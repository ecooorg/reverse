import { spawn } from 'node:child_process';import { performance } from 'node:perf_hooks';import { result } from './core-types.js';import { saveJson } from './core-util.js';import { killProcessTree } from './process-tree.js';import { summarize, compareSamples } from './benchmark-stats.js';import { fingerprintComparison, getEnvironmentFingerprint, childEnv } from './benchmark-environment.js';
export interface RunSpec { command:string; args?:string[]; cwd?:string; timeoutMs?:number; repetitions?:number; warmupRuns?:number; label?:string; }
const OUTPUT_CAP = 1024 * 1024; // BYTES kept per stream; the excess is dropped and flagged
const KILL_GRACE_MS = 2000;     // how long to wait for stdio to close after the process tree was killed

/** Byte-accurate capture buffer: never holds more than OUTPUT_CAP bytes, whatever the chunk size. */
class CappedBuffer {
  private chunks: Buffer[] = [];
  private size = 0;
  truncated = false;
  push(chunk: Buffer): void {
    const room = OUTPUT_CAP - this.size;
    if (chunk.length <= room) { this.chunks.push(chunk); this.size += chunk.length; return; }
    if (room > 0) { this.chunks.push(chunk.subarray(0, room)); this.size += room; }
    this.truncated = true;
  }
  /** Decoded once at the end, so a multi-byte character is never split between chunks. */
  text(): string { return Buffer.concat(this.chunks).toString('utf8'); }
}

export { median } from './benchmark-stats.js';

function one(spec: RunSpec): Promise<any> {
  return new Promise(resolve => {
    const start = performance.now();
    const out = new CappedBuffer(), err = new CappedBuffer();
    let timedOut = false, settled = false, terminated = 0;
    let timer: NodeJS.Timeout | undefined, grace: NodeJS.Timeout | undefined, killing: Promise<void> | undefined;
    const child = spawn(spec.command, spec.args ?? [], { cwd: spec.cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: false, env: childEnv(), windowsHide: true });
    const finish = (extra: Record<string, unknown>) => {
      if (settled) return; settled = true;
      clearTimeout(timer); clearTimeout(grace);
      resolve({ durationMs: performance.now() - start, timedOut, stdout: out.text(), stderr: err.text(), stdoutTruncated: out.truncated, stderrTruncated: err.truncated, processesTerminated: terminated, ...extra });
    };
        child.stdout!.on('data', (d: Buffer) => out.push(d));
    child.stderr!.on('data', (d: Buffer) => err.push(d));
    timer = setTimeout(() => {
      timedOut = true;
      // Kill the whole tree (the snapshot is taken first, so grandchildren cannot escape by being re-parented).
      killing = killProcessTree(child.pid ?? 0).then(n => { terminated = n; }, () => { try { child.kill('SIGKILL'); } catch { /* gone */ } });
      // A survivor can still hold the stdio pipes open; do not wait for 'close' forever.
      grace = setTimeout(() => { child.stdout!.destroy(); child.stderr!.destroy(); finish({ exitCode: null, signal: 'SIGKILL' }); }, KILL_GRACE_MS);
    }, Math.max(100, Math.min(120000, spec.timeoutMs ?? 30000)));
    child.on('error', e => finish({ exitCode: null, signal: null, error: e.message }));
    // The tree kill may still be reporting (taskkill is slow on Windows): wait for it, so the count is final and no survivor outlives the run.
    child.on('close', (code, signal) => { void (killing ?? Promise.resolve()).then(() => finish({ exitCode: code, signal })); });
  });
}
const MAX_RUNS = 20, MAX_WARMUP = 5;
const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => Math.max(lo, Math.min(hi, Math.floor(Number.isFinite(Number(v)) ? Number(v) : dflt)));

export async function runBenchmark(spec: RunSpec) {
  if (!spec.command?.trim()) throw new Error('A command is required.');
  const n = clampInt(spec.repetitions, 1, MAX_RUNS, 3), warmup = clampInt(spec.warmupRuns, 0, MAX_WARMUP, 0);
  const warmups: any[] = [], runs: any[] = [];
  // Warm-up runs are executed and recorded but never enter the statistics.
  for (let i = 0; i < warmup; i++) { const r = await one(spec); warmups.push({ ...r, index: i + 1, phase: 'warmup' }); if (r.error || r.timedOut) break; }
  const warmupFailed = warmups.some(x => x.error || x.timedOut);
  for (let i = 0; !warmupFailed && i < n; i++) {
    const r = await one(spec); runs.push({ ...r, index: i + 1, phase: 'measured' });
    if (r.error || r.timedOut) break;
  }
  // Failed runs (error, timeout, non-zero exit) are excluded from the timing statistics.
  const good = runs.filter(x => !x.error && !x.timedOut && x.exitCode === 0);
  const times = good.map(x => x.durationMs), stats = summarize(times);
  const summary = {
    label: spec.label ?? 'benchmark', command: spec.command, args: spec.args ?? [], cwd: spec.cwd ?? process.cwd(),
    repetitionsRequested: n, repetitionsCompleted: runs.length, warmupRequested: warmup, warmupCompleted: warmups.length, successfulRuns: good.length,
    meanDurationMs: stats?.mean ?? null, medianDurationMs: stats?.median ?? null, minDurationMs: stats?.min ?? null, maxDurationMs: stats?.max ?? null,
    p95DurationMs: stats?.p95 ?? null, stddevMs: stats?.stddev ?? null, madMs: stats?.mad ?? null, outlierDurationsMs: stats?.outliers ?? [], ci95MeanMs: stats?.ci95 ?? null,
    environment: getEnvironmentFingerprint(spec), warmups, runs,
  };
  const failed = runs.some(x => x.error || x.timedOut) || warmupFailed;
  const r = result(spec.command, 'benchmark', [summary], {
    status: failed ? 'partial' : 'completed',
    limitations: [
      'Wall-clock duration only per run; CPU time, peak RAM, disk/network I/O and hardware normalization are not yet measured.',
      'Statistics cover successful runs only (exit code 0, no timeout); warm-up runs are recorded but excluded. Fewer than 5 successful runs give no confidence-based verdict.',
      'stdout/stderr are captured up to 1 MiB per stream (bytes); the excess is dropped and flagged as truncated.',
      'On timeout the whole process tree is terminated, not only the direct child.',
      'Children receive an allowlisted environment (see REVERSE_CHILD_ENV), not the full environment of the parent.',
      'Run commands execute with the current user permissions. Use trusted commands and an isolated working directory.',
    ],
    coverage: { examined: runs.length > 0, complete: !failed && runs.length === n, notes: ['No shell is used; command and arguments are passed directly.', 'Each repetition is a fresh process.'] },
  });
  const saved = await saveJson('benchmarks', r);
  return { ...r, findings: [{ ...summary, artifactPath: saved }] };
}

const durationsOf = (f: any): number[] => (Array.isArray(f?.runs) ? f.runs.filter((x: any) => !x.error && !x.timedOut && x.exitCode === 0).map((x: any) => x.durationMs) : []);

/** Compares two benchmark envelopes. A verdict needs repeated successful runs on both sides; means alone never produce `improved`. */
export async function compareBenchmarks(before: any, after: any) {
  const fb = before?.findings?.[0], fa = after?.findings?.[0];
  const a = Number(fb?.meanDurationMs), b = Number(fa?.meanDurationMs);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0) throw new Error('Both inputs must be Reverse benchmark results with positive meanDurationMs.');
  const delta = b - a, verdict = compareSamples(durationsOf(fb), durationsOf(fa));
  const env = fingerprintComparison(fb?.environment, fa?.environment);
  const warnings = env.comparable === false ? [`The environment fingerprints differ (${env.differences.join(', ')}); the comparison may be invalid.`] : env.comparable === null ? ['At least one input has no environment fingerprint; comparability is unknown.'] : [];
  return result('benchmark-pair', 'benchmark_comparison', [{
    beforeMeanMs: a, afterMeanMs: b, deltaMs: delta, changePercent: (delta / a) * 100,
    improved: verdict.verdict === 'improved', ...verdict, environmentComparable: env.comparable, environmentDifferences: env.differences, warnings,
    interpretation: verdict.verdict === 'improved' ? 'A statistically supported speedup was observed in these runs.' : verdict.verdict === 'regressed' ? 'A statistically supported slowdown was observed in these runs.' : verdict.verdict === 'no_significant_change' ? 'The runs do not show a significant difference.' : 'Not enough repeated runs to claim any difference; the mean change is descriptive only.',
  }], { limitations: ['A timing difference alone does not establish causality or functional equivalence.', 'Compare repeated runs under equivalent hardware, load, inputs and configuration.', 'Verdict: two-sided Mann-Whitney test (alpha 0.05) plus a bootstrap interval of the median shift that must exclude zero; at least 5 successful runs per side.'], status: warnings.length ? 'partial' : 'completed' });
}
