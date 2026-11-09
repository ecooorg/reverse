import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { EvidenceEngine } from '../dist/evidence-engine.js';
test('evidence records are indexed by ID and research hypotheses remain separate from evidence', async () => {
    const previous = process.env.REVERSE_HOME;
    const home = await mkdtemp(path.join(os.tmpdir(), 'reverse-evidence-'));
    process.env.REVERSE_HOME = home;
    try {
        const engine = new EvidenceEngine();
        const ref = await engine.record('fixture', 'unit-test', { value: 7 });
        assert.ok(await engine.get(ref.id));
        const session = await engine.createResearchSession('fixture-target');
        const h = await engine.addHypothesis(session.session_id, { statement: 'The target is CPU-bound', provenance: ['profile observation'], confidence: 0.6 });
        assert.equal(h.kind, 'hypothesis');
        await assert.rejects(engine.updateHypothesis(session.session_id, h.hypothesis_id, 'supported', 'missing'), /only by referencing Validation or Benchmark/);
        const ev = await engine.addEvidence(session.session_id, { target_id: session.target_id, type: 'Benchmark', source: 'benchmark run', measurement: { medianMs: 10 }, confidence: 0.95, limitations: ['sampled'] });
        await engine.updateHypothesis(session.session_id, h.hypothesis_id, 'supported', ev.evidence_id);
        const loaded = await engine.getResearchSession(session.session_id);
        assert.equal(loaded?.hypotheses.length, 1);
        assert.equal(loaded?.evidence.length, 1);
        assert.equal(loaded?.hypotheses[0].promotionEvidenceId, ev.evidence_id);
        assert.deepEqual(loaded?.integrity, { valid: true, checkedEntries: 4, errors: [] });
        assert.equal(loaded?.entries.length, 4);
        for (let i = 0; i < loaded!.entries.length; i++) {
            const entry: any = loaded!.entries[i];
            assert.equal(entry.previousHash, i ? loaded!.entries[i - 1].hash : '0'.repeat(64));
            const { hash, ...base } = entry;
            assert.equal(hash, createHash('sha256').update(JSON.stringify(base)).digest('hex'));
        }
        const sessionFile = path.join(home, 'sessions', `${session.session_id}.json`);
        const original = JSON.parse(await (await import('node:fs/promises')).readFile(sessionFile, 'utf8'));
        const tamperedEntry = structuredClone(original);
        tamperedEntry.entries[1].payload.statement = 'tampered';
        await (await import('node:fs/promises')).writeFile(sessionFile, JSON.stringify(tamperedEntry));
        assert.equal((await engine.getResearchSession(session.session_id))?.integrity?.valid, false);
        const tamperedEvidence = structuredClone(original);
        tamperedEvidence.evidence[0].measurement.medianMs = 999;
        await (await import('node:fs/promises')).writeFile(sessionFile, JSON.stringify(tamperedEvidence));
        assert.equal((await engine.getResearchSession(session.session_id))?.integrity?.valid, false);
    }
    finally {
        if (previous === undefined)
            delete process.env.REVERSE_HOME;
        else
            process.env.REVERSE_HOME = previous;
        await rm(home, { recursive: true, force: true });
    }
});
