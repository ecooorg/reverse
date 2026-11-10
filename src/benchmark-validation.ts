import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { runBenchmark, type RunSpec } from './benchmark-engine.js';
import { result } from './core-types.js';
import { saveJson } from './core-util.js';
export interface NormalizeOptions {
    /** Collapse runs of whitespace to a single space and trim. */
    whitespace?: boolean;
    /** Strip ISO-like timestamps before compare. */
    timestamps?: boolean;
    /** Sort lines before compare (order-independent output). */
    sortLines?: boolean;
}
export interface ValidateOptions {
    normalize?: NormalizeOptions;
    repetitions?: number;
}
function normalizeText(s: string, n?: NormalizeOptions): string {
    if (!n)
        return s;
    let out = s;
    if (n.timestamps) {
        out = out.replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, '<TS>');
    }
    if (n.sortLines) {
        out = out.split(/\r?\n/).slice().sort().join('\n');
    }
    if (n.whitespace) {
        out = out.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
    }
    return out;
}
export async function validateBehavior(spec: RunSpec, expected: {
    exitCode?: number;
    stdout?: string;
    stderr?: string;
}, repetitions = 1, options?: ValidateOptions) {
    const reps = options?.repetitions ?? repetitions;
    const norm = options?.normalize;
    const bench = await runBenchmark({ ...spec, repetitions: reps });
    const run: any = bench.findings[0];
    const expOut = expected.stdout !== undefined ? normalizeText(expected.stdout, norm) : undefined;
    const expErr = expected.stderr !== undefined ? normalizeText(expected.stderr, norm) : undefined;
    const checks: any[] = [{
            name: 'exitCode',
            expected: expected.exitCode ?? 0,
            actual: run.runs[0]?.exitCode,
            passed: run.runs.every((x: any) => x.exitCode === (expected.exitCode ?? 0))
        }];
    if (expOut !== undefined) {
        checks.push({
            name: 'stdout',
            expected: expOut,
            actual: normalizeText(run.runs[0]?.stdout ?? '', norm),
            passed: run.runs.every((x: any) => normalizeText(x.stdout ?? '', norm) === expOut),
            normalized: !!norm
        });
    }
    if (expErr !== undefined) {
        checks.push({
            name: 'stderr',
            expected: expErr,
            actual: normalizeText(run.runs[0]?.stderr ?? '', norm),
            passed: run.runs.every((x: any) => normalizeText(x.stderr ?? '', norm) === expErr),
            normalized: !!norm
        });
    }
    const truncated = run.runs.some((x: any) => x.stdoutTruncated || x.stderrTruncated);
    if (truncated) {
        checks.push({
            name: 'outputNotTruncated',
            expected: false,
            actual: true,
            passed: false
        });
    }
    const incomplete = truncated
        || run.runs.length < run.repetitionsRequested
        || run.runs.some((x: any) => x.error || x.timedOut);
    const passed = checks.every(c => c.passed);
    const limitations = [
        'Exact output/exit-code checking with optional normalization; not proof of semantic equivalence.',
        'The expected output must be supplied by the caller or a fixture.',
        'Output cut at the 1 MiB capture cap is a failed outputNotTruncated check, never a match.'
    ];
    if (!passed && !incomplete) {
        limitations.push('Equivalence cannot be proven: at least one check failed under the chosen rules.');
    }
    if (norm) {
        limitations.push('Normalization applied: '
            + [
                norm.whitespace ? 'whitespace' : '',
                norm.timestamps ? 'timestamps' : '',
                norm.sortLines ? 'sortLines' : ''
            ].filter(Boolean).join(', '));
    }
    const out = result(spec.command, 'behavior_validation', [{
            passed,
            checks,
            benchmarkId: bench.id,
            equivalenceProven: false,
            normalization: norm ?? null
        }], {
        status: incomplete ? 'partial' : 'completed',
        limitations
    });
    const file = await saveJson('validations', out);
    return { ...out, findings: [{ ...out.findings[0], artifactPath: file }] };
}
/** Load fixtures from a directory: each *.json with { command, args?, expected, normalize? }. */
export async function runValidationFixtures(dir: string) {
    const abs = path.resolve(dir);
    const names = (await readdir(abs)).filter(n => n.endsWith('.json')).sort();
    const results: unknown[] = [];
    for (const name of names) {
        const raw = JSON.parse(await readFile(path.join(abs, name), 'utf8'));
        const r = await validateBehavior({ command: raw.command, args: raw.args ?? [], cwd: raw.cwd }, raw.expected ?? {}, raw.repetitions
            ?? 1, { normalize: raw.normalize });
        results.push({ fixture: name, passed: r.findings[0].passed, id: r.id });
    }
    const allPassed = results.every((x: any) => x.passed);
    return result(abs, 'validation_fixtures', results, {
        status: 'completed',
        limitations: [
            'Fixture runner executes caller-authored JSON cases only.',
            'No automatic test discovery from project frameworks.'
        ],
        coverage: {
            examined: true,
            complete: true,
            notes: [`${results.length} fixture(s); allPassed=${allPassed}`]
        }
    });
}
