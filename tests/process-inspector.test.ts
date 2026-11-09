import test from 'node:test';
import assert from 'node:assert/strict';
import { listProcesses } from '../dist/process-inspector.js';
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
