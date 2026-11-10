import { inspectProcess } from '../dist/process-inspector.js';
/** Wall-clock cost of one process inspection on this host: a few ms on Linux, hundreds of ms with ps or PowerShell. */
export async function inspectionCostMs(pid: number): Promise<number> {
    let worst = 0;
    for (let i = 0; i < 2; i++) {
        const started = Date.now();
        await inspectProcess(pid);
        worst = Math.max(worst, Date.now() - started);
    }
    return worst;
}
/**
 * Observation window that yields at least `samples` samples at the 100 ms interval whatever the cost of one sample.
 * It is never shorter than the nominal window and never longer than the 30 s bound of the profiler.
 */
export function windowFor(nominalMs: number, samples: number, costMs: number): number {
    return Math.min(30000, Math.max(nominalMs, Math.ceil(2 * (samples + 1) * (costMs + 100))));
}
