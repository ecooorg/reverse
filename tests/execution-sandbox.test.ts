import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { detectSandboxMechanism, runInSandbox, writeIsolationProbe } from '../dist/execution-sandbox.js';
import { bootstrapExecutionEnvironments } from '../dist/execution-environment.js';
import { createWineEnvironment } from '../dist/execution-environment.js';
import { listExecutionEnvironments } from '../dist/execution-environment.js';
import { runWorksFailsMatrix } from '../dist/execution-environment.js';
const prevMode = process.env.REVERSE_MODE;
test('sandbox refuses to run without CONTROLLED_EXECUTION and confirm', async () => {
    process.env.REVERSE_MODE = 'READ_ONLY';
    await assert.rejects(() => runInSandbox({
        command: process.execPath,
        args: ['-e', 'console.log(1)'],
        confirm: true
    }), /CONTROLLED_EXECUTION/);
    process.env.REVERSE_MODE = 'CONTROLLED_EXECUTION';
    await assert.rejects(() => runInSandbox({
        command: process.execPath,
        args: ['-e', 'console.log(1)'],
        confirm: false
    }), /confirm/);
});
test('sandbox runs a probe in a scratch directory with a real mechanism report', async () => {
    process.env.REVERSE_MODE = 'CONTROLLED_EXECUTION';
    const mechanism = await detectSandboxMechanism();
    assert.ok(['bwrap', 'unshare', 'process-group', 'none'].includes(mechanism.id));
    const dir = await mkdtemp(join(tmpdir(), 'reverse-probe-'));
    try {
        const probe = await writeIsolationProbe(dir);
        // Keep scratch so we could inspect; runInSandbox deletes unless KEEP.
        process.env.REVERSE_KEEP_SCRATCH = '1';
        const r = await runInSandbox({
            command: process.execPath,
            args: [probe],
            confirm: true,
            limits: { timeoutMs: 8000 }
        });
        assert.equal(typeof r.durationMs, 'number');
        assert.ok(r.mechanism.id);
        // Probe always prints one of the NETWORK_* tokens.
        assert.match(r.stdout + r.stderr, /NETWORK_(OK|BLOCKED)/);
        if (r.mechanism.networkIsolated)
            assert.match(r.stdout + r.stderr, /NETWORK_BLOCKED/);
        // Limitations must be non-empty when isolation is partial.
        if (!r.mechanism.networkIsolated)
            assert.ok(r.limitations.length > 0);
    }
    finally {
        delete process.env.REVERSE_KEEP_SCRATCH;
        await rm(dir, { recursive: true, force: true });
    }
});
test('wine/dosbox/qemu adapters report unsupported when binary is absent', async () => {
    bootstrapExecutionEnvironments();
    const names = listExecutionEnvironments().map(e => e.name);
    assert.ok(names.includes('wine'));
    assert.ok(names.includes('dosbox'));
    assert.ok(names.includes('qemu'));
    // Force PATH empty-ish so wine is unlikely to resolve.
    const prevPath = process.env.PATH;
    process.env.PATH = '/nonexistent-reverse-path';
    try {
        const wine = createWineEnvironment();
        assert.equal(await wine.available(), false);
        const r = await wine.run('/tmp/nope.exe', { confirm: true });
        assert.ok(r.limitations.some(l => /not installed/i.test(l)));
    }
    finally {
        process.env.PATH = prevPath;
    }
});
test('works/fails matrix marks missing engines as unsupported', async () => {
    process.env.REVERSE_MODE = 'CONTROLLED_EXECUTION';
    const prevPath = process.env.PATH;
    process.env.PATH = '/nonexistent-reverse-path';
    try {
        // Re-bootstrap with empty path: register new instances
        const cells = await runWorksFailsMatrix(['/tmp/fixture.exe'], {
            confirm: true,
            limits: { timeoutMs: 3000 }
        });
        assert.ok(cells.length >= 3);
        assert.ok(cells.every((c: {
            outcome: string;
        }) => c.outcome === 'unsupported' || c.outcome === 'error'));
    }
    finally {
        process.env.PATH = prevPath;
    }
});
test.after(() => {
    if (prevMode === undefined)
        delete process.env.REVERSE_MODE;
    else
        process.env.REVERSE_MODE = prevMode;
});
