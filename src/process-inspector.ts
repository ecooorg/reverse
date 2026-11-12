import { readFile, readdir, readlink } from 'node:fs/promises';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { result } from './core-types.js';
import { execTimeoutMs } from './core-util.js';
import { MAC_PS_ARGS_FIELDS, MAC_PS_FIELDS, parseMacPs, parseWindowsCim } from './process-parse.js';
import { windowsHelperRequest } from './process-windows-helper.js';
const exec = promisify(execFile);
export interface ProcessInfo {
    pid: number;
    ppid?: number;
    name: string;
    command?: string;
    executable?: string;
    identityToken?: string;
    ownerUid?: number;
    startedAt?: string;
    uptimeSeconds?: number;
    threads?: number;
    rssBytes?: number;
    vmsBytes?: number;
    cpuTimeMs?: number;
    cpuPercent?: number;
    diskReadBytes?: number;
    diskWriteBytes?: number;
    openFileDescriptors?: number;
    children?: number[];
    state?: string;
}
const proc = '/proc';
let linuxConstants: Promise<{
    pageSize: number;
    ticks: number;
    bootTime: number;
}> | undefined;
function getLinuxConstants() {
    linuxConstants ??= (async () => {
        const [page, ticks, raw] = await Promise.all([
            exec('getconf', ['PAGESIZE'], {
                timeout: 2000
            }).then(x => Number(x.stdout.trim())).catch(() => 4096), exec('getconf', ['CLK_TCK'], {
                timeout: 2000
            }).then(x => Number(x.stdout.trim())).catch(() => 100), readFile(`${proc}/stat`, 'utf8')
        ]);
        return {
            pageSize: Number.isFinite(page) && page > 0 ? page : 4096,
            ticks: Number.isFinite(ticks) && ticks > 0 ? ticks : 100,
            bootTime: Number(raw.match(/^btime (\d+)/m)?.[1] ?? 0)
        };
    })();
    return linuxConstants;
}
async function linuxInfo(pid: number): Promise<ProcessInfo | null> {
    const base = `${proc}/${pid}`;
    try {
        const [raw, cmdline, exe, io, fd, status] = await Promise.all([
            readFile(`${base}/stat`, 'utf8'), readFile(`${base}/cmdline`).catch(() => Buffer.alloc(0)),
            readlink(`${base}/exe`).catch(() => undefined),
            readFile(`${base}/io`, 'utf8').catch(() => ''),
            readdir(`${base}/fd`).catch(() => []),
            readFile(`${base}/status`, 'utf8').catch(() => '')
        ]);
        const end = raw.lastIndexOf(')');
        const name = raw.slice(raw.indexOf('(') + 1, end);
        const v = raw.slice(end + 2).trim().split(/\s+/);
        const ppid = Number(v[1]);
        const utime = Number(v[11]);
        const stime = Number(v[12]);
        const threads = Number(v[17]);
        const startTicks = Number(v[19]);
        const vsize = Number(v[20]);
        const rssPages = Number(v[21]);
        const { pageSize: page, ticks: hz, bootTime: btime } = await getLinuxConstants();
        const ioVal = (k: string) => Number(io.match(new RegExp(`^${k}:\\s*(\\d+)`, 'm'))?.[1] ?? 0);
        const args = cmdline.toString().split('\0').filter(Boolean).join(' ');
        const started = btime + startTicks / hz;
        const ownerUid = Number(status.match(/^Uid:\s+(\d+)/m)?.[1]);
        return {
            pid,
            ppid,
            name,
            command: args || name,
            executable: exe,
            identityToken: `linux:${(await readFile('/proc/sys/kernel/random/boot_id', 'utf8').catch(() => '')).trim()}:${startTicks}`,
            ownerUid: Number.isFinite(ownerUid) ? ownerUid : undefined,
            startedAt: new Date(started * 1000).toISOString(),
            uptimeSeconds: Math.max(0, Date.now() / 1000 - started),
            threads,
            rssBytes: Math.max(0, rssPages) * page,
            vmsBytes: vsize,
            cpuTimeMs: (utime + stime) / hz * 1000,
            diskReadBytes: ioVal('read_bytes'),
            diskWriteBytes: ioVal('write_bytes'),
            openFileDescriptors: fd.length,
            state: v[0]
        };
    }
    catch {
        return null;
    }
}
/**
 * Single-PID macOS/BSD path (F-08 / R-19 macOS). Uses `ps -p` so sampling does not read the full
 * process table. Children come from `pgrep -P` when available. True libproc is not used: the
 * project has zero runtime native dependencies.
 */
async function macOsInfo(pid: number): Promise<ProcessInfo | null> {
    const opts = { timeout: execTimeoutMs(10000), maxBuffer: 2 * 1024 * 1024 };
    try {
        const [table, argv] = await Promise.all([
            exec('ps', ['-p', String(pid), '-o', MAC_PS_FIELDS.join(',')], opts),
            exec('ps', ['-p', String(pid), '-o', MAC_PS_ARGS_FIELDS.join(',')], opts),
        ]);
        const rows = parseMacPs(table.stdout, argv.stdout);
        const one = rows.find(x => x.pid === pid);
        if (!one)
            return null;
        let children: number[] = [];
        try {
            const { stdout } = await exec('pgrep', ['-P', String(pid)], {
                timeout: execTimeoutMs(5000),
                maxBuffer: 1024 * 1024,
            });
            children = stdout
                .split(/\s+/)
                .map(Number)
                .filter(n => Number.isInteger(n) && n > 0 && n !== pid);
        }
        catch {
            // pgrep absent or no children
        }
        return { ...one, children };
    }
    catch {
        // ps -p exits non-zero when the PID is gone
        return null;
    }
}
async function enumerate(): Promise<{
    rows: ProcessInfo[];
    limitations: string[];
}> {
    const limitations: string[] = [];
    let rows: ProcessInfo[] = [];
    if (process.platform === 'linux') {
        try {
            const ids = (await readdir(proc)).filter(x => /^\d+$/.test(x));
            rows = (await Promise.all(ids.map(x => linuxInfo(+x)))).filter((x): x is ProcessInfo => !!x);
        }
        catch (e) {
            limitations.push(`Process enumeration failed: ${String(e)}`);
        }
    }
    else
        try {
            if (process.platform === 'win32') {
                const stdout = await windowsHelperRequest('list', undefined, execTimeoutMs(15000));
                rows = parseWindowsCim(stdout);
            }
            else {
                const opts = { timeout: execTimeoutMs(10000), maxBuffer: 32 * 1024 * 1024 };
                const [table, argv] = await Promise.all([
                    exec('ps', [
                        '-axo', MAC_PS_FIELDS.join(',')
                    ], opts), exec('ps', [
                        '-axo', MAC_PS_ARGS_FIELDS.join(',')
                    ], opts)
                ]);
                rows = parseMacPs(table.stdout, argv.stdout);
            }
            if (!rows.length)
                throw new Error('helper output contained no parseable process rows');
        }
        catch (e) {
            limitations.push(`Process enumeration failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    const byParent = new Map<number, number[]>();
    for (const p of rows) {
        if (p.ppid !== undefined) {
            const a = byParent.get(p.ppid) ?? [];
            a.push(p.pid);
            byParent.set(p.ppid, a);
        }
    }
    for (const p of rows)
        p.children = byParent.get(p.pid) ?? [];
    return { rows, limitations };
}
export async function listProcesses(limit = 100, offset = 0) {
    const cap = Math.max(1, Math.min(500, Math.floor(limit)));
    const start = Math.max(0, Math.min(1000000, Math.floor(offset)));
    const { rows, limitations } = await enumerate();
    const shown = rows.slice(start, start + cap);
    return result<ProcessInfo>('local-host', 'process_inventory', shown, {
        status: limitations.length ? 'partial' : 'completed', limitations, pagination: {
            offset: start, limit: cap, total: rows.length, nextOffset: start + shown.length < rows.length ? start + shown.length : null
        }, coverage: {
            examined: true, complete: false, notes: [
                `Snapshot: ${shown.length}/${rows.length} visible processes (offset ${start}, limit ${cap}).`,
                `Platform metrics are limited to those exposed by ${process.platform}.`
            ]
        }
    });
}
export async function inspectProcess(pid: number) {
    if (!Number.isInteger(pid) || pid <= 0)
        throw new Error('PID must be a positive integer.');
    if (process.platform === 'linux') {
        const p = await linuxInfo(pid);
        return p ? result<ProcessInfo>(String(pid), 'process_inspection', [p], {
            coverage: {
                examined: true,
                complete: false,
                notes: ['Single-PID /proc fast path; identity token uses boot ID and process start ticks. CPU percentages use a '
                        + 'per-core convention where 100% is one logical CPU.']
            }
        }) : result<ProcessInfo>(String(pid), 'process_inspection', [], {
            status: 'partial', limitations: ['Process does not exist or is not visible.']
        });
    }
    if (process.platform === 'win32') {
        // Fast path: ask WMI for this one PID (and its direct children) instead of enumerating every process. A failure falls
        // back to the full table below.
        try {
            const stdout = await windowsHelperRequest('inspect', pid, execTimeoutMs(15000));
            const rows = parseWindowsCim(stdout), one = rows.find(x => x.pid === pid);
            if (one) {
                const found: ProcessInfo = { ...one, children: rows.filter(x => x.ppid === pid && x.pid !== pid).map(x => x.pid) };
                return result<ProcessInfo>(String(pid), 'process_inspection', [found], {
                    coverage: {
                        examined: true,
                        complete: false,
                        notes: ['Single-PID CIM fast path; identity token is the process creation time. PID can still race between '
                                + 'an OS read and a subsequent operation.']
                    }
                });
            }
            if (!stdout.trim())
                return result<ProcessInfo>(String(pid), 'process_inspection', [], {
                    status: 'partial', limitations: ['Process does not exist or is not visible.']
                });
        }
        catch { /* fall back to the full enumeration */ }
    }
    if (process.platform === 'darwin') {
        const p = await macOsInfo(pid);
        return p ? result<ProcessInfo>(String(pid), 'process_inspection', [p], {
            coverage: {
                examined: true,
                complete: false,
                notes: [
                    'Single-PID ps -p fast path (F-08 / R-19 macOS); does not read the full process table. '
                    + 'Children via pgrep -P when available. True libproc is not used (zero runtime native deps). '
                    + 'Identity token is pid + lstart. PID can still race between an OS read and a subsequent operation.',
                ],
            },
        }) : result<ProcessInfo>(String(pid), 'process_inspection', [], {
            status: 'partial', limitations: ['Process does not exist or is not visible.'],
        });
    }
    const { rows, limitations } = await enumerate();
    const p = rows.find(x => x.pid === pid);
    if (!p)
        return result<ProcessInfo>(String(pid), 'process_inspection', [], {
            status: 'partial', limitations: [
                ...limitations, 'Process does not exist or is not visible.'
            ]
        });
    return result<ProcessInfo>(String(pid), 'process_inspection', [p], {
        limitations, coverage: {
            examined: true,
            complete: false,
            notes: ['Process identity token is derived from OS start-time metadata where available. PID can still race between '
                    + 'an OS read and a subsequent operation.']
        }
    });
}
export async function getProcessTree(pid: number) {
    const { rows, limitations } = await enumerate();
    if (!rows.some(p => p.pid === pid))
        return result(String(pid), 'process_tree', [], { status: 'partial', limitations: [...limitations, 'Process is not visible.'] });
    const map = new Map(rows.map(p => [p.pid, p]));
    const walk = (id: number, seen = new Set<number>()): any => {
        if (seen.has(id))
            return null;
        seen.add(id);
        const p = map.get(id);
        if (!p)
            return null;
        return { ...p, children: (p.children ?? []).map(c => walk(c, seen)).filter(Boolean) };
    };
    return result(String(pid), 'process_tree', [walk(pid)], {
        limitations, coverage: {
            examined: true, complete: limitations.length === 0, notes: ['Tree includes only processes visible to the current user.']
        }
    });
}
export async function getProcessMetrics(pid: number) { return inspectProcess(pid); }
export async function analyzeMemory(pid: number) {
    const r = await inspectProcess(pid);
    return result(String(pid), 'memory_analysis', r.findings.map((p: any) => ({
        pid: p.pid, rssBytes: p.rssBytes, vmsBytes: p.vmsBytes, threads: p.threads
    })), {
        status: r.status, limitations: r.limitations, coverage: r.coverage
    });
}
export async function analyzeCpu(pid: number) {
    const r = await inspectProcess(pid);
    return result(String(pid), 'cpu_analysis', r.findings.map((p: any) => ({
        pid: p.pid, cpuPercent: p.cpuPercent, cpuTimeMs: p.cpuTimeMs
    })), {
        status: r.status, limitations: r.limitations, coverage: r.coverage
    });
}
export async function analyzeIo(pid: number) {
    const r = await inspectProcess(pid);
    return result(String(pid), 'io_analysis', r.findings.map((p: any) => ({
        pid: p.pid, diskReadBytes: p.diskReadBytes, diskWriteBytes: p.diskWriteBytes
    })), {
        status: r.status, limitations: r.limitations, coverage: r.coverage
    });
}
/** Return a stable-enough OS start token; callers must still re-check immediately before acting. */
export async function getProcessIdentity(pid: number): Promise<{
    identityToken?: string;
    ownerUid?: number;
} | null> {
    const r: any = await inspectProcess(pid);
    const p = r.findings[0];
    return p ? { identityToken: p.identityToken, ownerUid: p.ownerUid } : null;
}
export async function verifyProcessIdentity(pid: number, expectedToken?: string): Promise<boolean> {
    if (!expectedToken)
        return false;
    const current = await getProcessIdentity(pid);
    return !!current && current.identityToken === expectedToken;
}
export async function verifyProcessOwnership(pid: number): Promise<{
    owned: boolean;
    known: boolean;
    ownerUid?: number;
}> {
    const current = await getProcessIdentity(pid);
    if (!current)
        return { owned: false, known: true };
    if (typeof process.getuid === 'function' && current.ownerUid !== undefined)
        return { owned: current.ownerUid === process.getuid(), known: true, ownerUid: current.ownerUid };
    return { owned: false, known: false, ownerUid: current.ownerUid };
}
