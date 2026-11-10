import { readdir, readFile, writeFile } from 'node:fs/promises';
import { hostname, platform, release, arch, cpus, totalmem } from 'node:os';
import { join } from 'node:path';

const root = 'ci-logs';
const files = await readdir(root).catch(() => []);
const logs = files.filter((name) => name.endsWith('.log')).sort();
const exits = files.filter((name) => name.endsWith('.exit')).sort();
const failures = [];
const sections = [];
for (const name of logs) {
  const content = await readFile(join(root, name), 'utf8').catch(() => '');
  const exitName = name.replace(/\.log$/, '.exit');
  const exitCode = exits.includes(exitName) ? (await readFile(join(root, exitName), 'utf8')).trim() : '0 (no failure marker)';
  const failed = !exitCode.startsWith('0');
  const errorLines = content.split(/\r?\n/).filter((line) => /error|failed|failure|exception|fatal|ERR!|TS\d{4}/i.test(line)).slice(-20);
  if (failed) failures.push({ name, exitCode, errorLines });
  sections.push({ name, exitCode, content, errorLines });
}
const env = (key) => process.env[key] || 'unknown';
const out = [
  '# Reverse CI — AI debugging summary',
  '',
  '> Paste this entire file into an AI assistant to diagnose the run. Full logs are in the companion CI Logs artifact.',
  '',
  '## Run identity',
  `- Workflow: ${env('GITHUB_WORKFLOW')}`,
  `- Job: ${env('GITHUB_JOB')}`,
  `- Run: ${env('GITHUB_RUN_ID')} (attempt ${env('GITHUB_RUN_ATTEMPT')})`,
  `- Event/ref: ${env('GITHUB_EVENT_NAME')} / ${env('GITHUB_REF')}`,
  `- Commit: ${env('GITHUB_SHA')}`,
  `- Runner: ${platform()} ${release()} ${arch()} (${hostname()})`,
  `- Node: ${process.version}; CPUs: ${cpus().length}; RAM GiB: ${(totalmem() / 2 ** 30).toFixed(1)}`,
  '',
  '## Result overview',
  `- Log files captured: ${logs.length}`,
  `- Failed steps with recorded non-zero exit code: ${failures.length}`,
  `- Steps with no failure marker (treated as successful): ${sections.filter((x) => x.exitCode.startsWith('0')).length}`, 
  '',
];
if (!logs.length) out.push('No step log files were found in `ci-logs/`. Check whether the job failed before log initialization.', '');
if (failures.length) {
  out.push('## Failed steps', '');
  for (const item of failures) {
    out.push(`### ${item.name} (exit ${item.exitCode})`);
    if (item.errorLines.length) out.push('Relevant output:', '```text', ...item.errorLines, '```');
    else { const tail = item.content.split(/\r?\n/).filter(Boolean).slice(-40); out.push('Last output lines (no common error signature matched):', '```text', ...(tail.length ? tail : ['(log is empty)']), '```'); }
    out.push('');
  }
} else {
  out.push('## Failed steps', '', 'No non-zero step exit codes were recorded. This does not prove every workflow stage ran; inspect the step inventory below.', '');
}
out.push('## Step inventory', '', '| Log | Exit code | Error-like lines |', '|---|---:|---:|');
for (const item of sections) out.push(`| ${item.name.replace(/\|/g, '\\|')} | ${item.exitCode} | ${item.errorLines.length} |`);
out.push('', '## Diagnostic instructions for the AI assistant', '',
  '1. Treat the recorded command output and exit codes as primary evidence; do not guess at missing output.',
  '2. Identify the earliest failing step, then distinguish its root cause from downstream failures.',
  '3. If this summary lacks enough context, name the exact log filename(s) needed from the companion archive; do not ask for the entire archive by default.',
  '4. Propose the smallest safe repository patch, preserving existing tests and CI gates.',
  '5. State which commands should be rerun to prove the fix and do not claim unobserved checks passed.',
  '', '## Full-log location', '', '`ci-logs/*.log`, matching `.exit` files, and per-step `.summary.md` files are included in the CI Logs artifact.', '');
await writeFile('AI-DEBUG-SUMMARY.md', out.join('\n'));
console.log(`Wrote AI-DEBUG-SUMMARY.md (${logs.length} logs, ${failures.length} recorded failures).`);
