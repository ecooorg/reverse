/**
 * Hostile-input property tests for Android parsers (R-04, Patch P step 3).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
    parseAxmlManifest,
    parseArscSummary,
    parseDexClasses,
    detectApkSignatures,
} from '../dist/legacy-android-parsers.js';

test('parseAxmlManifest never throws on random buffers', () => {
    fc.assert(
        fc.property(fc.uint8Array({ minLength: 0, maxLength: 4096 }), (arr) => {
            const b = Buffer.from(arr);
            const m = parseAxmlManifest(b);
            assert.ok(m);
            assert.ok(Array.isArray(m.permissions));
            assert.ok(Array.isArray(m.activities));
            assert.ok(Array.isArray(m.evidence));
            return true;
        }),
        { numRuns: 40 },
    );
});

test('parseArscSummary never throws on random buffers', () => {
    fc.assert(
        fc.property(fc.uint8Array({ minLength: 0, maxLength: 4096 }), (arr) => {
            const s = parseArscSummary(Buffer.from(arr));
            assert.ok(s);
            assert.ok(Array.isArray(s.packageNames));
            return true;
        }),
        { numRuns: 40 },
    );
});

test('parseDexClasses never throws on random buffers', () => {
    fc.assert(
        fc.property(fc.uint8Array({ minLength: 0, maxLength: 8192 }), (arr) => {
            const d = parseDexClasses(Buffer.from(arr));
            assert.ok(d);
            assert.ok(Array.isArray(d.classNames));
            assert.ok(d.classCount >= 0);
            return true;
        }),
        { numRuns: 40 },
    );
});

test('detectApkSignatures never throws on random buffers', () => {
    fc.assert(
        fc.property(fc.uint8Array({ minLength: 0, maxLength: 8192 }), (arr) => {
            const s = detectApkSignatures(Buffer.from(arr));
            assert.ok(s);
            assert.ok(Array.isArray(s.schemes));
            return true;
        }),
        { numRuns: 40 },
    );
});
