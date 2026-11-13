import test from 'node:test';
import assert from 'node:assert/strict';
import {
    collectAndroidUiObservations,
    replayAndroidSeededInput,
    compareAndroidObservations,
    type AdbRunner,
} from '../dist/legacy-android-capture.js';
import { LegacyAuthorizationError } from '../dist/legacy-gate.js';

const AUTH = {
    basis: 'open_source' as const,
    licenseOrConsentReference: 'test-fixture',
    declaredBy: 'legacy-android-capture.test',
    declaredAt: new Date().toISOString(),
};

function mockRunner(handlers: Record<string, { stdout?: string; stderr?: string; fail?: boolean }>): AdbRunner {
    return async (_serial, args) => {
        const key = args.join(' ');
        for (const [pattern, resp] of Object.entries(handlers)) {
            if (key.includes(pattern)) {
                if (resp.fail) {
                    const err = new Error('mock fail') as Error & { code: string };
                    err.code = 'MOCK';
                    throw err;
                }
                return { stdout: resp.stdout ?? '', stderr: resp.stderr ?? '' };
            }
        }
        return { stdout: '', stderr: '' };
    };
}

test('collectAndroidUiObservations refuses without authorization', async () => {
    await assert.rejects(
        () => collectAndroidUiObservations({ confirm: true, serial: 'emulator-5554' }),
        LegacyAuthorizationError,
    );
});

test('collectAndroidUiObservations refuses without CONTROLLED_EXECUTION/confirm', async () => {
    const prev = process.env.REVERSE_MODE;
    delete process.env.REVERSE_MODE;
    try {
        const r = await collectAndroidUiObservations({
            authorization: AUTH,
            confirm: false,
            serial: 'emulator-5554',
            runner: mockRunner({}),
        });
        assert.equal(r.status, 'refused');
        assert.equal(r.hierarchyXml, null);
    }
    finally {
        if (prev !== undefined) process.env.REVERSE_MODE = prev;
        else delete process.env.REVERSE_MODE;
    }
});

test('collectAndroidUiObservations rejects invalid serial without calling adb', async () => {
    process.env.REVERSE_MODE = 'CONTROLLED_EXECUTION';
    let called = false;
    const runner: AdbRunner = async () => {
        called = true;
        return { stdout: '', stderr: '' };
    };
    const r = await collectAndroidUiObservations({
        authorization: AUTH,
        confirm: true,
        serial: '-bad',
        runner,
    });
    assert.equal(r.status, 'unsupported');
    assert.equal(called, false);
});

test('collectAndroidUiObservations returns hierarchy and screenshot digest', async () => {
    process.env.REVERSE_MODE = 'CONTROLLED_EXECUTION';
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02]);
    const runner = mockRunner({
        'uiautomator dump': { stdout: 'UI hierchary dumped to: /sdcard/window_dump.xml' },
        'cat /sdcard/window_dump.xml': { stdout: '<?xml version="1.0"?><hierarchy><node text="OK"/></hierarchy>' },
        'screencap': { stdout: png.toString('binary') },
    });
    const r = await collectAndroidUiObservations({
        authorization: AUTH,
        confirm: true,
        serial: 'emulator-5554',
        runner,
    });
    assert.equal(r.status, 'completed');
    assert.ok(r.hierarchyXml?.includes('<hierarchy'));
    assert.equal(typeof r.screenshotSha256, 'string');
    assert.equal(r.screenshotSha256?.length, 64);
    assert.ok(r.limitations.some(l => /raw pixels/i.test(l)));
});

test('replayAndroidSeededInput refuses without confirm', async () => {
    process.env.REVERSE_MODE = 'CONTROLLED_EXECUTION';
    const r = await replayAndroidSeededInput({
        authorization: AUTH,
        confirm: false,
        serial: 'emulator-5554',
        packageName: 'com.example.app',
        runner: mockRunner({}),
    });
    assert.equal(r.status, 'refused');
    assert.equal(r.runs.length, 0);
});

test('replayAndroidSeededInput rejects bad package without adb', async () => {
    process.env.REVERSE_MODE = 'CONTROLLED_EXECUTION';
    let called = false;
    const runner: AdbRunner = async () => {
        called = true;
        return { stdout: '', stderr: '' };
    };
    const r = await replayAndroidSeededInput({
        authorization: AUTH,
        confirm: true,
        serial: 'emulator-5554',
        packageName: 'bad;rm -rf',
        runner,
    });
    assert.equal(r.status, 'unsupported');
    assert.equal(called, false);
});

test('replayAndroidSeededInput runs monkey with fixed seed and reports stability', async () => {
    process.env.REVERSE_MODE = 'CONTROLLED_EXECUTION';
    const runner = mockRunner({
        'pm clear': { stdout: 'Success' },
        'monkey': { stdout: 'Events injected: 50\n## Network stats: elapsed time=100ms' },
    });
    const r = await replayAndroidSeededInput({
        authorization: AUTH,
        confirm: true,
        serial: 'emulator-5554',
        packageName: 'com.example.app',
        seed: 99,
        eventCount: 50,
        runs: 2,
        clearPackage: true,
        runner,
    });
    assert.equal(r.status, 'completed');
    assert.equal(r.seed, 99);
    assert.equal(r.runs.length, 2);
    assert.equal(r.stable, true);
    assert.ok(r.runs.every(x => x.pmCleared));
    assert.ok(r.runs.every(x => x.exitCode === 0));
});

test('compareAndroidObservations treats pixel drift as non-fatal', () => {
    const left = {
        hierarchyXml: '<hierarchy><node text="A"/></hierarchy>',
        screenshotSha256: 'aaa',
        monkeyExitCode: 0,
        monkeyStdoutTail: 'Events injected: 10',
    };
    const right = {
        hierarchyXml: '<hierarchy><node text="A"/></hierarchy>',
        screenshotSha256: 'bbb',
        monkeyExitCode: 0,
        monkeyStdoutTail: 'Events injected: 10',
    };
    const c = compareAndroidObservations({ left, right });
    assert.equal(c.uiEqual, true);
    assert.equal(c.monkeyEqual, true);
    assert.equal(c.pixelDrift, true);
    assert.equal(c.equal, true);
    assert.ok(c.differences.some(d => /pixel drift/i.test(d)));
});

test('compareAndroidObservations reports UI hierarchy differences', () => {
    const c = compareAndroidObservations({
        left: { hierarchyXml: '<hierarchy><node text="A"/></hierarchy>' },
        right: { hierarchyXml: '<hierarchy><node text="B"/></hierarchy>' },
    });
    assert.equal(c.uiEqual, false);
    assert.equal(c.equal, false);
});

test('collectAndroidUiObservations wraps untrusted hierarchy text', async () => {
    process.env.REVERSE_MODE = 'CONTROLLED_EXECUTION';
    const long = 'X'.repeat(5000);
    const runner = mockRunner({
        'uiautomator dump': { stdout: 'ok' },
        'cat /sdcard/window_dump.xml': { stdout: long },
        'screencap': { stdout: Buffer.alloc(16, 1).toString('binary') },
    });
    const r = await collectAndroidUiObservations({
        authorization: AUTH,
        confirm: true,
        serial: 'emulator-5554',
        runner,
    });
    assert.ok(r.hierarchyXml);
    assert.ok(r.hierarchyXml!.includes('…[truncated'));
    assert.ok(r.hierarchyXml!.length < 5000);
});
