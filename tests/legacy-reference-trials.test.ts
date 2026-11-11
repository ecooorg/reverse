import assert from 'node:assert/strict';
import test from 'node:test';
import { runLegacyReferenceTrials } from '../dist/legacy-reference-trials.js';
test('reference trials run both scenarios on crafted fixtures', async () => {
    const report = await runLegacyReferenceTrials();
    assert.equal(report.trials.length, 2);
    const ids = report.trials.map(t => t.id).sort();
    assert.deepEqual(ids, ['compare-versions', 'diagnose-and-advise']);
    assert.equal(report.ok, true, report.trials.map(t => `${t.id}:${t.status}`).join(','));
    assert.equal(report.preservation.level, 'L0');
    assert.ok(report.limitations.some(l => /oracle|licensed/i.test(l)));
    for (const t of report.trials) {
        assert.notEqual(t.status, 'failed', t.summary);
        assert.ok(t.evidence.length > 0);
        assert.ok(t.limitations.length > 0);
    }
    assert.ok((report.migration?.options.length ?? 0) >= 1);
});
