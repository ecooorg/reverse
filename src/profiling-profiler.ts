import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { result } from './core-types.js';
import { inspectProcess, verifyProcessOwnership } from './process-inspector.js';
export type ProfileMode = 'Snapshot' | 'Monitor' | 'Diagnostic' | 'Compare';
export interface ProfileOptions {
    durationMs?: number;
    intervalMs?: number;
    mode?: ProfileMode;
    signal?: AbortSignal;
    expectedIdentityToken?: string;
    /** `true` refuses a process owned by someone else; `'verified'` also refuses when ownership cannot be established. */
    requireOwnership?: boolean | 'verified';
}
type Opts = Pick<ProfileOptions, 'signal' | 'expectedIdentityToken' | 'requireOwnership'>;
/** Deterministic anomaly thresholds; `detect_resource_anomalies` and Diagnostic mode both use them. */
export const ANOMALY_THRESHOLDS = {
    sustainedCpuPercent: 80, spikeCpuPercent: 95, rssGrowthRatio: 1.2, minRssSamples: 3
} as const;
function finiteValues(samples: any[], key: string): number[] {
    const isNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
    return samples.map(x => x[key]).filter(isNumber);
}
const average = (values: number[]) => values.length ? values.reduce((x, y) => x + y, 0) / values.length : null;
const peakOf = (values: number[]) => values.length ? Math.max(...values) : null;
const subtractOrNull = (a: number | null, b: number | null) => a !== null && b !== null ? a - b : null;
/**
 * Compare mode: the observation is split into a first and a second period and the two are compared.
 * Returns null when fewer than four samples exist (each period needs at least two).
 */
export function comparePeriods(samples: any[]) {
    if (samples.length < 4)
        return null;
    const mid = Math.floor(samples.length / 2);
    const describe = (part: any[]) => ({
        sampleCount: part.length,
        averageCpuPercent: average(finiteValues(part, 'cpuPercent')),
        averageRssBytes: average(finiteValues(part, 'rssBytes')),
        peakRssBytes: peakOf(finiteValues(part, 'rssBytes'))
    });
    const first = describe(samples.slice(0, mid)), second = describe(samples.slice(mid));
    return {
        first,
        second,
        averageCpuPercentChange: subtractOrNull(second.averageCpuPercent, first.averageCpuPercent),
        averageRssBytesChange: subtractOrNull(second.averageRssBytes, first.averageRssBytes)
    };
}
export async function profileProcess(pid: number, durationMs = 3000, intervalMs = 250, mode: ProfileMode = 'Monitor', options: Opts = {}) {
    if (!Number.isInteger(pid) || pid <= 0)
        throw new Error('PID must be a positive integer.');
    const duration = Math.max(500, Math.min(30000, durationMs)), interval = Math.max(100, Math.min(2000, intervalMs));
    const samples: any[] = [], errors: string[] = [], limitations: string[] = [
        'Process-level sampling; no function-level hotspots or network metrics.',
        'Metrics depend on operating-system permissions and provider availability.'
    ];
    let previous: any = null;
    const started = Date.now();
    const signal = options.signal;
    let identity = options.expectedIdentityToken;
    const initial: any = await inspectProcess(pid);
    const initialProcess = initial.findings[0];
    if (!initialProcess)
        return result('pid:' + pid, 'process_profile', [], {
            status: 'partial', errors: ['Process does not exist or is not visible.'], limitations: initial.limitations
        });
    identity = identity ?? initialProcess.identityToken;
    if (options.expectedIdentityToken && initialProcess.identityToken !== options.expectedIdentityToken)
        return result('pid:' + pid, 'process_profile', [], {
            status: 'partial', errors: ['Process identity does not match the expected start token.'], coverage: {
                examined: true, complete: false, notes: ['PID reuse protection rejected the target.']
            }
        });
    let ownership: 'not-checked' | 'owned' | 'unknown' = 'not-checked';
    if (options.requireOwnership) {
        const owner = await verifyProcessOwnership(pid);
        ownership = owner.known ? 'owned' : 'unknown';
        if (owner.known && !owner.owned)
            return result('pid:' + pid, 'process_profile', [], {
                status: 'partial', errors: ['Process is not owned by the current user.'], coverage: {
                    examined: true, complete: false, notes: ['Ownership check failed before sampling.']
                }
            });
        if (!owner.known && options.requireOwnership === 'verified')
            return result('pid:' + pid, 'process_profile', [], {
                status: 'partial',
                errors: ['Process ownership cannot be verified on this platform (OBSERVE mode refuses unverified targets).'],
                coverage: { examined: true, complete: false, notes: ['Verified-ownership check failed before sampling.'] }
            });
        if (!owner.known)
            limitations.push('Process ownership could not be verified on this platform; no ownership claim is made.');
    }
    let cancelled = false, useInitial = true;
    do {
        // The initial inspection already is the first sample; reusing it keeps the data and saves one OS enumeration.
        if (!useInitial && signal?.aborted) {
            cancelled = true;
            break;
        }
        const r: any = useInitial ? initial : await inspectProcess(pid);
        useInitial = false;
        const p = r.findings[0];
        if (!p) {
            errors.push(...r.limitations, 'Process vanished or is not visible.');
            break;
        }
        if (identity && p.identityToken !== identity) {
            errors.push('Process identity changed or process exited; sampling stopped to prevent PID-reuse contamination.');
            break;
        }
        const cpuDelta = previous && p.cpuTimeMs !== undefined && previous.cpuTimeMs !== undefined
            ? (p.cpuTimeMs - previous.cpuTimeMs)
            : undefined;
        const elapsed = previous ? Date.parse(new Date().toISOString()) - Date.parse(previous.at) : undefined;
        const cpuPercent = cpuDelta !== undefined && elapsed && elapsed > 0
            ? Math.max(0, cpuDelta / elapsed * 100 / Math.max(1, (await import('node:os')).cpus().length))
            : p.cpuPercent;
        samples.push({
            at: new Date().toISOString(),
            cpuPercent,
            rssBytes: p.rssBytes,
            vmsBytes: p.vmsBytes,
            cpuTimeMs: p.cpuTimeMs,
            diskReadBytes: p.diskReadBytes,
            diskWriteBytes: p.diskWriteBytes,
            threads: p.threads,
            ppid: p.ppid,
            children: p.children,
            identity: {
                name: p.name, executable: p.executable
            }
        });
        previous = { ...p, at: samples[samples.length - 1].at };
        if (mode === 'Snapshot')
            break;
        if (Date.now() - started >= duration)
            break;
        await new Promise<void>(resolve => {
            if (signal?.aborted) {
                resolve();
                return;
            }
            const timer = setTimeout(done, Math.min(interval, duration - (Date.now() - started)));
            function done() { clearTimeout(timer); signal?.removeEventListener('abort', done); resolve(); }
            signal?.addEventListener('abort', done, {
                once: true
            });
        });
    } while (Date.now() - started < duration);
    const avg = (key: string) => average(finiteValues(samples, key));
    const peak = (key: string) => peakOf(finiteValues(samples, key));
    const first = samples[0], last = samples.at(-1);
    const finding = {
        pid,
        mode,
        durationMs: Date.now() - started,
        sampleCount: samples.length,
        averageCpuPercent: avg('cpuPercent'),
        peakCpuPercent: peak('cpuPercent'),
        averageRssBytes: avg('rssBytes'),
        peakRssBytes: peak('rssBytes'),
        memoryChangeBytes: first && last && first.rssBytes !== undefined && last.rssBytes !== undefined
            ? last.rssBytes - first.rssBytes
            : null, readBytesDelta: first && last
            ? Math.max(0, (last.diskReadBytes ?? 0) - (first.diskReadBytes ?? 0))
            : null, writeBytesDelta: first && last
            ? Math.max(0, (last.diskWriteBytes ?? 0) - (first.diskWriteBytes ?? 0))
            : null, peakThreads: peak('threads'), ownership, samples
    };
    // Diagnostic adds the deterministic anomaly checks of this same series; Compare adds a first-versus-second-period view.
    if (mode === 'Diagnostic')
        Object.assign(finding, { anomalies: findAnomalies([{ pid, samples }]) });
    if (mode === 'Compare')
        Object.assign(finding, { periods: comparePeriods(samples) });
    const home = process.env.REVERSE_HOME || path.join(process.env.HOME || process.env.USERPROFILE || '.', '.reverse');
    const dir = path.join(home, 'profiles');
    await mkdir(dir, { recursive: true });
    const artifactPath = path.join(dir, `${randomUUID()}.json`);
    await writeFile(artifactPath, JSON.stringify({
        schemaVersion: 1, generatedAt: new Date().toISOString(), finding
    }, null, 2) + '\n', 'utf8');
    return result('pid:' + pid, 'process_profile', [{
            ...finding, artifactPath
        }], {
        status: errors.length || cancelled || !samples.length ? 'partial' : 'completed', errors, limitations: [
            ...limitations, ...(cancelled ? ['Sampling cancelled by caller.'] : [])
        ], coverage: {
            examined: samples.length > 0, complete: false, notes: [
                'Sampling duration and interval are bounded.',
                'CPU utilization is derived from process CPU-time deltas where available.',
                'PID start-time identity is checked between samples where supported.',
                'Profile is persisted as structured JSON.'
            ]
        }
    });
}
export async function monitorProcess(pid: number, options: ProfileOptions = {}) {
    return profileProcess(pid, options.durationMs, options.intervalMs, options.mode ?? 'Monitor', options);
}
/** Pure, deterministic anomaly rules over supplied series ({ pid, samples[] }). */
export function findAnomalies(series: any[]): any[] {
    const t = ANOMALY_THRESHOLDS;
    const findings: any[] = [];
    for (const p of series) {
        const samples = Array.isArray(p?.samples) ? p.samples : [];
        if (!samples.length)
            continue;
        const cpu = finiteValues(samples, 'cpuPercent'), rss = finiteValues(samples, 'rssBytes');
        const meanCpu = average(cpu);
        if (meanCpu !== null && meanCpu > t.sustainedCpuPercent)
            findings.push({
                pid: p.pid,
                type: 'sustained_cpu',
                severity: 'high',
                averageCpuPercent: meanCpu,
                threshold: t.sustainedCpuPercent
            });
        if (rss.length >= t.minRssSamples && rss[rss.length - 1] > rss[0] * t.rssGrowthRatio)
            findings.push({
                pid: p.pid,
                type: 'growing_memory',
                severity: 'medium',
                growthBytes: rss[rss.length - 1] - rss[0],
                growthRatio: rss[rss.length - 1] / Math.max(1, rss[0])
            });
        const maxCpu = peakOf(cpu);
        if (maxCpu !== null && maxCpu > t.spikeCpuPercent)
            findings.push({ pid: p.pid, type: 'cpu_spike', severity: 'medium', peakCpuPercent: maxCpu, threshold: t.spikeCpuPercent });
    }
    return findings;
}
export async function detectResourceAnomalies(series: any[]) {
    return result('local-host', 'resource_anomalies', findAnomalies(series), {
        coverage: {
            examined: true,
            complete: true,
            notes: ['Deterministic thresholds: sustained CPU >80%, spike >95%, RSS growth >20%.']
        }
    });
}
