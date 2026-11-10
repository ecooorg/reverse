import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildSummary, writeSummary } from './ci-ai-summary.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'reverse-ci-summary-'));
  const logsDir = path.join(root, 'ci-logs');
  await mkdir(logsDir);
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, logsDir };
}

const host = { hostname: 'test-runner', platform: 'linux', release: 'test', arch: 'x64', cpuCount: 2, ramGiB: '4.0' };
const env = { GITHUB_WORKFLOW: 'Test', GITHUB_JOB: 'test', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: 'abc123' };

test('summarizes a formatter failure with exact path and line even without a known signature', async (t) => {
  const { root, logsDir } = await fixture(t);
  await writeFile(path.join(logsDir, '02-static-quality-gates.log'), '> reverse-compact@1.1.0-beta.1 format:check\n> node tests/format-check.mjs\nTypeScript formatting drift in 1 file(s):\ntests/legacy-windows.test.ts\n');
  await writeFile(path.join(logsDir, '02-static-quality-gates.exit'), '1\n');
  const { markdown, stats } = await buildSummary({ rootDir: root, logsDir, env, host });
  assert.equal(stats.failures, 1);
  assert.match(markdown, /Earliest recorded failure/);
  assert.match(markdown, /Formatting gate/);
  assert.match(markdown, /tests\/legacy-windows\.test\.ts/);
  assert.match(markdown, /npm run format:check/);
});

test('classifies a size-gate failure correctly when format:check passed earlier', async (t) => {
  const { root, logsDir } = await fixture(t);
  const log = [
    '> reverse-compact@1.1.0-beta.1 format:check',
    '> node tests/format-check.mjs',
    'TypeScript formatting check passed.',
    '> reverse-compact@1.1.0-beta.1 size:check',
    '> node tests/size-gate.mjs',
    'Line length gate failed: 1 line(s) longer than 140 characters:',
    'tests/legacy-windows.test.ts:76 (158 chars)',
  ].join('\n');
  await writeFile(path.join(logsDir, '02-static-quality-gates.log'), log);
  await writeFile(path.join(logsDir, '02-static-quality-gates.exit'), '1\n');
  const { markdown } = await buildSummary({ rootDir: root, logsDir, env, host });
  assert.match(markdown, /Line-length \/ size gate/);
  assert.match(markdown, /tests\/legacy-windows\.test\.ts:76/);
  assert.match(markdown, /npm run size:check/);
});

test('extracts TypeScript compiler file and line coordinates', async (t) => {
  const { root, logsDir } = await fixture(t);
  await writeFile(path.join(logsDir, '03-build.log'), 'src/legacy-windows.ts(70,21): error TS1156: const declarations can only be declared inside a block.\n');
  await writeFile(path.join(logsDir, '03-build.exit'), '2\n');
  const { markdown } = await buildSummary({ rootDir: root, logsDir, env, host });
  assert.match(markdown, /TypeScript compilation/);
  assert.match(markdown, /src\/legacy-windows\.ts\(70,21\)/);
  assert.match(markdown, /TS1156/);
});

test('keeps stack frames with runtime exceptions', async (t) => {
  const { root, logsDir } = await fixture(t);
  await writeFile(path.join(logsDir, '04-summary.log'), 'TypeError: Cannot read properties of undefined\n    at buildSummary (tests/ci-ai-summary.mjs:47:20)\n    at async run (tests/runner.mjs:12:3)\n');
  await writeFile(path.join(logsDir, '04-summary.exit'), '1\n');
  const { markdown } = await buildSummary({ rootDir: root, logsDir, env, host });
  assert.match(markdown, /tests\/ci-ai-summary\.mjs:47:20/);
  assert.match(markdown, /tests\/runner\.mjs:12:3/);
});

test('falls back to a safe output tail for unknown failure formats', async (t) => {
  const { root, logsDir } = await fixture(t);
  await writeFile(path.join(logsDir, '05-unknown.log'), 'runner returned status 17\nlast diagnostic payload: unusual-provider-code\n');
  await writeFile(path.join(logsDir, '05-unknown.exit'), '17\n');
  const { markdown, stats } = await buildSummary({ rootDir: root, logsDir, env, host });
  assert.equal(stats.failures, 1);
  assert.match(markdown, /Unclassified failure/);
  assert.match(markdown, /unusual-provider-code/);
});

test('handles empty logs and missing exit markers without throwing or claiming success', async (t) => {
  const { root, logsDir } = await fixture(t);
  await writeFile(path.join(logsDir, '01-empty.log'), '');
  await writeFile(path.join(logsDir, '02-unmarked.log'), 'TypeError: sample diagnostic\n');
  const { markdown, stats } = await buildSummary({ rootDir: root, logsDir, env, host });
  assert.equal(stats.logs, 2);
  assert.match(markdown, /NO MARKER/);
  assert.match(markdown, /may be successful or skipped/);
  assert.match(markdown, /TypeError: sample diagnostic/);
  assert.match(markdown, /01-empty\.log.*contains no output/);
});

test('summarizes JUnit failures and redacts common secrets', async (t) => {
  const { root, logsDir } = await fixture(t);
  const reports = path.join(root, 'capability-reports');
  await mkdir(reports);
  await writeFile(path.join(logsDir, '07-tests.log'), 'test command completed with report\n');
  await writeFile(path.join(reports, 'junit-linux.xml'), '<testsuite><testcase classname="suite" name="fails"><failure message="assertion failed">Expected true</failure></testcase></testsuite>');
  await writeFile(path.join(reports, 'capability-linux.json'), JSON.stringify({ platform: 'linux', node: 'v22.0.0', totals: { verified: 10, limitation: 2, drift: 1, failed: 1 }, records: [{ area: 'Build', name: 'compiler', status: 'failed', detail: 'TS1156 in src/legacy-windows.ts' }, { area: 'Docs', name: 'roadmap', status: 'drift', detail: 'Status mismatch' }] }));
  await mkdir(path.join(root, 'reports'));
  await writeFile(path.join(root, 'reports', 'capability-windows.json'), JSON.stringify({ platform: 'win32', node: 'v22.0.0', totals: { verified: 4, limitation: 0, drift: 0, failed: 1 }, records: [{ area: 'CLI', name: 'entry point', status: 'failed', detail: 'missing executable' }] }));
  await writeFile(path.join(root, 'reports', 'junit-windows.xml'), '<testsuite><testcase classname="cli" name="does not launch"><error message="spawn failed">ENOENT</error></testcase></testsuite>');
  await writeFile(path.join(logsDir, '08-secret.log'), 'Bearer abc.def.ghi\n');
  await writeFile(path.join(logsDir, '08-secret.exit'), '1\n');
  const { markdown, stats } = await buildSummary({ rootDir: root, logsDir, env, host });
  assert.equal(stats.junitFailures, 2);
  assert.equal(stats.capabilityIssues, 3);
  assert.match(markdown, /Capability JSON reports: 2; failed\/drift checks: 3/);
  assert.match(markdown, /FAILED — Build \/ compiler.*TS1156 in src\/legacy-windows\.ts/);
  assert.match(markdown, /reports\/capability-windows\.json/);
  assert.match(markdown, /suite — fails/);
  assert.match(markdown, /cli — does not launch/);
  assert.match(markdown, /REDACTED/);
  assert.doesNotMatch(markdown, /abc\.def\.ghi/);
});

test('does not mistake its own in-progress output log for a failed workflow step', async (t) => {
  const { root, logsDir } = await fixture(t);
  await writeFile(path.join(logsDir, '01-real-step.log'), 'Build passed\n');
  await writeFile(path.join(logsDir, '07-generate-ai-debugging-summary.log'), '');
  await writeFile(path.join(logsDir, '07-generate-ai-debugging-summary.summary.md'), '');
  const { markdown, stats } = await buildSummary({ rootDir: root, logsDir, env, host });
  assert.equal(stats.logs, 1);
  assert.doesNotMatch(markdown, /07-generate-ai-debugging-summary/);
});

test('writes a standalone summary when the log directory is absent', async (t) => {
  const { root } = await fixture(t);
  const outputPath = path.join(root, 'AI-DEBUG-SUMMARY.md');
  const stats = await writeSummary({ logsDir: path.join(root, 'missing'), rootDir: root, outputPath, env, host });
  const markdown = await readFile(outputPath, 'utf8');
  assert.equal(stats.logs, 0);
  assert.match(markdown, /No step logs found/);
});


test('prioritizes capability test failures over incidental formatting words', async (t) => {
  const { root, logsDir } = await fixture(t);
  const log = [
    'Running capability suite',
    '✔ Docs — formatting guidance is current (1.2ms)',
    '✖ Docs — every audit ID is tracked in the approved backlog (3.6ms)',
    '  AssertionError [ERR_ASSERTION]: IDs missing from the approved audit backlog',
    "  actual: [ 'F-63', 'F-64', 'F-65' ]",
    '✖ MCP — handshake: initialize, ping and tools/list (50ms)',
    '  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal',
    "  + 'analyze_legacy_windows'",
    'Formatting gate is also mentioned in an unrelated capability description.',
  ].join('\n');
  await writeFile(path.join(logsDir, '07-exercise-capabilities.log'), log);
  await writeFile(path.join(logsDir, '07-exercise-capabilities.exit'), '1\n');
  const { markdown } = await buildSummary({ rootDir: root, logsDir, env, host });
  assert.match(markdown, /Test \/ capability suite failure/);
  assert.doesNotMatch(markdown, /Category: Formatting gate/);
  assert.match(markdown, /every audit ID is tracked in the approved backlog/);
  assert.match(markdown, /MCP — handshake: initialize, ping and tools\/list/);
  assert.match(markdown, /F-63/);
});

test('lists actionable capability report records and JUnit failures even when step logs are sparse', async (t) => {
  const { root, logsDir } = await fixture(t);
  const reports = path.join(root, 'capability-reports');
  await mkdir(reports);
  await writeFile(path.join(logsDir, '09-capability-report.log'), 'capability report emitted\n');
  await writeFile(path.join(logsDir, '09-capability-report.exit'), '1\n');
  await writeFile(path.join(reports, 'capability-linux.json'), JSON.stringify({
    platform: 'linux', node: 'v22.0.0', totals: { verified: 10, limitation: 1, drift: 0, failed: 2 },
    records: [
      { area: 'Docs', name: 'audit backlog', status: 'failed', detail: "IDs missing: F-63, F-64, F-65" },
      { area: 'MCP', name: 'tools/list', status: 'failed', detail: 'Expected 60 tools, got 58' },
    ],
  }));
  await writeFile(path.join(reports, 'junit-linux.xml'), '<testsuite><testcase classname="mcp" name="tools list"><failure message="tool names differ">analyze_legacy_windows missing</failure></testcase></testsuite>');
  const { markdown, stats } = await buildSummary({ rootDir: root, logsDir, env, host });
  assert.equal(stats.capabilityIssues, 2);
  assert.equal(stats.junitFailures, 1);
  assert.match(markdown, /F-63, F-64, F-65/);
  assert.match(markdown, /Expected 60 tools, got 58/);
  assert.match(markdown, /analyze_legacy_windows missing/);
});
