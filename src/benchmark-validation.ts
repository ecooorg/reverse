import { runBenchmark, type RunSpec } from './benchmark-engine.js';
import { result } from './core-types.js';
import { saveJson } from './core-util.js';
export async function validateBehavior(spec: RunSpec, expected: {
    exitCode?: number;
    stdout?: string;
    stderr?: string;
}, repetitions = 1) {
    const bench = await runBenchmark({ ...spec, repetitions });
    const run: any = bench.findings[0];
    const checks: any[] = [{
            name: 'exitCode',
            expected: expected.exitCode ?? 0,
            actual: run.runs[0]?.exitCode,
            passed: run.runs.every((x: any) => x.exitCode === (expected.exitCode ?? 0))
        }];
    if (expected.stdout !== undefined)
        checks.push({
            name: 'stdout',
            expected: expected.stdout,
            actual: run.runs[0]?.stdout,
            passed: run.runs.every((x: any) => x.stdout === expected.stdout)
        });
    if (expected.stderr !== undefined)
        checks.push({
            name: 'stderr',
            expected: expected.stderr,
            actual: run.runs[0]?.stderr,
            passed: run.runs.every((x: any) => x.stderr === expected.stderr)
        });
    const truncated = run.runs.some((x: any) => x.stdoutTruncated || x.stderrTruncated);
    if (truncated)
        checks.push({ name: 'outputNotTruncated', expected: false, actual: true, passed: false });
    // A clean mismatch is a completed check with passed=false; partial means the comparison itself could not be made in full (error,
    // timeout, truncated output).
    const incomplete = truncated || run.runs.length < run.repetitionsRequested || run.runs.some((x: any) => x.error || x.timedOut);
    const out = result(spec.command, 'behavior_validation', [{
            passed: checks.every(c => c.passed), checks, benchmarkId: bench.id
        }], {
        status: incomplete ? 'partial' : 'completed', limitations: [
            'This is exact output/exit-code checking for caller-specified cases, not proof of semantic equivalence.',
            'The expected output must be supplied by the caller.',
            'No regression test discovery or build-system integration is performed.',
            'Output cut at the 1 MiB capture cap is reported as a failed outputNotTruncated check, never as a match.'
        ]
    });
    const file = await saveJson('validations', out);
    return { ...out, findings: [{ ...out.findings[0], artifactPath: file }] };
}
