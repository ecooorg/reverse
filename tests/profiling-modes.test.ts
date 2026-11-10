import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { profileProcess } from '../dist/profiling-profiler.js';
import { inspectionCostMs, windowFor } from './sampling-window.js';
const home = await mkdtemp(path.join(os.tmpdir(), 'reverse-modes-'));
process.env.REVERSE_HOME = home;
const children: ChildProcess[] = [];
const target = () => {
    const c = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
    children.push(c);
    return c.pid!;
};
after(async () => {
    for (const c of children)
        c.kill();
    await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
const finding = async (pid: number, mode: any, duration = 700, options: any = {}) => {
    const r: any = await profileProcess(pid, duration, 100, mode, options);
    return { r, f: r.findings[0] };
};
test('Snapshot takes exactly one sample and no mode-specific extras', async () => {
    const { f } = await finding(target(), 'Snapshot');
    assert.equal(f.mode, 'Snapshot');
    assert.equal(f.sampleCount, 1);
    assert.equal(f.anomalies, undefined);
    assert.equal(f.periods, undefined);
});
test('Monitor keeps sampling until the bounded duration and adds no extras', async () => {
    const pid = target();
    const { f } = await finding(pid, 'Monitor', windowFor(800, 3, await inspectionCostMs(pid)));
    assert.equal(f.mode, 'Monitor');
    assert.ok(f.sampleCount >= 3, `samples: ${f.sampleCount}`);
    assert.ok(f.durationMs >= 700);
    assert.equal(f.anomalies, undefined);
    assert.equal(f.periods, undefined);
});
test('Diagnostic adds the deterministic anomaly findings of the same series', async () => {
    const pid = target();
    const { f } = await finding(pid, 'Diagnostic', windowFor(800, 3, await inspectionCostMs(pid)));
    assert.equal(f.mode, 'Diagnostic');
    assert.ok(f.sampleCount >= 3);
    assert.ok(Array.isArray(f.anomalies), 'anomalies array is present even when empty');
    assert.equal(f.periods, undefined);
});
test('Compare splits the observation into two periods', async () => {
    const pid = target();
    const { f } = await finding(pid, 'Compare', windowFor(1000, 4, await inspectionCostMs(pid)));
    assert.equal(f.mode, 'Compare');
    assert.ok(f.sampleCount >= 4, `samples: ${f.sampleCount}`);
    assert.equal(f.periods.first.sampleCount + f.periods.second.sampleCount, f.sampleCount);
    assert.equal(f.anomalies, undefined);
});
test('a profile is persisted as JSON and the series respects identity and cancellation', async () => {
    const pid = target();
    const duration = windowFor(5000, 3, await inspectionCostMs(pid));
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 250);
    const { r, f } = await finding(pid, 'Monitor', duration, { signal: ac.signal });
    assert.equal(r.status, 'partial');
    assert.match(r.limitations.join(' '), /cancelled/i);
    assert.ok(f.sampleCount >= 1 && f.durationMs < duration - 1000);
    assert.ok(f.artifactPath.startsWith(home));
});
test('verified ownership (OBSERVE) accepts an owned process and refuses an unverifiable or foreign one', async () => {
    const owned = await finding(target(), 'Snapshot', 500, { requireOwnership: 'verified' });
    if (process.platform === 'win32') {
        assert.equal(owned.r.status, 'partial', 'Windows ownership is unknown, so verified mode refuses');
        assert.match(owned.r.errors.join(' '), /cannot be verified/);
    }
    else
        assert.equal(owned.f.sampleCount, 1);
    if (process.platform === 'linux' && process.getuid?.() !== 0) {
        const foreign = await finding(1, 'Snapshot', 500, { requireOwnership: 'verified' });
        assert.equal(foreign.r.status, 'partial');
        assert.match(foreign.r.errors.join(' '), /not owned/);
    }
    // The default (READ_ONLY) behavior is unchanged: unknown ownership is only a limitation.
    const lenient = await finding(target(), 'Snapshot', 500, { requireOwnership: true });
    assert.equal(lenient.f.sampleCount, 1);
});
