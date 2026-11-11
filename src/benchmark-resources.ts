import { readFile, stat } from 'node:fs/promises';
import { execFile, execFileSync } from 'node:child_process';
import path from 'node:path';
import { windowsHelperRequest } from './process-windows-helper.js';
// Per-run resource measurement for benchmark children (Patch C, part 2).
// Linux: /proc/<pid>/stat and /proc/<pid>/status are sampled every few milliseconds; CPU time is user+system
// (including waited-for children), peak RAM is the kernel's resident high-water mark (VmHWM).
// macOS and other POSIX systems: `ps -o rss=,time=` is sampled; peak RAM is the largest sampled RSS.
// Windows: PowerShell Get-Process samples CPU time and peak working set; sampling overhead is recorded as a limitation.
// Values describe the direct child process only and are lower bounds: whatever happens after the last sample is not seen.
export interface ResourceUsage {
    method: 'proc' | 'ps' | 'powershell';
    available: boolean;
    samples: number;
    cpuTimeMs: number | null;
    peakRssBytes: number | null;
    reason?: string;
}
/** `ps` CPU time: `M:SS.cc`, `H:MM:SS`, `D-HH:MM:SS` (also with a comma as decimal separator). Returns milliseconds. */
export function parsePsCpuTime(text: string): number | undefined {
    const m = text.trim().replace(',', '.').match(/^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/);
    if (!m)
        return undefined;
    const [, d, h, min, sec] = m;
    return Math.round((((Number(d ?? 0) * 24 + Number(h ?? 0)) * 60 + Number(min)) * 60 + Number(sec)) * 1000);
}
/** One `ps -o rss=,time=` row: RSS in KiB, then CPU time. */
export function parsePsRow(output: string): {
    rssBytes: number;
    cpuTimeMs: number;
} | undefined {
    const m = output.trim().split('\n')[0]?.trim().split(/\s+/);
    if (!m || m.length < 2)
        return undefined;
    const rss = Number(m[0]), cpu = parsePsCpuTime(m[1]);
    return Number.isFinite(rss) && cpu !== undefined ? { rssBytes: rss * 1024, cpuTimeMs: cpu } : undefined;
}
/** CPU time in ms from the content of /proc/<pid>/stat: utime + stime + cutime + cstime, in clock ticks. */
export function parseProcStatCpu(raw: string, ticksPerSecond: number): number | undefined {
    const end = raw.lastIndexOf(')');
    if (end < 0)
        return undefined;
    const v = raw.slice(end + 2).trim().split(/\s+/).map(Number);
    const ticks = v[11] + v[12] + v[13] + v[14];
    return Number.isFinite(ticks) ? Math.round((ticks / ticksPerSecond) * 1000) : undefined;
}
/** Peak resident set in bytes from /proc/<pid>/status: VmHWM, else VmRSS. */
export function parseProcStatusPeak(status: string): number | undefined {
    const kb = status.match(/^VmHWM:\s+(\d+)\s*kB/m)?.[1] ?? status.match(/^VmRSS:\s+(\d+)\s*kB/m)?.[1];
    return kb === undefined ? undefined : Number(kb) * 1024;
}
let cachedTicks: number | undefined;
function clockTicks(): number {
    if (cachedTicks)
        return cachedTicks;
    try {
        const v = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8', timeout: 2000 }).trim());
        cachedTicks = Number.isFinite(v) && v > 0 ? v : 100;
    }
    catch {
        cachedTicks = 100;
    }
    return cachedTicks;
}
export class ResourceSampler {
    private cpu: number | null = null;
    private peak: number | null = null;
    private samples = 0;
    private timer?: NodeJS.Timeout;
    private busy = false;
    private stopped = false;
    readonly method: ResourceUsage['method'] = process.platform === 'linux' ? 'proc' : process.platform === 'win32' ? 'powershell' : 'ps';
    constructor(private readonly pid: number | undefined) { }
    start(): void {
        if (!this.pid)
            return;
        const interval = this.method === 'proc' ? 5 : this.method === 'ps' ? 25 : 75;
        const tick = () => {
            if (this.stopped)
                return;
            if (this.busy)
                return;
            this.busy = true;
            const read = this.method === 'proc' ? this.readProc() : this.method === 'ps' ? this.readPs() : this.readPowerShell();
            void read.catch(() => undefined).finally(() => { this.busy = false; });
        };
        this.timer = setInterval(tick, interval);
        this.timer.unref?.();
        tick();
    }
    private async readProc(): Promise<void> {
        const [raw, status] = await Promise.all([
            readFile(`/proc/${this.pid}/stat`, 'utf8'), readFile(`/proc/${this.pid}/status`, 'utf8').catch(() => '')
        ]);
        const cpu = parseProcStatCpu(raw, clockTicks()), peak = parseProcStatusPeak(status);
        if (cpu === undefined)
            return;
        this.samples++;
        this.cpu = Math.max(this.cpu ?? 0, cpu);
        if (peak !== undefined)
            this.peak = Math.max(this.peak ?? 0, peak);
    }
    private readPs(): Promise<void> {
        return new Promise(resolve => {
            execFile('ps', [
                '-o', 'rss=,time=', '-p', String(this.pid)
            ], {
                timeout: 2000, signal: AbortSignal.timeout(2000), env: {
                    ...process.env, LC_ALL: 'C'
                }
            }, (err, stdout) => {
                const row = err ? undefined : parsePsRow(String(stdout));
                if (row) {
                    this.samples++;
                    this.cpu = Math.max(this.cpu ?? 0, row.cpuTimeMs);
                    this.peak = Math.max(this.peak ?? 0, row.rssBytes);
                }
                resolve();
            });
        });
    }
    private readPowerShell(): Promise<void> {
        return windowsHelperRequest('sample', this.pid, 5000).then(stdout => {
            const parsed = JSON.parse(stdout);
            const v = Array.isArray(parsed) ? parsed[0] : parsed;
            const cpu = Number(v?.cpuMs), rss = Math.max(Number(v?.rss), Number(v?.peak));
            if (Number.isFinite(cpu) && Number.isFinite(rss)) {
                this.samples++;
                this.cpu = Math.max(this.cpu ?? 0, cpu);
                this.peak = Math.max(this.peak ?? 0, rss);
            }
        }).catch(() => {
            // Process exit, access denial or a helper failure leaves metrics explicitly unavailable.
        });
    }
    /** Call once the child has exited; returns the last values seen. */
    stop(): ResourceUsage {
        this.stopped = true;
        if (this.timer)
            clearInterval(this.timer);
        if (this.samples === 0)
            return {
                method: this.method,
                available: false,
                samples: 0,
                cpuTimeMs: null,
                peakRssBytes: null,
                reason: 'the process ended before the first sample'
            };
        return { method: this.method, available: true, samples: this.samples, cpuTimeMs: this.cpu, peakRssBytes: this.peak };
    }
}
/** Resolves the command like the OS would (cwd-relative path, or PATH lookup with PATHEXT on Windows) and reports its size. */
export async function describeExecutable(command: string, cwd: string = process.cwd(), env: NodeJS.ProcessEnv = process.env): Promise<{
    path: string;
    sizeBytes: number;
} | null> {
    const win = process.platform === 'win32';
    const exts = win ? ['', ...(env.PATHEXT ?? env.PathExt ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)] : [''];
    const dirs = /[\\/]/.test(command)
        ? [path.resolve(cwd, path.dirname(command))]
        : (env.PATH ?? env.Path ?? '').split(path.delimiter).filter(Boolean);
    const base = /[\\/]/.test(command) ? path.basename(command) : command;
    for (const dir of dirs)
        for (const ext of exts) {
            const candidate = path.join(dir, base + ext);
            try {
                const s = await stat(candidate);
                if (s.isFile())
                    return { path: candidate, sizeBytes: s.size };
            }
            catch { /* next */ }
        }
    return null;
}
