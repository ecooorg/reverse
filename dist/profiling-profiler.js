import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { result } from './core-types.js';
const exec = promisify(execFile);
export async function profileProcess(pid, durationMs = 3000, intervalMs = 250) {
    if (!Number.isInteger(pid) || pid <= 0)
        throw new Error('PID must be a positive integer.');
    const duration = Math.max(500, Math.min(30000, durationMs)), interval = Math.max(100, Math.min(2000, intervalMs));
    const samples = [];
    let errors = [];
    const end = Date.now() + duration;
    while (Date.now() < end) {
        try {
            if (process.platform === 'win32') {
                const { stdout } = await exec('powershell.exe', ['-NoProfile', '-Command', `$p=Get-Process -Id ${pid} -ErrorAction Stop; [pscustomobject]@{cpu=$p.CPU;rss=$p.WorkingSet64;threads=$p.Threads.Count}|ConvertTo-Json -Compress`], { timeout: 4000 });
                const x = JSON.parse(stdout);
                samples.push({ at: new Date().toISOString(), rssKb: Math.round(x.rss / 1024), cpuPercent: undefined });
            }
            else {
                const { stdout } = await exec('ps', ['-p', String(pid), '-o', '%cpu=,rss=,state='], { timeout: 3000 });
                const m = stdout.trim().match(/^([\d.]+)\s+(\d+)\s+(\S+)/);
                if (!m)
                    throw new Error('Process is no longer visible.');
                samples.push({ at: new Date().toISOString(), cpuPercent: +m[1], rssKb: +m[2], state: m[3] });
            }
        }
        catch (e) {
            errors.push(e instanceof Error ? e.message : String(e));
            break;
        }
        await new Promise(r => setTimeout(r, interval));
    }
    const rss = samples.map(s => s.rssKb).filter((x) => x !== undefined), cpu = samples.map(s => s.cpuPercent).filter((x) => x !== undefined);
    const findings = [{ pid, durationMs: Date.now() - (end - duration), sampleCount: samples.length, averageCpuPercent: cpu.length ? cpu.reduce((a, b) => a + b, 0) / cpu.length : null, peakCpuPercent: cpu.length ? Math.max(...cpu) : null, averageRssKb: rss.length ? rss.reduce((a, b) => a + b, 0) / rss.length : null, peakRssKb: rss.length ? Math.max(...rss) : null, samples }];
    return result('pid:' + pid, 'process_profile', findings, { status: errors.length ? 'partial' : 'completed', errors, limitations: [process.platform === 'win32' ? 'Windows CPU percentage is omitted in this MVP; RSS is sampled.' : 'CPU percentage is the OS ps snapshot value, not a function-level profile.', 'Sampling has overhead and may miss short-lived peaks.', 'No function-level hotspots, disk I/O, network I/O, or child-process aggregation.'], coverage: { examined: samples.length > 0, complete: false, notes: ['Only the selected process is sampled.', 'Sampling interval and duration are bounded by the implementation.'] } });
}
//# sourceMappingURL=profiling-profiler.js.map