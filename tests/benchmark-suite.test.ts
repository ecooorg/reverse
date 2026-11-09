import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBenchmarkSuite, runBenchmarkSuite, compareBenchmarkSuites } from '../dist/benchmark-suite.js';
test('benchmark suite runs cases in interleaved rounds and supports baseline comparison', async () => {
    const previous = process.env.REVERSE_HOME;
    const home = await mkdtemp(path.join(os.tmpdir(), 'reverse-suite-'));
    process.env.REVERSE_HOME = home;
    try {
        const created: any = await createBenchmarkSuite({ name: 'fixture', repetitions: 5, warmupRuns: 1, cases: [
                { name: 'A', command: process.execPath, args: ['-e', 'process.stdout.write("A")'] },
                { name: 'B', command: process.execPath, args: ['-e', 'process.stdout.write("B")'] },
            ] });
        const id = created.findings[0].suite_id;
        const run: any = await runBenchmarkSuite(id);
        assert.equal(run.findings.length, 2);
        assert.ok(run.findings.every((f: any) => f.successfulRuns === 5 && f.warmups.length === 1));
        assert.ok(run.findings.every((f: any) => f.runs.every((r: any) => r.phase === 'measured')));
        const comparison: any = await compareBenchmarkSuites(run, run);
        assert.equal(comparison.findings.length, 2);
        assert.ok(comparison.findings.every((f: any) => f.comparison.findings[0].verdict !== undefined));
    }
    finally {
        if (previous === undefined)
            delete process.env.REVERSE_HOME;
        else
            process.env.REVERSE_HOME = previous;
        await rm(home, { recursive: true, force: true });
    }
});
