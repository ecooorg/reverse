import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import fc from 'fast-check';
import { analyzeLegacyLinux } from '../dist/legacy-linux.js';
import { inspectPackageBuffer } from '../dist/legacy-linux-packages.js';
import { summarizeVerneed } from '../dist/legacy-linux-symver.js';
import type { LegacyAuthorization } from '../dist/legacy-types.js';
// R-04 for Patch N: hostile-input property tests for the a.out, ELF and archive parsers.
// The seed is fixed so a failure reproduces on every host; fast-check still prints the shrunk counterexample.
const SEED = 20261111;
const auth: LegacyAuthorization = {
    basis: 'open_source',
    licenseOrConsentReference: 'test',
    declaredBy: 'legacy-linux-property.test',
    declaredAt: new Date().toISOString()
};
const bytes = (max: number) => fc.uint8Array({ maxLength: max }).map(a => Buffer.from(a));
const elfIdent = (cls: number, data: number) => Buffer.from([0x7f, 0x45, 0x4c, 0x46, cls, data, 1, 0]);
/** ELF-shaped input: valid magic, random class and byte order, arbitrary rest of the header and body. */
const elfShaped = fc
    .tuple(fc.constantFrom(1, 2), fc.constantFrom(1, 2), bytes(1024))
    .map(([cls, data, tail]) => Buffer.concat([elfIdent(cls, data), tail]));
/** ELF64 LE header whose program-header table points at the arbitrary body, so the deeper parser paths run. */
const elf64WithTable = fc
    .tuple(fc.integer({ min: 0, max: 12 }), fc.integer({ min: 0, max: 0xffff }), bytes(768))
    .map(([phnum, phentsize, body]) => {
    const head = Buffer.alloc(64);
    elfIdent(2, 1).copy(head, 0);
    head.writeUInt16LE(2, 16);
    head.writeUInt16LE(62, 18);
    head.writeBigUInt64LE(64n, 32);
    head.writeUInt16LE(phentsize % 128, 54);
    head.writeUInt16LE(phnum, 56);
    return Buffer.concat([head, body]);
});
const aoutShaped = fc
    .tuple(fc.constantFrom(0x107, 0x108, 0x10b, 0xcc), fc.boolean(), bytes(256))
    .map(([magic, bigEndian, tail]) => {
    const head = Buffer.alloc(4);
    if (bigEndian)
        head.writeUInt32BE(magic);
    else
        head.writeUInt32LE(magic);
    return Buffer.concat([head, tail]);
});
const anyInput = fc.oneof(bytes(2048), elfShaped, elf64WithTable, aoutShaped);
test('property: analyzeLegacyLinux never throws on arbitrary, ELF-shaped or a.out-shaped bytes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'll-prop-'));
    let counter = 0;
    try {
        await fc.assert(fc.asyncProperty(anyInput, async (buf) => {
            const file = join(dir, `f${counter++}`);
            await writeFile(file, buf);
            const result = await analyzeLegacyLinux(file, auth);
            const finding = result.findings[0];
            assert.ok(finding);
            assert.ok(['a.out', 'ELF', 'unknown'].includes(finding.format));
            assert.equal(finding.sha256.length, 64);
            assert.ok(Array.isArray(finding.neededLibraries));
            assert.ok(finding.neededLibraries.every((n: unknown) => typeof n === 'string'));
            assert.ok([null, 'none', 'partial', 'full'].includes(finding.hardening.relro));
            assert.ok(finding.interpreter === null || typeof finding.interpreter === 'string');
            assert.equal(result.status, finding.format === 'unknown' ? 'partial' : 'completed');
        }), { seed: SEED, numRuns: 120 });
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('property: a buffer that starts with a known a.out magic is never classified as ELF', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'll-prop-aout-'));
    let counter = 0;
    try {
        await fc.assert(fc.asyncProperty(aoutShaped, async (buf) => {
            const file = join(dir, `a${counter++}`);
            await writeFile(file, buf);
            const finding = (await analyzeLegacyLinux(file, auth)).findings[0];
            // Fewer than 32 bytes cannot carry an a.out header; anything longer must be recognized as a.out.
            assert.equal(finding.format, buf.length >= 32 ? 'a.out' : 'unknown');
        }), { seed: SEED, numRuns: 80 });
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
const KINDS = ['rpm', 'deb', 'makeself', 'slackware-tgz', 'unknown'];
test('property: inspectPackageBuffer never throws and always returns a well-formed record', () => {
    const rpm = Buffer.from([0xed, 0xab, 0xee, 0xdb]);
    const ar = Buffer.from('!<arch>\n');
    const gzip = Buffer.from([0x1f, 0x8b]);
    const shebang = Buffer.from('#!/bin/sh\n');
    const magics = fc.constantFrom(rpm, ar, gzip, shebang, Buffer.alloc(0));
    fc.assert(fc.property(magics, bytes(9000), (magic, tail) => {
        const info = inspectPackageBuffer(Buffer.concat([magic, tail]), 'prop');
        assert.ok(KINDS.includes(info.kind));
        assert.ok(info.evidence.length > 0);
        assert.ok(info.limitations.length > 0);
        assert.ok(info.label === null || typeof info.label === 'string');
    }), { seed: SEED, numRuns: 400 });
});
test('property: RPM lead magic and a debian-binary ar member always win over trailing noise', () => {
    fc.assert(fc.property(bytes(512), (tail) => {
        assert.equal(inspectPackageBuffer(Buffer.concat([Buffer.from([0xed, 0xab, 0xee, 0xdb]), tail])).kind, 'rpm');
        const deb = Buffer.concat([Buffer.from('!<arch>\ndebian-binary   '), tail]);
        assert.equal(inspectPackageBuffer(deb).kind, 'deb');
    }), { seed: SEED, numRuns: 200 });
});
const versionOf = (tag: string) => tag.replace(/^GLIBC_/, '').split('.').map(Number);
const compare = (a: number[], b: number[]) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const d = (a[i] ?? 0) - (b[i] ?? 0);
        if (d !== 0)
            return d;
    }
    return 0;
};
test('property: summarizeVerneed never throws and reports only well-formed hints', () => {
    fc.assert(fc.property(bytes(4096), (buf) => {
        const summary = summarizeVerneed(buf);
        for (const hint of summary.hints) {
            assert.match(hint.name, /^(GLIBC_|GLIBCXX_|CXXABI_|GCC_|\.gnu\.version)/);
            assert.ok(hint.confidence > 0 && hint.confidence <= 1);
        }
        assert.ok(summary.limitations.length > 0);
    }), { seed: SEED, numRuns: 400 });
});
test('property: maxGlibc is the highest GLIBC_ tag planted between binary noise', () => {
    const noise = fc.array(fc.integer({ min: 128, max: 255 }), { maxLength: 64 }).map(a => Buffer.from(a));
    const tag = fc
        .tuple(fc.integer({ min: 0, max: 40 }), fc.option(fc.integer({ min: 0, max: 20 }), { nil: undefined }))
        .map(([minor, patch]) => `GLIBC_2.${minor}${patch === undefined ? '' : `.${patch}`}`);
    fc.assert(fc.property(fc.array(fc.tuple(noise, tag), { minLength: 1, maxLength: 20 }), (parts) => {
        const buf = Buffer.concat(parts.flatMap(([n, t]) => [n, Buffer.from(`${t}\0`)]));
        const planted = parts.map(([, t]) => t);
        const expected = planted.reduce((best, t) => (compare(versionOf(t), versionOf(best)) >= 0 ? t : best));
        const got = summarizeVerneed(buf).maxGlibc;
        assert.ok(got !== null);
        assert.equal(compare(versionOf(got), versionOf(expected)), 0);
    }), { seed: SEED, numRuns: 300 });
});
