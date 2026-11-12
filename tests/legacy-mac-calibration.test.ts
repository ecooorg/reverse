import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { writeCraftedMacCalibrationFixtures, runMacCalibration, } from '../dist/legacy-mac-calibration.js';
import type { LegacyAuthorization } from '../dist/legacy-types.js';
const AUTH: LegacyAuthorization = {
    basis: 'open_source',
    licenseOrConsentReference: 'test-fixture',
    declaredBy: 'unit-test',
    declaredAt: new Date().toISOString(),
};
test('Mac calibration fixtures score expected detectors', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mac-cal-'));
    try {
        const manifest = await writeCraftedMacCalibrationFixtures(dir);
        const manPath = path.join(dir, 'manifest.json');
        await writeFile(manPath, JSON.stringify(manifest, null, 2));
        const report = await runMacCalibration(manPath, { authorization: AUTH });
        assert.equal(report.evaluated, manifest.expectations.length);
        assert.equal(report.skipped, 0);
        assert.ok(report.failures.length === 0, report.failures.join('; '));
        for (const s of report.scores) {
            if (s.truePositives + s.falseNegatives > 0)
                assert.ok(s.recall === null || s.recall >= 0.99, `${s.detector} recall ${s.recall}`);
        }
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
