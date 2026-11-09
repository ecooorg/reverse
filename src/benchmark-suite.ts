import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { storeDir, now, atomicWriteJson } from './core-util.js';
import { result } from './core-types.js';
import { runBenchmark, compareBenchmarks, type RunSpec } from './benchmark-engine.js';
export interface BenchmarkCase {
    name: string;
    command: string;
    args?: string[];
    cwd?: string;
    timeoutMs?: number;
}
export interface BenchmarkSuite {
    suite_id: string;
    name: string;
    cases: BenchmarkCase[];
    repetitions: number;
    warmupRuns: number;
    createdAt: string;
}
const suitePath = (id: string) => path.join(storeDir(), 'benchmark-suites', `${id}.json`);
const safe = (s: string) => /^[a-zA-Z0-9_-]{1,128}$/.test(s);
async function save(file: string, value: unknown) { await atomicWriteJson(file, value); }
export async function createBenchmarkSuite(input: {
    name?: string;
    cases: BenchmarkCase[];
    repetitions?: number;
    warmupRuns?: number;
}) {
    if (!Array.isArray(input.cases) || input.cases.length < 2 || input.cases.length > 10)
        throw new Error('A benchmark suite needs 2–10 cases.');
    const names = new Set<string>();
    for (const c of input.cases) {
        if (!c.name?.trim() || !c.command?.trim() || names.has(c.name))
            throw new Error('Each suite case needs a unique name and command.');
        names.add(c.name);
    }
    const suite: BenchmarkSuite = { suite_id: randomUUID(), name: input.name?.trim() || 'benchmark-suite', cases: input.cases, repetitions: Math.max(5, Math.min(20, Math.floor(input.repetitions ?? 5))), warmupRuns: Math.max(0, Math.min(5, Math.floor(input.warmupRuns ?? 1))), createdAt: now() };
    await save(suitePath(suite.suite_id), suite);
    return result(suite.name, 'create_benchmark_suite', [suite]);
}
export async function getBenchmarkSuite(id: string): Promise<BenchmarkSuite | undefined> {
    if (!safe(id))
        return undefined;
    try {
        return JSON.parse(await readFile(suitePath(id), 'utf8')) as BenchmarkSuite;
    }
    catch {
        return undefined;
    }
}
export async function runBenchmarkSuite(id: string) {
    if (!safe(id))
        throw new Error('Invalid suite id.');
    const suite = JSON.parse(await readFile(suitePath(id), 'utf8')) as BenchmarkSuite;
    const byCase = new Map(suite.cases.map(c => [c.name, [] as any[]]));
    const warmups = new Map(suite.cases.map(c => [c.name, 0]));
    // Round-robin execution reduces temporal/environment bias between A and B.
    for (let round = 0; round < suite.warmupRuns + suite.repetitions; round++) {
        for (const c of suite.cases) {
            const isWarmup = round < suite.warmupRuns;
            const one = await runBenchmark({ command: c.command, args: c.args, cwd: c.cwd, timeoutMs: c.timeoutMs, repetitions: 1, warmupRuns: 0, label: c.name } satisfies RunSpec);
            const run = one.findings[0]?.runs?.[0];
            if (run) {
                run.phase = isWarmup ? 'warmup' : 'measured';
                run.index = isWarmup ? round + 1 : round - suite.warmupRuns + 1;
                byCase.get(c.name)!.push(run);
            }
            if (isWarmup)
                warmups.set(c.name, warmups.get(c.name)! + 1);
        }
    }
    const findings = suite.cases.map(c => {
        const all = byCase.get(c.name)!;
        const runs = all.filter(x => x.phase === 'measured');
        const good = runs.filter(x => !x.error && !x.timedOut && x.exitCode === 0);
        const times = good.map(x => x.durationMs).sort((a, b) => a - b);
        const mean = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
        const median = times.length ? (times.length % 2 ? times[(times.length - 1) / 2] : (times[times.length / 2 - 1] + times[times.length / 2]) / 2) : null;
        return { label: c.name, command: c.command, args: c.args ?? [], repetitionsRequested: suite.repetitions, repetitionsCompleted: runs.length, successfulRuns: good.length, meanDurationMs: mean, medianDurationMs: median, runs, warmups: all.filter(x => x.phase === 'warmup'), environment: good[0]?.environment };
    });
    const out = result(suite.name, 'run_benchmark_suite', findings, { status: findings.every(f => f.successfulRuns === suite.repetitions) ? 'completed' : 'partial', limitations: ['Cases are executed in round-robin order to reduce time-dependent bias; this is not CPU/load isolation.', 'Each sample is a fresh process. Warm-up runs are excluded from statistics.'], coverage: { examined: findings.some(f => f.repetitionsCompleted > 0), complete: findings.every(f => f.successfulRuns === suite.repetitions), notes: ['Round-robin interleaving is enabled by default.'] } });
    const file = path.join(storeDir(), 'benchmarks', `${out.id}.json`);
    await save(file, out);
    return { ...out, findings: findings.map(f => ({ ...f, artifactPath: file })) };
}
export async function compareBenchmarkSuites(before: any, after: any) {
    const a = before?.findings ?? [], b = after?.findings ?? [];
    const rows = await Promise.all(a.map(async (x: any) => {
        const y = b.find((v: any) => v.label === x.label);
        if (!y)
            return { label: x.label, verdict: 'insufficient_evidence', reason: 'Matching case missing from after suite.' };
        return { label: x.label, comparison: await compareBenchmarks({ findings: [x] }, { findings: [y] }) };
    }));
    return result('benchmark-suites', 'compare_benchmarks', rows, { status: rows.length && rows.every((r: any) => r.comparison) ? 'completed' : 'partial', limitations: ['Each case comparison requires at least five successful runs per side and comparable environment fingerprints.'] });
}
export async function captureBaseline(spec: RunSpec & {
    name?: string;
}) {
    const measured = await runBenchmark({ ...spec, label: spec.name ?? spec.label ?? 'baseline' });
    const baseline = { baseline_id: randomUUID(), name: spec.name ?? spec.label ?? 'baseline', createdAt: now(), benchmark: measured };
    const file = path.join(storeDir(), 'baselines', `${baseline.baseline_id}.json`);
    await save(file, baseline);
    return result(baseline.name, 'capture_baseline', [{ baseline_id: baseline.baseline_id, name: baseline.name, artifactPath: file, benchmark: measured }], { status: measured.status, limitations: measured.limitations, coverage: measured.coverage });
}
export async function getBaseline(id: string) {
    if (!safe(id))
        return undefined;
    try {
        return JSON.parse(await readFile(path.join(storeDir(), 'baselines', `${id}.json`), 'utf8'));
    }
    catch {
        return undefined;
    }
}
export async function compareBaselines(beforeId: string, afterId: string) {
    const [before, after] = await Promise.all([getBaseline(beforeId), getBaseline(afterId)]);
    if (!before || !after)
        throw new Error('Both baseline IDs must exist in the local baseline store.');
    return compareBenchmarks(before.benchmark, after.benchmark);
}
