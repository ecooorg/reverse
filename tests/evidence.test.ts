import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
        const h = await engine.addHypothesis(session.session_id, {
            statement: 'The target is CPU-bound',
            provenance: ['profile observation'],
            confidence: 0.6
        });
        assert.equal(h.kind, 'hypothesis');
        const promote = (id: string) => engine.updateHypothesis(session.session_id, h.hypothesis_id, 'supported', id);
        await assert.rejects(promote('missing'), /only by referencing Validation or Benchmark/);
        const ev = await engine.addEvidence(session.session_id, {
            target_id: session.target_id,
            type: 'Benchmark',
            source: 'benchmark comparison',
            measurement: { verdict: 'improved', improved: true, medianMs: 10 },
            confidence: 0.95,
            limitations: ['sampled']
        });
        await promote(ev.evidence_id);
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
test('promotion looks at the content of the evidence, not only its type (closure of the promotion bypass)', async () => {
    const previous = process.env.REVERSE_HOME;
    const home = await mkdtemp(path.join(os.tmpdir(), 'reverse-promotion-'));
    process.env.REVERSE_HOME = home;
    try {
        const engine = new EvidenceEngine();
        const session = await engine.createResearchSession('promotion-target');
        const sid = session.session_id;
        const h = await engine.addHypothesis(sid, { statement: 'The change is safe and faster', provenance: ['agent'], confidence: 0.5 });
        const add = (type: 'Validation' | 'Benchmark', measurement: unknown, confidence: number) => engine.addEvidence(sid, {
            type,
            source: 'unit-test',
            measurement,
            confidence,
            limitations: []
        });
        const promote = (id: string) => engine.updateHypothesis(sid, h.hypothesis_id, 'supported', id);
        await assert.rejects(promote((await add('Validation', { passed: false }, 1)).evidence_id), /passed: true/);
        await assert.rejects(promote((await add('Validation', { passed: false }, 0)).evidence_id), /below the promotion minimum/);
        await assert.rejects(promote((await add('Validation', { passed: true }, 0.3)).evidence_id), /below the promotion minimum/);
        await assert.rejects(promote((await add('Validation', 'passed', 1)).evidence_id), /structured measurement/);
        await assert.rejects(promote((await add('Benchmark', { medianMs: 10 }, 0.9)).evidence_id), /"improved"/);
        await assert.rejects(promote((await add('Benchmark', { verdict: 'regressed' }, 0.9)).evidence_id), /"improved"/);
        await assert.rejects(promote((await add('Benchmark', { verdict: 'insufficient_evidence' }, 0.9)).evidence_id), /"improved"/);
        assert.equal((await engine.getResearchSession(sid))?.hypotheses[0].status, 'open', 'no failed attempt changed the status');
        // A tampered record is refused even when its content now looks supporting.
        const good = await add('Validation', { passed: false }, 0.9);
        const file = path.join(home, 'sessions', `${sid}.json`);
        const data = JSON.parse(await readFile(file, 'utf8'));
        data.evidence.find((e: any) => e.evidence_id === good.evidence_id).measurement = { passed: true };
        await writeFile(file, JSON.stringify(data));
        await assert.rejects(promote(good.evidence_id), /hash/);
        // The legitimate path still works.
        await promote((await add('Validation', { passed: true }, 0.9)).evidence_id);
        assert.equal((await engine.getResearchSession(sid))?.hypotheses[0].status, 'supported');
    }
    finally {
        if (previous === undefined)
            delete process.env.REVERSE_HOME;
        else
            process.env.REVERSE_HOME = previous;
        await rm(home, { recursive: true, force: true });
    }
});
