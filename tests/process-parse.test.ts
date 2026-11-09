import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMacPs, parseWindowsCim, parseEtime } from '../dist/process-parse.js';
import { parseProcStatCpu, parseProcStatusPeak, parsePsRow, parsePsCpuTime } from '../dist/benchmark-resources.js';
test('process parsers tolerate hostile, truncated and oversized deterministic inputs', () => {
    const fixtures = ['', '\uFEFF', '{', '[', 'null', 'not-json', '0'.repeat(1024 * 1024), '\u0000'.repeat(4096)];
    for (const text of fixtures) {
        assert.doesNotThrow(() => parseWindowsCim(text));
        assert.doesNotThrow(() => parseMacPs(text, text));
        assert.doesNotThrow(() => parseEtime(text));
        assert.doesNotThrow(() => parsePsRow(text));
        assert.doesNotThrow(() => parsePsCpuTime(text));
        assert.doesNotThrow(() => parseProcStatCpu(text, 100));
        assert.doesNotThrow(() => parseProcStatusPeak(text));
    }
    for (let i = 0; i < 1000; i++) {
        const hostile = `${i}) name) ${'x '.repeat(i % 31)}${i % 2 ? '123' : '\u0000'}`;
        assert.doesNotThrow(() => parseProcStatCpu(hostile, 100));
        assert.doesNotThrow(() => parseMacPs(hostile, hostile));
        assert.doesNotThrow(() => parseWindowsCim(hostile));
    }
});
test('process-tree kill refuses to signal a PID whose identity token does not match', async () => {
    const { spawn } = await import('node:child_process');
    const { killProcessTree } = await import('../dist/process-tree.js');
    const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
    try {
        await new Promise(resolve => setTimeout(resolve, 100));
        const count = await killProcessTree(child.pid!, 'definitely-not-the-current-identity', true);
        assert.equal(count, 0);
        process.kill(child.pid!, 0);
    }
    finally {
        try {
            child.kill('SIGKILL');
        }
        catch { /* already exited */ }
        await new Promise<void>(resolve => child.once('close', () => resolve()));
    }
});
