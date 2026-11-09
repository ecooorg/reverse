import test from 'node:test';
import assert from 'node:assert/strict';
import { capStrings, wrapUntrusted, MAX_STRING_LENGTH } from '../dist/core-untrusted.js';
test('capStrings cuts long strings at any depth and counts them', () => {
    const r: any = capStrings({ a: 'x'.repeat(MAX_STRING_LENGTH + 10), b: ['ok', { c: 'y'.repeat(MAX_STRING_LENGTH + 1) }] });
    assert.equal(r.truncated, 2);
    assert.equal(r.value.b[0], 'ok');
    assert.match(r.value.a, /truncated 10 chars/);
});
test('wrapUntrusted keeps arrays as arrays in text and wraps them for structured output', () => {
    const w: any = wrapUntrusted(['a']);
    assert.deepEqual(w.text, ['a']);
    assert.deepEqual(w.structured.items, ['a']);
    assert.equal(w.structured.untrustedContent.truncatedStrings, 0);
});
test('wrapUntrusted enforces the total response budget and marks omitted findings', () => {
    const w: any = wrapUntrusted({ status: 'completed', findings: Array.from({ length: 1800 }, (_, i) => ({ id: i, detail: 'x'.repeat(1000) })), coverage: { complete: true, notes: [] }, limitations: [] });
    assert.ok(Buffer.byteLength(JSON.stringify(w.text)) <= 1024 * 1024);
    assert.equal(w.text.status, 'partial');
    assert.equal(w.text.coverage.complete, false);
    assert.ok(w.structured.responseBudget.truncatedItems > 0);
});
