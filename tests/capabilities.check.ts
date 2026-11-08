// Capability verification suite.
//
// Goal: establish what CREA can REALLY do on the machine running this file, by exercising the built
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
import { analyzeSource } from '../dist/analysis-source.js';
import { analyzeDependencies } from '../dist/analysis-dependencies.js';
import { listProcesses, inspectProcess } from '../dist/process-inspector.js';
import { profileProcess } from '../dist/profiling-profiler.js';
import { runBenchmark, compareBenchmarks } from '../dist/benchmark-engine.js';
import { validateBehavior } from '../dist/benchmark-validation.js';
import { EvidenceEngine } from '../dist/evidence-engine.js';
import { listProviders, registerProvider, getProviderStatus } from '../dist/providers-registry.js';

type Status = 'verified' | 'limitation' | 'drift' | 'failed';
interface Rec { area: string; name: string; status: Status; detail: string }
interface Ctx { limit(d: string): void; drift(d: string): void; note(d: string): void }

const records: Rec[] = [];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const CLI = path.join(DIST, 'cli-main.js');
const MCP = path.join(DIST, 'mcp-server.js');
const WIN = process.platform === 'win32';
const MAC = process.platform === 'darwin';
const NODE = process.execPath;

const WORK = await mkdtemp(path.join(os.tmpdir(), 'crea-verify-'));
const HOME = path.join(WORK, 'crea-home');
process.env.CREA_HOME = HOME; // keep evidence/benchmark artifacts out of the real home directory

function check(area: string, name: string, fn: (c: Ctx) => Promise<void> | void) {
  test(`${area} — ${name}`, async () => {
    let status: Status = 'verified';
    const details: string[] = [];
    const c: Ctx = {
      limit: d => { if (status === 'verified') status = 'limitation'; details.push(d); },
      drift: d => { status = 'drift'; details.push(d); },
      note: d => { details.push(d); },
    };
    try { await fn(c); }
    catch (e) {
      records.push({ area, name, status: 'failed', detail: e instanceof Error ? e.message : String(e) });
      throw e;
    }
    records.push({ area, name, status, detail: details.join('; ') });
  });
}

after(async () => {
  const totals: Record<Status, number> = { verified: 0, limitation: 0, drift: 0, failed: 0 };
  for (const r of records) totals[r.status]++;
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const report = {
    schema: 1,
    crea: pkg.version,
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    osRelease: os.release(),
    generatedAt: new Date().toISOString(),
    totals,
    records,
  };
  const out = process.env.CREA_CAPABILITY_REPORT || path.join(ROOT, 'dist-tests', 'capability-report.json');
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(report, null, 2) + '\n', 'utf8');
  await rm(WORK, { recursive: true, force: true });
});

// ---------------------------------------------------------------- helpers
const read = async (p: string) => JSON.parse(await readFile(p, 'utf8'));
const j = (v: unknown) => JSON.stringify(v);

async function craft(name: string, bytes: Buffer | number[]): Promise<string> {
  const f = path.join(WORK, name);
  await writeFile(f, Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
  return f;
}
function elf(opts: { cls: 1 | 2; le: boolean; machine: number; entry: bigint }): Buffer {
  const b = Buffer.alloc(64);
  b.set([0x7f, 0x45, 0x4c, 0x46, opts.cls, opts.le ? 1 : 2, 1]);
  if (opts.le) b.writeUInt16LE(opts.machine, 18); else b.writeUInt16BE(opts.machine, 18);
  if (opts.cls === 2) { if (opts.le) b.writeBigUInt64LE(opts.entry, 24); else b.writeBigUInt64BE(opts.entry, 24); }
  else if (opts.le) b.writeUInt32LE(Number(opts.entry), 24); else b.writeUInt32BE(Number(opts.entry), 24);
  return b;
}
function pe(machine: number, optMagic: number): Buffer {
  const b = Buffer.alloc(256);
  b[0] = 0x4d; b[1] = 0x5a; b.writeUInt32LE(0x80, 0x3c);
  b.write('PE\0\0', 0x80, 'ascii'); b.writeUInt16LE(machine, 0x84); b.writeUInt16LE(optMagic, 0x80 + 24);
  return b;
}
const nodeEval = (code: string, ...rest: string[]) => ['-e', code, ...rest];

function spawnIdle(): ChildProcess {
  return spawn(NODE, nodeEval('setInterval(()=>{},1000)'), { stdio: 'ignore' });
}
async function killAndWait(c: ChildProcess) {
  if (c.exitCode !== null || c.signalCode !== null) return;
  await new Promise<void>(res => { c.once('exit', () => res()); c.kill('SIGKILL'); });
}

function runCli(args: string[], input?: string) {
  const r = spawnSync(NODE, [CLI, ...args], { encoding: 'utf8', env: process.env, input, timeout: 120000 });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function startMcp(args: string[] = [MCP]) {
  const child = spawn(NODE, args, { stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
  const pending = new Map<number, (m: any) => void>();
  const unsolicited: any[] = [];
  const rl = readline.createInterface({ input: child.stdout! });
  rl.on('line', l => {
    let m: any; try { m = JSON.parse(l); } catch { unsolicited.push({ unparsable: l }); return; }
    const p = m.id !== undefined ? pending.get(m.id) : undefined;
    if (p) { pending.delete(m.id); p(m); } else unsolicited.push(m);
  });
  let n = 0;
  const req = (method: string, params?: unknown) => new Promise<any>((resolve, reject) => {
    const id = ++n;
    const t = setTimeout(() => reject(new Error(`MCP timeout waiting for ${method}`)), 90000);
    pending.set(id, m => { clearTimeout(t); resolve(m); });
    child.stdin!.write(j({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const raw = (s: string) => child.stdin!.write(s + '\n');
  const notify = (method: string) => raw(j({ jsonrpc: '2.0', method }));
  const call = async (name: string, args: unknown) => {
    const m = await req('tools/call', { name, arguments: args });
    if (m.error) throw new Error(`tool ${name}: ${m.error.message}`);
    return { envelope: m.result, value: JSON.parse(m.result.content[0].text) };
  };
  const close = () => { try { child.stdin!.end(); } catch { /* ignore */ } child.kill(); };
  return { req, raw, notify, call, close, unsolicited };
}
const settle = (ms = 300) => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- 1. build output & library surface
check('Package', 'built output exists and the library exports the documented API', async c => {
  for (const f of ['index', 'cli-main', 'mcp-server']) assert.ok(existsSync(path.join(DIST, `${f}.js`)), `dist/${f}.js missing`);
  const lib: any = await import(pathToFileURL(path.join(DIST, 'index.js')).href);
  const expected = ['EvidenceEngine', 'analyzeBinary', 'analyzeDependencies', 'analyzeSource', 'compareBenchmarks', 'getProviderStatus',
    'inspectProcess', 'listProcesses', 'listProviders', 'profileProcess', 'registerProvider', 'result', 'runBenchmark', 'validateBehavior'];
  for (const k of expected) assert.equal(typeof lib[k], 'function', `export ${k}`);
  c.note(`${expected.length} exports present`);
});

check('Package', 'bin entry has a shebang and package.json targets exist', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(readFileSync(CLI, 'utf8').split('\n')[0], '#!/usr/bin/env node');
  assert.ok(existsSync(path.join(ROOT, pkg.bin.crea)), 'bin.crea target');
  const exp = pkg.exports['.'];
  assert.ok(existsSync(path.join(ROOT, exp.default)), 'exports default');
  assert.ok(existsSync(path.join(ROOT, exp.types)), 'exports types');
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
  assert.equal(a.architecture, 'AArch64'); assert.equal(r.architecture, 'RISC-V');
});
check('Binary', 'PE32+ (x86_64) and PE32 (x86) headers are parsed', async () => {
  const a: any = (await analyzeBinary(await craft('pe64.bin', pe(0x8664, 0x20b)))).findings[0];
  const b: any = (await analyzeBinary(await craft('pe32.bin', pe(0x14c, 0x10b)))).findings[0];
  assert.deepEqual([a.format, a.architecture, a.bitness], ['PE', 'x86_64', 64]);
  assert.deepEqual([b.format, b.architecture, b.bitness], ['PE', 'x86', 32]);
});
check('Binary', 'MZ file without a PE signature is reported as DOS/PE-like', async () => {
  const b = Buffer.alloc(128); b[0] = 0x4d; b[1] = 0x5a; b.writeUInt32LE(0x40, 0x3c);
  const f: any = (await analyzeBinary(await craft('mz.bin', b))).findings[0];
  assert.equal(f.format, 'DOS/PE-like');
});
check('Binary', 'Mach-O 64-bit magics (both byte orders) are recognized', async () => {
  const a: any = (await analyzeBinary(await craft('macho1.bin', [0xfe, 0xed, 0xfa, 0xcf, 0, 0, 0, 0]))).findings[0];
  const b: any = (await analyzeBinary(await craft('macho2.bin', [0xcf, 0xfa, 0xed, 0xfe, 0, 0, 0, 0]))).findings[0];
  assert.match(a.format, /^Mach-O 64-bit/); assert.match(b.format, /^Mach-O 64-bit/);
  assert.equal(a.bitness, 64); assert.equal(b.bitness, 64);
});
check('Binary', 'Mach-O universal binary: format recognized, bitness field is meaningless', async c => {
  const f: any = (await analyzeBinary(await craft('fat.bin', [0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 2]))).findings[0];
  assert.equal(f.format, 'Mach-O universal');
  if (f.bitness === 32) c.drift('universal binary is reported with bitness=32, which has no meaning for a fat binary');
});
check('Binary', 'Java .class files share the 0xCAFEBABE magic and are misclassified', async c => {
  const f: any = (await analyzeBinary(await craft('Hello.class', [0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 0x34]))).findings[0];
  if (f.format === 'Mach-O universal') c.limit('Java class files are reported as "Mach-O universal" (magic collision, no disambiguation)');
  else c.note(`classified as ${f.format}`);
});
check('Binary', 'unrecognized content yields status partial, not a crash', async () => {
  const r = await analyzeBinary(await craft('text.bin', Buffer.from('just some text, definitely not a binary header'))) as any;
  assert.equal(r.findings[0].format, 'unknown'); assert.equal(r.status, 'partial'); assert.equal(r.coverage.complete, false);
});
check('Binary', 'files shorter than 4 bytes are handled gracefully', async c => {
  const f = await craft('tiny.bin', [0x01, 0x02]);
  try {
    const r: any = await analyzeBinary(f);
    assert.equal(r.status, 'partial');
  } catch (e) {
    c.drift(`analyzeBinary throws on a 2-byte file instead of returning partial (${(e as Error).name}: ${(e as Error).message.slice(0, 80)})`);
  }
});
check('Binary', 'missing file rejects with an error', async () => {
  await assert.rejects(analyzeBinary(path.join(WORK, 'does-not-exist.bin')));
});
check('Binary', 'the Node.js executable on this host is identified with the right format and architecture', async () => {
  const f: any = (await analyzeBinary(NODE)).findings[0];
  const want = WIN ? 'PE' : MAC ? 'Mach-O' : 'ELF';
  assert.ok(f.format.startsWith(want), `expected ${want}, got ${f.format}`);
  if (!MAC) assert.equal(f.architecture, process.arch === 'arm64' ? (WIN ? 'ARM64' : 'AArch64') : 'x86_64');
  assert.equal(f.bitness, 64);
});
check('Binary', 'result carries a SHA-256 evidence record matching the file', async () => {
  const file = await craft('hash-me.bin', elf({ cls: 2, le: true, machine: 62, entry: 1n }));
  const r: any = await analyzeBinary(file);
  const ev = r.evidence[0];
  assert.equal(ev.sha256, createHash('sha256').update(await readFile(file)).digest('hex'));
  assert.ok(existsSync(ev.details.artifactPath));
});
check('Binary', 'no sections, imports, symbols or disassembly are produced', async c => {
  const f: any = (await analyzeBinary(NODE)).findings[0];
  assert.equal(f.sections, undefined); assert.equal(f.imports, undefined);
  c.limit('header-level only: no sections, imports, symbols, disassembly or decompilation');
});

// ---------------------------------------------------------------- 3. source inventory
const SRC = path.join(WORK, 'proj');
check('Source', 'inventories files, counts extensions/lines, extracts bare imports, skips excluded dirs', async () => {
  await mkdir(path.join(SRC, 'node_modules', 'pkg'), { recursive: true });
  await mkdir(path.join(SRC, '.hidden'), { recursive: true });
  await mkdir(path.join(SRC, '.github'), { recursive: true });
  await mkdir(path.join(SRC, 'dist'), { recursive: true });
  await mkdir(path.join(SRC, 'sub'), { recursive: true });
  await writeFile(path.join(SRC, 'a.ts'), "import fs from 'node:fs';\nimport g from 'lodash/get';\nimport l from './local.js';\nconst z = require('left-pad');\n");
  await writeFile(path.join(SRC, 'b.py'), 'print("x")\n');
  await writeFile(path.join(SRC, 'c.js'), "// see: from 'fake-pkg'\nexport {};\n");
  await writeFile(path.join(SRC, 'sub', 'd.go'), 'package main\n');
  await writeFile(path.join(SRC, '.github', 'ci.js'), 'export {};\n');
  for (const skipped of [['node_modules', 'pkg', 'index.js'], ['.hidden', 'x.js'], ['dist', 'y.js']]) await writeFile(path.join(SRC, ...skipped), 'x');
  await writeFile(path.join(SRC, 'README.md'), '# not source');
  await writeFile(path.join(SRC, 'package.json'), j({ name: 'fixture', dependencies: { alpha: '^1.0.0' } }));
  const r: any = await analyzeSource(SRC);
  const f = r.findings[0];
  assert.equal(f.fileCount, 5, `files: ${j(f.filesByExtension)}`);
  assert.deepEqual(f.filesByExtension, { '.ts': 1, '.py': 1, '.js': 2, '.go': 1 });
  assert.ok(f.approximateLines >= 8);
  const imp = Object.fromEntries(f.externalImportReferences);
  assert.equal(imp['node:fs'], 1); assert.equal(imp['lodash'], 1); assert.equal(imp['left-pad'], 1);
  assert.equal(imp['./local.js'], undefined);
  assert.equal(f.packageManifest.name, 'fixture');
  assert.equal(r.status, 'completed');
  assert.equal(r.evidence[0].kind, 'directory');
});
check('Source', 'import counting is textual and counts imports inside comments', async c => {
  const f: any = ((await analyzeSource(SRC)) as any).findings[0];
  const imp = Object.fromEntries(f.externalImportReferences);
  assert.equal(imp['fake-pkg'], 1);
  c.limit('imports are matched by regex; a commented-out import is counted (no AST)');
});
check('Source', 'scan is capped at 5000 files and reports partial coverage', async () => {
  const big = path.join(WORK, 'big'); await mkdir(big, { recursive: true });
  await Promise.all(Array.from({ length: 5100 }, (_, i) => writeFile(path.join(big, `f${i}.js`), 'x')));
  const r: any = await analyzeSource(big);
  assert.equal(r.status, 'partial'); assert.equal(r.coverage.complete, false); assert.ok(r.findings[0].fileCount >= 5000);
});
check('Source', 'this repository itself can be inventoried', async () => {
  const r: any = await analyzeSource(ROOT);
  assert.ok(r.findings[0].fileCount > 0);
  assert.ok(r.findings[0].externalImportReferences.some(([k]: [string]) => k.startsWith('node:')));
});

// ---------------------------------------------------------------- 4. dependencies
check('Dependencies', 'reads dependencies, devDependencies and optionalDependencies', async () => {
  const d = path.join(WORK, 'deps'); await mkdir(d, { recursive: true });
  await writeFile(path.join(d, 'package.json'), j({ dependencies: { a: '^1.0.0' }, devDependencies: { b: '~2.0.0' }, optionalDependencies: { c: '3.x' } }));
  const r: any = await analyzeDependencies(d);
  assert.deepEqual(r.findings.map((x: any) => [x.name, x.declaredVersion]), [['a', '^1.0.0'], ['b', '~2.0.0'], ['c', '3.x']]);
  assert.equal(r.status, 'completed');
});
check('Dependencies', 'missing or malformed package.json yields partial with a limitation', async () => {
  const empty = path.join(WORK, 'nodeps'); await mkdir(empty, { recursive: true });
  const bad = path.join(WORK, 'baddeps'); await mkdir(bad, { recursive: true }); await writeFile(path.join(bad, 'package.json'), '{ not json');
  for (const dir of [empty, bad]) {
    const r: any = await analyzeDependencies(dir);
    assert.equal(r.status, 'partial'); assert.deepEqual(r.findings, []); assert.ok(r.limitations.length > 0);
  }
});
check('Dependencies', 'versions are declared ranges only (no resolution, transitive graph, CVE or license data)', async c => {
  const r: any = await analyzeDependencies(path.join(WORK, 'deps'));
  assert.ok(r.findings.every((x: any) => x.resolvedVersion === null));
  c.limit('resolvedVersion is always null; no lockfile parsing, transitive graph, vulnerability or license audit');
});

// ---------------------------------------------------------------- 5. processes
check('Processes', 'lists visible processes with pid and name, honoring the limit', async () => {
  const r: any = await listProcesses(25);
  assert.equal(r.status, 'completed', j(r.limitations));
  assert.ok(r.findings.length > 0 && r.findings.length <= 25);
  // Windows legitimately lists PID 0 ("System Idle Process"); POSIX PIDs start at 1.
  assert.ok(r.findings.every((p: any) => Number.isInteger(p.pid) && p.pid >= (WIN ? 0 : 1) && typeof p.name === 'string'));
  if (!WIN) assert.ok(r.findings.every((p: any) => Number.isInteger(p.ppid)), 'ppid on POSIX hosts');
});
check('Processes', 'limit is clamped to the 1..500 range', async () => {
  assert.ok(((await listProcesses(100000)) as any).findings.length <= 500);
  assert.ok(((await listProcesses(0)) as any).findings.length <= 1);
});
check('Processes', 'inspectProcess validates PIDs', async () => {
  for (const bad of [0, -1, 1.5, NaN]) await assert.rejects(inspectProcess(bad as number), /positive integer/);
});
check('Processes', 'unknown PID yields partial with an empty finding list', async () => {
  const r: any = await inspectProcess(2147483646);
  assert.equal(r.status, 'partial'); assert.deepEqual(r.findings, []);
});
check('Processes', 'a freshly started child process can be inspected', async c => {
  const child = spawnIdle();
  try {
    await settle(200);
    const r: any = await inspectProcess(child.pid!);
    if (r.findings.length) { assert.equal(r.findings[0].pid, child.pid); assert.equal(r.status, 'completed'); }
    else c.limit('child not visible within the 500-row inventory cap (inspectProcess only searches the first 500 processes)');
  } finally { await killAndWait(child); }
});
check('Processes', 'no memory maps, handles, threads, per-process I/O or process tree', async c => {
  const p: any = ((await listProcesses(5)) as any).findings[0];
  assert.equal(p.threads, undefined); assert.equal(p.rssKb, undefined); assert.equal(p.children, undefined);
  c.limit('inspector exposes pid/ppid/name/command only');
});

// ---------------------------------------------------------------- 6. profiling
check('Profiling', 'samples CPU/RSS of a live process and aggregates average/peak', async c => {
  // A busy loop gives non-zero CPU% on POSIX. On Windows CPU is not collected, and a spinning child
  // starves the 2-core runner, so use an idle child there.
  const child = WIN ? spawnIdle() : spawn(NODE, nodeEval('while(true){}'), { stdio: 'ignore' });
  try {
    await settle(200);
    const r: any = await profileProcess(child.pid!, 700, 100);
    const f = r.findings[0];
    if (WIN && r.status === 'partial' && /Command failed|timed out|ETIMEDOUT/i.test(j(r.errors))) {
      c.drift(`PowerShell sampling failed under load (fixed 4 s exec timeout, one PowerShell start per sample): ${String(r.errors[0]).slice(0, 90)}`);
      return;
    }
    assert.equal(r.status, 'completed', j(r.errors));
    assert.ok(f.sampleCount >= (WIN ? 1 : 2), `samples: ${f.sampleCount}`);
    assert.ok(f.peakRssKb > 0 && f.averageRssKb > 0);
    if (WIN) { assert.equal(f.averageCpuPercent, null); c.limit('Windows: CPU percentage is not collected, RSS only'); }
    else { assert.ok(f.peakCpuPercent >= 0); assert.ok(f.peakCpuPercent >= f.averageCpuPercent); }
    assert.ok(f.samples.every((s: any) => !Number.isNaN(Date.parse(s.at))));
  } finally { await killAndWait(child); }
});
check('Profiling', 'duration and interval are clamped to safe bounds', async () => {
  const child = spawnIdle();
  try {
    await settle(100);
    const t0 = Date.now();
    const r: any = await profileProcess(child.pid!, 1, 1);
    assert.ok(Date.now() - t0 >= 450, 'duration below 500ms must be raised to 500ms');
    assert.ok(r.findings[0].sampleCount <= 6, 'interval below 100ms must be raised to 100ms');
  } finally { await killAndWait(child); }
});
check('Profiling', 'a vanished process yields partial with a recorded error', async () => {
  const child = spawnIdle(); const pid = child.pid!; await killAndWait(child); await settle(200);
  const r: any = await profileProcess(pid, 500, 100);
  assert.equal(r.status, 'partial'); assert.ok(r.errors.length > 0);
});
check('Profiling', 'invalid PID is rejected', async () => {
  await assert.rejects(profileProcess(0), /positive integer/);
});
check('Profiling', 'process-level only (no hot functions, I/O, network, child aggregation)', async c => {
  const child = spawnIdle();
  try {
    await settle(100);
    const f: any = ((await profileProcess(child.pid!, 500, 100)) as any).findings[0];
    for (const k of ['hotspots', 'functions', 'diskReadBytes', 'diskWriteBytes', 'threads', 'children']) assert.equal(f[k], undefined, k);
    c.limit('only CPU%/RSS of one process; no function hotspots, disk/network I/O, thread count or child aggregation');
  } finally { await killAndWait(child); }
});

// ---------------------------------------------------------------- 7. benchmark
check('Benchmark', 'repeats a command and reports mean/median/min/max with per-run output', async () => {
  const r: any = await runBenchmark({ command: NODE, args: nodeEval('process.stdout.write("ok")'), repetitions: 4 });
  const f = r.findings[0];
  assert.equal(f.repetitionsCompleted, 4); assert.equal(r.status, 'completed');
  assert.ok(f.minDurationMs <= f.medianDurationMs && f.medianDurationMs <= f.maxDurationMs && f.meanDurationMs > 0);
  assert.ok(f.runs.every((x: any) => x.stdout === 'ok' && x.exitCode === 0));
});
check('Benchmark', 'persists the result as a JSON artifact under CREA_HOME', async () => {
  const f: any = ((await runBenchmark({ command: NODE, args: nodeEval('0'), repetitions: 1 })) as any).findings[0];
  assert.ok(path.resolve(f.artifactPath).startsWith(path.resolve(HOME)), f.artifactPath);
  assert.equal((await read(f.artifactPath)).operation, 'benchmark');
});
check('Benchmark', 'repetitions are clamped to 1..20', async () => {
  const hi: any = await runBenchmark({ command: NODE, args: nodeEval('0'), repetitions: 50 });
  assert.equal(hi.findings[0].repetitionsRequested, 20); assert.equal(hi.findings[0].repetitionsCompleted, 20);
  const lo: any = await runBenchmark({ command: NODE, args: nodeEval('0'), repetitions: 0 });
  assert.equal(lo.findings[0].repetitionsRequested, 1);
});
check('Benchmark', 'a timeout kills the command, flags the run and stops further repetitions', async () => {
  const t0 = Date.now();
  const r: any = await runBenchmark({ command: NODE, args: nodeEval('setTimeout(()=>{},20000)'), timeoutMs: 400, repetitions: 3 });
  assert.ok(Date.now() - t0 < 10000, 'must not wait for the child');
  assert.equal(r.status, 'partial'); assert.equal(r.findings[0].runs[0].timedOut, true); assert.equal(r.findings[0].repetitionsCompleted, 1);
});
check('Benchmark', 'a missing executable is reported as an error, not thrown', async () => {
  const r: any = await runBenchmark({ command: 'definitely-not-a-real-command-xyz', repetitions: 2 });
  assert.equal(r.status, 'partial'); assert.ok(r.findings[0].runs[0].error);
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
  assert.equal(r.findings[0].runs[0].stdout, 'eof'); assert.equal(r.findings[0].runs[0].stderr, 'err');
});
check('Benchmark', 'captured output is bounded (~1 MiB per stream)', async c => {
  // Small chunks: the cap must hold on every platform.
  const small: any = await runBenchmark({
    command: NODE, repetitions: 1, timeoutMs: 60000,
    args: nodeEval('const c="x".repeat(16384);let n=0;(function w(){while(n<250){n++;if(!process.stdout.write(c))return process.stdout.once("drain",w);}})()'),
  });
  const len = small.findings[0].runs[0].stdout.length;
  assert.ok(len >= 1_000_000 && len < 2_000_000, `captured ${len} bytes of 4,096,000 written in 16 KiB chunks`);
  // One huge chunk: the cap is checked before appending, so a single oversized chunk can bypass it.
  const big: any = await runBenchmark({ command: NODE, args: nodeEval('process.stdout.write("x".repeat(4e6))'), repetitions: 1, timeoutMs: 60000 });
  const bigLen = big.findings[0].runs[0].stdout.length;
  assert.ok(bigLen >= 1_000_000, `captured only ${bigLen} bytes`);
  if (bigLen >= 2_000_000) c.drift(`output cap is bypassed when a child's output arrives in one large chunk: kept ${bigLen} of 4,000,000 bytes (seen on Windows/Node 20; the cap is checked before appending, not after)`);
});
check('Benchmark', 'honors cwd and records the non-zero exit code', async () => {
  const d = path.join(WORK, 'cwd'); await mkdir(d, { recursive: true });
  const r: any = await runBenchmark({ command: NODE, args: nodeEval('process.stdout.write(process.cwd());process.exit(3)'), cwd: d, repetitions: 1 });
  assert.equal(realpathSync.native(r.findings[0].runs[0].stdout), realpathSync.native(d)); // 8.3 short names (Windows) and /var -> /private/var (macOS)
  assert.equal(r.findings[0].runs[0].exitCode, 3);
});
check('Benchmark', 'compareBenchmarks computes delta and percent change and validates input', async () => {
  const imp: any = await compareBenchmarks({ findings: [{ meanDurationMs: 200 }] }, { findings: [{ meanDurationMs: 150 }] });
  assert.deepEqual([imp.findings[0].deltaMs, imp.findings[0].changePercent, imp.findings[0].improved], [-50, -25, true]);
  const reg: any = await compareBenchmarks({ findings: [{ meanDurationMs: 100 }] }, { findings: [{ meanDurationMs: 120 }] });
  assert.equal(reg.findings[0].improved, false);
  await assert.rejects(compareBenchmarks({}, {}), /positive meanDurationMs/);
  await assert.rejects(compareBenchmarks({ findings: [{ meanDurationMs: 0 }] }, { findings: [{ meanDurationMs: 1 }] }));
});
check('Benchmark', 'end to end: a measurably slower command is detected as slower', async () => {
  const fast: any = await runBenchmark({ command: NODE, args: nodeEval('0'), repetitions: 3 });
  const slow: any = await runBenchmark({ command: NODE, args: nodeEval('setTimeout(()=>{},300)'), repetitions: 3 });
  const cmp: any = await compareBenchmarks(fast, slow);
  assert.equal(cmp.findings[0].improved, false); assert.ok(cmp.findings[0].changePercent > 50);
});
check('Benchmark', 'timeout kills only the direct child (grandchildren survive)', async c => {
  const code = 'const {spawn}=require("node:child_process");' +
    'const g=spawn(process.execPath,["-e","setTimeout(()=>{},30000)"],{detached:true,stdio:"ignore"});g.unref();' +
    'process.stdout.write(String(g.pid));setTimeout(()=>{},30000)';
  const r: any = await runBenchmark({ command: NODE, args: nodeEval(code), timeoutMs: 1500, repetitions: 1 });
  const gpid = Number(r.findings[0].runs[0].stdout);
  if (!Number.isInteger(gpid) || gpid <= 0) { c.note('grandchild pid not captured before timeout; check skipped'); return; }
  let alive = false;
  try { process.kill(gpid, 0); alive = true; } catch { /* gone */ }
  if (alive) { try { process.kill(gpid, 'SIGKILL'); } catch { /* ignore */ } c.limit('a detached grandchild outlived the timeout; only the direct child is terminated'); }
  else c.note('grandchild was terminated too');
});
check('Benchmark', 'only wall-clock time is measured (no CPU time, RAM, I/O, warm-up, percentiles)', async c => {
  const f: any = ((await runBenchmark({ command: NODE, args: nodeEval('0'), repetitions: 2 })) as any).findings[0];
  for (const k of ['cpuTimeMs', 'peakRssKb', 'p95DurationMs', 'stdDevMs', 'madMs', 'warmupRuns', 'environment']) assert.equal(f[k], undefined, k);
  c.limit('no CPU time, peak RAM, P95, std-dev, MAD, warm-up/cold split or environment fingerprint');
});

// ---------------------------------------------------------------- 8. validation
check('Validation', 'passes when exit code, stdout and stderr match exactly', async () => {
  const r: any = await validateBehavior({ command: NODE, args: nodeEval('process.stdout.write("pass");process.stderr.write("e")') }, { exitCode: 0, stdout: 'pass', stderr: 'e' }, 2);
  assert.equal(r.findings[0].passed, true); assert.equal(r.status, 'completed'); assert.equal(r.findings[0].checks.length, 3);
  assert.ok(existsSync(r.findings[0].artifactPath));
});
check('Validation', 'detects a stdout mismatch, a wrong exit code and an unexpected non-zero exit', async () => {
  const a: any = await validateBehavior({ command: NODE, args: nodeEval('process.stdout.write("actual")') }, { stdout: 'expected' });
  assert.equal(a.findings[0].passed, false); assert.equal(a.status, 'partial');
  assert.equal(a.findings[0].checks.find((x: any) => x.name === 'stdout').passed, false);
  const b: any = await validateBehavior({ command: NODE, args: nodeEval('process.exit(2)') }, { exitCode: 2 });
  assert.equal(b.findings[0].passed, true);
  const d: any = await validateBehavior({ command: NODE, args: nodeEval('process.exit(2)') }, {});
  assert.equal(d.findings[0].passed, false);
});
check('Validation', 'repeated runs must all match (non-deterministic output fails)', async () => {
  const r: any = await validateBehavior({ command: NODE, args: nodeEval('process.stdout.write(String(Math.random()))') }, { stdout: '0.5' }, 3);
  assert.equal(r.findings[0].passed, false);
});
check('Validation', 'exact-match only (no semantic equivalence, test discovery or build integration)', async c => {
  const r: any = await validateBehavior({ command: NODE, args: nodeEval('process.stdout.write("a  b")') }, { stdout: 'a b' });
  assert.equal(r.findings[0].passed, false);
  c.limit('whitespace-only differences fail; there is no normalization, fixture discovery or test-runner adapter');
});

// ---------------------------------------------------------------- 9. evidence
check('Evidence', 'evidence written by an analysis can be found again by ID', async () => {
  const file = await craft('ev.bin', elf({ cls: 2, le: true, machine: 62, entry: 2n }));
  const ev = ((await analyzeBinary(file)) as any).evidence[0];
  assert.match(ev.id, /^[0-9a-f-]{36}$/); assert.ok(!Number.isNaN(Date.parse(ev.observedAt)));
  const p = await new EvidenceEngine().get(ev.id);
  assert.ok(p, 'evidence file not found'); assert.equal((await read(p!)).id, ev.id);
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
  for (const k of ['schemaVersion', 'id', 'target', 'operation', 'status', 'generatedAt', 'host', 'findings', 'evidence', 'limitations', 'errors', 'coverage']) assert.ok(k in r, k);
  assert.equal(r.schemaVersion, '1.0');
});
check('Evidence', 'records are not signed, chained or tamper-evident, and there are no research sessions', async c => {
  const ev: any = ((await analyzeBinary(NODE)) as any).evidence[0];
  const stored = await read(ev.details.artifactPath);
  assert.equal(stored.signature, undefined); assert.equal(stored.previousHash, undefined); assert.equal(stored.sessionId, undefined);
  c.limit('evidence JSON has no signature, hash chain, session link or confidence/limitations fields');
});

// ---------------------------------------------------------------- 10. providers
check('Providers', 'built-in header provider is implemented; external engines are extension points only', async c => {
  const list: any[] = listProviders();
  assert.equal(list.find(p => p.name === 'builtin-native-header').state, 'implemented');
  for (const n of ['ghidra', 'rizin', 'frida', 'gdb', 'perf', 'ebpf', 'etw', 'instruments']) {
    const p = list.find(x => x.name === n);
    assert.ok(p, n); assert.equal(p.state, 'extension-point'); assert.deepEqual(p.capabilities, []);
  }
  c.limit('Ghidra, Rizin, Frida, GDB, perf, eBPF, ETW and Instruments are labels only; none is invoked');
});
check('Providers', 'a custom provider can be registered, listed and status-checked; duplicates are refused', async () => {
  const name = `verify-provider-${process.pid}`;
  registerProvider({ name, capabilities: ['demo'], available: async () => true, analyze: async () => ({}) });
  assert.deepEqual((listProviders() as any[]).find(p => p.name === name), { name, state: 'registered', capabilities: ['demo'] });
  assert.equal((await getProviderStatus()).find(p => p.name === name)!.available, true);
  assert.throws(() => registerProvider({ name, capabilities: [], available: async () => false, analyze: async () => ({}) }), /already registered/);
});

// ---------------------------------------------------------------- 11. CLI
const cliDir = path.join(WORK, 'cli'); await mkdir(cliDir, { recursive: true });
check('CLI', '--help, no arguments and "help" print usage listing every command', () => {
  for (const a of [['--help'], [], ['help'], ['-h']]) {
    const r = runCli(a);
    assert.equal(r.code, 0, j(a)); assert.match(r.stdout, /Usage: crea/);
    for (const cmd of ['binary', 'source', 'dependencies', 'processes', 'process', 'profile', 'benchmark', 'compare', 'validate', 'analyzers', 'mcp']) assert.ok(r.stdout.includes(cmd), cmd);
  }
});
check('CLI', 'an unknown command fails with exit code 1 and a message on stderr', () => {
  const r = runCli(['frobnicate']); assert.equal(r.code, 1); assert.match(r.stderr, /Unknown command/);
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
  try { await settle(150); assert.equal(JSON.parse(runCli(['profile', String(child.pid), '--duration', '600', '--interval', '100']).stdout).operation, 'process_profile'); }
  finally { await killAndWait(child); }
});
check('CLI', 'benchmark -> compare workflow through files', async () => {
  const mk = (ms: number) => runCli(['benchmark', '--command', NODE, '--arg', '-e', '--arg', `setTimeout(()=>{},${ms})`, '--repeat', '2', '--label', `t${ms}`]).stdout;
  const before = path.join(cliDir, 'before.json'), after = path.join(cliDir, 'after.json');
  await writeFile(before, mk(250)); await writeFile(after, mk(1));
  const cmp = JSON.parse(runCli(['compare', before, after]).stdout);
  assert.equal(cmp.findings[0].improved, true);
});
check('CLI', 'validate --expected works for argument-less commands', async () => {
  const exp = path.join(cliDir, 'exp.json'); await writeFile(exp, j({ exitCode: 0, stdout: '' }));
  const v = JSON.parse(runCli(['validate', '--command', NODE, '--expected', exp]).stdout);
  assert.equal(v.findings[0].passed, true);
});
check('CLI', 'validate cannot pass arguments to the command (MCP validate_changes can)', async c => {
  const exp = path.join(cliDir, 'exp2.json'); await writeFile(exp, j({ exitCode: 0, stdout: 'x' }));
  const v = JSON.parse(runCli(['validate', '--command', NODE, '--arg', '-e', '--arg', 'process.stdout.write("x")', '--expected', exp]).stdout);
  if (v.findings[0].passed === false) c.drift('`crea validate` ignores --arg, so only argument-less commands can be validated from the CLI (the README/help do not say so)');
  else c.note('CLI validate accepts --arg');
});
check('CLI', 'analyzers lists providers', () => {
  assert.ok(JSON.parse(runCli(['analyzers']).stdout).some((p: any) => p.name === 'ghidra'));
});
check('CLI', '--json flag is accepted but changes nothing (output is always pretty JSON)', async c => {
  const f = await craft('cli2.elf', elf({ cls: 2, le: true, machine: 62, entry: 1n }));
  const a = JSON.parse(runCli(['binary', f]).stdout), b = JSON.parse(runCli(['binary', f, '--json']).stdout);
  assert.equal(a.findings[0].format, b.findings[0].format);
  c.limit('there is no human-readable output mode; --json is a no-op');
});

// ---------------------------------------------------------------- 12. MCP server
const DOCUMENTED_TOOLS = ['inspect_target', 'analyze_binary', 'analyze_source', 'analyze_dependencies', 'get_inventory', 'inspect_process', 'profile_process',
  'capture_baseline', 'run_benchmark', 'compare_results', 'validate_changes', 'get_evidence', 'list_analyzers'];

check('MCP', 'handshake: initialize, ping and tools/list', async () => {
  const s = startMcp();
  try {
    const init = await s.req('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'verify', version: '1' } });
    assert.equal(init.result.serverInfo.name, 'crea'); assert.ok(init.result.capabilities.tools);
    s.notify('notifications/initialized');
    assert.deepEqual((await s.req('ping')).result, {});
    const names = (await s.req('tools/list')).result.tools.map((t: any) => t.name);
    assert.deepEqual([...names].sort(), [...DOCUMENTED_TOOLS].sort());
  } finally { s.close(); }
});
check('MCP', 'every tool has a description and an object input schema with valid required fields', async () => {
  const s = startMcp();
  try {
    for (const t of (await s.req('tools/list')).result.tools) {
      assert.ok(t.description.length > 10, t.name); assert.equal(t.inputSchema.type, 'object', t.name);
      for (const r of t.inputSchema.required ?? []) assert.ok(r in t.inputSchema.properties, `${t.name}.${r}`);
    }
  } finally { s.close(); }
});
check('MCP', 'protocol errors: unknown method, unknown tool, garbage input, notifications', async () => {
  const s = startMcp();
  try {
    assert.equal((await s.req('no/such/method')).error.code, -32601);
    const bad = await s.req('tools/call', { name: 'no_such_tool', arguments: {} });
    assert.equal(bad.error.code, -32000); assert.match(bad.error.message, /Unknown tool/);
    s.raw('this is not json'); s.notify('notifications/cancelled'); s.notify('some/unknown/notification');
    assert.deepEqual((await s.req('ping')).result, {}, 'server must survive garbage');
    await settle(200);
    assert.deepEqual(s.unsolicited, [], 'notifications and garbage must not produce responses');
  } finally { s.close(); }
});
check('MCP', 'all 13 tools can be called and return parseable JSON results', async () => {
  const s = startMcp();
  const child = spawnIdle();
  try {
    await s.req('initialize', {});
    const binFile = await craft('mcp.elf', elf({ cls: 2, le: true, machine: 62, entry: 1n }));
    const ok = async (name: string, args: unknown) => { const r = await s.call(name, args); assert.ok(r.value, name); return r; };
    assert.equal((await ok('inspect_target', { target: binFile })).value.operation, 'binary_analysis');
    assert.equal((await ok('inspect_target', { target: SRC })).value.operation, 'source_inventory');
    const bin = await ok('analyze_binary', { file: binFile }); assert.equal(bin.value.findings[0].format, 'ELF');
    assert.equal((await ok('analyze_source', { directory: SRC })).value.findings[0].fileCount, 5);
    assert.equal((await ok('analyze_dependencies', { directory: path.join(WORK, 'deps') })).value.findings.length, 3);
    assert.ok((await ok('get_inventory', { limit: 5 })).value.findings.length <= 5);
    assert.equal((await ok('inspect_process', { pid: process.pid })).value.operation, 'process_inspection');
    await settle(100);
    assert.equal((await ok('profile_process', { pid: child.pid, durationMs: 500, intervalMs: 100 })).value.operation, 'process_profile');
    const base = await ok('capture_baseline', { command: NODE, args: nodeEval('0'), repetitions: 2 });
    assert.equal(base.value.findings[0].label, 'baseline');
    const b1 = await ok('run_benchmark', { command: NODE, args: nodeEval('setTimeout(()=>{},200)'), repetitions: 2 });
    const b2 = await ok('run_benchmark', { command: NODE, args: nodeEval('0'), repetitions: 2 });
    assert.equal((await ok('compare_results', { before: b1.value, after: b2.value })).value.findings[0].improved, true);
    const val = await ok('validate_changes', { command: NODE, args: nodeEval('process.stdout.write("v")'), expected: { stdout: 'v' } });
    assert.equal(val.value.findings[0].passed, true);
    const ev = await ok('get_evidence', { id: bin.value.evidence[0].id }); assert.equal(ev.value.found, true);
    assert.equal((await ok('get_evidence', { id: 'nope' })).value.found, false);
    assert.ok((await ok('list_analyzers', {})).value.length >= 9);
  } finally { s.close(); await killAndWait(child); }
});
check('MCP', 'tool errors (missing file, bad PID) surface as JSON-RPC errors, not crashes', async () => {
  const s = startMcp();
  try {
    assert.ok((await s.req('tools/call', { name: 'analyze_binary', arguments: { file: path.join(WORK, 'nope') } })).error);
    assert.match((await s.req('tools/call', { name: 'inspect_process', arguments: { pid: -4 } })).error.message, /positive integer/);
    assert.deepEqual((await s.req('ping')).result, {});
  } finally { s.close(); }
});
check('MCP', '"crea mcp" starts the same stdio server', async () => {
  const s = startMcp([CLI, 'mcp']);
  try { assert.equal((await s.req('tools/list')).result.tools.length, 13); } finally { s.close(); }
});
check('Docs', 'docs/MCP.md says tools return structuredContent', async c => {
  const doc = path.join(ROOT, 'docs', 'MCP.md');
  if (!existsSync(doc)) { c.note('docs/MCP.md not present'); return; }
  if (!/structuredContent/.test(readFileSync(doc, 'utf8'))) { c.note('docs do not claim structuredContent'); return; }
  const s = startMcp();
  try {
    const r = await s.call('list_analyzers', {});
    if (!('structuredContent' in r.envelope)) c.drift('docs/MCP.md promises `structuredContent`, but tools/call returns only `content[0].text` (isError:false)');
  } finally { s.close(); }
});
check('Docs', 'the tool table in docs/MCP.md matches tools/list', async c => {
  const doc = path.join(ROOT, 'docs', 'MCP.md');
  if (!existsSync(doc)) { c.note('docs/MCP.md not present'); return; }
  const documented = [...readFileSync(doc, 'utf8').matchAll(/^\|\s*`([a-z_]+)`\s*\|/gm)].map(m => m[1]);
  const s = startMcp();
  try {
    const live: string[] = (await s.req('tools/list')).result.tools.map((t: any) => t.name);
    const missing = documented.filter(x => !live.includes(x)), extra = live.filter(x => !documented.includes(x));
    if (missing.length || extra.length) c.drift(`documented but not served: [${missing}]; served but undocumented: [${extra}]`);
  } finally { s.close(); }
});
check('Docs', 'extension points in docs/CAPABILITIES.md match listProviders()', async c => {
  const doc = path.join(ROOT, 'docs', 'CAPABILITIES.md');
  if (!existsSync(doc)) { c.note('docs/CAPABILITIES.md not present'); return; }
  const m = readFileSync(doc, 'utf8').match(/Provider status\s*\n+([^\n]+)/);
  if (!m) { c.note('provider paragraph not found'); return; }
  const documented = [...m[1].matchAll(/`([a-z]+)`/g)].map(x => x[1]);
  const live = (listProviders() as any[]).filter(p => p.state === 'extension-point').map(p => p.name);
  const diff = documented.filter(x => !live.includes(x)).concat(live.filter(x => !documented.includes(x)));
  if (diff.length) c.drift(`mismatch: ${diff.join(', ')}`);
});

// ---------------------------------------------------------------- 13. what the platform could not do (informational)
check('Platform', `host summary: ${process.platform}/${process.arch}, Node ${process.version}`, async c => {
  const procs: any = await listProcesses(500);
  c.note(`visible processes (capped at 500): ${procs.findings.length}`);
  const dir = await readdir(HOME).catch(() => []);
  c.note(`artifact kinds written this run: ${dir.join(', ') || 'none'}`);
  assert.ok((await stat(HOME)).isDirectory());
});
