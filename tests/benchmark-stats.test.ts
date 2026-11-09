import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, percentile, mannWhitney, bootstrapShiftCi, compareSamples, median } from '../dist/benchmark-stats.js';
test('median handles odd, even and empty lists', () => {
    assert.equal(median([]), null);
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 3, 2]), 2.5);
});
test('summarize computes known values', () => {
    const s: any = summarize([2, 4, 4, 4, 5, 5, 7, 9]);
    assert.equal(s.mean, 5);
    assert.equal(s.median, 4.5);
    assert.equal(s.min, 2);
    assert.equal(s.max, 9);
    assert.ok(Math.abs(s.stddev - 2.13809) < 1e-4);
    assert.equal(s.mad, 0.5);
    assert.equal(summarize([]), null);
    assert.equal((summarize([5]) as any).ci95, null);
});
test('MAD outlier detection flags a far value only', () => {
    assert.deepEqual((summarize([10, 11, 10, 12, 11, 10, 500]) as any).outliers, [500]);
    assert.deepEqual((summarize([10, 10, 10]) as any).outliers, []);
});
test('percentile uses nearest rank', () => {
    assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
    assert.equal(percentile([5, 1, 3], 50), 3);
});
test('Mann-Whitney: separated samples are significant, identical are not; shift has the right sign', () => {
    const a = [1, 2, 3, 4, 5, 6], b = [11, 12, 13, 14, 15, 16];
    const sep = mannWhitney(a, b);
    assert.ok(sep.p < 0.01);
    assert.equal(sep.shift, 10);
    assert.ok(mannWhitney(a, a).p > 0.9);
    assert.equal(mannWhitney([3, 3, 3], [3, 3, 3]).p, 1);
});
test('bootstrap interval is deterministic and brackets the true shift', () => {
    const a = [10, 11, 12, 13, 14, 15], b = [20, 21, 22, 23, 24, 25];
    const ci = bootstrapShiftCi(a, b);
    assert.deepEqual(ci, bootstrapShiftCi(a, b));
    assert.ok(ci[0] <= 10 && ci[1] >= 10);
});
test('compareSamples: minimum run count and verdicts', () => {
    assert.equal(compareSamples([1, 2, 3, 4], [9, 9, 9, 9, 9]).verdict, 'insufficient_evidence');
    assert.equal(compareSamples([10, 11, 12, 13, 14], [1, 2, 3, 4, 5]).verdict, 'improved');
    assert.equal(compareSamples([1, 2, 3, 4, 5], [10, 11, 12, 13, 14]).verdict, 'regressed');
    assert.equal(compareSamples([5, 6, 7, 8, 9], [5, 6, 7, 8, 9]).verdict, 'no_significant_change');
});
test('statistics median uses the mean of both middle observations for even n', () => {
    assert.ok(Math.abs((median([26.8, 21.32]) ?? 0) - 24.06) < 1e-9);
    assert.equal(median([4]), 4);
    assert.equal(median([1, 2, 3]), 2);
    assert.equal(median([1, 2, 3, 4]), 2.5);
});
