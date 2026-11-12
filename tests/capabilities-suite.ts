// Capability verification suite.
//
// Goal: establish what Reverse can REALLY do on the machine running this file, by exercising the built
// output in dist/ (library API, CLI and MCP stdio server) against real fixtures and real processes.
//
// Every check ends in one of four outcomes, recorded in a JSON report:
//   verified    - the capability works as documented
//   limitation  - a documented limitation was confirmed to be real (the feature is NOT there)
//   drift       - documentation and behavior disagree, or a defect was found; reported, does not fail the run
//   failed      - a capability that must work does not work; fails the run
//
// Run: npm run verify   (or: node --test dist-tests/capabilities.check.js after building)
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { analyzeBinary } from '../dist/analysis-binary.js';
import { analyzeLegacyWindows } from '../dist/legacy-windows.js';
import { analyzeSource } from '../dist/analysis-source.js';
import { analyzeDependencies } from '../dist/analysis-dependencies.js';
import { listProcesses, inspectProcess } from '../dist/process-inspector.js';
import { profileProcess } from '../dist/profiling-profiler.js';
import { MAC_PS_FIELDS, parseEtime, parseMacPs, parseWindowsCim } from '../dist/process-parse.js';
import { getProcessIdentity, verifyProcessIdentity, verifyProcessOwnership } from '../dist/process-inspector.js';
import { getResourceControlStatus, withProcessResourceLimits } from '../dist/process-safety.js';
import { analyzeMemory, analyzeCpu, analyzeIo } from '../dist/process-inspector.js';
import { findAnomalies } from '../dist/profiling-profiler.js';
import { checkCommandGate, operatingMode } from '../dist/benchmark-gate.js';
import { evidenceFromResult } from '../dist/evidence-collect.js';
import { promotionBlocker } from '../dist/evidence-engine.js';
import { runBenchmark, compareBenchmarks } from '../dist/benchmark-engine.js';
import { validateBehavior } from '../dist/benchmark-validation.js';
import { EvidenceEngine } from '../dist/evidence-engine.js';
import { listProviders, registerProvider, getProviderStatus } from '../dist/providers-registry.js';
type Status = 'verified' | 'limitation' | 'drift' | 'failed';
interface Rec {
    area: string;
    name: string;
    status: Status;
    detail: string;
}
interface Ctx {
    limit(d: string): void;
    drift(d: string): void;
    note(d: string): void;
}
const records: Rec[] = [];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const CLI = path.join(DIST, 'cli-main.js');
const MCP = path.join(DIST, 'mcp-server.js');
const WIN = process.platform === 'win32';
const MAC = process.platform === 'darwin';
const NODE = process.execPath;
const WORK = await mkdtemp(path.join(os.tmpdir(), 'reverse-verify-'));
const HOME = path.join(WORK, 'reverse-home');
process.env.REVERSE_HOME = HOME; // keep evidence/benchmark artifacts out of the real home directory
function check(area: string, name: string, fn: (c: Ctx) => Promise<void> | void) {
    test(`${area} — ${name}`, async () => {
        let status: Status = 'verified';
        const details: string[] = [];
        const c: Ctx = {
            limit: d => {
                if (status === 'verified')
                    status = 'limitation';
                details.push(d);
            },
            drift: d => { status = 'drift'; details.push(d); },
            note: d => { details.push(d); },
        };
        try {
            await fn(c);
        }
        catch (e) {
            records.push({ area, name, status: 'failed', detail: e instanceof Error ? e.message : String(e) });
            throw e;
        }
        records.push({ area, name, status, detail: details.join('; ') });
    });
}
after(async () => {
    const totals: Record<Status, number> = { verified: 0, limitation: 0, drift: 0, failed: 0 };
    for (const r of records)
        totals[r.status]++;
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const report = {
        schema: 1,
        reverse: pkg.version,
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        osRelease: os.release(),
        generatedAt: new Date().toISOString(),
        totals,
        records,
    };
    const out = process.env.REVERSE_CAPABILITY_REPORT || path.join(ROOT, 'dist-tests', 'capability-report.json');
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, JSON.stringify(report, null, 2) + '\n', 'utf8');
    await rm(WORK, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
// ---------------------------------------------------------------- helpers
const read = async (p: string) => JSON.parse(await readFile(p, 'utf8'));
const j = (v: unknown) => JSON.stringify(v);
async function craft(name: string, bytes: Buffer | number[]): Promise<string> {
    const f = path.join(WORK, name);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
    return f;
}
function elf(opts: {
    cls: 1 | 2;
    le: boolean;
    machine: number;
    entry: bigint;
}): Buffer {
    const b = Buffer.alloc(64);
    b.set([0x7f, 0x45, 0x4c, 0x46, opts.cls, opts.le ? 1 : 2, 1]);
    if (opts.le)
        b.writeUInt16LE(opts.machine, 18);
    else
        b.writeUInt16BE(opts.machine, 18);
    if (opts.cls === 2) {
        if (opts.le)
            b.writeBigUInt64LE(opts.entry, 24);
        else
            b.writeBigUInt64BE(opts.entry, 24);
    }
    else if (opts.le)
        b.writeUInt32LE(Number(opts.entry), 24);
    else
        b.writeUInt32BE(Number(opts.entry), 24);
    return b;
}
function pe(machine: number, optMagic: number): Buffer {
    const b = Buffer.alloc(256);
    b[0] = 0x4d;
    b[1] = 0x5a;
    b.writeUInt32LE(0x80, 0x3c);
    b.write('PE\0\0', 0x80, 'ascii');
    b.writeUInt16LE(machine, 0x84);
    b.writeUInt16LE(optMagic, 0x80 + 24);
    return b;
}
const nodeEval = (code: string, ...rest: string[]) => ['-e', code, ...rest];
function spawnIdle(): ChildProcess {
    return spawn(NODE, nodeEval('setInterval(()=>{},1000)'), { stdio: 'ignore' });
}
async function killAndWait(c: ChildProcess) {
    if (c.exitCode !== null || c.signalCode !== null)
        return;
    await new Promise<void>(res => { c.once('exit', () => res()); c.kill('SIGKILL'); });
}
function runCli(args: string[], input?: string) {
    const r = spawnSync(NODE, [CLI, ...args], { encoding: 'utf8', env: process.env, input, timeout: 120000 });
    return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
function startMcp(args: string[] = [MCP], extraEnv: Record<string, string> = {}) {
    const child = spawn(NODE, args, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...extraEnv } });
    const pending = new Map<number, (m: any) => void>();
    const unsolicited: any[] = [];
    const rl = readline.createInterface({ input: child.stdout! });
    rl.on('line', l => {
        let m: any;
        try {
            m = JSON.parse(l);
        }
        catch {
            unsolicited.push({ unparsable: l });
            return;
        }
        const p = m.id !== undefined ? pending.get(m.id) : undefined;
        if (p) {
            pending.delete(m.id);
            p(m);
        }
        else
            unsolicited.push(m);
    });
    let n = 0;
    const req = (method: string, params?: unknown, requestId?: number) => new Promise<any>((resolve, reject) => {
        const id = requestId ?? ++n;
        const t = setTimeout(() => { pending.delete(id); reject(new Error(`MCP timeout waiting for ${method}`)); }, 10000);
        pending.set(id, m => { clearTimeout(t); resolve(m); });
        child.stdin!.write(j({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
    const raw = (s: string) => child.stdin!.write(s + '\n');
    const notify = (method: string, params?: unknown) => raw(j({ jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }) }));
    const call = async (name: string, args: unknown) => {
        const m = await req('tools/call', { name, arguments: args });
        if (m.error)
            throw new Error(`tool ${name}: ${m.error.message}`);
        if (m.result?.isError)
            throw new Error(`tool ${name}: ${m.result.content[0].text}`);
        return { envelope: m.result, value: JSON.parse(m.result.content[0].text) };
    };
    const close = async () => {
        if (child.exitCode !== null || child.signalCode !== null)
            return;
        const done = new Promise<void>(resolve => child.once('close', () => resolve()));
        try {
            child.stdin!.end();
        }
        catch { /* ignore */ }
        child.kill();
        let timer: NodeJS.Timeout | undefined;
        await Promise.race([done, new Promise<void>(resolve => { timer = setTimeout(resolve, 3000); timer.unref(); })]);
        if (timer)
            clearTimeout(timer);
    };
    return { req, raw, notify, call, close, unsolicited };
}
const settle = (ms = 300) => new Promise(r => setTimeout(r, ms));
// ---------------------------------------------------------------- 1. build output & library surface
check('Package', 'built output exists and the library exports the documented API', async (c) => {
    for (const f of ['index', 'cli-main', 'mcp-server'])
        assert.ok(existsSync(path.join(DIST, `${f}.js`)), `dist/${f}.js missing`);
    const lib: any = await import(pathToFileURL(path.join(DIST, 'index.js')).href);
    const expected = [
        'EvidenceEngine', 'analyzeAndroid', 'analyzeBinary', 'analyzeDependencies', 'analyzeSource',
        'compareBenchmarks', 'getProviderStatus',
        'inspectProcess',
        'listProcesses',
        'listProviders',
        'profileProcess',
        'registerProvider',
        'result',
        'runBenchmark',
        'validateBehavior'
    ];
    for (const k of expected)
        assert.equal(typeof lib[k], 'function', `export ${k}`);
    c.note(`${expected.length} exports present`);
});
check('Package', 'bin entry has a shebang and package.json targets exist', () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.equal(readFileSync(CLI, 'utf8').split('\n')[0], '#!/usr/bin/env node');
    assert.ok(existsSync(path.join(ROOT, pkg.bin.reverse)), 'bin.reverse target');
    const exp = pkg.exports['.'];
    assert.ok(existsSync(path.join(ROOT, exp.default)), 'exports default');
    assert.ok(existsSync(path.join(ROOT, exp.types)), 'exports types');
});
// ---------------------------------------------------------------- 2. legacy Windows analysis (Patch M initial slice + step 1 contracts)
const step1Auth = {
    basis: 'open_source' as const, licenseOrConsentReference: 'LICENSE',
    declaredBy: 'capability-test', declaredAt: '2026-11-10T00:00:00.000Z'
};
check('Legacy Windows', 'MZ + NE executable is recognized as a 16-bit Windows NE image', async () => {
    const b = Buffer.alloc(256);
    b.write('MZ', 0, 'ascii');
    b.writeUInt32LE(128, 0x3c);
    b.write('NE', 128, 'ascii');
    const r: any = await analyzeLegacyWindows(await craft('legacy-ne.exe', b), step1Auth);
    assert.equal(r.findings[0].format, 'Windows NE');
    assert.equal(r.findings[0].bitness, 16);
    assert.equal(r.findings[0].compatibilityFindings[0].needsExecutionEnvironment, true);
    assert.equal(r.findings[0].targetProfile.schemaVersion, '1.0');
    assert.equal(r.findings[0].targetProfile.osAndEra.value.family, 'Windows');
});
check('Legacy Windows', 'Delphi form/RTTI signatures are reported as bounded static structural evidence', async () => {
    const b = Buffer.alloc(256);
    b.write('MZ', 0, 'ascii');
    b.write('TPF0 TForm TApplication TComponent TControl', 64, 'ascii');
    const r: any = await analyzeLegacyWindows(await craft('legacy-delphi.exe', b), step1Auth);
    assert.ok(r.findings[0].structuralDetectors.some((x: any) => x.name.includes('form stream')));
    assert.ok(r.findings[0].structuralDetectors.some((x: any) => x.name.includes('RTTI-style')));
});
check('Legacy Windows', 'legacy analysis report preserves the declared authorization provenance', async () => {
    const b = Buffer.alloc(64);
    b.write('MZ', 0, 'ascii');
    const r: any = await analyzeLegacyWindows(await craft('legacy-authorized.exe', b), step1Auth);
    assert.deepEqual(r.findings[0].authorization, step1Auth);
});
check('Legacy Windows', 'shared gate refuses legacy analysis without authorization declaration', async () => {
    const b = Buffer.alloc(64);
    b.write('MZ', 0, 'ascii');
    let refused = false;
    try {
        await analyzeLegacyWindows(await craft('legacy-no-auth.exe', b), null);
    }
    catch {
        refused = true;
    }
    assert.equal(refused, true, 'analyze_legacy_windows must refuse without authorization');
});
check('Legacy Windows', 'sourced data table format validates good tables and rejects the failing fixture', async () => {
    const tables = await import(pathToFileURL(path.join(DIST, 'legacy-tables.js')).href);
    const { validateSourcedDataTable, exampleSourcedTable, invalidSourcedTableFixture } = tables;
    const good = validateSourcedDataTable(exampleSourcedTable());
    assert.equal(good.ok, true, good.errors?.join('; '));
    const bad = validateSourcedDataTable(invalidSourcedTableFixture());
    assert.equal(bad.ok, false);
    assert.ok(bad.errors.length >= 4);
});
check('Legacy Windows', 'calibration harness reports precision/recall on crafted fixtures', async () => {
    const { writeCraftedCalibrationFixtures, runCalibration } = await import(pathToFileURL(path.join(DIST, 'legacy-calibration.js')).href);
    const dir = await mkdtemp(path.join(WORK, 'calib-'));
    const manifest = await writeCraftedCalibrationFixtures(dir);
    const manifestPath = path.join(dir, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify(manifest));
    const report = await runCalibration(manifestPath, { authorization: step1Auth });
    assert.equal(report.evaluated, 4);
    assert.equal(report.skipped, 0);
    assert.ok(report.scores.length >= 1);
    assert.equal(report.failures.filter((f: string) => f.includes('format expected')).length, 0);
});
check('Legacy Windows', 'support matrix formats are recognized by analyze_legacy_windows', async () => {
    const cases: Array<{
        name: string;
        build: () => Buffer;
        format: string;
    }> = [
        {
            name: 'mz',
            build: () => { const b = Buffer.alloc(64); b.write('MZ', 0, 'ascii'); return b; },
            format: 'DOS MZ'
        },
        {
            name: 'ne',
            build: () => {
                const b = Buffer.alloc(256);
                b.write('MZ', 0, 'ascii');
                b.writeUInt32LE(128, 0x3c);
                b.write('NE', 128, 'ascii');
                return b;
            },
            format: 'Windows NE'
        },
    ];
    for (const c of cases) {
        const r: any = await analyzeLegacyWindows(await craft(`matrix-${c.name}.exe`, c.build()), step1Auth);
        assert.equal(r.findings[0].format, c.format);
    }
});
check('Legacy Windows', 'builtin compatibility tables validate (G-01)', async () => {
    const { assertBuiltinTablesValid } = await import(pathToFileURL(path.join(DIST, 'legacy-compat-tables.js')).href);
    assert.deepEqual(assertBuiltinTablesValid(), []);
});
check('Legacy Windows', 'detect-only providers register and report unsupported when absent', async () => {
    const { createDiecProvider } = await import(pathToFileURL(path.join(DIST, 'providers-detect-tools.js')).href);
    const p = createDiecProvider();
    // Force unavailable path: still must not throw and must not fabricate findings
    const r = await p.analyze('/nonexistent/target.bin');
    assert.ok(r.status === 'unsupported' || r.status === 'partial' || r.status === 'failed');
    if (r.status === 'unsupported')
        assert.ok((r.limitations || []).length > 0);
});
check('Legacy Windows', 'reference trials run both scenarios with L0 limitations', async () => {
    const { runLegacyReferenceTrials } = await import(pathToFileURL(path.join(DIST, 'legacy-reference-trials.js')).href);
    const report = await runLegacyReferenceTrials();
    assert.equal(report.ok, true);
    assert.equal(report.trials.length, 2);
    assert.equal(report.preservation.level, 'L0');
    assert.ok(report.limitations.some((l: string) => /oracle|licensed/i.test(l)));
});
check('Legacy Linux', 'analyzeLegacyLinux ELF64 reports Linux profile and interpreter', async () => {
    const { analyzeLegacyLinux } = await import(pathToFileURL(path.join(DIST, 'legacy-linux.js')).href);
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cap-ll-'));
    try {
        const b = Buffer.alloc(256);
        b[0] = 0x7f;
        b.write('ELF', 1, 'ascii');
        b[4] = 2;
        b[5] = 1;
        b[6] = 1;
        b.writeUInt16LE(3, 16);
        b.writeUInt16LE(62, 18);
        b.writeUInt32LE(1, 20);
        b.writeBigUInt64LE(64n, 32);
        b.writeUInt16LE(64, 52);
        b.writeUInt16LE(56, 54);
        b.writeUInt16LE(1, 56);
        const interp = '/lib64/ld-linux-x86-64.so.2';
        b.write(interp, 200, 'ascii');
        b.writeUInt32LE(3, 64);
        b.writeUInt32LE(4, 68);
        b.writeBigUInt64LE(200n, 72);
        b.writeBigUInt64LE(200n, 80);
        b.writeBigUInt64LE(BigInt(interp.length + 1), 96);
        const f = path.join(dir, 'e');
        await writeFile(f, b);
        const r = await analyzeLegacyLinux(f, {
            basis: 'open_source',
            licenseOrConsentReference: 'capability-suite',
            declaredBy: 'capabilities-suite',
            declaredAt: new Date().toISOString()
        });
        assert.equal(r.findings[0].format, 'ELF');
        assert.equal(r.findings[0].targetProfile.osAndEra.value.family, 'Linux');
        assert.ok(r.findings[0].interpreter?.includes('ld-linux'));
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
check('Legacy Linux', 'linux calibration fixtures evaluate without detector misses', async () => {
    const calMod = await import(pathToFileURL(path.join(DIST, 'legacy-linux-calibration.js')).href);
    const writeCraftedLinuxCalibrationFixtures = calMod.writeCraftedLinuxCalibrationFixtures;
    const runLinuxCalibration = calMod.runLinuxCalibration;
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cap-ll-cal-'));
    try {
        const manifest = await writeCraftedLinuxCalibrationFixtures(dir);
        const manPath = path.join(dir, 'manifest.json');
        await writeFile(manPath, JSON.stringify(manifest));
        const report = await runLinuxCalibration(manPath, { authorization: step1Auth });
        assert.equal(report.evaluated, 4);
        assert.deepEqual(report.authorization, step1Auth);
        assert.ok(report.scores.every((score: any) => score.brierScore !== null && score.expectedCalibrationError !== null));
        const miss = report.failures.filter((f: string) => /expected detector/.test(f));
        assert.equal(miss.length, 0, miss.join('; '));
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
check('Legacy Linux', 'linux reference trials run both scenarios with L0 limits', async () => {
    const { runLegacyLinuxReferenceTrials } = await import(pathToFileURL(path.join(DIST, 'legacy-linux-reference-trials.js')).href);
    const report = await runLegacyLinuxReferenceTrials();
    assert.equal(report.ok, true);
    assert.equal(report.trials.length, 2);
    assert.equal(report.preservation.level, 'L0');
});
check('Legacy Linux', 'linux sourced tables validate', async () => {
    const { assertLinuxTablesValid } = await import(pathToFileURL(path.join(DIST, 'legacy-linux-tables.js')).href);
    assert.equal(assertLinuxTablesValid().length, 0);
});
check('Execution', 'sandbox refuses execution outside CONTROLLED_EXECUTION', async () => {
    const { runInSandbox } = await import(pathToFileURL(path.join(DIST, 'execution-sandbox.js')).href);
    const prev = process.env.REVERSE_MODE;
    process.env.REVERSE_MODE = 'READ_ONLY';
    try {
        let threw = false;
        try {
            await runInSandbox({
                command: process.execPath,
                args: ['-e', '0'],
                confirm: true
            });
        }
        catch {
            threw = true;
        }
        assert.equal(threw, true);
    }
    finally {
        if (prev === undefined)
            delete process.env.REVERSE_MODE;
        else
            process.env.REVERSE_MODE = prev;
    }
});
check('Execution', 'sandbox mechanism is reported honestly', async () => {
    const { detectSandboxMechanism } = await import(pathToFileURL(path.join(DIST, 'execution-sandbox.js')).href);
    const m = await detectSandboxMechanism();
    assert.ok(m.id);
    assert.equal(typeof m.networkIsolated, 'boolean');
    assert.equal(typeof m.detail, 'string');
});
check('Execution', 'works/fails matrix marks absent engines unsupported', async () => {
    const { runWorksFailsMatrix } = await import(pathToFileURL(path.join(DIST, 'execution-environment.js')).href);
    const prev = process.env.REVERSE_MODE;
    const prevPath = process.env.PATH;
    process.env.REVERSE_MODE = 'CONTROLLED_EXECUTION';
    process.env.PATH = '/nonexistent-reverse-path';
    try {
        const cells = await runWorksFailsMatrix(['/tmp/fixture.exe'], {
            confirm: true,
            limits: { timeoutMs: 2000 },
            authorization: {
                basis: 'open_source',
                licenseOrConsentReference: 'capability-fixture',
                declaredBy: 'capabilities-suite',
                declaredAt: '2026-11-11T00:00:00.000Z'
            }
        });
        assert.ok(cells.length >= 1);
        assert.ok(cells.every((c: {
            outcome: string;
        }) => c.outcome === 'unsupported' || c.outcome === 'error'));
    }
    finally {
        process.env.PATH = prevPath;
        if (prev === undefined)
            delete process.env.REVERSE_MODE;
        else
            process.env.REVERSE_MODE = prev;
    }
});
// ---------------------------------------------------------------- 2. binary analysis
check('Binary', 'ELF64 little-endian x86_64 header is parsed (arch, bitness, endian, entry point)', async () => {
    const r = await analyzeBinary(await craft('elf64.bin', elf({ cls: 2, le: true, machine: 62, entry: 0x401000n })));
    const f: any = r.findings[0];
    assert.deepEqual([f.format, f.architecture, f.bitness, f.endian, f.entryPoint], ['ELF', 'x86_64', 64, 'little', '401000']);
    assert.equal(r.status, 'completed');
});
check('Binary', 'ELF32 big-endian ARM header is parsed', async () => {
    const f: any = (await analyzeBinary(await craft('elf32be.bin', elf({ cls: 1, le: false, machine: 40, entry: 0x8000n })))).findings[0];
    assert.deepEqual([f.format, f.architecture, f.bitness, f.endian, f.entryPoint], ['ELF', 'ARM', 32, 'big', '8000']);
});
check('Binary', 'ELF AArch64 and RISC-V machine codes are mapped', async () => {
    const a: any = (await analyzeBinary(await craft('elfa64.bin', elf({ cls: 2, le: true, machine: 183, entry: 0n })))).findings[0];
    const r: any = (await analyzeBinary(await craft('elfrv.bin', elf({ cls: 2, le: true, machine: 243, entry: 0n })))).findings[0];
    assert.equal(a.architecture, 'AArch64');
    assert.equal(r.architecture, 'RISC-V');
});
check('Binary', 'PE32+ (x86_64) and PE32 (x86) headers are parsed', async () => {
    const a: any = (await analyzeBinary(await craft('pe64.bin', pe(0x8664, 0x20b)))).findings[0];
    const b: any = (await analyzeBinary(await craft('pe32.bin', pe(0x14c, 0x10b)))).findings[0];
    assert.deepEqual([a.format, a.architecture, a.bitness], ['PE', 'x86_64', 64]);
    assert.deepEqual([b.format, b.architecture, b.bitness], ['PE', 'x86', 32]);
});
check('Binary', 'MZ file without a PE signature is reported as DOS/PE-like', async () => {
    const b = Buffer.alloc(128);
    b[0] = 0x4d;
    b[1] = 0x5a;
    b.writeUInt32LE(0x40, 0x3c);
    const f: any = (await analyzeBinary(await craft('mz.bin', b))).findings[0];
    assert.equal(f.format, 'DOS/PE-like');
});
check('Binary', 'Mach-O 64-bit magics (both byte orders) are recognized', async () => {
    const a: any = (await analyzeBinary(await craft('macho1.bin', [0xfe, 0xed, 0xfa, 0xcf, 0, 0, 0, 0]))).findings[0];
    const b: any = (await analyzeBinary(await craft('macho2.bin', [0xcf, 0xfa, 0xed, 0xfe, 0, 0, 0, 0]))).findings[0];
    assert.match(a.format, /^Mach-O 64-bit/);
    assert.match(b.format, /^Mach-O 64-bit/);
    assert.equal(a.bitness, 64);
    assert.equal(b.bitness, 64);
});
check('Binary', 'Mach-O universal binary is recognized and reports no meaningless bitness', async () => {
    const f: any = (await analyzeBinary(await craft('fat.bin', [0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 2]))).findings[0];
    assert.equal(f.format, 'Mach-O universal');
    assert.equal(f.bitness, null);
});
check('Binary', 'Java .class files are told apart from Mach-O universal binaries (same 0xCAFEBABE magic)', async () => {
    const cls: any = (await analyzeBinary(await craft('Hello.class', [0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 0x34]))).findings[0];
    assert.equal(cls.format, 'Java class');
    assert.equal(cls.bitness, null);
    const fat: any = (await analyzeBinary(await craft('fat3.bin', [0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 3]))).findings[0];
    assert.equal(fat.format, 'Mach-O universal');
});
check('Binary', 'unrecognized content yields status partial, not a crash', async () => {
    const r = await analyzeBinary(await craft('text.bin', Buffer.from('just some text, definitely not a binary header'))) as any;
    assert.equal(r.findings[0].format, 'unknown');
    assert.equal(r.status, 'partial');
    assert.equal(r.coverage.complete, false);
});
check('Binary', 'empty and tiny files (0-3 bytes) yield partial instead of throwing', async () => {
    for (const [name, bytes] of [['b0.bin', []], ['b1.bin', [0x7f]], ['b2.bin', [0x01, 0x02]], ['b3.bin', [0x7f, 0x45, 0x4c]]] as [
        string,
        number[]
    ][]) {
        const r: any = await analyzeBinary(await craft(name, bytes));
        assert.equal(r.status, 'partial', name);
        assert.equal(r.findings[0].format, 'unknown', name);
    }
});
check('Binary', 'missing file rejects with an error', async () => {
    await assert.rejects(analyzeBinary(path.join(WORK, 'does-not-exist.bin')));
});
check('Binary', 'the Node.js executable on this host is identified with the right format and architecture', async () => {
    const f: any = (await analyzeBinary(NODE)).findings[0];
    const want = WIN ? 'PE' : MAC ? 'Mach-O' : 'ELF';
    assert.ok(f.format.startsWith(want), `expected ${want}, got ${f.format}`);
    if (!MAC)
        assert.equal(f.architecture, process.arch === 'arm64' ? (WIN ? 'ARM64' : 'AArch64') : 'x86_64');
    assert.equal(f.bitness, 64);
});
check('Binary', 'result carries a SHA-256 evidence record matching the file', async () => {
    const file = await craft('hash-me.bin', elf({ cls: 2, le: true, machine: 62, entry: 1n }));
    const r: any = await analyzeBinary(file);
    const ev = r.evidence[0];
    assert.equal(ev.sha256, createHash('sha256').update(await readFile(file)).digest('hex'));
    assert.ok(existsSync(ev.details.artifactPath));
});
check('Binary', 'sections, imports or symbols are produced where the format allows', async (c) => {
    const f: any = (await analyzeBinary(NODE)).findings[0];
    const has = (f.sections?.length ?? 0) > 0 || (f.imports?.length ?? 0) > 0 ||
        (f.exports?.length ?? 0) > 0 || (f.symbols?.length ?? 0) > 0 || (f.loadCommands?.length ?? 0) > 0;
    assert.ok(has, 'expected at least sections, imports, exports, symbols or load commands on the host binary');
    c.note(`sections=${f.sections?.length ?? 0} imports=${f.imports?.length ?? 0} ` +
        `exports=${f.exports?.length ?? 0} symbols=${f.symbols?.length ?? 0}`);
    // Disassembly / call graph remain out of scope for patch E (provider engines in F).
    c.limit('no disassembly, decompilation or control-flow graph (provider engines in patch F)');
});
// ---------------------------------------------------------------- 3. source inventory
const SRC = path.join(WORK, 'proj');
check('Source', 'inventories files, counts extensions/lines, extracts bare imports, skips excluded dirs', async () => {
    await mkdir(path.join(SRC, 'node_modules', 'pkg'), { recursive: true });
    await mkdir(path.join(SRC, '.hidden'), { recursive: true });
    await mkdir(path.join(SRC, '.github'), { recursive: true });
    await mkdir(path.join(SRC, 'dist'), { recursive: true });
    await mkdir(path.join(SRC, 'sub'), { recursive: true });
    const imports = [
        "import fs from 'node:fs';",
        "import g from 'lodash/get';",
        "import l from './local.js';",
        "const z = require('left-pad');"
    ];
    await writeFile(path.join(SRC, 'a.ts'), imports.join('\n') + '\n');
    await writeFile(path.join(SRC, 'b.py'), 'print("x")\n');
    await writeFile(path.join(SRC, 'c.js'), "// see: from 'fake-pkg'\nexport {};\n");
    await writeFile(path.join(SRC, 'sub', 'd.go'), 'package main\n');
    await writeFile(path.join(SRC, '.github', 'ci.js'), 'export {};\n');
    for (const skipped of [['node_modules', 'pkg', 'index.js'], ['.hidden', 'x.js'], ['dist', 'y.js']])
        await writeFile(path.join(SRC, ...skipped), 'x');
    await writeFile(path.join(SRC, 'README.md'), '# not source');
    await writeFile(path.join(SRC, 'package.json'), j({ name: 'fixture', dependencies: { alpha: '^1.0.0' } }));
    const r: any = await analyzeSource(SRC);
    const f = r.findings[0];
    assert.equal(f.fileCount, 5, `files: ${j(f.filesByExtension)}`);
    assert.deepEqual(f.filesByExtension, { '.ts': 1, '.py': 1, '.js': 2, '.go': 1 });
    assert.ok(f.approximateLines >= 8);
    const imp = Object.fromEntries(f.externalImportReferences);
    assert.equal(imp['node:fs'], 1);
    assert.equal(imp['lodash'], 1);
    assert.equal(imp['left-pad'], 1);
    assert.equal(imp['./local.js'], undefined);
    assert.equal(f.packageManifest.name, 'fixture');
    assert.equal(r.status, 'completed');
    assert.equal(r.evidence[0].kind, 'directory');
});
check('Source', 'commented-out imports are not counted', async () => {
    const f: any = ((await analyzeSource(SRC)) as any).findings[0];
    const imp = Object.fromEntries(f.externalImportReferences);
    assert.equal(imp['fake-pkg'], undefined, 'commented import must not be counted');
    assert.equal(imp['lodash'], 1);
    assert.equal(imp['left-pad'], 1);
});
check('Source', 'scan is capped at 5000 files and reports partial coverage', async () => {
    const big = path.join(WORK, 'big');
    await mkdir(big, { recursive: true });
    await Promise.all(Array.from({ length: 5100 }, (_, i) => writeFile(path.join(big, `f${i}.js`), 'x')));
    const r: any = await analyzeSource(big);
    assert.equal(r.status, 'partial');
    assert.equal(r.coverage.complete, false);
    assert.ok(r.findings[0].fileCount >= 5000);
});
check('Source', 'this repository itself can be inventoried', async () => {
    const r: any = await analyzeSource(ROOT);
    assert.ok(r.findings[0].fileCount > 0);
    assert.ok(r.findings[0].externalImportReferences.some(([k]: [
        string
    ]) => k.startsWith('node:')));
});
// ---------------------------------------------------------------- 4. dependencies
check('Dependencies', 'reads dependencies, devDependencies and optionalDependencies', async () => {
    const d = path.join(WORK, 'deps');
    await mkdir(d, { recursive: true });
    await writeFile(path.join(d, 'package.json'), j({
        dependencies: { a: '^1.0.0' },
        devDependencies: { b: '~2.0.0' },
        optionalDependencies: { c: '3.x' }
    }));
    const r: any = await analyzeDependencies(d);
    assert.deepEqual(r.findings.map((x: any) => [x.name, x.declaredVersion]), [['a', '^1.0.0'], ['b', '~2.0.0'], ['c', '3.x']]);
    assert.equal(r.status, 'completed');
});
check('Dependencies', 'missing or malformed package.json yields partial with a limitation', async () => {
    const empty = path.join(WORK, 'nodeps');
    await mkdir(empty, { recursive: true });
    const bad = path.join(WORK, 'baddeps');
    await mkdir(bad, { recursive: true });
    await writeFile(path.join(bad, 'package.json'), '{ not json');
    for (const dir of [empty, bad]) {
        const r: any = await analyzeDependencies(dir);
        assert.equal(r.status, 'partial');
        assert.deepEqual(r.findings, []);
        assert.ok(r.limitations.length > 0);
    }
});
check('Dependencies', 'lockfile resolution supplies resolved versions when package-lock.json is present', async () => {
    const d = path.join(WORK, 'deps-lock');
    await mkdir(d, { recursive: true });
    await writeFile(path.join(d, 'package.json'), j({
        dependencies: { a: '^1.0.0' }
    }));
    await writeFile(path.join(d, 'package-lock.json'), j({
        lockfileVersion: 3,
        packages: {
            '': { dependencies: { a: '^1.0.0' } },
            'node_modules/a': { version: '1.2.3', dependencies: { b: '2.0.0' } },
            'node_modules/b': { version: '2.0.0' }
        }
    }));
    const r: any = await analyzeDependencies(d);
    const byName = Object.fromEntries(r.findings.map((x: any) => [x.name, x]));
    assert.equal(byName['a']?.resolvedVersion, '1.2.3');
    assert.equal(byName['a']?.direct, true);
    assert.ok(byName['b'], 'transitive from lockfile');
    assert.equal(byName['b']?.resolvedVersion, '2.0.0');
    assert.equal(byName['b']?.direct, false);
    assert.equal(r.status, 'completed');
});
check('Dependencies', 'without a lockfile resolved versions stay null and status may be partial', async (c) => {
    const r: any = await analyzeDependencies(path.join(WORK, 'deps'));
    assert.ok(r.findings.every((x: any) => x.resolvedVersion === null));
    c.limit('no CVE/vulnerability database; size impact and replacement recommendations not computed');
});
// ---------------------------------------------------------------- 5. processes
check('Processes', 'lists visible processes with pid and name, honoring the limit', async () => {
    const r: any = await listProcesses(25);
    assert.equal(r.status, 'completed', j(r.limitations));
    assert.ok(r.findings.length > 0 && r.findings.length <= 25);
    // Windows legitimately lists PID 0 ("System Idle Process"); POSIX PIDs start at 1.
    assert.ok(r.findings.every((p: any) => Number.isInteger(p.pid) && p.pid >= (WIN ? 0 : 1) && typeof p.name === 'string'));
    if (!WIN)
        assert.ok(r.findings.every((p: any) => Number.isInteger(p.ppid)), 'ppid on POSIX hosts');
});
check('Processes', 'limit is clamped to the 1..500 range', async () => {
    assert.ok(((await listProcesses(100000)) as any).findings.length <= 500);
    assert.ok(((await listProcesses(0)) as any).findings.length <= 1);
});
check('Processes', 'inspectProcess validates PIDs', async () => {
    for (const bad of [0, -1, 1.5, NaN])
        await assert.rejects(inspectProcess(bad as number), /positive integer/);
});
check('Processes', 'unknown PID yields partial with an empty finding list', async () => {
    const r: any = await inspectProcess(2147483646);
    assert.equal(r.status, 'partial');
    assert.deepEqual(r.findings, []);
});
check('Processes', 'any live process can be inspected, even beyond the 500-row display cap', async () => {
    const child = spawnIdle();
    try {
        await settle(200);
        for (const pid of [child.pid!, process.pid]) {
            const r: any = await inspectProcess(pid);
            assert.equal(r.status, 'completed', `pid ${pid}: ${j(r.limitations)}`);
            assert.equal(r.findings[0].pid, pid);
        }
    }
    finally {
        await killAndWait(child);
    }
});
check('Processes', 'process enumeration respects helper timeout where a helper is used', async (c) => {
    const prev = process.env.REVERSE_EXEC_TIMEOUT_MS;
    process.env.REVERSE_EXEC_TIMEOUT_MS = '1';
    try {
        const r: any = await listProcesses(5);
        if (process.platform === 'linux') {
            assert.equal(r.status, 'completed');
            c.note('Linux /proc enumeration does not spawn a helper.');
        }
        else {
            assert.equal(r.status, 'partial');
            assert.match(r.limitations.join(' '), /enumeration failed/i);
        }
    }
    finally {
        if (prev === undefined)
            delete process.env.REVERSE_EXEC_TIMEOUT_MS;
        else
            process.env.REVERSE_EXEC_TIMEOUT_MS = prev;
    }
    assert.equal(((await listProcesses(5)) as any).status, 'completed');
});
check('Processes', 'collects thread, memory, I/O and child-process metadata where supported', async () => {
    const p: any = ((await listProcesses(5)) as any).findings[0];
    if (process.platform === 'linux') {
        assert.ok(p.rssBytes >= 0);
        assert.ok(p.vmsBytes >= 0);
        assert.ok(Array.isArray(p.children));
        assert.ok(p.openFileDescriptors >= 0);
    }
    assert.ok(p.threads === undefined || p.threads >= 0);
});
check('Processes', 'macOS ps output is parsed (fixture): paths with spaces, etime, memory in KiB, no thread column', () => {
    assert.ok(!MAC_PS_FIELDS.some(f => /thcount|nlwp/.test(f)), 'BSD ps has no thread-count column');
    assert.equal(MAC_PS_FIELDS.at(-1), 'comm=', 'comm may contain spaces, so it must be the last column');
    const table = [
        '    1     0     0   0.0  13024 4294000 12-03:04:05 Mon Nov  2 09:12:01 2026 /sbin/launchd',
        '  512     1   501  12.5 204800 9000000    01:02:03 Mon Nov  9 06:54:40 2026 '
            + '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        'not a process row',
    ].join('\n');
    const args = ['    1 /sbin/launchd', '  512 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --type=renderer'].join('\n');
    const rows = parseMacPs(table, args);
    assert.equal(rows.length, 2);
    assert.equal(rows[1].pid, 512);
    assert.equal(rows[1].ppid, 1);
    assert.equal(rows[1].ownerUid, 501);
    assert.equal(rows[1].name, 'Google Chrome');
    assert.match(rows[1].command!, /--type=renderer$/);
    assert.equal(rows[1].rssBytes, 204800 * 1024);
    assert.equal(rows[1].vmsBytes, 9000000 * 1024);
    assert.equal(rows[1].cpuPercent, 12.5);
    assert.equal(rows[1].uptimeSeconds, 3723);
    assert.ok(rows[1].identityToken!.startsWith('mac:512:'));
    assert.ok(rows[1].startedAt && !Number.isNaN(Date.parse(rows[1].startedAt)));
    assert.equal(rows[0].uptimeSeconds, 1047845);
    assert.equal(rows[0].threads, undefined);
    assert.equal(parseEtime('05:07'), 307);
    assert.equal(parseEtime('garbage'), undefined);
});
check('Processes', 'Windows CIM JSON is parsed (fixture): ISO start time, null values, single object, BOM', () => {
    const one = parseWindowsCim('\uFEFF'
        + j({
            ProcessId: 4321,
            ParentProcessId: 4,
            Name: 'node.exe',
            CommandLine: null,
            ExecutablePath: 'C:\\node.exe',
            ThreadCount: 11,
            WorkingSetSize: 5000,
            VirtualSize: 0,
            Started: '2026-11-09T06:54:40.1234567Z'
        }));
    assert.equal(one.length, 1);
    assert.equal(one[0].identityToken, 'windows:2026-11-09T06:54:40.1234567Z');
    assert.equal(one[0].startedAt, '2026-11-09T06:54:40.123Z');
    assert.equal(one[0].command, '');
    assert.equal(one[0].threads, 11);
    assert.equal(one[0].vmsBytes, undefined);
    const many = parseWindowsCim(j([
        {
            ProcessId: 0,
            ParentProcessId: 0,
            Name: 'System Idle Process',
            Started: null
        },
        {
            ProcessId: 8,
            ParentProcessId: 0,
            Name: 'a',
            Started: 'not a date'
        }
    ]));
    assert.equal(many.length, 2);
    assert.ok(many.every(p => p.startedAt === undefined && p.identityToken === undefined), 'an unreadable start time must not throw');
    assert.deepEqual(parseWindowsCim(''), []);
});
check('Processes', 'exposes stable process identity and verifies ownership where the OS provides it', async () => {
    const identity = await getProcessIdentity(process.pid);
    assert.ok(identity?.identityToken, 'current process has a start-time identity token');
    assert.equal(await verifyProcessIdentity(process.pid, identity.identityToken), true);
    const owner = await verifyProcessOwnership(process.pid);
    if (process.platform !== 'win32') {
        assert.equal(owner.known, true);
        assert.equal(owner.owned, true);
    }
});
check('Safety', 'resource-control status is reported without claiming isolation', async () => {
    const r: any = await getResourceControlStatus();
    assert.equal(r.operation, 'resource_control_status');
    assert.ok(r.findings.length === 1);
    const limit = { memoryMaxBytes: 64 * 1024 * 1024 };
    await assert.rejects(withProcessResourceLimits(process.pid, limit, 'READ_ONLY', true, async () => true), /CONTROLLED_EXECUTION/);
    await assert.rejects(withProcessResourceLimits(process.pid, limit, 'CONTROLLED_EXECUTION', false, async () => true), /confirm=true/);
});
// ---------------------------------------------------------------- 6. profiling
check('Profiling', 'samples CPU/RSS of a live process and aggregates average/peak', async (c) => {
    // A busy loop gives non-zero CPU% on POSIX. On Windows CPU is not collected, and a spinning child
    // starves the 2-core runner, so use an idle child there.
    const child = WIN ? spawnIdle() : spawn(NODE, nodeEval('while(true){}'), { stdio: 'ignore' });
    try {
        await settle(200);
        const r: any = await profileProcess(child.pid!, 700, 100);
        const f = r.findings[0];
        if (WIN && r.status === 'partial' && /Command failed|timed out|ETIMEDOUT/i.test(j(r.errors))) {
            c.drift('PowerShell sampling failed under load (helper timeout is configurable through REVERSE_EXEC_TIMEOUT_MS; '
                + `one PowerShell start per sample): ${String(r.errors[0]).slice(0, 90)}`);
            return;
        }
        assert.equal(r.status, 'completed', j(r.errors));
        assert.ok(f.sampleCount >= (WIN ? 1 : 2), `samples: ${f.sampleCount}`);
        assert.ok(f.peakRssBytes > 0 && f.averageRssBytes > 0);
        if (WIN) {
            assert.equal(f.averageCpuPercent, null);
            c.limit('Windows: CPU percentage is not collected, RSS only');
        }
        else {
            assert.ok(f.peakCpuPercent >= 0);
            assert.ok(f.peakCpuPercent >= f.averageCpuPercent);
        }
        assert.ok(f.samples.every((s: any) => !Number.isNaN(Date.parse(s.at))));
    }
    finally {
        await killAndWait(child);
    }
});
check('Profiling', 'duration and interval are clamped to safe bounds', async () => {
    const child = spawnIdle();
    try {
        await settle(100);
        const t0 = Date.now();
        const r: any = await profileProcess(child.pid!, 1, 1);
        assert.ok(Date.now() - t0 >= 450, 'duration below 500ms must be raised to 500ms');
        assert.ok(r.findings[0].sampleCount <= 6, 'interval below 100ms must be raised to 100ms');
    }
    finally {
        await killAndWait(child);
    }
});
check('Profiling', 'rejects a mismatched expected process identity before sampling', async () => {
    const r: any = await profileProcess(process.pid, 500, 100, 'Monitor', { expectedIdentityToken: 'not-the-current-process-token' });
    assert.equal(r.status, 'partial');
    assert.ok(r.errors.some((x: string) => /identity does not match/i.test(x)));
    assert.equal(r.findings.length, 0);
});
check('Profiling', 'caller cancellation stops sampling and returns a partial result', async () => {
    const child = spawnIdle();
    const controller = new AbortController();
    try {
        await settle(100);
        const pending = profileProcess(child.pid!, 2500, 100, 'Monitor', { signal: controller.signal });
        setTimeout(() => controller.abort(), 250);
        const r: any = await pending;
        assert.equal(r.status, 'partial');
        assert.ok(r.limitations.some((x: string) => /cancelled/i.test(x)));
        assert.ok(r.findings[0].sampleCount >= 1);
    }
    finally {
        await killAndWait(child);
    }
});
check('Profiling', 'a cancellation that arrives before the first sample still returns that sample, and returns promptly', async () => {
    const child = spawnIdle();
    try {
        await settle(100);
        const t0 = Date.now();
        const r: any = await profileProcess(child.pid!, 5000, 2000, 'Monitor', { signal: AbortSignal.abort() });
        assert.equal(r.status, 'partial');
        assert.ok(r.limitations.some((x: string) => /cancelled/i.test(x)));
        assert.equal(r.findings[0].sampleCount, 1, 'the initial inspection is kept as the first sample');
        assert.ok(Date.now() - t0 < 4000, 'an already-aborted signal must not wait out the sampling interval');
    }
    finally {
        await killAndWait(child);
    }
});
check('Profiling', 'a vanished process yields partial with a recorded error', async () => {
    const child = spawnIdle();
    const pid = child.pid!;
    await killAndWait(child);
    await settle(200);
    const r: any = await profileProcess(pid, 500, 100);
    assert.equal(r.status, 'partial');
    assert.ok(r.errors.length > 0);
});
check('Profiling', 'invalid PID is rejected', async () => {
    await assert.rejects(profileProcess(0), /positive integer/);
});
check('Profiling', 'time-series includes memory, threads, child and disk I/O metrics', async () => {
    const child = spawnIdle();
    try {
        await settle(100);
        const f: any = ((await profileProcess(child.pid!, 500, 100)) as any).findings[0];
        assert.ok(f.sampleCount >= 1);
        assert.ok(f.samples.every((x: any) => 'rssBytes' in x));
        if (process.platform === 'linux')
            assert.ok(f.samples.every((x: any) => 'diskReadBytes' in x && 'threads' in x && 'children' in x));
        assert.ok(existsSync(f.artifactPath));
    }
    finally {
        await killAndWait(child);
    }
});
// ---------------------------------------------------------------- 7. benchmark
check('Benchmark', 'repeats a command and reports mean/median/min/max with per-run output', async () => {
    const r: any = await runBenchmark({ command: NODE, args: nodeEval('process.stdout.write("ok")'), repetitions: 4 });
    const f = r.findings[0];
    assert.equal(f.repetitionsCompleted, 4);
    assert.equal(r.status, 'completed');
    assert.ok(f.minDurationMs <= f.medianDurationMs && f.medianDurationMs <= f.maxDurationMs && f.meanDurationMs > 0);
    assert.ok(f.runs.every((x: any) => x.stdout === 'ok' && x.exitCode === 0));
});
check('Benchmark', 'persists the result as a JSON artifact under REVERSE_HOME', async () => {
    const f: any = ((await runBenchmark({ command: NODE, args: nodeEval('0'), repetitions: 1 })) as any).findings[0];
    assert.ok(path.resolve(f.artifactPath).startsWith(path.resolve(HOME)), f.artifactPath);
    assert.equal((await read(f.artifactPath)).operation, 'benchmark');
});
check('Benchmark', 'repetitions are clamped to 1..20', async () => {
    const hi: any = await runBenchmark({ command: NODE, args: nodeEval('0'), repetitions: 50 });
    assert.equal(hi.findings[0].repetitionsRequested, 20);
    assert.equal(hi.findings[0].repetitionsCompleted, 20);
    const lo: any = await runBenchmark({ command: NODE, args: nodeEval('0'), repetitions: 0 });
    assert.equal(lo.findings[0].repetitionsRequested, 1);
});
check('Benchmark', 'a timeout kills the command, flags the run and stops further repetitions', async () => {
    const t0 = Date.now();
    const r: any = await runBenchmark({ command: NODE, args: nodeEval('setTimeout(()=>{},20000)'), timeoutMs: 400, repetitions: 3 });
    assert.ok(Date.now() - t0 < 10000, 'must not wait for the child');
    assert.equal(r.status, 'partial');
    assert.equal(r.findings[0].runs[0].timedOut, true);
    assert.equal(r.findings[0].repetitionsCompleted, 1);
});
check('Benchmark', 'a missing executable is reported as an error, not thrown', async () => {
    const r: any = await runBenchmark({ command: 'definitely-not-a-real-command-xyz', repetitions: 2 });
    assert.equal(r.status, 'partial');
    assert.ok(r.findings[0].runs[0].error);
});
check('Benchmark', 'an empty command is rejected', async () => {
    await assert.rejects(runBenchmark({ command: '  ' }), /command is required/i);
});
check('Benchmark', 'runs without a shell: metacharacters stay literal arguments', async () => {
    const arg = 'x && echo INJECTED; $(whoami) | cat';
    const r: any = await runBenchmark({ command: NODE, args: nodeEval('process.stdout.write(process.argv[1])', arg), repetitions: 1 });
    assert.equal(r.findings[0].runs[0].stdout, arg);
});
check('Benchmark', 'stdin is closed (child sees EOF) and stdout/stderr are captured separately', async () => {
    const r: any = await runBenchmark({
        command: NODE, repetitions: 1,
        args: nodeEval('process.stdin.on("end",()=>{process.stdout.write("eof");process.stderr.write("err")});process.stdin.resume()'),
    });
    assert.equal(r.findings[0].runs[0].stdout, 'eof');
    assert.equal(r.findings[0].runs[0].stderr, 'err');
});
check('Benchmark', 'captured output never exceeds 1 MiB (bytes) per stream, whatever the chunk size, and is flagged', async () => {
    const CAP = 1024 * 1024;
    const small: any = await runBenchmark({
        command: NODE, repetitions: 1, timeoutMs: 60000,
        args: nodeEval('const c="x".repeat(16384);let n=0;'
            + '(function w(){while(n<250){n++;if(!process.stdout.write(c))return process.stdout.once("drain",w);}})()'),
    });
    const s = small.findings[0].runs[0];
    assert.equal(Buffer.byteLength(s.stdout), CAP, 'small chunks');
    assert.equal(s.stdoutTruncated, true);
    const big: any = await runBenchmark({
        command: NODE,
        args: nodeEval('process.stdout.write("x".repeat(4e6));process.stderr.write("y".repeat(3e6))'),
        repetitions: 1,
        timeoutMs: 60000
    });
    const b = big.findings[0].runs[0];
    assert.equal(Buffer.byteLength(b.stdout), CAP, 'one huge chunk');
    assert.equal(Buffer.byteLength(b.stderr), CAP);
    const wide: any = await runBenchmark({
        command: NODE,
        args: nodeEval('process.stdout.write("é".repeat(1100000))'),
        repetitions: 1,
        timeoutMs: 60000
    });
    assert.ok(Buffer.byteLength(wide.findings[0].runs[0].stdout) <= CAP, 'multi-byte text is capped in bytes, not characters');
    assert.equal(wide.findings[0].runs[0].stdoutTruncated, true);
    assert.equal(b.stdoutTruncated, true);
    assert.equal(b.stderrTruncated, true);
    const ok: any = await runBenchmark({ command: NODE, args: nodeEval('process.stdout.write("small")'), repetitions: 1 });
    assert.equal(ok.findings[0].runs[0].stdoutTruncated, false);
});
check('Benchmark', 'honors cwd and records the non-zero exit code', async () => {
    const d = path.join(WORK, 'cwd');
    await mkdir(d, { recursive: true });
    const r: any = await runBenchmark({
        command: NODE,
        args: nodeEval('process.stdout.write(process.cwd());process.exit(3)'),
        cwd: d,
        repetitions: 1
    });
    // Normalizes 8.3 short names (Windows) and /var -> /private/var (macOS).
    assert.equal(realpathSync.native(r.findings[0].runs[0].stdout), realpathSync.native(d));
    assert.equal(r.findings[0].runs[0].exitCode, 3);
});
check('Benchmark', 'compareBenchmarks computes delta and percent change and validates input', async () => {
    const imp: any = await compareBenchmarks({ findings: [{ meanDurationMs: 200 }] }, { findings: [{ meanDurationMs: 150 }] });
    // Means alone are descriptive: no claim of improvement without repeated runs (AUDIT F-04).
    assert.deepEqual([
        imp.findings[0].deltaMs,
        imp.findings[0].changePercent,
        imp.findings[0].improved,
        imp.findings[0].verdict
    ], [
        -50,
        -25,
        false,
        'insufficient_evidence'
    ]);
    const reg: any = await compareBenchmarks({ findings: [{ meanDurationMs: 100 }] }, { findings: [{ meanDurationMs: 120 }] });
    assert.equal(reg.findings[0].improved, false);
    await assert.rejects(compareBenchmarks({}, {}), /positive meanDurationMs/);
    await assert.rejects(compareBenchmarks({ findings: [{ meanDurationMs: 0 }] }, { findings: [{ meanDurationMs: 1 }] }));
});
check('Benchmark', 'end to end: a measurably slower command is detected as slower', async () => {
    // Windows process start-up costs several hundred ms and varies a lot, so the injected delay must dominate it.
    const delayMs = WIN ? 1500 : 300;
    const fast: any = await runBenchmark({ command: NODE, args: nodeEval('0'), repetitions: 3 });
    const slow: any = await runBenchmark({ command: NODE, args: nodeEval(`setTimeout(()=>{},${delayMs})`), repetitions: 3 });
    const cmp: any = await compareBenchmarks(fast, slow);
    assert.equal(cmp.findings[0].improved, false);
    assert.ok(cmp.findings[0].changePercent > 50);
});
check('Benchmark', 'a timeout terminates the whole process tree, grandchildren included', async (c) => {
    const code = 'const {spawn}=require("node:child_process");' +
        'const g=spawn(process.execPath,["-e","setTimeout(()=>{},30000)"],{detached:true,stdio:"ignore"});g.unref();' +
        'process.stdout.write(String(g.pid));setTimeout(()=>{},30000)';
    const r: any = await runBenchmark({ command: NODE, args: nodeEval(code), timeoutMs: 1500, repetitions: 1 });
    const gpid = Number(r.findings[0].runs[0].stdout);
    assert.ok(Number.isInteger(gpid) && gpid > 0, 'grandchild pid must be reported before the timeout');
    let alive = true;
    for (let i = 0; i < 30 && alive; i++) {
        try {
            process.kill(gpid, 0);
            await settle(100);
        }
        catch {
            alive = false;
        }
    }
    if (alive) {
        try {
            process.kill(gpid, 'SIGKILL');
        }
        catch { /* ignore */ }
        if (WIN)
            c.drift('Windows: a detached grandchild survived taskkill /T after the timeout');
        else
            assert.fail('grandchild survived the benchmark timeout');
    }
    assert.ok(r.findings[0].runs[0].processesTerminated >= 1);
});
check('Benchmark', 'a timeout returns promptly even when a grandchild holds the stdio pipes', async () => {
    const code = 'const {spawn}=require("node:child_process");' +
        'spawn(process.execPath,["-e","setTimeout(()=>{},30000)"],{stdio:"inherit"});setTimeout(()=>{},30000)';
    const t0 = Date.now();
    const r: any = await runBenchmark({ command: NODE, args: nodeEval(code), timeoutMs: 500, repetitions: 1 });
    assert.ok(Date.now() - t0 < 8000, `took ${Date.now() - t0} ms`);
    assert.equal(r.findings[0].runs[0].timedOut, true);
});
check('Benchmark', 'reports P95, std-dev, MAD, outliers, CI, environment, binary size and cold/warm labels', async () => {
    const f: any = ((await runBenchmark({ command: NODE, args: nodeEval('0'), repetitions: 2 })) as any).findings[0];
    for (const k of [
        'p95DurationMs',
        'stddevMs',
        'madMs',
        'outlierDurationsMs',
        'ci95MeanMs',
        'environment',
        'environmentNoiseDetected',
        'hyperfineExport',
        'warmupCompleted',
        'resourceMetrics',
        'binarySizeBytes',
        'coldDurationMs',
        'warmMedianDurationMs'
    ])
        assert.notEqual(f[k], undefined, k);
    assert.ok(f.binarySizeBytes > 1000, `binary size ${f.binarySizeBytes}`);
    assert.equal(f.hyperfineExport.version, '1.0');
    assert.equal(f.hyperfineExport.results[0].times.length, 2);
    assert.equal(typeof f.environment.noise.highLoad, 'boolean');
    assert.deepEqual(f.runs.map((x: any) => x.temperature), ['cold', 'warm']);
    assert.equal(f.coldPhase, 'measured');
    const w: any = ((await runBenchmark({ command: NODE, args: nodeEval('0'), repetitions: 1, warmupRuns: 1 })) as any).findings[0];
    assert.equal(w.warmups[0].temperature, 'cold');
    assert.equal(w.runs[0].temperature, 'warm');
    assert.equal(w.coldPhase, 'warmup');
});
check('Benchmark', 'per-run CPU time and peak RAM are sampled on Linux (/proc), macOS (ps) and Windows (PowerShell)', async (c) => {
    // A child that holds ~80 MB and burns CPU for a moment, so that sampling has something to see.
    // On Windows every sample starts a PowerShell (0.5-1.5 s), so a run must outlive the first sample to be seen at all.
    const busyMs = WIN ? 2500 : 400;
    const code = 'const a=Buffer.alloc(80*1024*1024,1);let x=0;const t=Date.now();'
        + `while(Date.now()-t<${busyMs})x+=Math.sqrt(x+1);process.stdout.write(String(a.length))`;
    const f: any = ((await runBenchmark({ command: NODE, args: nodeEval(code), repetitions: 3 })) as any).findings[0];
    if (!f.resourceMetrics.available) {
        c.limit(`${process.platform}: resource sampling produced no data (${f.resourceMetrics.reason ?? 'unknown'}); `
            + 'very short runs may end before a sample');
        return;
    }
    const sampled = f.runs.every((x: any) => x.cpuTimeMs !== null && x.peakRssBytes !== null);
    assert.ok(sampled, 'every successful run carries CPU time and peak RSS');
    assert.ok(f.medianCpuTimeMs >= 150, `CPU time ${f.medianCpuTimeMs} ms for a ${busyMs} ms busy loop`);
    assert.ok(f.medianCpuTimeMs <= f.medianDurationMs * 2 + 100, 'CPU time is plausible against wall-clock time');
    assert.ok(f.medianPeakRssBytes >= 60 * 1024 * 1024, `peak RSS ${f.medianPeakRssBytes} bytes for an 80 MiB buffer`);
    assert.ok(f.maxPeakRssBytes >= f.medianPeakRssBytes);
});
check('Benchmark', 'compare_results reports CPU time, peak RAM and binary size changes per metric', async () => {
    const mk = (cpu: number[], rss: number[], size: number) => ({
        findings: [{
                meanDurationMs: 100,
                binarySizeBytes: size,
                medianCpuTimeMs: cpu[0],
                medianPeakRssBytes: rss[0],
                runs: cpu.map((v, i) => ({
                    durationMs: 100,
                    exitCode: 0,
                    cpuTimeMs: v,
                    peakRssBytes: rss[i]
                }))
            }]
    });
    const r: any = await compareBenchmarks(mk([
        100,
        101,
        99,
        100,
        102,
        98
    ], [
        50e6,
        50e6,
        50e6,
        50e6,
        50e6,
        50e6
    ], 1000), mk([
        50,
        51,
        49,
        50,
        52,
        48
    ], [
        40e6,
        40e6,
        40e6,
        40e6,
        40e6,
        40e6
    ], 900));
    const m = r.findings[0].metrics;
    assert.equal(m.binarySizeBytes.delta, -100);
    assert.equal(m.binarySizeBytes.changePercent, -10);
    assert.ok(m.cpuTimeMedianMs.changePercent < -40);
    assert.equal(m.cpuTimeVerdict, 'improved');
    assert.equal(m.peakRssMedianBytes.changePercent, -20);
    const none: any = await compareBenchmarks({ findings: [{ meanDurationMs: 100 }] }, { findings: [{ meanDurationMs: 90 }] });
    assert.equal(none.findings[0].metrics.cpuTimeMedianMs, null);
    assert.equal(none.findings[0].metrics.cpuTimeVerdict, null);
});
// ---------------------------------------------------------------- 8. validation
check('Validation', 'passes when exit code, stdout and stderr match exactly', async () => {
    const r: any = await validateBehavior({
        command: NODE,
        args: nodeEval('process.stdout.write("pass");process.stderr.write("e")')
    }, {
        exitCode: 0,
        stdout: 'pass',
        stderr: 'e'
    }, 2);
    assert.equal(r.findings[0].passed, true);
    assert.equal(r.status, 'completed');
    assert.equal(r.findings[0].checks.length, 3);
    assert.ok(existsSync(r.findings[0].artifactPath));
});
check('Validation', 'detects a stdout mismatch, a wrong exit code and an unexpected non-zero exit', async () => {
    const a: any = await validateBehavior({ command: NODE, args: nodeEval('process.stdout.write("actual")') }, { stdout: 'expected' });
    assert.equal(a.findings[0].passed, false);
    assert.equal(a.status, 'completed', 'a clean mismatch is a completed check with passed=false');
    assert.equal(a.findings[0].checks.find((x: any) => x.name === 'stdout').passed, false);
    const b: any = await validateBehavior({ command: NODE, args: nodeEval('process.exit(2)') }, { exitCode: 2 });
    assert.equal(b.findings[0].passed, true);
    const d: any = await validateBehavior({ command: NODE, args: nodeEval('process.exit(2)') }, {});
    assert.equal(d.findings[0].passed, false);
});
check('Validation', 'repeated runs must all match (non-deterministic output fails)', async () => {
    const r: any = await validateBehavior({
        command: NODE,
        args: nodeEval('process.stdout.write(String(Math.random()))')
    }, { stdout: '0.5' }, 3);
    assert.equal(r.findings[0].passed, false);
});
check('Validation', 'normalization can collapse whitespace; semantic equivalence still not claimed', async (c) => {
    const r: any = await validateBehavior({ command: NODE, args: nodeEval('process.stdout.write("a  b")') }, { stdout: 'a b' }, 1, {
        normalize: { whitespace: true }
    });
    assert.equal(r.findings[0].passed, true, 'whitespace normalization should allow match');
    c.limit('semantic equivalence and full test-framework adapters remain out of scope');
});
check('Validation', 'without normalize, whitespace-only differences still fail', async () => {
    const r: any = await validateBehavior({ command: NODE, args: nodeEval('process.stdout.write("a  b")') }, { stdout: 'a b' });
    assert.equal(r.findings[0].passed, false);
});
// ---------------------------------------------------------------- hotfix 0.2.0-beta.2 checks
check('Benchmark', 'median is the mean of the two middle values for even counts (AUDIT F-02)', async () => {
    const { median } = await import('../dist/benchmark-engine.js');
    assert.equal(median([]), null);
    assert.equal(median([5]), 5);
    assert.equal(median([9, 1]), 5);
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 3, 2]), 2.5);
});
check('Validation', 'output cut at the capture cap never counts as a match (AUDIT F-05)', async () => {
    const r: any = await validateBehavior({
        command: NODE,
        args: nodeEval('process.stdout.write("x".repeat(2e6))')
    }, { stdout: 'x'.repeat(1024 * 1024) });
    assert.equal(r.findings[0].passed, false);
    assert.equal(r.status, 'partial');
    assert.ok(r.findings[0].checks.some((x: any) => x.name === 'outputNotTruncated' && !x.passed));
});
check('MCP', 'a failing tool returns a result with isError:true and the message, not a protocol error (AUDIT F-06)', async () => {
    const s = startMcp();
    try {
        const m = await s.req('tools/call', { name: 'analyze_binary', arguments: { file: path.join(WORK, 'does-not-exist') } });
        assert.equal(m.error, undefined);
        assert.equal(m.result.isError, true);
        assert.match(m.result.content[0].text, /ENOENT/);
        assert.deepEqual((await s.req('ping')).result, {});
    }
    finally {
        await s.close();
    }
});
check('Source', 'files above the size cap are counted but not read; the file cap is exact (AUDIT F-09)', async () => {
    await mkdir(WORK, { recursive: true });
    const d = path.join(WORK, 'bigfile');
    await mkdir(d, { recursive: true });
    await writeFile(path.join(d, 'huge.js'), Buffer.alloc(3 * 1024 * 1024, 'a'));
    await writeFile(path.join(d, 'blob.wasm'), Buffer.from([0, 0x61, 0x73, 0x6d]));
    const r: any = await analyzeSource(d);
    assert.equal(r.findings[0].fileCount, 1, '.wasm is not text source');
    assert.ok(r.coverage.notes.some((n: string) => /not read/.test(n)));
    const many = path.join(WORK, 'many');
    await mkdir(many, { recursive: true });
    await Promise.all(Array.from({ length: 5100 }, (_, i) => writeFile(path.join(many, `f${i}.js`), 'x')));
    assert.equal(((await analyzeSource(many)) as any).findings[0].fileCount, 5000);
});
check('Docs', 'ARCHITECTURE.md does not list implemented MCP tools as planned (AUDIT F-15)', async () => {
    const arch = readFileSync(path.join(ROOT, 'docs', 'ARCHITECTURE.md'), 'utf8');
    const planned = arch.slice(arch.indexOf('Remaining planned additions'));
    const s = startMcp();
    try {
        const names: string[] = (await s.req('tools/list')).result.tools.map((t: any) => t.name);
        const section = planned.slice(0, planned.indexOf('Candidates for later'));
        const stale = [...section.matchAll(/^\| `([a-z_]+)` \|/gm)].map(m => m[1]).filter(n => names.includes(n));
        assert.deepEqual(stale, [], 'implemented tools still listed as planned');
    }
    finally {
        await s.close();
    }
});
check('Docs', 'every finding and recommendation ID of docs/AUDIT.md is tracked in docs/ROADMAP.md', async () => {
    const audit = readFileSync(path.join(ROOT, 'docs', 'AUDIT.md'), 'utf8');
    const road = readFileSync(path.join(ROOT, 'docs', 'ROADMAP.md'), 'utf8');
    const ids = [...new Set(audit.match(/\b[FGRH]-\d{2}\b/g) ?? [])];
    assert.ok(ids.length >= 57, 'audit IDs found');
    assert.deepEqual(ids.filter(id => !road.includes(`| ${id} |`)), [], 'IDs missing from the approved audit backlog');
});
// ---------------------------------------------------------------- 9. evidence
check('Evidence', 'evidence written by an analysis can be found again by ID', async () => {
    const file = await craft('ev.bin', elf({ cls: 2, le: true, machine: 62, entry: 2n }));
    const ev = ((await analyzeBinary(file)) as any).evidence[0];
    assert.match(ev.id, /^[0-9a-f-]{36}$/);
    assert.ok(!Number.isNaN(Date.parse(ev.observedAt)));
    const p = await new EvidenceEngine().get(ev.id);
    assert.ok(p, 'evidence file not found');
    assert.equal((await read(p!)).id, ev.id);
    assert.equal(path.dirname(p!), path.join(HOME, 'evidence'));
});
check('Evidence', 'unknown ID returns undefined; record() and persist() round-trip', async () => {
    const e = new EvidenceEngine();
    assert.equal(await e.get('00000000-0000-0000-0000-000000000000'), undefined);
    const rec = await e.record('measurement', 'unit-test', { value: 42 }, 'abc');
    assert.deepEqual([rec.kind, rec.source, rec.sha256, (rec.details as any).value], ['measurement', 'unit-test', 'abc', 42]);
    const file = await e.persist(rec);
    assert.equal((await read(file)).id, rec.id);
    assert.equal(await e.get(rec.id), file);
});
check('Evidence', 'every result uses the documented Result envelope', async () => {
    const r: any = await runBenchmark({ command: NODE, args: nodeEval('0'), repetitions: 1 });
    for (const k of [
        'schemaVersion',
        'id',
        'target',
        'operation',
        'status',
        'generatedAt',
        'host',
        'findings',
        'evidence',
        'limitations',
        'errors',
        'coverage'
    ])
        assert.ok(k in r, k);
    assert.equal(r.schemaVersion, '1.0');
});
check('Evidence', 'research sessions hash-chain events, detect tampering and keep hypotheses separate from evidence', async () => {
    const engine = new EvidenceEngine();
    const session = await engine.createResearchSession('capability-fixture');
    const hypothesis = await engine.addHypothesis(session.session_id, {
        statement: 'Possible CPU bottleneck',
        provenance: ['agent'],
        confidence: 0.4
    });
    assert.equal(hypothesis.kind, 'hypothesis');
    const measured = await engine.addEvidence(session.session_id, {
        type: 'Validation',
        source: 'fixture',
        measurement: { passed: true },
        confidence: 1,
        limitations: []
    });
    await engine.updateHypothesis(session.session_id, hypothesis.hypothesis_id, 'supported', measured.evidence_id);
    const loaded = await engine.getResearchSession(session.session_id);
    assert.equal(loaded?.hypotheses.length, 1);
    assert.equal(loaded?.evidence.length, 1);
    const genesis = '0'.repeat(64);
    assert.ok(loaded!.entries.every((entry: any, i: number) => entry.previousHash === (i ? loaded!.entries[i - 1].hash : genesis)));
    assert.equal(loaded?.integrity?.valid, true);
    // Editing the stored ledger must be detected.
    const file = path.join(HOME, 'sessions', `${session.session_id}.json`);
    const stored = await read(file);
    stored.entries[0].payload = { ...stored.entries[0].payload, tampered: true };
    await writeFile(file, JSON.stringify(stored));
    assert.equal((await engine.getResearchSession(session.session_id))?.integrity?.valid, false);
});
check('Evidence', 'the session ledger is hash-chained and optionally signed (patch I)', async (c) => {
    const { signSession, verifySessionSignature, verifyHashChain } = await import('../dist/evidence-integrity.js');
    const engine = new EvidenceEngine();
    const session: any = await engine.createResearchSession('signed-fixture');
    const chain = verifyHashChain(session);
    assert.equal(chain.valid, true);
    const prev = process.env.REVERSE_EVIDENCE_KEY;
    process.env.REVERSE_EVIDENCE_KEY = 'capability-test-key';
    try {
        const signed = signSession(session);
        assert.ok((signed.integrity as any)?.signature, 'HMAC signature present when key set');
        const ver: any = verifySessionSignature(signed);
        assert.equal(ver.findings[0].signatureValid, true);
        assert.equal(ver.findings[0].chainValid, true);
    }
    finally {
        if (prev === undefined)
            delete process.env.REVERSE_EVIDENCE_KEY;
        else
            process.env.REVERSE_EVIDENCE_KEY = prev;
    }
    c.limit('Merkle roots and public-key detached signatures remain optional extensions');
});
check('Evidence', 'a hypothesis is promoted only by evidence whose content supports it (promotion bypass closed)', async () => {
    const engine = new EvidenceEngine();
    const session = await engine.createResearchSession('promotion-fixture');
    const sid = session.session_id;
    const h = await engine.addHypothesis(sid, { statement: 'safe', provenance: ['agent'], confidence: 0.5 });
    const add = (type: any, measurement: unknown, confidence: number) => engine.addEvidence(sid, {
        type,
        source: 'check',
        measurement,
        confidence,
        limitations: []
    });
    const promote = (id: string) => engine.updateHypothesis(sid, h.hypothesis_id, 'supported', id);
    await assert.rejects(promote((await add('Benchmark', { medianMs: 10 }, 1)).evidence_id), /improved/);
    await assert.rejects(promote((await add('Validation', { passed: false }, 1)).evidence_id), /passed: true/);
    await assert.rejects(promote((await add('Validation', { passed: true }, 0.2)).evidence_id), /minimum/);
    await assert.rejects(promote((await add('CPU', { passed: true }, 1)).evidence_id), /Validation or Benchmark/);
    assert.equal(promotionBlocker(undefined) !== null, true);
    await promote((await add('Validation', { passed: true }, 1)).evidence_id);
    assert.equal((await engine.getResearchSession(sid))?.hypotheses[0].status, 'supported');
});
check('Evidence', 'real analyzer results become typed evidence (Binary, Process, Memory, CPU, I/O) with a Reverse source', async (c) => {
    const collected = [
        evidenceFromResult(await analyzeBinary(NODE)),
        evidenceFromResult(await inspectProcess(process.pid)),
        evidenceFromResult(await analyzeMemory(process.pid)),
        evidenceFromResult(await analyzeCpu(process.pid)),
        evidenceFromResult(await analyzeIo(process.pid)),
        evidenceFromResult(await profileProcess(process.pid, 500, 100, 'Snapshot'))
    ];
    assert.deepEqual(collected.map(e => e?.type), ['Binary', 'Process', 'Memory', 'CPU', 'I/O', 'Process']);
    for (const e of collected)
        assert.match(e!.source, /^reverse:[a-z_]+#[0-9a-f-]{36}$/);
    const weak = collected.filter(e => e!.confidence < 1).map(e => e!.type);
    if (weak.length)
        c.note(`${process.platform}: ${weak.join(', ')} evidence has confidence below 1 because the result was partial or incomplete`);
});
check('Profiling', 'anomaly rules fire on both sides of every threshold', () => {
    const run = (cpu: number[], rss: number[] = []) => findAnomalies([{
            pid: 1,
            samples: cpu.map((cpuPercent, i) => ({
                cpuPercent,
                rssBytes: rss[i]
            }))
        }]).map((f: any) => f.type);
    assert.deepEqual(run([80, 80, 80]), []);
    assert.deepEqual(run([81, 81, 81]), ['sustained_cpu']);
    assert.deepEqual(run([95, 1, 1]), []);
    assert.deepEqual(run([96, 1, 1]), ['cpu_spike']);
    assert.deepEqual(run([1, 1, 1], [100, 110, 120]), []);
    assert.deepEqual(run([1, 1, 1], [100, 110, 121]), ['growing_memory']);
    assert.deepEqual(run([1, 1], [100, 500]), []);
});
check('Profiling', 'Snapshot, Monitor, Diagnostic and Compare differ as documented', async () => {
    const child = spawn(NODE, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
    try {
        const take = async (mode: any, ms: number) => ((await profileProcess(child.pid!, ms, 100, mode)) as any).findings[0];
        // Windows needs a PowerShell call per sample (AUDIT R-19), so the observation window is scaled, not the assertions.
        const scale = WIN ? 12 : 1;
        const snapshot = await take('Snapshot', 600);
        const monitor = await take('Monitor', 700 * scale);
        const diagnostic = await take('Diagnostic', 700 * (WIN ? 4 : 1));
        const compare = await take('Compare', 1000 * scale);
        assert.equal(snapshot.sampleCount, 1);
        assert.ok(monitor.sampleCount >= 3);
        assert.ok(Array.isArray(diagnostic.anomalies) && diagnostic.periods === undefined);
        assert.ok(compare.periods && compare.anomalies === undefined && compare.sampleCount >= 4);
        assert.ok(snapshot.anomalies === undefined && monitor.anomalies === undefined && monitor.periods === undefined);
    }
    finally {
        child.kill();
    }
});
check('Safety', 'OBSERVE is a distinct contract: no command execution, sampling only with verified ownership', async () => {
    assert.equal(operatingMode({}), 'READ_ONLY');
    assert.equal(operatingMode({ REVERSE_MODE: 'OBSERVE' }), 'OBSERVE');
    assert.equal(operatingMode({ REVERSE_MODE: 'CONTROLLED_EXECUTION' }), 'CONTROLLED_EXECUTION');
    for (const mode of ['READ_ONLY', 'OBSERVE'])
        assert.match(String(checkCommandGate({ command: NODE }, { REVERSE_MODE: mode, REVERSE_COMMAND_ALLOWLIST: '*' })), /disabled/, mode);
    const child = spawn(NODE, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
    try {
        const r: any = await profileProcess(child.pid!, 500, 100, 'Snapshot', { requireOwnership: 'verified' });
        if (WIN)
            assert.equal(r.status, 'partial', 'Windows ownership is unknown, so verified sampling refuses');
        else
            assert.equal(r.findings[0].sampleCount, 1);
    }
    finally {
        child.kill();
    }
});
check('Safety', 'resource limits are enforced in a real cgroup (needs a delegated cgroup v2 hierarchy)', async (c) => {
    if (process.platform !== 'linux') {
        c.limit(`${process.platform}: enforced limits exist only for Linux cgroup v2`);
        return;
    }
    const child = spawn(NODE, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
    try {
        const pid = child.pid!;
        const procCgroup = () => readFileSync(`/proc/${pid}/cgroup`, 'utf8');
        const before = procCgroup();
        const unified = before.match(/^0::(.*)$/m);
        if (!unified) {
            c.limit('the host does not use a unified cgroup v2 hierarchy');
            return;
        }
        let seen: {
            inside: string;
            memory: string;
            cpu: string;
        } | undefined;
        try {
            await withProcessResourceLimits(pid, {
                memoryMaxBytes: 64 * 1024 * 1024,
                cpuQuotaPercent: 50
            }, 'CONTROLLED_EXECUTION', true, async () => {
                const inside = procCgroup();
                const dir = path.join('/sys/fs/cgroup', inside.match(/^0::(.*)$/m)![1]);
                seen = {
                    inside,
                    memory: readFileSync(path.join(dir, 'memory.max'), 'utf8').trim(),
                    cpu: readFileSync(path.join(dir, 'cpu.max'), 'utf8').trim()
                };
            });
        }
        catch (e) {
            const code = (e as NodeJS.ErrnoException).code;
            if (/cgroup v2 hierarchy is not available|cgroup\.subtree_control/.test((e as Error).message)) {
                c.limit(`no usable cgroup v2 hierarchy for the target here: ${(e as Error).message}`);
                return;
            }
            if (code && ['EACCES', 'EPERM', 'EROFS'].includes(code)) {
                c.limit(`cgroup v2 is not delegated to this user here (${code}: ${(e as Error).message})`);
                return;
            }
            throw e;
        }
        assert.match(seen!.inside, new RegExp(`/reverse-${pid}-[0-9a-f-]{36}`), 'the target was inside the temporary cgroup');
        assert.equal(seen!.memory, String(64 * 1024 * 1024));
        assert.equal(seen!.cpu, '50000 100000');
        assert.equal(procCgroup(), before, 'the target is back in its original cgroup');
        const rel = unified[1].replace(/^\/+|\/+$/g, '');
        const siblings = rel ? path.dirname(path.join('/sys/fs/cgroup', rel)) : '/sys/fs/cgroup';
        assert.deepEqual((await readdir(siblings)).filter(n => n.startsWith(`reverse-${pid}-`)), [], 'the temporary cgroup was removed');
    }
    finally {
        child.kill();
    }
});
check('Supply chain', 'GitHub Actions are pinned to full commit SHAs (R-03)', async (c) => {
    const dir = path.join(ROOT, '.github', 'workflows');
    const unpinned = new Set<string>();
    let total = 0;
    for (const name of (await readdir(dir)).filter(n => /\.ya?ml$/.test(n))) {
        for (const m of (await readFile(path.join(dir, name), 'utf8')).matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)) {
            total++;
            if (!m[1].startsWith('./') && !/@[0-9a-f]{40}$/.test(m[1]))
                unpinned.add(m[1]);
        }
    }
    if (unpinned.size)
        c.limit(`${unpinned.size} of ${total} action references are tags, not commit SHAs: ${[...unpinned].sort().join(', ')}`);
});
check('Source', 'no source or test line exceeds 140 characters, and the gate can fail', async () => {
    const gate = path.join(ROOT, 'tests', 'size-gate.mjs');
    assert.equal(spawnSync(NODE, [gate], { cwd: ROOT, encoding: 'utf8' }).status, 0, 'the repository passes its own gate');
    const probe = await mkdtemp(path.join(WORK, 'gate-'));
    await mkdir(path.join(probe, 'src'), { recursive: true });
    await writeFile(path.join(probe, 'src', 'wide.ts'), `export const x = '${'a'.repeat(200)}';\n`);
    const failed = spawnSync(NODE, [gate], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, REVERSE_GATE_ROOT: probe } });
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /Line length gate failed/);
    await writeFile(path.join(probe, 'src', 'wide.ts'), 'export const x = 1;\n');
    assert.equal(spawnSync(NODE, [gate], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, REVERSE_GATE_ROOT: probe } }).status, 0);
});
check('Tests', 'the capability harness is split across files (F-16)', async () => {
    const entry = (await readFile(path.join(ROOT, 'tests', 'capabilities.check.ts'), 'utf8')).split('\n').length;
    const suite = (await readFile(path.join(ROOT, 'tests', 'capabilities-suite.ts'), 'utf8')).split('\n').length;
    assert.ok(entry < 40, `entry capabilities.check.ts should be thin (got ${entry} lines)`);
    assert.ok(suite > 500, `suite module should hold the checks (got ${suite} lines)`);
    assert.ok(existsSync(path.join(ROOT, 'tests', 'capabilities-suite.ts')));
});
check('Docs', 'roadmap, audit and architecture agree with the delivered state of patches A-D', async () => {
    const docs = async (n: string) => readFile(path.join(ROOT, 'docs', n), 'utf8');
    const [roadmap, audit, arch, mcp] = [
        await docs('ROADMAP.md'),
        await docs('AUDIT.md'),
        await docs('ARCHITECTURE.md'),
        await docs('MCP.md')
    ];
    // Unchecked boxes in patches A-D are allowed only as explicitly labelled release gates.
    const sections = [...roadmap.matchAll(/^### Patch ([A-D])\b[\s\S]*?(?=^### |^## )/gm)];
    assert.equal(sections.length, 4, 'patch sections A, B, C and D exist');
    for (const m of sections)
        for (const line of m[0].split('\n').filter(l => /^- \[ \]/.test(l)))
            assert.match(line, /^- \[ \] Release gate:/, `Patch ${m[1]}: ${line.slice(0, 80)}`);
    // The 0.2 release checklist is closed apart from labelled release gates.
    const release = roadmap.slice(roadmap.indexOf('## 0.2 '), roadmap.indexOf('## 0.3 '));
    assert.ok(release.length > 500, '0.2 section found');
    for (const line of release.split('\n').filter(l => /^- \[ \]/.test(l) || /; \[ \]/.test(l)))
        assert.fail(`unchecked 0.2 item: ${line.slice(0, 80)}`);
    assert.ok(!/### Fact categories \(planned\)/.test(arch), 'fact categories are implemented, not planned');
    // No sentence of a reference document is stated twice in a row.
    for (const sentence of mcp.split(/(?<=\.)\s+/).filter(x => x.length > 40))
        assert.equal(mcp.split(sentence).length - 1, 1, `MCP.md repeats: ${sentence.slice(0, 60)}`);
    // AUDIT.md: every closed finding carries a Status line in the audit it belongs to.
    for (const id of ['F-18', 'F-24', 'F-29'])
        assert.match(audit, new RegExp(`${id}[^\\n]*closed in 0\\.2\\.0-beta\\.7`), id);
});
check('Docs', 'the roadmap has one patch table A-Q and a status dashboard for the current version', async () => {
    const roadmap = readFileSync(path.join(ROOT, 'docs', 'ROADMAP.md'), 'utf8');
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const table = roadmap.slice(roadmap.indexOf('### Order and dependencies'), roadmap.indexOf('## Active work'));
    const letters = [...table.matchAll(/^\| ([A-Z]) \|/gm)].map(m => m[1]);
    assert.deepEqual(letters, 'ABCDEFGHIJKLMNOPQ'.split(''), 'one ordered row per patch, A to Q');
    assert.ok(!/\| N \| Execution environments/.test(roadmap), 'superseded N/O/P classification returned');
    const glance = roadmap.slice(roadmap.indexOf('## Status at a glance'), roadmap.indexOf('## Delivery plan'));
    assert.ok(glance.includes(`**${pkg.version}**`), `Status at a glance does not name version ${pkg.version}`);
    for (const heading of ['## Carry-over debt register', '### Patch M working checklist', '## Release history'])
        assert.ok(roadmap.includes(heading), `missing section ${heading}`);
});
// ---------------------------------------------------------------- 10. providers
check('Providers', 'built-ins implemented; Ghidra/Rizin/JADX/Apktool registered; others extension points', async (c) => {
    // ensure bootstrap ran
    await import('../dist/providers-bootstrap.js').catch(() => import('../dist/providers-registry.js'));
    const list: any[] = listProviders();
    assert.equal(list.find(p => p.name === 'builtin-native-header')?.state, 'implemented');
    for (const n of [
        'ghidra', 'rizin', 'jadx', 'apktool', 'ghidra-similarity',
        'frida', 'gdb', 'perf', 'ebpf', 'etw', 'instruments', 'valgrind', 'simpleperf'
    ]) {
        const p = list.find(x => x.name === n);
        assert.ok(p, n + ' should be registered');
        assert.equal(p.state, 'registered', n);
        assert.ok(p.capabilities.length > 0, n);
    }
    // Absent tools must not fabricate analysis results
    const { runProvider } = await import('../dist/providers-registry.js');
    const absent = await runProvider('ghidra', '/nonexistent-binary-for-provider-test');
    assert.ok(absent.status === 'unsupported' || absent.status === 'failed' || absent.status === 'partial');
    assert.ok((absent.limitations?.length ?? 0) > 0);
    c.limit('Hotspots require a real profiler under CONTROLLED_EXECUTION; absent tools stay unsupported');
});
check('Providers', 'a custom provider can be registered, listed and status-checked; duplicates are refused', async () => {
    const name = `verify-provider-${process.pid}`;
    registerProvider({
        name,
        capabilities: ['demo'],
        available: async () => true,
        analyze: async (target) => ({ schemaVersion: '1.0', id: 't', target, operation: 'demo', status: 'completed',
            generatedAt: new Date().toISOString(), host: { hostname: '', platform: '', arch: '' },
            findings: [], evidence: [], limitations: [], errors: [], coverage: { examined: true, complete: true, notes: [] } })
    });
    assert.deepEqual((listProviders() as any[]).find(p => p.name === name), { name, state: 'registered', capabilities: ['demo'] });
    assert.equal((await getProviderStatus()).find(p => p.name === name)!.available, true);
    assert.throws(() => registerProvider({
        name,
        capabilities: [],
        available: async () => false,
        analyze: async (target) => ({ schemaVersion: '1.0', id: 't', target, operation: 'demo', status: 'completed',
            generatedAt: new Date().toISOString(), host: { hostname: '', platform: '', arch: '' },
            findings: [], evidence: [], limitations: [], errors: [], coverage: { examined: true, complete: true, notes: [] } })
    }), /already registered/);
});
// ---------------------------------------------------------------- 11. CLI
const cliDir = path.join(WORK, 'cli');
await mkdir(cliDir, { recursive: true });
check('CLI', '--help, no arguments and "help" print usage listing every command', () => {
    for (const a of [['--help'], [], ['help'], ['-h']]) {
        const r = runCli(a);
        assert.equal(r.code, 0, j(a));
        assert.match(r.stdout, /Usage: reverse/);
        for (const cmd of [
            'binary',
            'source',
            'dependencies',
            'processes',
            'process',
            'profile',
            'benchmark',
            'compare',
            'validate',
            'analyzers',
            'doctor',
            'mcp'
        ])
            assert.ok(r.stdout.includes(cmd), cmd);
    }
});
check('CLI', 'an unknown command fails with exit code 1 and a message on stderr', () => {
    const r = runCli(['frobnicate']);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /Unknown command/);
});
check('CLI', 'binary / source / dependencies print JSON results', async () => {
    const b = JSON.parse(runCli(['binary', await craft('cli.elf', elf({ cls: 2, le: true, machine: 62, entry: 1n }))]).stdout);
    assert.equal(b.findings[0].format, 'ELF');
    assert.equal(JSON.parse(runCli(['source', SRC]).stdout).findings[0].fileCount, 5);
    assert.equal(JSON.parse(runCli(['dependencies', path.join(WORK, 'deps')]).stdout).findings.length, 3);
});
check('CLI', 'a missing target gives a non-zero exit code', () => {
    assert.notEqual(runCli(['binary', path.join(WORK, 'nope')]).code, 0);
});
check('CLI', 'processes --limit and process <pid>', () => {
    assert.ok(JSON.parse(runCli(['processes', '--limit', '3']).stdout).findings.length <= 3);
    assert.equal(JSON.parse(runCli(['process', String(process.pid)]).stdout).operation, 'process_inspection');
});
check('CLI', 'profile <pid> --duration --interval', async () => {
    const child = spawnIdle();
    try {
        await settle(150);
        assert.equal(JSON.parse(runCli([
            'profile',
            String(child.pid),
            '--duration',
            '600',
            '--interval',
            '100'
        ]).stdout).operation, 'process_profile');
    }
    finally {
        await killAndWait(child);
    }
});
check('CLI', 'benchmark -> compare workflow through files', async () => {
    const slowMs = WIN ? 1500 : 250; // must dominate the start-up noise of a Windows process
    const mk = (ms: number) => runCli([
        'benchmark',
        '--command',
        NODE,
        '--arg',
        '-e',
        '--arg',
        `setTimeout(()=>{},${ms})`,
        '--repeat',
        '6',
        '--label',
        `t${ms}`
    ]).stdout;
    const before = path.join(cliDir, 'before.json'), after = path.join(cliDir, 'after.json');
    await writeFile(before, mk(slowMs));
    await writeFile(after, mk(1));
    const cmp = JSON.parse(runCli(['compare', before, after]).stdout);
    assert.equal(cmp.findings[0].verdict, 'improved');
});
check('CLI', 'validate --expected works for argument-less commands', async () => {
    const exp = path.join(cliDir, 'exp.json');
    await writeFile(exp, j({ exitCode: 0, stdout: '' }));
    const v = JSON.parse(runCli(['validate', '--command', NODE, '--expected', exp]).stdout);
    assert.equal(v.findings[0].passed, true);
});
check('CLI', 'validate passes --arg to the command', async () => {
    const exp = path.join(cliDir, 'exp2.json');
    await writeFile(exp, j({ exitCode: 0, stdout: 'x' }));
    const v = JSON.parse(runCli([
        'validate',
        '--command',
        NODE,
        '--arg',
        '-e',
        '--arg',
        'process.stdout.write("x")',
        '--expected',
        exp
    ]).stdout);
    assert.equal(v.findings[0].passed, true);
});
check('CLI', 'missing positional arguments give a usage message instead of a stack trace', () => {
    for (const cmd of ['binary', 'source', 'dependencies', 'process', 'profile']) {
        const r = runCli([cmd]);
        assert.equal(r.code, 1, cmd);
        assert.match(r.stderr, /Usage: reverse /, cmd);
    }
});
check('CLI', 'analyzers lists providers', () => {
    assert.ok(JSON.parse(runCli(['analyzers']).stdout).some((p: any) => p.name === 'ghidra'));
});
check('CLI', 'doctor creates the local store and reports readiness', () => {
    const previous = process.env.REVERSE_HOME;
    const home = path.join(WORK, 'doctor-home');
    process.env.REVERSE_HOME = home;
    try {
        const r = JSON.parse(runCli(['doctor']).stdout);
        assert.equal(r.status, 'completed');
        assert.equal(r.storeWritable, true);
        assert.equal(r.storeDir, home);
    }
    finally {
        if (previous === undefined)
            delete process.env.REVERSE_HOME;
        else
            process.env.REVERSE_HOME = previous;
    }
});
check('CLI', '--json is accepted, documented as having no effect, and output is always JSON', async () => {
    const f = await craft('cli2.elf', elf({ cls: 2, le: true, machine: 62, entry: 1n }));
    const a = JSON.parse(runCli(['binary', f]).stdout), b = JSON.parse(runCli(['binary', f, '--json']).stdout);
    assert.equal(a.findings[0].format, b.findings[0].format);
    assert.match(runCli(['--help']).stdout, /always JSON on stdout; --json is accepted and has no effect/);
});
// ---------------------------------------------------------------- 12. MCP server
const GATE_ENV = { REVERSE_MODE: 'CONTROLLED_EXECUTION', REVERSE_COMMAND_ALLOWLIST: NODE };
const DOCUMENTED_TOOLS = [
    'inspect_target',
    'analyze_binary',
    'analyze_source',
    'analyze_dependencies',
    'analyze_android',
    'get_inventory',
    'inspect_process',
    'profile_process',
    'list_processes',
    'monitor_process',
    'get_process_metrics',
    'get_process_tree',
    'analyze_memory',
    'analyze_cpu',
    'analyze_io',
    'detect_resource_anomalies',
    'get_resource_control_status',
    'trace_execution',
    'get_hotspots',
    'get_process_io',
    'capture_baseline',
    'run_benchmark',
    'compare_results',
    'validate_changes',
    'get_environment_fingerprint',
    'get_evidence',
    'list_analyzers',
    'run_provider',
    'create_benchmark_suite',
    'run_benchmark_suite',
    'compare_benchmarks',
    'compare_baselines',
    'get_research_session',
    'create_research_session',
    'add_research_hypothesis',
    'promote_research_hypothesis',
    'add_research_event',
    'add_research_evidence',
    'link_research_artifacts',
    'generate_change_report',
    'verify_evidence_integrity',
    'run_validation_fixtures',
    'declare_legacy_authorization',
    'analyze_legacy_windows',
    'analyze_legacy_linux',
    'analyze_legacy_mac',
    'analyze_legacy_android',
    'create_change_workspace',
    'apply_change',
    'rollback_change',
    'accept_change',
    'decide_optimization',
    'run_apk_pipeline',
    'create_git_worktree',
    'remove_git_worktree',
    'adb_install',
    'adb_pm_clear',
    'adb_emu_snapshot_load',
    'run_optimization_trial',
    'run_all_reference_trials',
    'analyze_javascript',
    'analyze_dotnet',
    'analyze_wasm'
];
check('MCP', 'handshake: initialize, ping and tools/list', async () => {
    const s = startMcp();
    try {
        const init = await s.req('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
                name: 'verify',
                version: '1'
            }
        });
        assert.equal(init.result.serverInfo.name, 'reverse');
        assert.ok(init.result.capabilities.tools);
        s.notify('notifications/initialized');
        assert.deepEqual((await s.req('ping')).result, {});
        const names = (await s.req('tools/list')).result.tools.map((t: any) => t.name);
        assert.deepEqual([...names].sort(), [...DOCUMENTED_TOOLS].sort());
    }
    finally {
        await s.close();
    }
});
check('MCP', 'every tool has a description and an object input schema with valid required fields', async () => {
    const s = startMcp();
    try {
        for (const t of (await s.req('tools/list')).result.tools) {
            assert.ok(t.description.length > 10, t.name);
            assert.equal(t.inputSchema.type, 'object', t.name);
            for (const r of t.inputSchema.required ?? [])
                assert.ok(r in t.inputSchema.properties, `${t.name}.${r}`);
        }
    }
    finally {
        await s.close();
    }
});
check('MCP', 'protocol errors: unknown method, unknown tool (-32602), garbage input (-32700), notifications', async () => {
    const s = startMcp();
    try {
        assert.equal((await s.req('no/such/method')).error.code, -32601);
        const bad = await s.req('tools/call', { name: 'no_such_tool', arguments: {} });
        assert.equal(bad.error.code, -32602);
        assert.match(bad.error.message, /Unknown tool/);
        assert.equal((await s.req('tools/call', {})).error.code, -32602, 'missing tool name');
        s.raw('this is not json');
        s.notify('notifications/cancelled');
        s.notify('some/unknown/notification');
        assert.deepEqual((await s.req('ping')).result, {}, 'server must survive garbage');
        await settle(200);
        assert.equal(s.unsolicited.length, 1, 'only the garbage line is answered; notifications are not');
        assert.equal(s.unsolicited[0].error.code, -32700);
        assert.equal(s.unsolicited[0].id, null);
    }
    finally {
        await s.close();
    }
});
check('MCP', 'all documented tools are listed with stable names and schemas', async () => {
    const s = startMcp();
    try {
        await s.req('initialize', {});
        const tools = (await s.req('tools/list')).result.tools;
        assert.deepEqual(tools.map((t: any) => t.name), DOCUMENTED_TOOLS);
        for (const t of tools) {
            assert.equal(typeof t.title, 'string', t.name);
            assert.equal(t.inputSchema.type, 'object', t.name);
            assert.equal(t.outputSchema.type, 'object', t.name);
        }
    }
    finally {
        await s.close();
    }
});
check('MCP', 'notifications/cancelled stops a running process profile request', async () => {
    const s = startMcp();
    const child = spawnIdle();
    const requestId = 424242;
    try {
        const pending = s.req('tools/call', {
            name: 'monitor_process',
            arguments: {
                pid: child.pid,
                durationMs: 2500,
                intervalMs: 100
            }
        }, requestId);
        await settle(300);
        s.notify('notifications/cancelled', { requestId });
        const response = await pending;
        const value = JSON.parse(response.result.content[0].text);
        assert.equal(value.status, 'partial');
        assert.ok(value.limitations.some((x: string) => /cancelled/i.test(x)));
    }
    finally {
        await s.close();
        await killAndWait(child);
    }
});
check('MCP', 'tool errors (missing file, bad PID) surface as isError results, not crashes', async () => {
    const s = startMcp();
    try {
        const a = await s.req('tools/call', { name: 'analyze_binary', arguments: { file: path.join(WORK, 'nope') } });
        assert.equal(a.error, undefined);
        assert.equal(a.result.isError, true);
        const b = await s.req('tools/call', { name: 'inspect_process', arguments: { pid: -4 } });
        assert.equal(b.result.isError, true);
        assert.match(b.result.content[0].text, /positive integer/);
        assert.equal(b.result.structuredContent.error.code, 'TOOL_EXECUTION_ERROR');
        assert.deepEqual((await s.req('ping')).result, {});
    }
    finally {
        await s.close();
    }
});
check('MCP', '"reverse mcp" starts the same stdio server', async () => {
    const s = startMcp([CLI, 'mcp']);
    try {
        assert.equal((await s.req('tools/list')).result.tools.length, DOCUMENTED_TOOLS.length);
    }
    finally {
        await s.close();
    }
});
check('Docs', 'docs/MCP.md says tools return structuredContent', async (c) => {
    const doc = path.join(ROOT, 'docs', 'MCP.md');
    if (!existsSync(doc)) {
        c.note('docs/MCP.md not present');
        return;
    }
    const s = startMcp();
    try {
        const obj = await s.call('get_inventory', { limit: 3 });
        assert.deepEqual(obj.envelope.structuredContent, obj.value);
        const arr = await s.call('list_analyzers', {});
        assert.deepEqual(arr.envelope.structuredContent, {
            items: arr.value,
            untrustedContent: arr.envelope.structuredContent.untrustedContent
        }, 'arrays are wrapped because structuredContent must be an object');
        assert.equal(arr.envelope.isError, false);
    }
    finally {
        await s.close();
    }
});
check('Security', 'tool results carry untrustedContent and cap oversized target strings', async () => {
    const s = startMcp();
    try {
        const dir = await mkdtemp(path.join(WORK, 'inj-'));
        await writeFile(path.join(dir, 'a.js'), `import x from '${'x'.repeat(5000)}';\n`);
        const r = await s.call('analyze_source', { directory: dir });
        const u = r.envelope.structuredContent.untrustedContent;
        assert.match(u.notice, /untrusted/);
        assert.ok(u.truncatedStrings >= 1, 'long import name must be truncated');
        assert.ok(!r.envelope.content[0].text.includes('x'.repeat(4200)));
        assert.ok(r.value.untrustedContent, 'object results carry the marker in text too');
    }
    finally {
        await s.close();
    }
});
check('MCP', 'initialize negotiates the protocol version and reports the product version', async () => {
    const s = startMcp();
    try {
        const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
        for (const v of ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25'])
            assert.equal((await s.req('initialize', { protocolVersion: v })).result.protocolVersion, v);
        const odd = await s.req('initialize', { protocolVersion: '1999-01-01' });
        assert.equal(odd.result.protocolVersion, '2025-11-25');
        assert.equal(odd.result.serverInfo.version, pkg.version);
    }
    finally {
        await s.close();
    }
});
check('Package', 'one version everywhere: package.json, VERSION, CLI banner, MCP serverInfo, server.json', async () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const { VERSION } = await import(pathToFileURL(path.join(DIST, 'core-version.js')).href);
    assert.equal(VERSION, pkg.version);
    assert.match(runCli(['--help']).stdout, new RegExp(`^Reverse ${pkg.version.replace(/\./g, '\\.')}\n`));
    assert.equal(pkg.name, 'reverse-compact');
    assert.ok(pkg.bin.reverse);
    const server = JSON.parse(readFileSync(path.join(ROOT, 'server.json'), 'utf8'));
    assert.equal(server.version, pkg.version, 'server.json version must match package.json');
});
check('Docs', 'the tool table in docs/MCP.md matches tools/list', async (c) => {
    const doc = path.join(ROOT, 'docs', 'MCP.md');
    if (!existsSync(doc)) {
        c.note('docs/MCP.md not present');
        return;
    }
    const documented = [...readFileSync(doc, 'utf8').matchAll(/^\|\s*`([a-z_]+)`\s*\|/gm)].map(m => m[1]);
    const s = startMcp();
    try {
        const live: string[] = (await s.req('tools/list')).result.tools.map((t: any) => t.name);
        const missing = documented.filter(x => !live.includes(x)), extra = live.filter(x => !documented.includes(x));
        if (missing.length || extra.length)
            c.drift(`documented but not served: [${missing}]; served but undocumented: [${extra}]`);
    }
    finally {
        await s.close();
    }
});
check('Docs', 'extension points in docs/CAPABILITIES.md match listProviders()', async (c) => {
    const doc = path.join(ROOT, 'docs', 'CAPABILITIES.md');
    if (!existsSync(doc)) {
        c.note('docs/CAPABILITIES.md not present');
        return;
    }
    const text = readFileSync(doc, 'utf8');
    const liveExt = (listProviders() as any[]).filter(p => p.state === 'extension-point').map(p => p.name);
    // Every live extension-point must be named in the Provider status section
    const section = text.split('## Provider status')[1]?.split('##')[0] ?? '';
    for (const n of liveExt) {
        if (!section.includes('`' + n + '`') && !section.includes(n))
            c.drift(`extension-point ${n} not documented in Provider status`);
    }
    // Registered adapters from Patch F should also be mentioned
    for (const n of ['ghidra', 'rizin', 'jadx', 'apktool']) {
        if (!section.toLowerCase().includes(n))
            c.drift(`adapter ${n} not documented in Provider status`);
    }
});
// ---------------------------------------------------------------- 13. what the platform could not do (informational)
check('Platform', `host summary: ${process.platform}/${process.arch}, Node ${process.version}`, async (c) => {
    const procs: any = await listProcesses(500);
    c.note(`visible processes (capped at 500): ${procs.findings.length}`);
    const dir = await readdir(HOME).catch(() => []);
    c.note(`artifact kinds written this run: ${dir.join(', ') || 'none'}`);
    assert.ok((await stat(HOME)).isDirectory());
});
// ---------------------------------------------------------------- patch C: measurement engine and gate
check('Benchmark', 'warm-up runs are recorded but excluded; failed runs are excluded from the statistics (AUDIT F-04)', async () => {
    const w: any = await runBenchmark({ command: NODE, args: nodeEval('0'), repetitions: 3, warmupRuns: 2 });
    const f = w.findings[0];
    assert.equal(f.warmupCompleted, 2);
    assert.equal(f.runs.length, 3);
    assert.ok(f.warmups.every((x: any) => x.phase === 'warmup'));
    assert.equal(f.successfulRuns, 3);
    assert.ok(f.p95DurationMs >= f.medianDurationMs && f.ci95MeanMs.length === 2 && f.stddevMs >= 0);
    const bad: any = await runBenchmark({ command: NODE, args: nodeEval('process.exit(2)'), repetitions: 3 });
    assert.equal(bad.findings[0].successfulRuns, 0);
    assert.equal(bad.findings[0].meanDurationMs, null);
});
check('Benchmark', 'children receive an allowlisted environment: secrets of the parent are not inherited', async () => {
    process.env.REVERSE_TEST_SECRET = 'top-secret';
    process.env.REVERSE_CHILD_ENV = 'REVERSE_TEST_PASS';
    process.env.REVERSE_TEST_PASS = 'visible';
    try {
        const r: any = await runBenchmark({
            command: NODE,
            args: nodeEval('process.stdout.write(String(process.env.REVERSE_TEST_SECRET)+"|"+process.env.REVERSE_TEST_PASS)'),
            repetitions: 1
        });
        assert.equal(r.findings[0].runs[0].stdout, 'undefined|visible');
    }
    finally {
        delete process.env.REVERSE_TEST_SECRET;
        delete process.env.REVERSE_CHILD_ENV;
        delete process.env.REVERSE_TEST_PASS;
    }
});
check('Benchmark', 'the environment fingerprint is recorded, holds no secrets, and differing fingerprints warn', async () => {
    const { getEnvironmentFingerprint } = await import('../dist/benchmark-environment.js');
    process.env.REVERSE_TEST_SECRET = 'top-secret';
    try {
        assert.ok(!JSON.stringify(getEnvironmentFingerprint()).includes('top-secret'));
    }
    finally {
        delete process.env.REVERSE_TEST_SECRET;
    }
    const a: any = await runBenchmark({ command: NODE, args: nodeEval('0'), repetitions: 1 });
    const b: any = JSON.parse(JSON.stringify(a));
    b.findings[0].environment.cpu.cores += 1;
    const same: any = await compareBenchmarks(a, a), diff: any = await compareBenchmarks(a, b);
    assert.equal(same.findings[0].environmentComparable, true);
    assert.equal(diff.findings[0].environmentComparable, false);
    assert.ok(diff.findings[0].warnings[0].includes('cpu'));
    assert.equal(diff.status, 'partial');
});
check('Benchmark', 'compareBenchmarks gives a significance verdict from repeated runs, never from means alone (AUDIT F-04)', async () => {
    const mk = (ds: number[]) => ({
        findings: [{
                meanDurationMs: ds.reduce((x, y) => x + y) / ds.length,
                runs: ds.map(d => ({
                    durationMs: d,
                    exitCode: 0
                }))
            }]
    });
    const slow = mk([200, 202, 198, 201, 199, 203]), fast = mk([100, 101, 99, 102, 98, 100]);
    assert.equal(((await compareBenchmarks(slow, fast)) as any).findings[0].verdict, 'improved');
    assert.equal(((await compareBenchmarks(fast, slow)) as any).findings[0].verdict, 'regressed');
    assert.equal(((await compareBenchmarks(mk([
        100,
        120,
        90,
        110,
        95
    ]), mk([
        105,
        99,
        118,
        92,
        108
    ]))) as any).findings[0].verdict, 'no_significant_change');
    assert.equal(((await compareBenchmarks(mk([200, 201]), mk([100, 99]))) as any).findings[0].verdict, 'insufficient_evidence');
});
check('MCP', 'command-running tools are refused by default and gated by mode, allowlist and cwd root (AUDIT F-01)', async () => {
    await mkdir(WORK, { recursive: true });
    const body = { command: NODE, args: nodeEval('process.stdout.write("x")'), repetitions: 1 };
    const refused = async (env: Record<string, string>, args: any = body) => {
        const s = startMcp([MCP], env);
        try {
            const m = await s.req('tools/call', { name: 'run_benchmark', arguments: args });
            return m.result;
        }
        finally {
            await s.close();
        }
    };
    const off = await refused({});
    assert.equal(off.isError, true);
    assert.match(off.content[0].text, /disabled/);
    for (const tool of ['capture_baseline', 'validate_changes']) {
        const s = startMcp();
        try {
            const m = await s.req('tools/call', { name: tool, arguments: { ...body, expected: {} } });
            assert.equal(m.result.isError, true, tool);
        }
        finally {
            await s.close();
        }
    }
    const noList = await refused({ REVERSE_MODE: 'CONTROLLED_EXECUTION' });
    assert.match(noList.content[0].text, /ALLOWLIST/);
    const wrong = await refused({ REVERSE_MODE: 'CONTROLLED_EXECUTION', REVERSE_COMMAND_ALLOWLIST: 'other-tool' });
    assert.match(wrong.content[0].text, /not on/);
    const outside = await refused({ ...GATE_ENV, REVERSE_CWD_ROOT: path.join(WORK, 'cwd') }, { ...body, cwd: WORK });
    assert.match(outside.content[0].text, /outside/);
    const okr = await refused(GATE_ENV);
    assert.equal(okr.isError, false);
});
check('MCP', 'tools carry annotations: command-running tools are not read-only', async () => {
    const s = startMcp();
    try {
        const tools = (await s.req('tools/list')).result.tools;
        for (const t of tools) {
            assert.equal(typeof t.annotations.readOnlyHint, 'boolean', t.name);
            assert.equal(typeof t.title, 'string', t.name);
            assert.equal(t.outputSchema?.type, 'object', t.name);
        }
        for (const n of ['capture_baseline', 'run_benchmark', 'validate_changes', 'run_benchmark_suite'])
            assert.equal(tools.find((t: any) => t.name === n).annotations.readOnlyHint, false, n);
        assert.equal(tools.find((t: any) => t.name === 'inspect_process').annotations.readOnlyHint, true);
    }
    finally {
        await s.close();
    }
});
check('Optimization', 'decide accept only with improved + validation passed', async () => {
    const { decideOptimization } = await import('../dist/optimization-decision.js');
    const a: any = decideOptimization({
        performanceVerdict: 'improved', validationPassed: true
    });
    assert.equal(a.findings[0].decision, 'accept');
    const r: any = decideOptimization({
        performanceVerdict: 'regressed', validationPassed: true
    });
    assert.equal(r.findings[0].decision, 'roll_back');
    const n: any = decideOptimization({
        performanceVerdict: 'insufficient_evidence', validationPassed: true
    });
    assert.equal(n.findings[0].decision, 'need_more_data');
    const rej: any = decideOptimization({
        performanceVerdict: 'improved', validationPassed: false
    });
    assert.equal(rej.findings[0].decision, 'reject');
});
check('Optimization', 'workspace create refused without CONTROLLED_EXECUTION and confirm', async () => {
    const { createChangeWorkspace } = await import('../dist/optimization-workspace.js');
    const prev = process.env.REVERSE_MODE;
    delete process.env.REVERSE_MODE;
    try {
        const r: any = await createChangeWorkspace(WORK, { confirm: false });
        assert.equal(r.status, 'unsupported');
    }
    finally {
        if (prev === undefined)
            delete process.env.REVERSE_MODE;
        else
            process.env.REVERSE_MODE = prev;
    }
});
check('Optimization', 'workspace copies target and rollback restores workPath', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const { createChangeWorkspace, rollbackChangeWorkspace, loadWorkspace } = await import('../dist/optimization-workspace.js');
    const { applyChange } = await import('../dist/optimization-apply.js');
    const prev = process.env.REVERSE_MODE;
    process.env.REVERSE_MODE = 'CONTROLLED_EXECUTION';
    const dir = path.join(WORK, 'opt-src');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'a.txt'), 'v1', 'utf8');
    try {
        const created: any = await createChangeWorkspace(dir, { confirm: true });
        assert.equal(created.status, 'completed');
        const id = created.findings[0].workspace_id;
        const ws = await loadWorkspace(id);
        assert.ok(ws);
        await applyChange({
            workspace_id: id,
            changeType: 'source_edit',
            relativePath: 'a.txt',
            contents: 'v2',
            permission: { confirm: true }
        });
        const mid = await fs.readFile(path.join(ws!.workPath, 'a.txt'), 'utf8');
        assert.equal(mid, 'v2');
        const orig = await fs.readFile(path.join(dir, 'a.txt'), 'utf8');
        assert.equal(orig, 'v1', 'original must stay untouched');
        await rollbackChangeWorkspace(id, { confirm: true });
        const after = await fs.readFile(path.join(ws!.workPath, 'a.txt'), 'utf8');
        assert.equal(after, 'v1');
    }
    finally {
        if (prev === undefined)
            delete process.env.REVERSE_MODE;
        else
            process.env.REVERSE_MODE = prev;
    }
});
check('Optimization', 'git worktree and adb helpers refuse without confirm/mode', async () => {
    const { createGitWorktreeWorkspace } = await import('../dist/optimization-git.js');
    const { adbInstall } = await import('../dist/optimization-adb.js');
    const prev = process.env.REVERSE_MODE;
    delete process.env.REVERSE_MODE;
    try {
        const g: any = await createGitWorktreeWorkspace(WORK, { confirm: false });
        assert.equal(g.status, 'unsupported');
        const a: any = await adbInstall('/no.apk', { confirm: false });
        assert.equal(a.status, 'unsupported');
    }
    finally {
        if (prev === undefined)
            delete process.env.REVERSE_MODE;
        else
            process.env.REVERSE_MODE = prev;
    }
});
check('Optimization', 'reference trial runs for small_source under CONTROLLED_EXECUTION', async () => {
    const { runOptimizationTrial } = await import('../dist/optimization-trial.js');
    const prev = process.env.REVERSE_MODE;
    process.env.REVERSE_MODE = 'CONTROLLED_EXECUTION';
    try {
        const r: any = await runOptimizationTrial('small_source', { confirm: true });
        assert.ok(r.status === 'completed' || r.status === 'partial');
        assert.ok(r.findings?.[0]?.steps?.length >= 4);
    }
    finally {
        if (prev === undefined)
            delete process.env.REVERSE_MODE;
        else
            process.env.REVERSE_MODE = prev;
    }
});
check('Runtime', 'JS inventory and WASM/dotnet detectors return structured results', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const { analyzeJavascript } = await import('../dist/analysis-javascript.js');
    const { analyzeWasm } = await import('../dist/analysis-wasm.js');
    const { analyzeDotnet } = await import('../dist/analysis-dotnet.js');
    const dir = path.join(WORK, 'jsapp');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 't', dependencies: { electron: '1.0.0' } }));
    await fs.writeFile(path.join(dir, 'main.js'), 'const {app}=require("electron");\n');
    const js: any = await analyzeJavascript(dir);
    assert.equal(js.status, 'completed');
    assert.equal(js.findings[0].isElectron, true);
    // minimal valid empty wasm module: magic+version
    const wasmPath = path.join(WORK, 'empty.wasm');
    const wasm = Buffer.alloc(8);
    wasm.writeUInt32LE(0x6d736100, 0);
    wasm.writeUInt32LE(1, 4);
    await fs.writeFile(wasmPath, wasm);
    const w: any = await analyzeWasm(wasmPath);
    assert.equal(w.findings[0].isWasm, true);
    const pe = path.join(WORK, 'notdotnet.bin');
    await fs.writeFile(pe, Buffer.from('MZ'));
    const d: any = await analyzeDotnet(pe);
    assert.ok(d.status === 'completed' || d.status === 'partial');
});
check('Runtime', 'HTTP MCP refuses without token and flag', async () => {
    const { startHttpMcp } = await import('../dist/mcp-http.js');
    const prevH = process.env.REVERSE_MCP_HTTP;
    const prevT = process.env.REVERSE_MCP_TOKEN;
    delete process.env.REVERSE_MCP_HTTP;
    delete process.env.REVERSE_MCP_TOKEN;
    try {
        const r: any = startHttpMcp(async () => ({}));
        assert.equal(r.status, 'unsupported');
    }
    finally {
        if (prevH === undefined)
            delete process.env.REVERSE_MCP_HTTP;
        else
            process.env.REVERSE_MCP_HTTP = prevH;
        if (prevT === undefined)
            delete process.env.REVERSE_MCP_TOKEN;
        else
            process.env.REVERSE_MCP_TOKEN = prevT;
    }
});
check('MCP', 'prompts/list and prompts/get research_cycle', async () => {
    const s = startMcp();
    try {
        const list = await s.req('prompts/list');
        assert.ok(Array.isArray(list.result.prompts));
        assert.ok(list.result.prompts.some((p: any) => p.name === 'research_cycle'));
        const got = await s.req('prompts/get', {
            name: 'research_cycle',
            arguments: { target: '/tmp/x' }
        });
        assert.ok(got.result.messages?.[0]?.content?.text?.includes('Research cycle'));
    }
    finally {
        await s.close();
    }
});
check('MCP', 'resources/list returns an array', async () => {
    const s = startMcp();
    try {
        const list = await s.req('resources/list');
        assert.ok(Array.isArray(list.result.resources));
    }
    finally {
        await s.close();
    }
});
check('Distribution', 'setup dry-run for cursor does not write without confirm', async () => {
    const { setupAgent } = await import('../dist/cli-setup.js');
    const r: any = await setupAgent({ agent: 'cursor', dryRun: true });
    assert.equal(r.status, 'completed');
    assert.equal(r.findings[0].dryRun, true);
});
check('Agent', 'prompt evaluation harness scores default H-09 lite cases', async () => {
    const { evaluateAgentPrompts } = await import('../dist/agent-eval.js');
    const r: any = evaluateAgentPrompts();
    assert.equal(r.status, 'completed');
    assert.ok(r.findings.every((f: any) => f.passed));
});
check('Legacy governance', 'capture/replay requires and preserves declared authorization', async () => {
    const { captureScenario, replayScenario } = await import(pathToFileURL(path.join(DIST, 'behavior-capture.js')).href);
    const auth = {
        basis: 'open_source',
        licenseOrConsentReference: 'capability-fixture',
        declaredBy: 'capabilities-suite',
        declaredAt: '2026-11-11T00:00:00.000Z'
    };
    const prev = process.env.REVERSE_MODE;
    process.env.REVERSE_MODE = 'CONTROLLED_EXECUTION';
    const scenario = {
        schemaVersion: '1.0',
        id: 'capability-auth-roundtrip',
        command: process.execPath,
        args: ['-e', 'process.stdout.write("authorized-roundtrip")']
    };
    try {
        await assert.rejects(() => captureScenario(scenario, { confirm: true }), /authorization/i);
        const record = await captureScenario(scenario, { confirm: true, authorization: auth });
        assert.deepEqual(record.authorization, auth);
        const replay = await replayScenario(scenario, record, { confirm: true, authorization: auth });
        assert.deepEqual(replay.captureAuthorization, auth);
        assert.deepEqual(replay.replayAuthorization, auth);
        assert.equal(replay.equal, true);
    }
    finally {
        if (prev === undefined)
            delete process.env.REVERSE_MODE;
        else
            process.env.REVERSE_MODE = prev;
    }
});
check('Legacy governance', 'preservation reports and migration advice retain authorization and enforce L0 without oracle', async () => {
    const preservationModule = await import(pathToFileURL(path.join(DIST, 'preservation-migration.js')).href);
    const { computePreservationLevel, adviseMigration, assertLevelRespectsOracle } = preservationModule;
    const auth = {
        basis: 'open_source',
        licenseOrConsentReference: 'capability-fixture',
        declaredBy: 'capabilities-suite',
        declaredAt: '2026-11-11T00:00:00.000Z'
    };
    const report = computePreservationLevel({
        oracle: null,
        comparisons: [],
        authorization: auth
    });
    assert.equal(report.level, 'L0');
    assert.deepEqual(report.authorization, auth);
    assert.deepEqual(assertLevelRespectsOracle(report), []);
    const advice = adviseMigration({
        authorization: auth,
        targetSummary: 'capability fixture',
        findings: [{
                cause: 'Requires an old runtime',
                evidence: 'fixture evidence',
                needsExecutionEnvironment: true
            }],
        preservation: report
    });
    assert.deepEqual(advice.authorization, auth);
    assert.ok(advice.options.every((option: any) => option.evidence.length > 0));
});
check('Legacy governance', 'calibration corpus manifest rejects embedded data and unprovenanced operator samples', async () => {
    const { loadCalibrationManifest } = await import(pathToFileURL(path.join(DIST, 'legacy-calibration.js')).href);
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cap-cal-policy-'));
    const manifestPath = path.join(dir, 'manifest.json');
    try {
        await writeFile(manifestPath, JSON.stringify({
            schemaVersion: '1.0',
            name: 'operator-corpus',
            description: 'local only',
            reviewedAt: '2026-11-11',
            expectations: [{
                    id: 'operator-entry',
                    file: '/operator/local/sample.bin'
                }]
        }));
        await assert.rejects(() => loadCalibrationManifest(manifestPath), /requires a valid SHA-256/);
        await writeFile(manifestPath, JSON.stringify({
            schemaVersion: '1.0',
            name: 'crafted-corpus',
            description: 'local only',
            reviewedAt: '2026-11-11',
            expectations: [{
                    id: 'crafted-payload',
                    file: 'fixture.bin',
                    bytes: 'AA=='
                }]
        }));
        await assert.rejects(() => loadCalibrationManifest(manifestPath), /never embed binaries/);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
check('Legacy Mac', 'analyzeLegacyMac recognizes Mach-O and fills Mac Target Profile fields', async () => {
    const { analyzeLegacyMac } = await import(pathToFileURL(path.join(DIST, 'legacy-mac.js')).href);
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cap-mac-'));
    try {
        const f = path.join(dir, 'tiny-macho');
        const b = Buffer.alloc(28);
        b.writeUInt32LE(0xfeedface, 0);
        b.writeUInt32LE(7, 4);
        b.writeUInt32LE(0, 8);
        b.writeUInt32LE(2, 12);
        await writeFile(f, b);
        const r: any = await analyzeLegacyMac(f, {
            basis: 'open_source',
            licenseOrConsentReference: 'cap-fixture',
            declaredBy: 'capability-suite',
            declaredAt: new Date().toISOString(),
        });
        assert.equal(r.status, 'completed');
        assert.equal(r.findings[0].format, 'mach-o');
        assert.equal(r.findings[0].targetProfile.codeModel.value, 'mach-o');
        assert.ok(r.findings[0].targetProfile.endianness.value === 'little');
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
check('Legacy Mac', 'Mac calibration fixtures score crafted detectors', async () => {
    const calUrl = pathToFileURL(path.join(DIST, 'legacy-mac-calibration.js')).href;
    const { writeCraftedMacCalibrationFixtures, runMacCalibration } = await import(calUrl);
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cap-mac-cal-'));
    try {
        const manifest = await writeCraftedMacCalibrationFixtures(dir);
        const manPath = path.join(dir, 'manifest.json');
        await writeFile(manPath, JSON.stringify(manifest));
        const report = await runMacCalibration(manPath, {
            authorization: {
                basis: 'open_source',
                licenseOrConsentReference: 'cap-fixture',
                declaredBy: 'capability-suite',
                declaredAt: new Date().toISOString(),
            },
        });
        assert.equal(report.skipped, 0, report.failures.join('; '));
        assert.ok(report.failures.length === 0, report.failures.join('; '));
        assert.ok(report.scores.length > 0);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
check('Legacy Mac', 'Mac sourced diagnosis tables validate and cite entries', async () => {
    const tablesUrl = pathToFileURL(path.join(DIST, 'legacy-mac-tables.js')).href;
    const { assertBuiltinMacTablesValid, diagnoseMacFromTables } = await import(tablesUrl);
    assert.deepEqual(assertBuiltinMacTablesValid(), []);
    const diag = diagnoseMacFromTables({
        format: 'pef-cfm',
        architecture: 'PowerPC',
        bitness: 32,
        dylibs: [],
        resourceTypes: [],
        containers: [],
        creatorType: null,
        codeSignaturePresent: false,
        structuralDetectorNames: ['pef-cfm'],
    });
    assert.ok(diag.some((d: any) => d.tableEntryIds.includes('mac-pef-cfm-needs-classic-or-carbon')));
    assert.ok(diag.some((d: any) => d.tableEntryIds.includes('mac-powerpc-needs-rosetta-or-emulator')));
});
check('Legacy Mac', 'Mac behavior capture/replay reports emulator absence without inventing output', async () => {
    const prev = process.env.REVERSE_MODE;
    process.env.REVERSE_MODE = 'CONTROLLED_EXECUTION';
    try {
        const url = pathToFileURL(path.join(DIST, 'legacy-mac-behavior.js')).href;
        const { runMacBehaviorRoundTrip, listMacEmulatorFingerprints } = await import(url);
        const fps = await listMacEmulatorFingerprints();
        assert.ok(fps.length >= 4);
        for (const fp of fps)
            assert.ok(['basiliskii', 'minivmac', 'sheepshaver', 'qemu-ppc'].includes(fp.engine));
        const r = await runMacBehaviorRoundTrip(undefined, {
            basis: 'open_source',
            licenseOrConsentReference: 'capability-suite',
            declaredBy: 'capability-suite',
            declaredAt: new Date().toISOString(),
        });
        assert.equal(r.equal, true);
        assert.ok(r.limitations.some((l: string) => /licensing|emulator|PATH/i.test(l)));
    }
    finally {
        if (prev === undefined)
            delete process.env.REVERSE_MODE;
        else
            process.env.REVERSE_MODE = prev;
    }
});
check('Legacy Mac', 'Mac emulator environments are registered and never simulated', async () => {
    const envUrl = pathToFileURL(path.join(DIST, 'execution-environment.js')).href;
    const { bootstrapExecutionEnvironments, listExecutionEnvironments, } = await import(envUrl);
    bootstrapExecutionEnvironments();
    const names = listExecutionEnvironments().map((e: any) => e.name);
    for (const n of ['basiliskii', 'minivmac', 'sheepshaver', 'qemu-ppc'])
        assert.ok(names.includes(n), n);
    const qemuPpc = listExecutionEnvironments().find((e: any) => e.name === 'qemu-ppc');
    assert.ok(qemuPpc);
    const av = await qemuPpc.available();
    const fp = await qemuPpc.fingerprint();
    assert.equal(fp.engine, 'qemu-ppc');
    assert.equal(typeof av, 'boolean');
});
check('Legacy Mac', 'analyze_legacy_mac is registered in the MCP tool contract', () => {
    assert.ok(DOCUMENTED_TOOLS.includes('analyze_legacy_mac'));
});
check('Legacy Linux', 'Linux support matrix names the implemented a.out and ELF detectors', () => {
    const docs = readFileSync(path.join(ROOT, 'docs/CAPABILITIES.md'), 'utf8');
    assert.match(docs, /Linux a\.out.*ELF32.*ELF64/s);
    assert.match(docs, /analyze_legacy_linux/);
});
check('Legacy Mac', 'HFS catalog first extent and PEF loader strings surface in detectors', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cap-hfs-pef-'));
    try {
        const hfs = Buffer.alloc(1024 + 0x70);
        hfs.write('BD', 1024);
        hfs.writeUInt32BE(512, 1024 + 20);
        hfs.writeUInt16BE(1, 1024 + 0x5e);
        hfs.writeUInt16BE(2, 1024 + 0x5e + 2);
        const hf = path.join(dir, 'v.hfs');
        await writeFile(hf, hfs);
        const macUrl = pathToFileURL(path.join(DIST, 'legacy-mac.js')).href;
        const { analyzeLegacyMac } = await import(macUrl);
        const auth = {
            basis: 'open_source',
            licenseOrConsentReference: 'cap',
            declaredBy: 'cap',
            declaredAt: new Date().toISOString(),
        };
        const r = await analyzeLegacyMac(hf, auth);
        assert.ok(r.findings[0].structuralDetectors.some((d: any) => d.name === 'hfs-catalog-extent'));
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
check('Legacy Mac', 'Toolbox A-line trap scan yields toolbox-traps detector', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cap-trap-'));
    try {
        const b = Buffer.alloc(32);
        for (let i = 0; i < 8; i++)
            b.writeUInt16BE(0xa000 + i, i * 2);
        const f = path.join(dir, 'code.bin');
        await writeFile(f, b);
        const macUrl = pathToFileURL(path.join(DIST, 'legacy-mac.js')).href;
        const { analyzeLegacyMac } = await import(macUrl);
        const auth = {
            basis: 'open_source',
            licenseOrConsentReference: 'cap',
            declaredBy: 'cap',
            declaredAt: new Date().toISOString(),
        };
        const r = await analyzeLegacyMac(f, auth);
        assert.ok(r.findings[0].structuralDetectors.some((d: any) => d.name === 'toolbox-traps'));
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
check('Legacy Mac', 'Mac reference trials pass on crafted fixtures at L0', async () => {
    const url = pathToFileURL(path.join(DIST, 'legacy-mac-reference-trials.js')).href;
    const { runLegacyMacReferenceTrials } = await import(url);
    const report = await runLegacyMacReferenceTrials();
    assert.equal(report.ok, true);
    assert.equal(report.trials.length, 2);
    assert.equal(report.preservation.level, 'L0');
});
check('Legacy Mac', 'HFS catalog btree detector fires on crafted extent data', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cap-btree-'));
    try {
        const hfs = Buffer.alloc(1536 + 512);
        hfs.write('BD', 1024);
        hfs.writeUInt32BE(512, 1024 + 20);
        hfs.writeUInt16BE(3, 1024 + 0x5e);
        hfs.writeUInt16BE(2, 1024 + 0x5e + 2);
        hfs.writeInt8(-1, 1536 + 8);
        hfs.writeUInt16BE(1, 1536 + 10);
        hfs[1536 + 14] = 3;
        hfs.write('App', 1536 + 15);
        const f = path.join(dir, 'v.hfs');
        await writeFile(f, hfs);
        const macUrl = pathToFileURL(path.join(DIST, 'legacy-mac.js')).href;
        const { analyzeLegacyMac } = await import(macUrl);
        const auth = {
            basis: 'open_source',
            licenseOrConsentReference: 'cap',
            declaredBy: 'cap',
            declaredAt: new Date().toISOString(),
        };
        const r = await analyzeLegacyMac(f, auth);
        assert.ok(r.findings[0].structuralDetectors.some((d: any) => d.name === 'hfs-catalog-btree'));
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
check('Legacy Mac', 'works/fails matrix reports unsupported without operator ROM', async () => {
    const prev = process.env.REVERSE_MAC_ROM;
    delete process.env.REVERSE_MAC_ROM;
    try {
        const url = pathToFileURL(path.join(DIST, 'legacy-mac-behavior.js')).href;
        const { runMacWorksFailsMatrix } = await import(url);
        const cells = await runMacWorksFailsMatrix(['/tmp/no-such'], {
            basis: 'open_source',
            licenseOrConsentReference: 'cap',
            declaredBy: 'cap',
            declaredAt: new Date().toISOString(),
        });
        assert.ok(cells.length >= 4);
        assert.ok(cells.every((c: any) => c.outcome === 'unsupported'));
    }
    finally {
        if (prev !== undefined)
            process.env.REVERSE_MAC_ROM = prev;
    }
});
check('Roadmap', 'Patch O is recorded closed at 1.4.0', () => {
    const roadmap = readFileSync(path.join(ROOT, 'docs/ROADMAP.md'), 'utf8');
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    // version from package.json only
    assert.match(pkg.version, /^1\.5\.\d+$/);
    assert.match(roadmap, /Patch O.*done|closed at \*\*1\.4\.0\*\*/i);
    assert.match(roadmap, /1\.4\.0 — Patch O closed/i);
});
check('Legacy Mac', 'diffDiskImageHashes reports tree drift', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cap-diff-'));
    try {
        const before = path.join(dir, 'b');
        const after = path.join(dir, 'a');
        await mkdir(before);
        await mkdir(after);
        await writeFile(path.join(before, 'f.txt'), '1');
        await writeFile(path.join(after, 'f.txt'), '2');
        const url = pathToFileURL(path.join(DIST, 'legacy-mac-behavior.js')).href;
        const { diffDiskImageHashes } = await import(url);
        const d = await diffDiskImageHashes(before, after);
        assert.equal(d.equal, false);
        assert.ok(d.changed.includes('f.txt'));
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
check('Legacy Android', 'analyze_legacy_android is registered in the MCP tool contract', () => {
    assert.ok(DOCUMENTED_TOOLS.includes('analyze_legacy_android'));
});
check('Legacy Android', 'analyzeLegacyAndroid fills Android Target Profile on DEX', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cap-la-'));
    try {
        const b = Buffer.alloc(70);
        b.write('dex\n035\0', 0);
        const f = path.join(dir, 'classes.dex');
        await writeFile(f, b);
        const url = pathToFileURL(path.join(DIST, 'legacy-android.js')).href;
        const { analyzeLegacyAndroid } = await import(url);
        const auth = {
            basis: 'open_source',
            licenseOrConsentReference: 'cap',
            declaredBy: 'cap',
            declaredAt: new Date().toISOString(),
        };
        const r = await analyzeLegacyAndroid(f, auth);
        assert.equal(r.findings[0].format, 'DEX');
        assert.equal(r.findings[0].targetProfile.osAndEra.value.family, 'Android');
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
check('Legacy Android', 'calibration fixtures pass on crafted DEX and AXML', async () => {
    const url = pathToFileURL(path.join(DIST, 'legacy-android-calibration.js')).href;
    const { runAndroidCalibration } = await import(url);
    const report = await runAndroidCalibration();
    assert.equal(report.ok, true);
});
check('Legacy Android', 'Android diagnosis tables validate and emit findings', async () => {
    const url = pathToFileURL(path.join(DIST, 'legacy-android-tables.js')).href;
    const { assertAndroidTablesValid, diagnoseAndroidFromTables } = await import(url);
    assertAndroidTablesValid();
    const d = diagnoseAndroidFromTables({
        minSdk: 15,
        targetSdk: 15,
        abis: ['armeabi'],
        hasMultidex: false,
    });
    assert.ok(d.length >= 1);
});
check('Roadmap', 'M and N status, version and O entry criteria are internally consistent', () => {
    const roadmap = readFileSync(path.join(ROOT, 'docs/ROADMAP.md'), 'utf8');
    const architecture = readFileSync(path.join(ROOT, 'docs/ARCHITECTURE.md'), 'utf8');
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    // Version is single-sourced from package.json; never hardcode the third digit here.
    const verRe = pkg.version.replace(/\./g, '\\.');
    assert.match(roadmap, new RegExp(`State as of \\*\\*${verRe}\\*\\*`));
    assert.match(roadmap, new RegExp(`What is the product version\\? \\| \\*\\*${verRe}`));
    assert.match(roadmap, /Patch M.*\*\*done\*\*/s);
    assert.match(roadmap, /Patch N.*\*\*done\*\*/s);
    // O closed at 1.4.0 — status table and narrative must not say in progress.
    assert.match(roadmap, /Patch O.*(\*\*done\*\*|closed at)/i);
    assert.doesNotMatch(roadmap, /\| O \|[^\n]*in progress/i);
    assert.match(roadmap, /Patch P.*in progress/i);
    assert.match(roadmap, /F-08 macOS|ps -p/);
    assert.doesNotMatch(architecture, /M remains open until its complete end-to-end acceptance criteria pass/);
});
check('Legacy governance', 'legacy profiles never emit analogy labels without a deterministic basis', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cap-analogy-'));
    try {
        const file = path.join(dir, 'target.exe');
        await writeFile(file, Buffer.from('MZ'));
        const finding = (await analyzeLegacyWindows(file, step1Auth)).findings[0];
        const tag = finding.targetProfile.analogyTag;
        if (tag) {
            assert.ok(tag.evidence.length > 0);
            assert.ok(tag.value.basis.length > 0);
            assert.ok(tag.confidence >= 0 && tag.confidence <= 1);
        }
        else {
            assert.equal(tag, undefined);
        }
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
check('Providers', 'Ghidra similarity does not fabricate a zero score without a local engine', async () => {
    const { createGhidraSimilarityProvider } = await import(pathToFileURL(path.join(DIST, 'providers-ghidra.js')).href);
    const prevPath = process.env.PATH;
    const prevHome = process.env.GHIDRA_INSTALL_DIR;
    process.env.PATH = '/nonexistent-ghidra';
    process.env.GHIDRA_INSTALL_DIR = '/nonexistent-ghidra';
    try {
        const provider = createGhidraSimilarityProvider();
        const result = await provider.compareFunctions?.('/tmp/a', '/tmp/b');
        assert.equal(result?.status, 'unsupported');
        assert.deepEqual(result?.findings, []);
    }
    finally {
        process.env.PATH = prevPath;
        if (prevHome === undefined)
            delete process.env.GHIDRA_INSTALL_DIR;
        else
            process.env.GHIDRA_INSTALL_DIR = prevHome;
    }
});
