import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EvidenceEngine } from '../dist/evidence-engine.js';
const references = [
    { target: 'small-source-app', kind: 'source' },
    { target: 'large-dependency-app', kind: 'source+dependencies' },
    { target: 'closed-binary-app', kind: 'binary' },
];
test('research cycle links observations, profile, baseline, optimization, benchmark, comparison, validation and final report', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'reverse-research-cycle-'));
    const previous = process.env.REVERSE_HOME;
    process.env.REVERSE_HOME = home;
    try {
        const root = path.join(home, 'reference-apps');
        for (const ref of references) {
            const dir = path.join(root, ref.target);
            await mkdir(path.join(dir, 'src'), { recursive: true });
            await writeFile(path.join(dir, 'src', 'main.js'), 'export function run(){ return 42; }\n');
            if (ref.kind === 'source+dependencies') {
                await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: ref.target, dependencies: { alpha: '^1.0.0', beta: '^2.0.0' } }));
                for (let i = 0; i < 40; i++)
                    await writeFile(path.join(dir, 'src', `module-${i}.js`), `export const value${i}=${i};\n`);
            }
            else if (ref.kind === 'binary') {
                const elf = Buffer.alloc(64);
                elf.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]);
                elf.writeUInt16LE(2, 16);
                elf.writeUInt16LE(62, 18);
                elf.writeBigUInt64LE(0x400000n, 24);
                await writeFile(path.join(dir, 'closed.bin'), elf);
            }
        }
        const engine = new EvidenceEngine();
        for (const ref of references) {
            const session = await engine.createResearchSession(ref.target);
            const events = ['observation_recorded', 'profile_completed', 'baseline_captured', 'optimization_proposed', 'benchmark_completed', 'comparison_completed', 'validation_completed', 'final_evidence_report_created'];
            for (const event of events)
                await engine.addSessionEvent(session.session_id, event, { referenceKind: ref.kind });
            const types = ['Process', 'Memory', 'CPU', 'I/O', ref.kind === 'binary' ? 'Binary' : 'Benchmark', 'Benchmark', 'Validation'] as const;
            const evidence = [];
            for (const type of types)
                evidence.push(await engine.addEvidence(session.session_id, { type, source: `${ref.target}:${type}`, measurement: { observed: true }, confidence: 0.9, limitations: [] }));
            const hypothesis = await engine.addHypothesis(session.session_id, { statement: `${ref.target} behavior is preserved after optimization`, provenance: ['baseline comparison', 'validation run'], confidence: 0.8 });
            await engine.updateHypothesis(session.session_id, hypothesis.hypothesis_id, 'supported', evidence.find(x => x.type === 'Validation')!.evidence_id);
            for (const relation of ['target', 'observations', 'profile', 'baseline', 'optimization', 'benchmark', 'comparison', 'validation', 'final_report']) {
                await engine.link(session.session_id, relation, [relation === 'target' ? ref.target : `${ref.target}-${relation}`]);
            }
            const loaded = await engine.getResearchSession(session.session_id);
            assert.equal(loaded?.integrity?.valid, true, ref.target);
            assert.equal(loaded?.hypotheses[0].status, 'supported');
            assert.equal(loaded?.evidence.some(x => x.type === 'Validation'), true);
            assert.deepEqual(Object.keys(loaded!.links).sort(), ['baseline', 'benchmark', 'comparison', 'final_report', 'observations', 'optimization', 'profile', 'target', 'validation']);
        }
    }
    finally {
        if (previous === undefined)
            delete process.env.REVERSE_HOME;
        else
            process.env.REVERSE_HOME = previous;
        await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
});
