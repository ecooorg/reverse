import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { runLegacyReferenceTrials } from '../dist/legacy-reference-trials.js';
test('reference trials run both scenarios on crafted fixtures', async () => {
    const report = await runLegacyReferenceTrials();
    const golden = JSON.parse(await readFile(new URL('../tests/legacy-linux-reference-golden.json', import.meta.url), 'utf8'));
    assert.equal(report.trials.length, golden.expected.trialIds.length);
    const ids = report.trials.map(t => t.id).sort();
    assert.deepEqual(ids, golden.expected.trialIds);
    assert.equal(report.ok, true, report.trials.map(t => `${t.id}:${t.status}`).join(','));
    assert.equal(report.authorization.basis, 'open_source');
    assert.ok(report.migration?.authorization.declaredBy);
    assert.deepEqual(report.trials.map(t => t.status), golden.expected.trialStatuses);
    assert.equal(report.preservation.level, golden.expected.preservationLevel);
    if (golden.expected.requiresExplicitOracleLimitation)
        assert.ok(report.limitations.some(l => /oracle|licensed/i.test(l)));
    for (const t of report.trials) {
        assert.notEqual(t.status, 'failed', t.summary);
        assert.ok(t.evidence.length > 0);
        assert.ok(t.limitations.length > 0);
    }
    assert.ok((report.migration?.options.length ?? 0) >= golden.expected.minimumMigrationOptions);
});
