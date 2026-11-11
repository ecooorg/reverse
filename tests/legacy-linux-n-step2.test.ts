import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertLinuxTablesValid, diagnoseLinuxFromTables } from '../dist/legacy-linux-tables.js';
import { writeCraftedLinuxCalibrationFixtures, runLinuxCalibration } from '../dist/legacy-linux-calibration.js';
import { analyzeLegacyLinux } from '../dist/legacy-linux.js';
import type { LegacyAuthorization } from '../dist/legacy-types.js';
const auth: LegacyAuthorization = {
    basis: 'open_source',
    licenseOrConsentReference: 'test',
    declaredBy: 'legacy-linux-n-step2.test',
    declaredAt: new Date().toISOString()
};
test('linux sourced tables validate', () => {
    const errors = assertLinuxTablesValid();
    assert.equal(errors.length, 0, errors.join('; '));
});
test('a.out diagnosis cites a.out loader table row', () => {
    const d = diagnoseLinuxFromTables({
        format: 'a.out',
        neededLibraries: [],
        interpreter: null,
        libcMarkers: [],
        compilerMarkers: []
    });
    assert.ok(d.some(x => x.tableEntryIds.includes('linux-aout-loader-removed')));
    assert.ok(d.every(x => x.evidence.includes('[table:')));
});
test('calibration fixtures score a.out and ELF detectors', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'll-cal-'));
    try {
        const manifest = await writeCraftedLinuxCalibrationFixtures(dir);
        const manPath = join(dir, 'manifest.json');
        await writeFile(manPath, JSON.stringify(manifest, null, 2));
        await assert.rejects(() => runLinuxCalibration(manPath, { authorization: null }), /authorization/i);
        const report = await runLinuxCalibration(manPath, { authorization: auth });
        assert.deepEqual(report.authorization, auth);
        assert.equal(report.evaluated, 4);
        assert.ok(report.scores.length > 0);
        assert.ok(report.scores.every(score => score.brierScore !== null && score.expectedCalibrationError !== null));
        const failedDet = report.failures.filter(f => /expected detector/.test(f));
        assert.equal(failedDet.length, 0, failedDet.join('; '));
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('analyzeLegacyLinux attaches compatibilityFindings for libc5 markers', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'll-diag-'));
    try {
        const b = Buffer.alloc(256);
        b[0] = 0x7f;
        b.write('ELF', 1, 'ascii');
        b[4] = 1;
        b[5] = 1;
        b.writeUInt16LE(2, 16);
        b.writeUInt16LE(3, 18);
        b.write('libc.so.5', 80, 'ascii');
        const f = join(dir, 'libc5');
        await writeFile(f, b);
        const r = await analyzeLegacyLinux(f, auth);
        const finding = r.findings[0];
        assert.ok(finding.compatibilityFindings.some(c => /libc\.so\.5|libc5/i.test(c.cause)));
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('hostile-input: random buffers never throw from analyzeLegacyLinux', async () => {
    for (let i = 0; i < 20; i++) {
        const dir = await mkdtemp(join(tmpdir(), 'll-fuzz-'));
        try {
            const n = (i * 17 + 3) % 200;
            const buf = Buffer.alloc(n);
            for (let j = 0; j < n; j++)
                buf[j] = (j * 13 + i) & 0xff;
            const f = join(dir, 'x');
            await writeFile(f, buf);
            const r = await analyzeLegacyLinux(f, auth);
            assert.ok(r.findings[0]);
            assert.ok(['a.out', 'ELF', 'unknown'].includes(r.findings[0].format));
        }
        finally {
            await rm(dir, { recursive: true, force: true });
        }
    }
});
