import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { captureScenario, compareObservations, replayScenario, type BehaviorScenario } from '../dist/behavior-capture.js';
const prevMode = process.env.REVERSE_MODE;
test('capture refuses without CONTROLLED_EXECUTION', async () => {
    process.env.REVERSE_MODE = 'READ_ONLY';
    const scenario: BehaviorScenario = {
        schemaVersion: '1.0',
        id: 'echo-1',
        command: process.execPath,
        args: ['-e', 'console.log("hello")']
    };
    await assert.rejects(() => captureScenario(scenario, { confirm: true }), /CONTROLLED_EXECUTION/);
});
test('capture then replay of a deterministic node script matches', async () => {
    process.env.REVERSE_MODE = 'CONTROLLED_EXECUTION';
    const script = 'console.log("hello-capture"); console.error("err"); process.exit(0);;;
    ';;;
    const scenario = {
        schemaVersion: '1.0' as const,
        id: 'det-hello',
        command: process.execPath,
        args: ['hello.mjs'],
        inputFiles: [{ relativePath: 'hello.mjs', content: script }],
        volatileFields: ['timestamps', 'scratch-paths'],
        timeoutMs: 8000
    };
    const dir = await mkdtemp(join(tmpdir(), 'reverse-capture-'));
    try {
        const record = await captureScenario(scenario, {
            confirm: true,
            outPath: join(dir, 'record.json'),
            environmentDetail: 'test'
        });
        const detail = `stdout=${record.observation.stdout.slice(0, 120)} ` +
            `stderr=${record.observation.stderr.slice(0, 120)}`;
        assert.equal(record.observation.exitCode, 0, detail);
        assert.match(record.observation.stdout, /hello-capture/);
        const cmp = await replayScenario(scenario, record, { confirm: true });
        assert.equal(cmp.equal, true, cmp.differences.join('; '));
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('compareObservations reports stdout drift', () => {
    const a = {
        exitCode: 0,
        signal: null,
        stdout: 'a',
        stderr: '',
        outputFiles: {},
        durationMs: 1,
        limitations: []
    };
    const b = { ...a, stdout: 'b' };
    const cmp = compareObservations(a, b, 'x');
    assert.equal(cmp.equal, false);
    assert.ok(cmp.differences.some(d => /stdout/.test(d)));
});
test.after(() => {
    if (prevMode === undefined)
        delete process.env.REVERSE_MODE;
    else
        process.env.REVERSE_MODE = prevMode;
});
