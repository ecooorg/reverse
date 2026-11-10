import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceConfidence, evidenceFromResult, evidenceOperations } from '../dist/evidence-collect.js';
import { result } from '../dist/core-types.js';
import { PROMOTION_MIN_CONFIDENCE, promotionBlocker, type EvidenceRecord } from '../dist/evidence-engine.js';
const make = (operation: string, findings: unknown[], options: any = {}) => result('t', operation, findings, options);
test('every evidence operation maps to exactly one EvidenceType and sources name the Result', () => {
    const expected: Record<string, string> = {
        process_inspection: 'Process', process_tree: 'Process', process_profile: 'Process', memory_analysis: 'Memory',
        cpu_analysis: 'CPU', io_analysis: 'I/O', binary_analysis: 'Binary', benchmark: 'Benchmark',
        benchmark_comparison: 'Benchmark', compare_benchmarks: 'Benchmark', capture_baseline: 'Benchmark',
        behavior_validation: 'Validation'
    };
    assert.deepEqual(evidenceOperations().sort(), Object.keys(expected).sort());
    for (const [operation, type] of Object.entries(expected)) {
        const r = make(operation, [{ value: 1 }]);
        const e = evidenceFromResult(r)!;
        assert.equal(e.type, type, operation);
        assert.equal(e.source, `reverse:${operation}#${r.id}`);
        if (operation !== 'compare_benchmarks')
            assert.deepEqual(e.measurement, { value: 1 });
    }
});
test('operations that are not evidence types produce nothing', () => {
    for (const operation of ['source_inventory', 'dependency_analysis', 'process_inventory', 'resource_anomalies', 'unknown'])
        assert.equal(evidenceFromResult(make(operation, [{}])), undefined, operation);
});
test('confidence reflects the quality of the observation and is never a free choice', () => {
    const complete = { examined: true, complete: true, notes: [] };
    const incomplete = { examined: true, complete: false, notes: [] };
    assert.equal(evidenceConfidence({ status: 'completed', coverage: complete }), 1);
    assert.equal(evidenceConfidence({ status: 'completed', coverage: incomplete }), 0.8);
    assert.equal(evidenceConfidence({ status: 'partial', coverage: complete }), 0.4);
    assert.equal(evidenceConfidence({ status: 'failed', coverage: complete }), 0);
    assert.equal(evidenceConfidence({ status: 'unsupported', coverage: complete }), 0);
    assert.ok(0.4 < PROMOTION_MIN_CONFIDENCE, 'a partial result can never promote a hypothesis');
});
test('limitations, errors and incomplete coverage are carried over to the evidence', () => {
    const r = make('cpu_analysis', [{ pid: 1 }], {
        status: 'partial', limitations: ['only RSS'], errors: ['boom'], coverage: { examined: true, complete: false, notes: [] }
    });
    const e = evidenceFromResult(r)!;
    assert.ok(e.limitations.includes('only RSS'));
    assert.ok(e.limitations.includes('error: boom'));
    assert.ok(e.limitations.some(l => /incomplete/.test(l)));
    assert.equal(e.confidence, 0.4);
});
test('several findings are kept together instead of being cut to the first', () => {
    assert.deepEqual(evidenceFromResult(make('process_tree', [{ a: 1 }, { b: 2 }]))!.measurement, { findings: [{ a: 1 }, { b: 2 }] });
});
test('a suite comparison counts as improved only when every case is improved', () => {
    const row = (improved: boolean) => ({ label: 'x', comparison: { findings: [{ improved }] } });
    const m = (rows: unknown[]) => evidenceFromResult(make('compare_benchmarks', rows))!.measurement as any;
    assert.equal(m([row(true), row(true)]).verdict, 'improved');
    assert.equal(m([row(true), row(false)]).verdict, 'not_improved');
    assert.equal(m([{ label: 'x', verdict: 'insufficient_evidence' }]).improved, false);
    assert.equal(m([]).improved, false);
});
test('collected evidence follows the promotion rule: complete passing validation promotes, partial does not', async () => {
    const { EvidenceEngine } = await import('../dist/evidence-engine.js');
    const { mkdtemp, rm } = await import('node:fs/promises');
    const os = await import('node:os');
    const path = await import('node:path');
    const home = await mkdtemp(path.join(os.tmpdir(), 'reverse-collect-'));
    const previous = process.env.REVERSE_HOME;
    process.env.REVERSE_HOME = home;
    try {
        const engine = new EvidenceEngine();
        const s = await engine.createResearchSession('collect');
        const ok = await engine.addEvidence(s.session_id, evidenceFromResult(make('behavior_validation', [{ passed: true }]))!);
        const partialResult = make('behavior_validation', [{ passed: true }], { status: 'partial' });
        const partial = await engine.addEvidence(s.session_id, evidenceFromResult(partialResult)!);
        const loaded = await engine.getResearchSession(s.session_id);
        const find = (id: string) => loaded!.evidence.find((e: EvidenceRecord) => e.evidence_id === id);
        assert.equal(promotionBlocker(find(ok.evidence_id)), null);
        assert.match(promotionBlocker(find(partial.evidence_id))!, /below the promotion minimum/);
    }
    finally {
        if (previous === undefined)
            delete process.env.REVERSE_HOME;
        else
            process.env.REVERSE_HOME = previous;
        await rm(home, { recursive: true, force: true });
    }
});
