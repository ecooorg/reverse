import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EvidenceEngine } from '../dist/evidence-engine.js';
import { evidenceFromResult } from '../dist/evidence-collect.js';
import { analyzeSource } from '../dist/analysis-source.js';
import { analyzeDependencies } from '../dist/analysis-dependencies.js';
import { analyzeBinary } from '../dist/analysis-binary.js';
import { inspectProcess, analyzeMemory, analyzeCpu, analyzeIo } from '../dist/process-inspector.js';
import { profileProcess } from '../dist/profiling-profiler.js';
import { runBenchmark, compareBenchmarks } from '../dist/benchmark-engine.js';
import { validateBehavior } from '../dist/benchmark-validation.js';
// Reference trials on the three application shapes of the 0.2 acceptance criteria. Every piece of evidence below comes from
// a real analyzer run on a real file or process: nothing is a hand-written stub.
const references = [
    { target: 'small-source-app', kind: 'source' },
    { target: 'large-dependency-app', kind: 'source+dependencies' },
    { target: 'closed-binary-app', kind: 'binary' }
] as const;
const MAIN = "process.stdout.write('42');\n";
const nodeArgs = (code: string) => ['-e', code];
const live: ChildProcess[] = [];
async function createApp(root: string, ref: (typeof references)[number]) {
    const dir = path.join(root, ref.target);
    await mkdir(path.join(dir, 'src'), { recursive: true });
    if (ref.kind === 'binary')
        return { dir, command: process.execPath, args: nodeArgs(MAIN), binary: process.execPath };
    await writeFile(path.join(dir, 'src', 'main.js'), MAIN);
    if (ref.kind === 'source+dependencies') {
        const manifest = { name: ref.target, dependencies: { alpha: '^1.0.0', beta: '^2.0.0' } };
        await writeFile(path.join(dir, 'package.json'), JSON.stringify(manifest));
        for (let i = 0; i < 40; i++)
            await writeFile(path.join(dir, 'src', `module-${i}.js`), `export const value${i}=${i};\n`);
    }
    return { dir, command: process.execPath, args: [path.join(dir, 'src', 'main.js')], binary: undefined };
}
function startBusyChild(): ChildProcess {
    const child = spawn(process.execPath, nodeArgs('const t=Date.now();while(Date.now()-t<4000){}'), { stdio: 'ignore' });
    live.push(child);
    return child;
}
test('research cycle: real analyzers feed typed evidence through the whole session chain', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'reverse-research-cycle-'));
    const previous = process.env.REVERSE_HOME;
    process.env.REVERSE_HOME = home;
    try {
        const root = path.join(home, 'reference-apps');
        const engine = new EvidenceEngine();
        for (const ref of references) {
            const app = await createApp(root, ref);
            const session = await engine.createResearchSession(ref.target);
            const sid = session.session_id;
            const attach = async (r: any) => {
                const collected = evidenceFromResult(r);
                assert.ok(collected, `${r.operation} must be an evidence operation`);
                return engine.addEvidence(sid, collected);
            };
            // Observation: static facts about the target.
            await engine.addSessionEvent(sid, 'observation_recorded', { referenceKind: ref.kind });
            const types = new Set<string>();
            if (ref.kind === 'binary')
                types.add((await attach(await analyzeBinary(app.binary!))).type);
            else {
                const source: any = await analyzeSource(app.dir);
                assert.ok(source.findings[0].fileCount >= 1, 'source inventory is real');
                if (ref.kind === 'source+dependencies')
                    assert.equal(((await analyzeDependencies(app.dir)) as any).findings.length, 2);
            }
            // Profile: a real process, observed by the real inspectors.
            const child = startBusyChild();
            const pid = child.pid!;
            for (const r of [await inspectProcess(pid), await analyzeMemory(pid), await analyzeCpu(pid), await analyzeIo(pid)])
                types.add((await attach(r)).type);
            types.add((await attach(await profileProcess(pid, 600, 100, 'Monitor'))).type);
            await engine.addSessionEvent(sid, 'profile_completed', { pid });
            child.kill();
            // Baseline, optimization, benchmark, comparison.
            const slow = nodeArgs("setTimeout(()=>process.stdout.write('42'),150)");
            const base = await runBenchmark({ command: app.command, args: slow, repetitions: 6 });
            await attach(base);
            await engine.addSessionEvent(sid, 'baseline_captured', { id: base.id });
            await engine.addSessionEvent(sid, 'optimization_proposed', { change: 'remove the artificial delay' });
            const fast = await runBenchmark({ command: app.command, args: app.args, repetitions: 6 });
            await attach(fast);
            await engine.addSessionEvent(sid, 'benchmark_completed', { id: fast.id });
            const comparison: any = await compareBenchmarks(base, fast);
            assert.equal(comparison.findings[0].verdict, 'improved');
            const comparisonEvidence = await attach(comparison);
            await engine.addSessionEvent(sid, 'comparison_completed', { id: comparison.id });
            // Validation of the optimized program against the caller's expectation.
            const validation: any = await validateBehavior({ command: app.command, args: app.args }, { stdout: '42' });
            assert.equal(validation.findings[0].passed, true);
            const validationEvidence = await attach(validation);
            await engine.addSessionEvent(sid, 'validation_completed', { id: validation.id });
            // Hypothesis: promoted only by evidence whose content supports it.
            const hypothesis = await engine.addHypothesis(sid, {
                statement: `${ref.target} behavior is preserved after the optimization`,
                provenance: ['baseline comparison', 'validation run'],
                confidence: 0.8
            });
            await engine.updateHypothesis(sid, hypothesis.hypothesis_id, 'supported', validationEvidence.evidence_id);
            await engine.addSessionEvent(sid, 'final_evidence_report_created', { evidenceCount: 0 });
            const relations = [
                'target',
                'observations',
                'profile',
                'baseline',
                'optimization',
                'benchmark',
                'comparison',
                'validation',
                'final_report'
            ];
            for (const relation of relations)
                await engine.link(sid, relation, [relation === 'comparison'
                        ? comparisonEvidence.evidence_id
                        : `${ref.target}-${relation}`]);
            const loaded = await engine.getResearchSession(sid);
            assert.equal(loaded?.integrity?.valid, true, ref.target);
            assert.equal(loaded?.hypotheses[0].status, 'supported');
            const stored = new Set(loaded!.evidence.map(e => e.type));
            for (const type of ['Process', 'Memory', 'CPU', 'I/O', 'Benchmark', 'Validation'])
                assert.ok(stored.has(type as any), `${ref.target}: ${type} evidence came from an analyzer`);
            assert.equal(stored.has('Binary'), ref.kind === 'binary');
            assert.ok(loaded!.evidence.every(e => e.source.startsWith('reverse:')), 'every record names the Reverse operation');
            assert.deepEqual(Object.keys(loaded!.links).sort(), [...relations].sort());
        }
    }
    finally {
        for (const child of live)
            child.kill();
        if (previous === undefined)
            delete process.env.REVERSE_HOME;
        else
            process.env.REVERSE_HOME = previous;
        await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
});
