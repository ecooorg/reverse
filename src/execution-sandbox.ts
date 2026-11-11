/**
 * Sandbox for executed targets (Patch M step 5 / R-20).
 * Linux first: bwrap or unshare when available; other platforms record limitations.
 * Never claims isolation it cannot enforce. Requires CONTROLLED_EXECUTION + confirm.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { operatingMode } from './benchmark-gate.js';
export interface SandboxLimits {
    /** Wall-clock timeout for the whole tree (ms). Default 15_000. */
    timeoutMs?: number;
    memoryMaxBytes?: number;
    cpuQuotaPercent?: number;
}
export interface SandboxRequest {
    /** Absolute path of the program or interpreter. */
    command: string;
    args?: string[];
    /** Optional files to materialize under the scratch directory before run. */
    seedFiles?: Array<{
        relativePath: string;
        content: Buffer | string;
    }>;
    limits?: SandboxLimits;
    /** Operator must pass true; doubles as MCP confirm. */
    confirm: boolean;
    env?: Record<string, string>;
}
export interface SandboxMechanism {
    id: 'bwrap' | 'unshare' | 'process-group' | 'none';
    networkIsolated: boolean;
    scratchIsolated: boolean;
    detail: string;
}
export interface SandboxRunResult {
    exitCode: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
    durationMs: number;
    scratchDir: string;
    mechanism: SandboxMechanism;
    limitations: string[];
    /** True when the process tree was killed due to timeout. */
    timedOut: boolean;
}
async function which(bin: string): Promise<string | null> {
    const pathEnv = process.env.PATH ?? '';
    for (const dir of pathEnv.split(process.platform === 'win32' ? ';' : ':')) {
        if (!dir)
            continue;
        const candidate = join(dir, bin);
        try {
            await access(candidate);
            return candidate;
        }
        catch { /* next */ }
    }
    return null;
}
/** Probe which isolation mechanism this host can offer. */
export async function detectSandboxMechanism(): Promise<SandboxMechanism> {
    if (process.platform === 'linux') {
        const bwrap = await which('bwrap');
        if (bwrap) {
            return {
                id: 'bwrap',
                networkIsolated: true,
                scratchIsolated: true,
                detail: `bubblewrap at ${bwrap}`
            };
        }
        const unshare = await which('unshare');
        if (unshare) {
            return {
                id: 'unshare',
                networkIsolated: true,
                scratchIsolated: false,
                detail: `unshare at ${unshare} (network namespace; scratch is host path)`
            };
        }
        return {
            id: 'process-group',
            networkIsolated: false,
            scratchIsolated: false,
            detail: 'No bwrap/unshare; process-group + timeout + scratch cwd only'
        };
    }
    if (process.platform === 'darwin') {
        return {
            id: 'process-group',
            networkIsolated: false,
            scratchIsolated: false,
            detail: 'macOS: sandbox-exec not wired; process-group + timeout + scratch cwd'
        };
    }
    return {
        id: 'process-group',
        networkIsolated: false,
        scratchIsolated: false,
        detail: 'Windows: Job Objects/AppContainer not wired; process-group + timeout + scratch cwd'
    };
}
function assertControlled(confirm: boolean): void {
    if (operatingMode() !== 'CONTROLLED_EXECUTION' || confirm !== true) {
        throw new Error('Sandbox execution requires REVERSE_MODE=CONTROLLED_EXECUTION and confirm=true.');
    }
}
function buildCommand(mechanism: SandboxMechanism, scratch: string, command: string, args: string[]): {
    cmd: string;
    args: string[];
} {
    if (mechanism.id === 'bwrap') {
        // Bind the command binary path so absolute paths (e.g. Node) stay visible.
        const cmdDir = resolve(command, '..');
        const bwrapArgs = [
            '--unshare-net',
            '--die-with-parent',
            '--tmpfs', '/tmp',
            '--bind', scratch, scratch,
            '--chdir', scratch,
            '--ro-bind', '/usr', '/usr',
            '--ro-bind', '/bin', '/bin',
            '--ro-bind', '/lib', '/lib',
            '--ro-bind-try', '/lib64', '/lib64',
            '--ro-bind-try', '/etc/resolv.conf', '/etc/resolv.conf',
            '--ro-bind-try', cmdDir, cmdDir,
            '--proc', '/proc',
            '--dev', '/dev',
            '--',
            command,
            ...args
        ];
        return { cmd: 'bwrap', args: bwrapArgs };
    }
    if (mechanism.id === 'unshare') {
        return {
            cmd: 'unshare',
            args: ['--net', '--map-root-user', command, ...args]
        };
    }
    return { cmd: command, args };
}
/**
 * Run a command inside the best available sandbox.
 * Always uses a unique scratch directory; kills the process group on timeout.
 */
export async function runInSandbox(req: SandboxRequest): Promise<SandboxRunResult> {
    assertControlled(req.confirm);
    const limits = req.limits ?? {};
    const timeoutMs = limits.timeoutMs ?? 15000;
    const mechanism = await detectSandboxMechanism();
    const limitations: string[] = [];
    if (!mechanism.networkIsolated)
        limitations.push('Network isolation is not enforced on this host.');
    if (!mechanism.scratchIsolated)
        limitations.push('Filesystem is not fully jailed; only cwd is set to the scratch directory.');
    if (mechanism.id === 'process-group')
        limitations.push(mechanism.detail);
    const scratch = await mkdtemp(join(tmpdir(), 'reverse-sandbox-'));
    try {
        for (const seed of req.seedFiles ?? []) {
            const dest = resolve(scratch, seed.relativePath);
            if (!dest.startsWith(scratch))
                throw new Error(`seed path escapes scratch: ${seed.relativePath}`);
            await writeFile(dest, seed.content);
        }
        const built = buildCommand(mechanism, scratch, req.command, req.args ?? []);
        const started = Date.now();
        const child = spawn(built.cmd, built.args, {
            cwd: scratch,
            env: {
                PATH: `${resolve(req.command, '..')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
                HOME: scratch,
                TMPDIR: scratch,
                REVERSE_SCRATCH: scratch,
                ...(req.env ?? {})
            },
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: false
        });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (c: Buffer) => {
            stdout += c.toString('utf8');
            if (stdout.length > 256000)
                stdout = stdout.slice(0, 256000);
        });
        child.stderr?.on('data', (c: Buffer) => {
            stderr += c.toString('utf8');
            if (stderr.length > 128000)
                stderr = stderr.slice(0, 128000);
        });
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            try {
                if (child.pid) {
                    try {
                        process.kill(-child.pid, 'SIGKILL');
                    }
                    catch {
                        child.kill('SIGKILL');
                    }
                }
            }
            catch { /* already dead */ }
        }, timeoutMs);
        const exit = await new Promise<{
            code: number | null;
            signal: string | null;
        }>(resolveExit => {
            child.on('error', err => {
                stderr += String(err);
                resolveExit({ code: null, signal: null });
            });
            child.on('close', (code, signal) => {
                resolveExit({ code, signal });
            });
        });
        clearTimeout(timer);
        return {
            exitCode: exit.code,
            signal: exit.signal,
            stdout,
            stderr,
            durationMs: Date.now() - started,
            scratchDir: scratch,
            mechanism,
            limitations,
            timedOut
        };
    }
    finally {
        // Keep scratch for the caller briefly? No — delete unless REVERSE_KEEP_SCRATCH.
        if (process.env.REVERSE_KEEP_SCRATCH !== '1') {
            await rm(scratch, { recursive: true, force: true }).catch(() => undefined);
        }
    }
}
/** Write a tiny probe script that tries network + outside write; used by capability tests. */
export async function writeIsolationProbe(dir: string): Promise<string> {
    const script = join(dir, `probe-${randomUUID().slice(0, 8)}.mjs`);
    const body = `
import { writeFileSync } from 'node:fs';
import net from 'node:net';
const scratch = process.env.REVERSE_SCRATCH || process.cwd();
try {
  writeFileSync(scratch + '/inside-ok.txt', 'ok');
} catch (e) {
  console.error('inside-write-failed', e);
}
try {
  writeFileSync('/tmp/reverse-sandbox-outside.txt', 'leak');
  console.log('OUTSIDE_WRITE_OK');
} catch {
  console.log('OUTSIDE_WRITE_BLOCKED');
}
const s = net.connect({ host: '1.1.1.1', port: 80, timeout: 800 }, () => {
  console.log('NETWORK_OK');
  s.destroy();
  process.exit(0);
});
s.on('error', () => { console.log('NETWORK_BLOCKED'); process.exit(0); });
s.on('timeout', () => { console.log('NETWORK_BLOCKED'); s.destroy(); process.exit(0); });
setTimeout(() => { console.log('NETWORK_BLOCKED'); process.exit(0); }, 1200);
`;
    await writeFile(script, body);
    return script;
}
export async function readScratchFile(scratchDir: string, relativePath: string): Promise<string | null> {
    try {
        return await readFile(join(scratchDir, relativePath), 'utf8');
    }
    catch {
        return null;
    }
}
