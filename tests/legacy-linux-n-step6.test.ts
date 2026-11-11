import assert from 'node:assert/strict';
import test from 'node:test';
import { runLegacyLinuxReferenceTrials } from '../dist/legacy-linux-reference-trials.js';
import { runLinuxBehaviorRoundTrip } from '../dist/legacy-linux-behavior.js';
const prevMode = process.env.REVERSE_MODE;
test('linux reference trials run both scenarios with L0 limitations', async () => {
    const report = await runLegacyLinuxReferenceTrials();
    assert.equal(report.trials.length, 2);
    const ids = report.trials.map(t => t.id).sort();
    assert.deepEqual(ids, ['compare-versions', 'diagnose-and-advise']);
    assert.equal(report.ok, true, report.trials.map(t => `${t.id}:${t.status}`).join(','));
    assert.equal(report.preservation.level, 'L0');
    assert.ok(report.limitations.some(l => /rootfs|oracle/i.test(l)));
    assert.ok((report.migration?.options.length ?? 0) >= 1);
});
test('linux behavior round-trip matches under CONTROLLED_EXECUTION', async () => {
    process.env.REVERSE_MODE = 'CONTROLLED_EXECUTION';
    const r = await runLinuxBehaviorRoundTrip();
    assert.equal(r.record.observation.exitCode, 0);
    assert.match(r.record.observation.stdout, /linux-behavior-ok/);
    assert.equal(r.equal, true, r.differences.join('; '));
    assert.ok(r.limitations.some(l => /rootfs|oracle|userland/i.test(l)));
});
test.after(() => {
    if (prevMode === undefined)
        delete process.env.REVERSE_MODE;
    else
        process.env.REVERSE_MODE = prevMode;
});
