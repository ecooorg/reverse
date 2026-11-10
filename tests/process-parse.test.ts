import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMacPs, parseWindowsCim, parseEtime } from '../dist/process-parse.js';
import { windowsProcessScript, WINDOWS_CIM_SCRIPT, WINDOWS_TREE_SCRIPT } from '../dist/process-parse.js';
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
test('Windows helper scripts: single-PID query is filtered, lean tree query has no command lines, all parse the same way', () => {
    const one = windowsProcessScript(4242);
    assert.match(one, /-Filter 'ProcessId=4242 OR ParentProcessId=4242'/);
    assert.ok(!one.includes('"'), 'no double quotes: they would need escaping through execFile');
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])
        assert.throws(() => windowsProcessScript(bad), /positive integer/);
    assert.ok(!WINDOWS_TREE_SCRIPT.includes('CommandLine') && !WINDOWS_TREE_SCRIPT.includes('ExecutablePath'));
    assert.ok(WINDOWS_TREE_SCRIPT.includes("ToUniversalTime().ToString('o')"), 'same start-time format as the full table');
    assert.ok(WINDOWS_CIM_SCRIPT.includes("ToUniversalTime().ToString('o')"));
    // The lean and the filtered output are read by the same parser; the identity token is identical in both.
    const lean = '[{"ProcessId":10,"ParentProcessId":4,"Started":"2026-11-10T05:00:00.1234567Z"},'
        + '{"ProcessId":11,"ParentProcessId":10,"Started":"2026-11-10T05:00:01.0000000Z"}]';
    const rows = parseWindowsCim(lean);
    assert.deepEqual(rows.map(r => [r.pid, r.ppid, r.identityToken]), [
        [10, 4, 'windows:2026-11-10T05:00:00.1234567Z'],
        [11, 10, 'windows:2026-11-10T05:00:01.0000000Z']
    ]);
    // A single match is an object, no match is empty output.
    assert.equal(parseWindowsCim('{"ProcessId":7,"ParentProcessId":1,"Started":"2026-11-10T05:00:00.0000000Z"}').length, 1);
    assert.deepEqual(parseWindowsCim(''), []);
});
