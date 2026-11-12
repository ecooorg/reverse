import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { analyzeLegacyAndroid } from '../dist/legacy-android.js';
import { LegacyAuthorizationError } from '../dist/legacy-gate.js';
const AUTH = {
    basis: 'open_source' as const,
    licenseOrConsentReference: 'test-fixture',
    declaredBy: 'legacy-android.test',
    declaredAt: new Date().toISOString(),
};
test('analyzeLegacyAndroid refuses without authorization', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'la-auth-'));
    try {
        const f = path.join(dir, 'x.apk');
        await writeFile(f, Buffer.from('PK\x03\x04'));
        await assert.rejects(() => analyzeLegacyAndroid(f, null), LegacyAuthorizationError);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('DEX magic yields format DEX and Target Profile Android family', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'la-dex-'));
    try {
        const b = Buffer.alloc(70);
        b.write('dex\n035\0', 0);
        const f = path.join(dir, 'classes.dex');
        await writeFile(f, b);
        const r: any = await analyzeLegacyAndroid(f, AUTH);
        assert.equal(r.findings[0].format, 'DEX');
        assert.equal(r.findings[0].targetProfile.osAndEra.value.family, 'Android');
        assert.ok(r.findings[0].structuralDetectors.some((d: any) => d.name === 'dex-magic'));
        assert.equal(r.findings[0].authorization.basis, 'open_source');
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
