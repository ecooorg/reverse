/**
 * R-04 for Patch O: hostile-input property tests for Mac format detectors.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import fc from 'fast-check';
import { analyzeLegacyMac } from '../dist/legacy-mac.js';
import type { LegacyAuthorization } from '../dist/legacy-types.js';
const SEED = 0x0ace0ace;
const auth: LegacyAuthorization = {
    basis: 'open_source',
    licenseOrConsentReference: 'property-test',
    declaredBy: 'legacy-mac-property.test',
    declaredAt: new Date().toISOString(),
};
const bytes = (max: number) => fc.uint8Array({ maxLength: max }).map(a => Buffer.from(a));
const machOShaped = fc
    .tuple(fc.constantFrom(0xfeedface, 0xcefaedfe, 0xfeedfacf, 0xcffaedfe), bytes(512))
    .map(([magic, tail]) => {
    const head = Buffer.alloc(28);
    head.writeUInt32LE(magic >>> 0, 0);
    return Buffer.concat([head, tail]);
});
const pefShaped = fc.tuple(bytes(256)).map(([tail]) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(0x4a6f7921, 0);
    head.write('pwpc', 4);
    return Buffer.concat([head, tail]);
});
const anyInput = fc.oneof(bytes(2048), machOShaped, pefShaped);
const FORMATS = new Set([
    'mach-o', 'fat-mach-o', 'pef-cfm', '68k-code', 'appledouble',
    'macbinary', 'binhex', 'hfs-volume', 'unknown',
]);
test('property: analyzeLegacyMac never throws on arbitrary or format-shaped bytes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mac-prop-'));
    let counter = 0;
    try {
        await fc.assert(fc.asyncProperty(anyInput, async (buf) => {
            const file = join(dir, `f${counter++}`);
            await writeFile(file, buf);
            const result = await analyzeLegacyMac(file, auth);
            const finding = result.findings[0];
            assert.ok(finding);
            assert.ok(FORMATS.has(finding.format));
            assert.equal(finding.sha256.length, 64);
            assert.ok(Array.isArray(finding.dylibs));
            assert.ok(Array.isArray(finding.resourceTypes));
            assert.ok(Array.isArray(finding.containers));
            assert.ok(finding.machOFlags && typeof finding.machOFlags === 'object');
            assert.equal(result.status, finding.format === 'unknown' ? 'partial' : 'completed');
        }), { seed: SEED, numRuns: 100 });
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('property: PEF magic is never classified as Mach-O', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mac-prop-pef-'));
    let counter = 0;
    try {
        await fc.assert(fc.asyncProperty(pefShaped, async (buf) => {
            const file = join(dir, `p${counter++}`);
            await writeFile(file, buf);
            const finding = (await analyzeLegacyMac(file, auth)).findings[0];
            assert.notEqual(finding.format, 'mach-o');
            assert.notEqual(finding.format, 'fat-mach-o');
            assert.ok(finding.format === 'pef-cfm' || finding.format === 'unknown');
        }), { seed: SEED, numRuns: 40 });
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
