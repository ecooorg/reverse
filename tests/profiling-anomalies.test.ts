import test from 'node:test';
import assert from 'node:assert/strict';
import { ANOMALY_THRESHOLDS, comparePeriods, detectResourceAnomalies, findAnomalies } from '../dist/profiling-profiler.js';
// Deterministic fixtures: every threshold is exercised on both sides of its boundary, so changing a constant or a comparison
// operator makes at least one assertion fail.
const MB = 1024 * 1024;
const series = (cpu: Array<number | undefined>, rss: Array<number | undefined> = []) => ({
    pid: 7,
    samples: cpu.map((cpuPercent, i) => ({ cpuPercent, rssBytes: rss[i] }))
});
const types = (s: unknown) => findAnomalies([s]).map(f => f.type);
test('thresholds are the documented ones', () => {
    assert.deepEqual({ ...ANOMALY_THRESHOLDS }, { sustainedCpuPercent: 80, spikeCpuPercent: 95, rssGrowthRatio: 1.2, minRssSamples: 3 });
});
test('sustained CPU: strictly above 80% on average', () => {
    assert.deepEqual(types(series([80, 80, 80])), []);
    assert.deepEqual(types(series([80.5, 80.5, 80.5])), ['sustained_cpu']);
    assert.deepEqual(types(series([90, 80, 70])), [], 'a mean of exactly 80 is not sustained');
    assert.deepEqual(types(series([90, 80, 71])), ['sustained_cpu']);
    const f = findAnomalies([series([90, 90])])[0];
    assert.equal(f.severity, 'high');
    assert.equal(f.averageCpuPercent, 90);
    assert.equal(f.threshold, 80);
});
test('CPU spike: strictly above 95% at any sample, even when the mean is low', () => {
    assert.deepEqual(types(series([95, 1, 1])), []);
    const f = findAnomalies([series([96, 1, 1])]);
    assert.deepEqual(f.map(x => x.type), ['cpu_spike']);
    assert.equal(f[0].peakCpuPercent, 96);
    assert.equal(f[0].threshold, 95);
    assert.deepEqual(types(series([99, 99, 99])).sort(), ['cpu_spike', 'sustained_cpu']);
});
test('growing memory: last sample more than 20% above the first, at least three samples', () => {
    assert.deepEqual(types(series([1, 1, 1], [100 * MB, 110 * MB, 120 * MB])), [], 'exactly +20% is not growth');
    const f = findAnomalies([series([1, 1, 1], [100 * MB, 110 * MB, 121 * MB])]);
    assert.deepEqual(f.map(x => x.type), ['growing_memory']);
    assert.equal(f[0].growthBytes, 21 * MB);
    assert.ok(Math.abs(f[0].growthRatio - 1.21) < 1e-9);
    assert.deepEqual(types(series([1, 1], [100 * MB, 300 * MB])), [], 'two samples are too few to call growth');
    assert.deepEqual(types(series([1, 1, 1], [300 * MB, 200 * MB, 100 * MB])), [], 'shrinking memory is not growth');
});
test('missing or non-finite values are ignored and never invent a finding', () => {
    assert.deepEqual(findAnomalies([{ pid: 1, samples: [] }, { pid: 2 }, { pid: 3, samples: 'x' }, null]), []);
    assert.deepEqual(types(series([undefined, undefined, undefined])), []);
    assert.deepEqual(types(series([NaN, Infinity, 90, 90])), ['sustained_cpu'], 'non-finite samples are dropped, not averaged in');
});
test('findings are attributed to the right process', () => {
    const f = findAnomalies([{ ...series([99, 99]), pid: 11 }, { ...series([1, 1]), pid: 12 }]);
    assert.ok(f.length > 0 && f.every(x => x.pid === 11));
});
test('detect_resource_anomalies wraps the rules in the Result envelope', async () => {
    const r: any = await detectResourceAnomalies([series([99, 99, 99], [100 * MB, 100 * MB, 200 * MB])]);
    assert.equal(r.operation, 'resource_anomalies');
    assert.equal(r.status, 'completed');
    assert.deepEqual(r.findings.map((x: any) => x.type).sort(), ['cpu_spike', 'growing_memory', 'sustained_cpu']);
    assert.match(r.coverage.notes.join(' '), /80%.*95%.*20%/);
    assert.deepEqual(((await detectResourceAnomalies([])) as any).findings, []);
});
test('Compare mode periods: needs four samples and reports the change between the halves', () => {
    assert.equal(comparePeriods(series([1, 2, 3]).samples), null);
    const c: any = comparePeriods(series([10, 10, 30, 30], [100, 100, 300, 300]).samples);
    assert.equal(c.first.sampleCount, 2);
    assert.equal(c.second.sampleCount, 2);
    assert.equal(c.first.averageCpuPercent, 10);
    assert.equal(c.second.averageCpuPercent, 30);
    assert.equal(c.averageCpuPercentChange, 20);
    assert.equal(c.averageRssBytesChange, 200);
    assert.equal(c.second.peakRssBytes, 300);
    assert.equal(comparePeriods(series([undefined, undefined, undefined, undefined]).samples)!.averageCpuPercentChange, null);
});
