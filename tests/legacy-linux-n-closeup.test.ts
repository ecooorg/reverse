import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { summarizeVerneed } from '../dist/legacy-linux-symver.js';
import { analyzeLegacyLinux } from '../dist/legacy-linux.js';
import { createLiefProvider } from '../dist/providers-detect-tools.js';
import type { LegacyAuthorization } from '../dist/legacy-types.js';
import { runLegacyLinuxReferenceTrials } from '../dist/legacy-linux-reference-trials.js';
import { runLinuxBehaviorRoundTrip } from '../dist/legacy-linux-behavior.js';
const auth: LegacyAuthorization = {
    basis: 'open_source',
    licenseOrConsentReference: 'test',
    declaredBy: 'legacy-linux-n-closeup.test',
    declaredAt: new Date().toISOString()
};
test('summarizeVerneed ranks max GLIBC and GLIBCXX', () => {
    const s = summarizeVerneed(Buffer.from('GLIBC_2.2.5 GLIBC_2.17 GLIBCXX_3.4.9 GLIBCXX_3.4.22'));
    assert.equal(s.maxGlibc, 'GLIBC_2.17');
    assert.equal(s.maxGlibcxx, 'GLIBCXX_3.4.22');
    assert.ok(s.limitations.length > 0);
});
test('analyzeLegacyLinux exposes verneedSummary and version diagnosis', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'll-vn-'));
    try {
        const b = Buffer.alloc(512);
        b[0] = 0x7f;
        b.write('ELF', 1, 'ascii');
        b[4] = 1;
        b[5] = 1;
        b.writeUInt16LE(2, 16);
        b.writeUInt16LE(3, 18);
        b.write('libc.so.6 GLIBC_2.17', 100, 'ascii');
        const f = join(dir, 'e');
        await writeFile(f, b);
        const r = await analyzeLegacyLinux(f, auth);
        assert.ok(r.findings[0].verneedSummary.maxGlibc === 'GLIBC_2.17');
        assert.ok(r.findings[0].compatibilityFindings.some(c => /GLIBC_2\.17|libc\.so\.6/i.test(c.cause)));
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('lief provider is detect-only and never simulates', async () => {
    const prev = process.env.PATH;
    process.env.PATH = '/nonexistent-reverse-bin';
    try {
        const p = createLiefProvider();
        assert.equal(await p.available(), false);
        const r = await p.analyze('/tmp/nope');
        assert.equal(r.status, 'unsupported');
    }
    finally {
        process.env.PATH = prev;
    }
});
test('linux reference + behavior helpers still pass', async () => {
    process.env.REVERSE_MODE = 'CONTROLLED_EXECUTION';
    const trials = await runLegacyLinuxReferenceTrials();
    assert.equal(trials.ok, true);
    const rt = await runLinuxBehaviorRoundTrip(undefined, auth);
    assert.equal(rt.equal, true);
});
