import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { extractSymbolVersionHints } from '../dist/legacy-linux-symver.js';
import { inspectPackageBuffer } from '../dist/legacy-linux-packages.js';
import { analyzeLegacyLinux } from '../dist/legacy-linux.js';
import type { LegacyAuthorization } from '../dist/legacy-types.js';
import { createReadelfProvider, createObjdumpProvider } from '../dist/providers-detect-tools.js';
const auth: LegacyAuthorization = {
    basis: 'open_source',
    licenseOrConsentReference: 'test',
    declaredBy: 'legacy-linux-n-step3.test',
    declaredAt: new Date().toISOString()
};
test('symbol version hints extract GLIBC and GLIBCXX strings', () => {
    const buf = Buffer.from('pad GLIBC_2.3.4 more GLIBCXX_3.4.9 CXXABI_1.3 end');
    const hints = extractSymbolVersionHints(buf);
    const names = hints.map(h => h.name);
    assert.ok(names.some(n => n.startsWith('GLIBC_2.3')));
    assert.ok(names.some(n => n.startsWith('GLIBCXX_3.4')));
    assert.ok(names.some(n => n.startsWith('CXXABI_1.3')));
});
test('RPM lead magic is detected without executing payload', () => {
    const b = Buffer.alloc(96);
    b[0] = 0xed;
    b[1] = 0xab;
    b[2] = 0xee;
    b[3] = 0xdb;
    const meta = inspectPackageBuffer(b, 'test');
    assert.equal(meta.kind, 'rpm');
    assert.ok(meta.limitations.some(l => /not executed/i.test(l)));
});
test('Debian ar with debian-binary is classified as deb', () => {
    const body = '!<arch>\ndebian-binary/  0 0 0 0 0 4\n2.0\n';
    const meta = inspectPackageBuffer(Buffer.from(body), 'test');
    assert.equal(meta.kind, 'deb');
});
test('makeself-style shell installer markers', () => {
    const body = '#!/bin/sh\n# This script was generated using Makeself\nfilesizes="123"\n';
    const meta = inspectPackageBuffer(Buffer.from(body), 'test');
    assert.equal(meta.kind, 'makeself');
});
test('analyzeLegacyLinux reports symbolVersionHints from GLIBC strings', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'll-sv-'));
    try {
        const b = Buffer.alloc(512);
        b[0] = 0x7f;
        b.write('ELF', 1, 'ascii');
        b[4] = 1;
        b[5] = 1;
        b.writeUInt16LE(2, 16);
        b.writeUInt16LE(3, 18);
        b.write('GLIBC_2.2.5 GLIBCXX_3.4', 100, 'ascii');
        const f = join(dir, 'e');
        await writeFile(f, b);
        const r = await analyzeLegacyLinux(f, auth);
        assert.ok(r.findings[0].symbolVersionHints.some(h => /GLIBC/.test(h.name)));
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('readelf/objdump providers report unavailable when missing (never simulate)', async () => {
    const prev = process.env.PATH;
    process.env.PATH = '/nonexistent-reverse-bin';
    try {
        const re = createReadelfProvider();
        const od = createObjdumpProvider();
        assert.equal(await re.available(), false);
        assert.equal(await od.available(), false);
        const r = await re.analyze('/tmp/nope');
        assert.equal(r.status, 'unsupported');
        assert.ok(r.limitations.some(l => /not installed|simulate/i.test(l)));
    }
    finally {
        process.env.PATH = prev;
    }
});
test('Linux analysis marks ELF-derived strings as untrusted and caps adversarial lengths', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'll-untrusted-'));
    try {
        const b = Buffer.alloc(6200);
        b[0] = 0x7f;
        b.write('ELF', 1, 'ascii');
        b[4] = 2;
        b[5] = 1;
        b[6] = 1;
        b.writeUInt16LE(2, 16);
        b.writeUInt16LE(62, 18);
        b.writeUInt32LE(1, 20);
        b.writeBigUInt64LE(64n, 32);
        b.writeUInt16LE(56, 54);
        b.writeUInt16LE(1, 56);
        b.writeUInt32LE(3, 64);
        b.writeUInt32LE(4, 68);
        b.writeBigUInt64LE(200n, 72);
        b.writeBigUInt64LE(200n, 80);
        b.writeBigUInt64LE(5000n, 96);
        b.write('/' + 'x'.repeat(4900), 200, 'ascii');
        const file = join(dir, 'hostile-elf');
        await writeFile(file, b);
        const report: any = await analyzeLegacyLinux(file, auth);
        assert.ok(report.untrustedContent);
        assert.ok(report.findings[0].interpreter.length <= 4200);
        assert.match(report.findings[0].interpreter, /truncated/);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
