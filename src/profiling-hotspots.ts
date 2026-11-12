import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { platform } from 'node:os';
import { result } from './core-types.js';
import { findExecutable, COMMON_BIN_DIRS } from './providers-discover.js';
import { operatingMode } from './benchmark-gate.js';
import { getProcessMetrics } from './process-inspector.js';
const execFileAsync = promisify(execFile);
export interface Hotspot {
    name: string;
    samples?: number;
    percent?: number;
    source: string;
    timeRangeMs?: number;
}
/**
 * Confirmed hot functions from a real profiler only.
 * Without a profiler: process-level metrics + explicit limitation.
 */
export async function getHotspots(pid: number, opts?: {
    durationMs?: number;
    signal?: AbortSignal;
}) {
    const durationMs = Math.min(Math.max(opts?.durationMs ?? 1000, 100), 30000);
    const findings: {
        pid: number;
        hotspots: Hotspot[];
        processLevel?: unknown;
        profiler?: string;
    } = { pid, hotspots: [] };
    const limitations: string[] = [];
    let profiler: string | undefined;
    const controlled = operatingMode() === 'CONTROLLED_EXECUTION';
    if (platform() === 'linux') {
        const perf = await findExecutable(['perf'], COMMON_BIN_DIRS, ['--version']);
        if (perf && controlled) {
            try {
                // Prefer perf report from a short record when possible
                const { stdout } = await execFileAsync(perf.path, [
                    'top', '-p', String(pid), '-n', '1', '-z', '30',
                    '--stdio', '--no-children'
                ], {
                    timeout: durationMs + 8000,
                    maxBuffer: 2 * 1024 * 1024,
                    signal: opts?.signal as any
                });
                for (const line of stdout.split(/\r?\n/)) {
                    // Formats vary: "  12.34%  ... symbol" or "12.34% symbol"
                    const m = line.match(/([\d.]+)%\s+(?:\S+\s+){0,4}(\S+)/);
                    if (m && !/overhead|symbol|command/i.test(m[2])) {
                        findings.hotspots.push({
                            name: m[2],
                            percent: Number(m[1]),
                            source: 'perf top',
                            timeRangeMs: durationMs
                        });
                    }
                }
                profiler = perf.path;
            }
            catch (e: any) {
                limitations.push(`perf top failed: ${e?.message ?? String(e)}`);
            }
        }
        else if (perf) {
            limitations.push('perf is installed but hotspots need REVERSE_MODE=CONTROLLED_EXECUTION.');
        }
    }
    if (platform() === 'darwin' && findings.hotspots.length === 0) {
        const sample = await findExecutable(['sample'], COMMON_BIN_DIRS, ['--help']);
        if (sample && controlled) {
            try {
                const secs = Math.max(1, Math.round(durationMs / 1000));
                const { stdout } = await execFileAsync(sample.path, [String(pid), String(secs), '1', '-f', '-'], {
                    timeout: durationMs + 15000,
                    maxBuffer: 4 * 1024 * 1024,
                    signal: opts?.signal as any
                });
                for (const line of stdout.split(/\r?\n/)) {
                    const m = line.match(/^\s*(\d+)\s+(.+)$/);
                    if (m && !/Total samples|Sample analysis|Call graph/i.test(m[2])) {
                        findings.hotspots.push({
                            name: m[2].trim().slice(0, 200),
                            samples: Number(m[1]),
                            source: 'sample',
                            timeRangeMs: durationMs
                        });
                    }
                }
                profiler = sample.path;
            }
            catch (e: any) {
                limitations.push(`sample failed: ${e?.message ?? String(e)}`);
            }
        }
        else if (sample) {
            limitations.push('macOS sample is installed but needs REVERSE_MODE=CONTROLLED_EXECUTION.');
        }
    }
    if (platform() === 'win32' && findings.hotspots.length === 0) {
        limitations.push('Windows function hotspots need ETW/WPA capture; auto session is not started. '
            + 'Process-level metrics only on this platform for now.');
    }
    try {
        const metrics = await getProcessMetrics(pid);
        findings.processLevel = metrics.findings?.[0] ?? metrics;
    }
    catch (e: any) {
        limitations.push(`process metrics: ${e?.message ?? String(e)}`);
    }
    findings.profiler = profiler;
    findings.hotspots = findings.hotspots.slice(0, 50);
    if (!findings.hotspots.length) {
        limitations.push('No function-level hotspots: process-level only. '
            + 'Use perf (Linux) or sample (macOS) under CONTROLLED_EXECUTION.');
    }
    return result(String(pid), 'get_hotspots', [findings], {
        status: findings.hotspots.length ? 'completed' : 'partial',
        limitations,
        coverage: {
            examined: true,
            complete: findings.hotspots.length > 0,
            notes: [
                profiler
                    ? `Profiler: ${profiler}; ${findings.hotspots.length} hotspot(s).`
                    : 'No profiler data; process-level metrics only.'
            ]
        }
    });
}
/** Disk and network I/O per process where the OS exposes it. */
export async function getProcessIo(pid: number) {
    const limitations: string[] = [];
    let disk: Record<string, number> | null = null;
    const network: Record<string, number> | null = null;
    if (platform() === 'linux') {
        try {
            const { readFile } = await import('node:fs/promises');
            const io = await readFile(`/proc/${pid}/io`, 'utf8');
            disk = {};
            for (const line of io.split(/\r?\n/)) {
                const [k, v] = line.split(':');
                if (k && v)
                    disk[k.trim()] = Number(v.trim());
            }
        }
        catch (e: any) {
            limitations.push(`/proc/pid/io: ${e?.message ?? String(e)}`);
        }
        limitations.push('Per-process network I/O is not exposed via a stable Linux interface here.');
    }
    else {
        limitations.push(`${platform()}: per-process disk/network I/O via native profilers is not wired yet.`);
    }
    return result(String(pid), 'get_process_io', [{ pid, disk, network }], {
        status: disk ? 'completed' : 'partial',
        limitations,
        coverage: {
            examined: true,
            complete: !!disk,
            notes: disk ? ['Disk I/O counters from /proc/pid/io.'] : []
        }
    });
}
