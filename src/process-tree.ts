import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { parseWindowsCim } from './process-parse.js';
import { windowsHelperRequest } from './process-windows-helper.js';
const exec = promisify(execFile);
async function windowsSnapshot(): Promise<{
    children: Map<number, number[]>;
    identities: Map<number, string>;
}> {
    const stdout = await windowsHelperRequest('tree', undefined, 15000);
    const children = new Map<number, number[]>(), identities = new Map<number, string>();
    for (const p of parseWindowsCim(stdout)) {
        const list = children.get(p.ppid ?? -1);
        if (list)
            list.push(p.pid);
        else
            children.set(p.ppid ?? -1, [p.pid]);
        if (p.identityToken)
            identities.set(p.pid, p.identityToken);
    }
    return { children, identities };
}
async function childMap(): Promise<Map<number, number[]>> {
    if (process.platform === 'win32')
        return (await windowsSnapshot()).children;
    const map = new Map<number, number[]>();
    if (process.platform === 'linux') {
        const ids = await (await import('node:fs/promises')).readdir('/proc');
        await Promise.all(ids.filter(x => /^\d+$/.test(x)).map(async (x) => {
            try {
                const raw = await readFile(`/proc/${x}/stat`, 'utf8');
                const end = raw.lastIndexOf(')');
                const fields = raw.slice(end + 2).trim().split(/\s+/);
                const pid = Number(x), ppid = Number(fields[1]);
                if (!Number.isInteger(ppid) || ppid < 0)
                    return;
                const list = map.get(ppid);
                if (list)
                    list.push(pid);
                else
                    map.set(ppid, [pid]);
            }
            catch { /* process exited during the snapshot */ }
        }));
        return map;
    }
    const { stdout } = await exec('ps', [
        '-axo', 'pid=,ppid='
    ], {
        timeout: 3000, signal: AbortSignal.timeout(3000), maxBuffer: 4 * 1024 * 1024
    });
    for (const line of stdout.split(/\r?\n/)) {
        const m = line.trim().match(/^(\d+)\s+(\d+)$/);
        if (!m)
            continue;
        const pid = Number(m[1]), ppid = Number(m[2]);
        const list = map.get(ppid);
        if (list)
            list.push(pid);
        else
            map.set(ppid, [pid]);
    }
    return map;
}
async function descendantsFrom(map: Map<number, number[]>, rootPid: number): Promise<number[]> {
    const order: number[] = [], queue = [rootPid], seen = new Set([rootPid]);
    while (queue.length)
        for (const pid of map.get(queue.shift()!) ?? [])
            if (!seen.has(pid)) {
                seen.add(pid);
                order.push(pid);
                queue.push(pid);
            }
    return order.reverse();
}
export async function listDescendants(rootPid: number): Promise<number[]> {
    if (!Number.isInteger(rootPid) || rootPid <= 0)
        return [];
    return descendantsFrom(await childMap(), rootPid);
}
async function identity(pid: number): Promise<string | undefined> {
    if (process.platform === 'linux') {
        try {
            const [raw, boot] = await Promise.all([
                readFile(`/proc/${pid}/stat`, 'utf8'), readFile('/proc/sys/kernel/random/boot_id', 'utf8')
            ]);
            const end = raw.lastIndexOf(')');
            const fields = raw.slice(end + 2).trim().split(/\s+/);
            return `linux:${boot.trim()}:${fields[19]}`;
        }
        catch {
            return undefined;
        }
    }
    try {
        const { stdout } = await exec('ps', ['-o', 'lstart=', '-p', String(pid)], { timeout: 3000, signal: AbortSignal.timeout(3000) });
        return stdout.trim() ? `mac:${pid}:${stdout.trim()}` : undefined;
    }
    catch {
        return undefined;
    }
}
/** Snapshot first; terminate a detached POSIX group only after the root identity still matches. */
export async function killProcessTree(pid: number, expectedIdentity?: string, detachedGroup = false): Promise<number> {
    if (!Number.isInteger(pid) || pid <= 0)
        return 0;
    if (process.platform === 'win32') {
        let snapshot: Awaited<ReturnType<typeof windowsSnapshot>>;
        try {
            snapshot = await windowsSnapshot();
        }
        catch {
            return 0;
        }
        const victims = await descendantsFrom(snapshot.children, pid);
        victims.push(pid);
        if (expectedIdentity && snapshot.identities.get(pid) !== expectedIdentity)
            return 0;
        // One more table right before the kill (instead of one PowerShell call per victim): a PID that was reused in
        // between has another start time and is skipped.
        let fresh: Awaited<ReturnType<typeof windowsSnapshot>>;
        try {
            fresh = await windowsSnapshot();
        }
        catch {
            return 0;
        }
        const targets = victims.filter(v => {
            const before = snapshot.identities.get(v);
            return !!before && fresh.identities.get(v) === before;
        });
        const killed = await Promise.all(targets.map(victim => exec('taskkill', [
            '/PID', String(victim), '/F'
        ], {
            timeout: 5000, signal: AbortSignal.timeout(5000), windowsHide: true
        }).then(() => 1, () => 0))); // already exited or access denied
        return killed.reduce<number>((a, b) => a + b, 0);
    }
    let victims: number[] = [];
    try {
        victims = await listDescendants(pid);
    }
    catch { /* root identity check remains */ }
    victims.push(pid);
    const rootIdentity = expectedIdentity ?? await identity(pid);
    const snapshot = new Map<number, string | undefined>();
    for (const victim of victims)
        snapshot.set(victim, victim === pid ? rootIdentity : await identity(victim));
    if (detachedGroup && rootIdentity && (!expectedIdentity || rootIdentity === expectedIdentity)) {
        const currentRoot = await identity(pid);
        if (currentRoot === rootIdentity) {
            try {
                process.kill(-pid, 'SIGKILL');
            }
            catch { /* group may already be gone */ }
        }
    }
    let terminated = 0;
    for (const victim of victims) {
        const before = snapshot.get(victim);
        if (!before || (victim === pid && expectedIdentity && before !== expectedIdentity))
            continue;
        if (await identity(victim) !== before)
            continue;
        try {
            process.kill(victim, 'SIGKILL');
            terminated++;
        }
        catch { /* exited between check and signal */ }
    }
    return terminated;
}
