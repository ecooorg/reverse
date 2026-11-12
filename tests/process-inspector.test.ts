import test from 'node:test';
import assert from 'node:assert/strict';
import { listProcesses, inspectProcess } from '../dist/process-inspector.js';
test('process inventory pagination returns stable offsets and a continuation marker', async () => {
    const first: any = await listProcesses(1, 0);
    assert.equal(first.pagination.offset, 0);
    assert.equal(first.pagination.limit, 1);
    if (first.pagination.total > 1) {
        assert.equal(first.pagination.nextOffset, 1);
        const second: any = await listProcesses(1, first.pagination.nextOffset);
        assert.equal(second.pagination.offset, 1);
        assert.ok(second.findings.length <= 1);
    }
});
test('inspectProcess rejects non-positive PIDs', async () => {
    for (const bad of [0, -1, 1.5, NaN])
        await assert.rejects(() => inspectProcess(bad as number), /positive integer/);
});
test('inspectProcess returns partial for a non-existent PID', async () => {
    const r: any = await inspectProcess(2147483646);
    assert.equal(r.status, 'partial');
    assert.deepEqual(r.findings, []);
});
test('inspectProcess finds the current process on this host', async () => {
    const r: any = await inspectProcess(process.pid);
    assert.equal(r.status, 'completed');
    assert.equal(r.findings[0]?.pid, process.pid);
    if (process.platform === 'darwin') {
        assert.match(r.coverage?.notes?.join(' ') ?? '', /ps -p fast path/i);
    }
});
