import { access, mkdir, readFile, rmdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { result } from './core-types.js';
import { getProcessIdentity, verifyProcessIdentity, verifyProcessOwnership } from './process-inspector.js';
export type OperatingMode = 'READ_ONLY' | 'OBSERVE' | 'CONTROLLED_EXECUTION';
/** File-system seam of the cgroup writer; production uses the real cgroup v2 mount, tests inject a recording implementation. */
export interface CgroupDeps {
    root: string;
    readProcCgroup(pid: number): Promise<string>;
    /**
     * Resolves when the file exists. Used to prove that the parent directory really is a cgroup v2 node
     * (`cgroup.controllers` exists only there).
     */
    access(file: string): Promise<void>;
    mkdir(dir: string): Promise<void>;
    writeFile(file: string, value: string): Promise<void>;
    rmdir(dir: string): Promise<void>;
}
const realCgroupDeps: CgroupDeps = {
    root: '/sys/fs/cgroup',
    readProcCgroup: pid => readFile(`/proc/${pid}/cgroup`, 'utf8'),
    access: file => access(file),
    mkdir: async (dir) => { await mkdir(dir); },
    writeFile: (file, value) => writeFile(file, value),
    rmdir: dir => rmdir(dir)
};
export interface ResourceLimits {
    memoryMaxBytes?: number;
    cpuQuotaPercent?: number;
}
/** Reports actual enforcement support; detection alone never implies isolation. */
export async function getResourceControlStatus() {
    if (process.platform !== 'linux')
        return result('local-host', 'resource_control_status', [{
                supported: false, mechanism: null
            }], {
            status: 'partial', limitations: ['Hard process resource limits are implemented only for delegated Linux cgroup v2 hierarchies.']
        });
    try {
        const controllers = (await readFile('/sys/fs/cgroup/cgroup.controllers', 'utf8')).trim().split(/\s+/);
        const writable = await access('/sys/fs/cgroup', constants.W_OK).then(() => true).catch(() => false);
        return result('local-host', 'resource_control_status', [{
                supported: controllers.includes('cpu') && controllers.includes('memory'), mechanism: 'cgroup-v2', controllers, writable
            }], {
            status: controllers.includes('cpu') && controllers.includes('memory')
                ? 'completed'
                : 'partial', limitations: writable
                ? []
                : ['Cgroup root is not writable by this process; a delegated subtree is required.']
        });
    }
    catch (e) {
        return result('local-host', 'resource_control_status', [{
                supported: false, mechanism: 'cgroup-v2'
            }], {
            status: 'partial',
            errors: [e instanceof Error ? e.message : String(e)],
            limitations: ['cgroup v2 controllers are unavailable or not readable.']
        });
    }
}
function validateLimits(pid: number, limits: ResourceLimits): void {
    if (!Number.isInteger(pid) || pid <= 0)
        throw new Error('PID must be a positive integer.');
    if (!Object.keys(limits).length)
        throw new Error('At least one resource limit is required.');
    const mem = limits.memoryMaxBytes, cpu = limits.cpuQuotaPercent;
    if (mem !== undefined && (!Number.isSafeInteger(mem) || mem < 16 * 1024 * 1024))
        throw new Error('memoryMaxBytes must be an integer >= 16 MiB.');
    if (cpu !== undefined && (!Number.isFinite(cpu) || cpu <= 0 || cpu > 10000))
        throw new Error('cpuQuotaPercent must be in (0, 10000].');
}
type Limits = ResourceLimits;
type Mode = OperatingMode;
type Op<T> = () => Promise<T>;
/**
 * Builds the scoped limiter. It runs `operation` while `pid` sits in a temporary child cgroup with the requested limits,
 * then moves the process back and removes the cgroup (also when the operation throws). It needs CONTROLLED_EXECUTION,
 * confirm=true, Linux cgroup v2 and a delegated hierarchy; a missing delegation surfaces as the underlying file-system
 * error, never as a silent success. Tests inject `deps`; production uses `withProcessResourceLimits`.
 */
export function createResourceLimiter(deps: CgroupDeps) {
    return async function limited<T>(pid: number, limits: Limits, mode: Mode, confirm: boolean, operation: Op<T>): Promise<T> {
        if (mode !== 'CONTROLLED_EXECUTION' || confirm !== true)
            throw new Error('Resource limits require mode CONTROLLED_EXECUTION and explicit confirm=true.');
        if (process.platform !== 'linux')
            throw new Error('Enforced process limits are currently supported only on Linux cgroup v2.');
        validateLimits(pid, limits);
        const owner = await verifyProcessOwnership(pid);
        if (!owner.known || !owner.owned)
            throw new Error('Target ownership cannot be verified or target is not owned by the current user.');
        const identity = await getProcessIdentity(pid);
        if (!identity?.identityToken)
            throw new Error('Stable process identity is unavailable.');
        const match = (await deps.readProcCgroup(pid)).match(/^0::(.*)$/m);
        if (!match)
            throw new Error('Target is not in a unified cgroup v2 hierarchy.');
        const original = path.join(deps.root, match[1].replace(/^\/+/, ''));
        // cgroup v2 "no internal processes": controllers cannot be enabled below a cgroup that holds processes, so the limited
        // cgroup is created next to the target's cgroup (under its parent), never inside it. At the root there is no parent.
        const parent = match[1].replace(/\/+$/, '') === '' ? original : path.dirname(original);
        // On hybrid or cgroup v1 hosts /sys/fs/cgroup is an ordinary tmpfs: refuse before anything is created there.
        await deps.access(path.join(parent, 'cgroup.controllers')).catch(() => {
            throw new Error(`The cgroup v2 hierarchy is not available at ${parent} (no cgroup.controllers); no limit was applied.`);
        });
        const dir = path.join(parent, `reverse-${pid}-${randomUUID()}`);
        await deps.mkdir(dir);
        let moved = false;
        try {
            const write = (name: string, value: string) => deps.writeFile(path.join(dir, name), value).catch(e => {
                if ((e as NodeJS.ErrnoException)?.code === 'ENOENT')
                    throw new Error(`Controller file ${name} is missing: the controller is not enabled in the parent cgroup `
                        + `${parent} (cgroup.subtree_control).`);
                throw e;
            });
            if (limits.memoryMaxBytes !== undefined)
                await write('memory.max', String(limits.memoryMaxBytes));
            if (limits.cpuQuotaPercent !== undefined)
                await write('cpu.max', `${Math.max(1, Math.floor(limits.cpuQuotaPercent * 1000))} 100000`);
            if (!(await verifyProcessIdentity(pid, identity.identityToken)))
                throw new Error('Process identity changed before resource control was applied.');
            await deps.writeFile(path.join(dir, 'cgroup.procs'), String(pid));
            moved = true;
            return await operation();
        }
        finally {
            if (moved)
                await deps.writeFile(path.join(original, 'cgroup.procs'), String(pid)).catch(() => { });
            await deps.rmdir(dir).catch(() => { });
        }
    };
}
;
export const withProcessResourceLimits = createResourceLimiter(realCgroupDeps);
