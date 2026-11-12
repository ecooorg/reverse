import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const server = path.resolve('dist/mcp-server.js');
test('MCP: baseline suites and hash-chained research-session tools work end-to-end', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'reverse-mcp-tools-'));
    const child = spawn(process.execPath, [server], {
        stdio: [
            'pipe',
            'pipe',
            'pipe'
        ],
        env: {
            ...process.env,
            REVERSE_HOME: home,
            REVERSE_MODE: 'CONTROLLED_EXECUTION',
            REVERSE_COMMAND_ALLOWLIST: process.execPath
        }
    });
    const rl = readline.createInterface({ input: child.stdout! });
    let nextId = 0;
    const pending = new Map<number, (value: any) => void>();
    rl.on('line', line => {
        const message = JSON.parse(line);
        if (pending.has(message.id)) {
            pending.get(message.id)!(message);
            pending.delete(message.id);
        }
    });
    const request = (method: string, params: unknown) => new Promise<any>((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, resolve);
        child.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
        setTimeout(() => {
            if (pending.delete(id))
                reject(new Error(`MCP request timed out: ${method}`));
        }, 60000).unref();
    });
    const call = async (name: string, args: unknown) => {
        const response = await request('tools/call', { name, arguments: args });
        assert.equal(response.error, undefined, name);
        if (response.result.isError)
            throw new Error(response.result.content[0].text);
        return JSON.parse(response.result.content[0].text);
    };
    try {
        await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
        const session = await call('create_research_session', { target_id: 'mcp-fixture' });
        const evidence = await call('add_research_evidence', {
            session_id: session.session_id,
            type: 'Validation',
            source: 'test',
            measurement: { passed: true },
            confidence: 1,
            limitations: []
        });
        const hypothesis = await call('add_research_hypothesis', {
            session_id: session.session_id,
            statement: 'Output remains stable',
            provenance: ['test run'],
            confidence: 0.8
        });
        await call('promote_research_hypothesis', {
            session_id: session.session_id,
            hypothesis_id: hypothesis.hypothesis_id,
            status: 'supported',
            evidence_id: evidence.evidence_id
        });
        await call('add_research_event', {
            session_id: session.session_id,
            event: 'validation_completed',
            payload: { validationId: 'test' }
        });
        await call('link_research_artifacts', { session_id: session.session_id, relation: 'final_report', ids: ['report-1'] });
        const loaded = await call('get_research_session', { id: session.session_id });
        assert.equal(loaded.session.integrity.valid, true);
        assert.equal(loaded.session.hypotheses[0].status, 'supported');
        assert.deepEqual(loaded.session.links.final_report, ['report-1']);
        const suite = await call('create_benchmark_suite', { name: 'mcp-suite', repetitions: 5, warmupRuns: 1, cases: [
                { name: 'A', command: process.execPath, args: ['-e', 'process.stdout.write("A")'] },
                { name: 'B', command: process.execPath, args: ['-e', 'process.stdout.write("B")'] },
            ] });
        const run = await call('run_benchmark_suite', { id: suite.findings[0].suite_id });
        assert.ok(run.findings.every((f: any) => f.successfulRuns === 5 && f.warmups.length === 1));
        const comparison = await call('compare_benchmarks', { before: run, after: run });
        assert.equal(comparison.findings.length, 2);
        const before = await call('capture_baseline', {
            command: process.execPath,
            args: [
                '-e',
                'process.stdout.write("x")'
            ],
            repetitions: 5
        });
        const after = await call('capture_baseline', {
            command: process.execPath,
            args: [
                '-e',
                'process.stdout.write("x")'
            ],
            repetitions: 5
        });
        const baselineComparison = await call('compare_baselines', {
            before_id: before.findings[0].baseline_id,
            after_id: after.findings[0].baseline_id
        });
        assert.equal(baselineComparison.operation, 'benchmark_comparison');
    }
    finally {
        child.stdin!.end();
        child.kill();
        await new Promise(resolve => child.once('close', resolve));
        await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
});
test('MCP: Android device observations use session authorization and refuse missing serial', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'reverse-mcp-android-'));
    const child = spawn(process.execPath, [server], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
            ...process.env,
            REVERSE_HOME: home,
            REVERSE_MODE: 'CONTROLLED_EXECUTION',
            REVERSE_ANDROID_SERIAL: ''
        }
    });
    const rl = readline.createInterface({ input: child.stdout! });
    let nextId = 0;
    const pending = new Map<number, (value: any) => void>();
    rl.on('line', line => {
        const message = JSON.parse(line);
        if (pending.has(message.id)) {
            pending.get(message.id)!(message);
            pending.delete(message.id);
        }
    });
    const request = (method: string, params: unknown) => new Promise<any>((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, resolve);
        child.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
        setTimeout(() => {
            if (pending.delete(id))
                reject(new Error(`MCP request timed out: ${method}`));
        }, 30000).unref();
    });
    const call = async (name: string, args: unknown) => {
        const response = await request('tools/call', { name, arguments: args });
        assert.equal(response.error, undefined, name);
        if (response.result.isError)
            throw new Error(response.result.content[0].text);
        return JSON.parse(response.result.content[0].text);
    };
    try {
        await request('initialize', {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'test', version: '1' }
        });
        const session = await call('create_research_session', { target_id: 'android-device-fixture' });
        await call('declare_legacy_authorization', {
            session_id: session.session_id,
            basis: 'open_source',
            license_or_consent_reference: 'fixture-only',
            declared_by: 'mcp-new-tools.test'
        });
        const report = await call('collect_android_device_observations', {
            session_id: session.session_id,
            confirm: true
        });
        assert.equal(report.status, 'unsupported');
        assert.equal(report.logcat, null);
        assert.equal(report.activityDump, null);
        assert.ok(report.limitations.some((item: string) => item.includes('no adb command was run')));
        const listed = await request('tools/list', {});
        assert.ok(listed.result.tools.some((tool: any) => tool.name === 'collect_android_device_observations'));
    }
    finally {
        child.stdin!.end();
        child.kill();
        await new Promise(resolve => child.once('close', resolve));
        await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
});
test('MCP full schema profile recursively rejects undeclared object properties', async () => {
    const child = spawn(process.execPath, [server], {
        stdio: [
            'pipe',
            'pipe',
            'pipe'
        ],
        env: {
            ...process.env,
            REVERSE_MCP_SCHEMA_PROFILE: 'full'
        }
    });
    const rl = readline.createInterface({ input: child.stdout! });
    const response = new Promise<any>(resolve => rl.once('line', line => resolve(JSON.parse(line))));
    try {
        child.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })}\n`);
        const message = await response;
        const suite = message.result.tools.find((t: any) => t.name === 'create_benchmark_suite');
        assert.equal(suite.inputSchema.additionalProperties, false);
        assert.equal(suite.inputSchema.properties.cases.items.additionalProperties, false);
    }
    finally {
        child.stdin!.end();
        child.kill();
        await new Promise(resolve => child.once('close', resolve));
    }
});
