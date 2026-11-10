import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import readline from 'node:readline';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectionCostMs, windowFor } from './sampling-window.js';
const server = path.resolve('dist/mcp-server.js');
type Call = (name: string, args: unknown) => Promise<any>;
async function withServer(env: Record<string, string>, run: (call: Call, home: string) => Promise<void>) {
    const home = await mkdtemp(path.join(os.tmpdir(), 'reverse-mcp-evidence-'));
    const child = spawn(process.execPath, [server], {
        stdio: [
            'pipe',
            'pipe',
            'pipe'
        ],
        env: {
            ...process.env,
            REVERSE_HOME: home,
            ...env
        }
    });
    const rl = readline.createInterface({ input: child.stdout! });
    const pending = new Map<number, (value: any) => void>();
    let nextId = 0;
    rl.on('line', line => {
        const message = JSON.parse(line);
        pending.get(message.id)?.(message);
        pending.delete(message.id);
    });
    const call = (name: string, args: unknown) => new Promise<any>((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, resolve);
        child.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } })}\n`);
        setTimeout(() => reject(new Error(`timeout: ${name}`)), 60000).unref();
    });
    try {
        await run(call, home);
    }
    finally {
        child.kill();
        await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
}
const ok = (m: any) => {
    assert.equal(m.error, undefined);
    assert.equal(m.result.isError, false, m.result.content[0].text);
    return m.result.structuredContent;
};
const sleeper = (): ChildProcess => spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
test('MCP: session_id attaches analyzer results as typed evidence with a source taken from the result', async () => {
    const children: ChildProcess[] = [];
    try {
        await withServer({}, async (call, home) => {
            const session = ok(await call('create_research_session', { target_id: 'auto-evidence' }));
            const sid = session.session_id;
            const bin = path.join(home, 'sample.bin');
            const elf = Buffer.alloc(64);
            elf.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]);
            await writeFile(bin, elf);
            const analysis = ok(await call('analyze_binary', { file: bin, session_id: sid }));
            assert.equal(analysis.researchEvidence.recorded, true);
            assert.equal(analysis.researchEvidence.type, 'Binary');
            assert.equal(analysis.findings[0].format, 'ELF', 'the normal result is unchanged');
            const child = sleeper();
            children.push(child);
            const pid = child.pid!;
            for (const [tool, type] of [
                [
                    'analyze_memory',
                    'Memory'
                ],
                [
                    'analyze_cpu',
                    'CPU'
                ],
                [
                    'analyze_io',
                    'I/O'
                ],
                [
                    'inspect_process',
                    'Process'
                ]
            ])
                assert.equal(ok(await call(tool, { pid, session_id: sid })).researchEvidence.type, type, tool);
            const stored = ok(await call('get_research_session', { id: sid })).session;
            assert.deepEqual(stored.evidence.map((e: any) => e.type), ['Binary', 'Memory', 'CPU', 'I/O', 'Process']);
            assert.ok(stored.evidence.every((e: any) => /^reverse:[a-z_]+#[0-9a-f-]{36}$/.test(e.source)));
            assert.equal(stored.integrity.valid, true);
            // Calls without session_id are unchanged and record nothing.
            assert.equal(ok(await call('analyze_binary', { file: bin })).researchEvidence, undefined);
            assert.equal(ok(await call('get_research_session', { id: sid })).session.evidence.length, 5);
            // An unknown session fails before the tool runs.
            const missing = await call('analyze_binary', { file: bin, session_id: 'does-not-exist' });
            assert.equal(missing.result.isError, true);
            assert.match(missing.result.content[0].text, /Research session not found/);
        });
    }
    finally {
        for (const c of children)
            c.kill();
    }
});
test('MCP: a refused command records no evidence', async () => {
    await withServer({}, async (call) => {
        const sid = ok(await call('create_research_session', { target_id: 'gate' })).session_id;
        const refused = await call('run_benchmark', { command: process.execPath, args: ['-e', '0'], session_id: sid });
        assert.equal(refused.result.isError, true);
        assert.match(refused.result.content[0].text, /Command execution is disabled/);
        assert.equal(ok(await call('get_research_session', { id: sid })).session.evidence.length, 0);
    });
});
test('MCP: OBSERVE verifies ownership before sampling, READ_ONLY does not, and every tool name is kept', async () => {
    const child = sleeper();
    try {
        // Compare needs four samples; a sample costs milliseconds on Linux and hundreds of them with ps or PowerShell.
        const durationMs = windowFor(600, 4, await inspectionCostMs(child.pid!));
        const args = { pid: child.pid, durationMs, intervalMs: 100 };
        await withServer({ REVERSE_MODE: 'OBSERVE' }, async (call) => {
            const r = ok(await call('profile_process', args));
            if (process.platform === 'win32') {
                assert.equal(r.status, 'partial', 'Windows ownership is unknown: OBSERVE refuses');
                assert.match(r.errors.join(' '), /cannot be verified/);
            }
            else
                assert.equal(r.findings[0].ownership, 'owned');
            const m = ok(await call('monitor_process', { ...args, mode: 'Compare' }));
            if (process.platform !== 'win32') {
                assert.equal(m.findings[0].ownership, 'owned');
                assert.ok(m.findings[0].periods);
            }
        });
        await withServer({ REVERSE_MODE: 'READ_ONLY' }, async (call) => {
            const r = ok(await call('profile_process', args));
            assert.equal(r.findings[0].ownership, 'not-checked', 'the default behavior is unchanged');
            assert.equal(ok(await call('monitor_process', args)).findings[0].ownership, 'not-checked');
        });
    }
    finally {
        child.kill();
    }
});
