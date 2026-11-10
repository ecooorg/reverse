import { readdir, readFile, writeFile } from 'node:fs/promises';
import { hostname, platform, release, arch, cpus, totalmem } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_LOG_DIR = 'ci-logs';
const MAX_EXCERPT_LINES = 100;
const MAX_EXCERPT_CHARS = 18000;
const MAX_SUMMARY_CHARS = 120000;

const ERROR_PATTERN = /(?:\berror\b|\bfailed\b|\bfailure\b|\bexception\b|\bfatal\b|\bERR!\b|\bTS\d{4}\b|\bnot ok\b|\bAssertionError\b|\bTypeError\b|\bReferenceError\b|\bSyntaxError\b|\bTimeoutError\b|\bdrift\b|\bno tests? found\b|(?:^|\s)✖(?:\s|$))/i;
const WARNING_PATTERN = /(?:\bwarning\b|\bwarn\b|\bdeprecated\b|\bskipped\b|\bTODO\b)/i;
const SECRET_PATTERNS = [
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/gi, '[REDACTED_GITHUB_TOKEN]'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '[REDACTED_GITHUB_TOKEN]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED_AWS_KEY]'],
  [/(\bBearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[REDACTED]'],
  [/(([A-Z0-9_]*(?:TOKEN|PASSWORD|SECRET|API_KEY|ACCESS_KEY))\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]'],
];

function redact(value) {
  let result = String(value ?? '');
  for (const [pattern, replacement] of SECRET_PATTERNS) result = result.replace(pattern, replacement);
  return result;
}

function normalizeExitCode(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const match = text.match(/^-?\d+$/);
  return match ? Number(text) : text.slice(0, 80);
}

function classifyFailure(name, content) {
  const text = `${name}\n${content}`.toLowerCase();
  // Concrete compiler/runtime/test evidence must win over incidental words in
  // a capability name or a later summary (for example, a test named 'Formatting').
  if (/\bts\d{4}\b|typescript.*error|error ts\d{4}|tsc -p/.test(text)) return 'TypeScript compilation';
  if (/typeerror|referenceerror|syntaxerror|uncaught exception|\berr_test_failure\b/.test(text)) return 'Runtime / test-runner exception';
  if (/(?:^|\n)\s*✖\s|not ok \d+|assertionerror|testcodefailure|test failed|tests? failed|failed test cases?|reverse capability failed/.test(text)) return 'Test / capability suite failure';
  if (/line length|too long|characters?\)/.test(text)) return 'Line-length / size gate';
  if (/format:check|formatter|formatting drift|typescript format check failed/.test(text)) return 'Formatting gate';
  if (/npm err!|npm ci|eresolve|enoent|cannot find package|module_not_found/.test(text)) return 'Dependency / package setup';
  if (/timed? ?out|timeout|signal: sigterm|job was cancelled/.test(text)) return 'Timeout / cancellation';
  if (/structure check|import graph|markdown link|unexpected file|layout/.test(text)) return 'Repository structure';
  if (/audit|vulnerabilit|signature|sbom/.test(text)) return 'Supply-chain / security check';
  if (/\berror\b|\bfailed\b|\bfailure\b/.test(text)) return 'Unclassified command failure';
  return 'Unclassified failure';
}

function extractTestFailureNames(lines) {
  const found = [];
  for (const line of lines) {
    const tap = line.match(/^\s*(?:✖\s+|not ok\s+\d+\s+-\s+)(.+?)(?:\s+\([\d.]+ms\))?\s*$/);
    if (tap) found.push(redact(tap[1]));
    const annotation = line.match(/::error title=Reverse capability failed::(.+)$/);
    if (annotation) found.push(redact(annotation[1].replace(/%0A/g, ' ').replace(/%25/g, '%')));
  }
  return [...new Set(found)].slice(0, 50);
}

function extractFileReferences(lines) {
  const found = new Set();
  const pattern = /(?:[A-Za-z0-9_.@-]+[\\/])+[A-Za-z0-9_.@-]+\.(?:[cm]?[jt]sx?|json|yml|yaml|md)(?:(?::\d+(?::\d+)?)|\(\d+,\d+\))?/g;
  for (const line of lines) {
    for (const match of line.matchAll(pattern)) found.add(match[0].replace(/\\/g, '/'));
  }
  return [...found].slice(0, 40);
}

function extractCommands(lines) {
  const commands = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^>\s+[^ ]+@[^ ]+\s+[A-Za-z0-9:_-]+$/.test(trimmed)) {
      commands.push(redact(`npm run ${trimmed.split(/\s+/).at(-1)}`));
    } else if (/^(?:>\s|\$\s|\+\s)(?:npm|npx|node|tsc|git|pnpm|yarn|bun|reverse)\b/i.test(trimmed)) {
      commands.push(redact(trimmed.replace(/^(?:>\s|\$\s|\+\s)/, '')));
    }
  }
  return [...new Set(commands)].slice(0, 20);
}

function collectContext(lines, indexes, radius = 2) {
  const selected = new Set();
  for (const index of indexes) {
    for (let cursor = Math.max(0, index - radius); cursor <= Math.min(lines.length - 1, index + radius); cursor += 1) {
      selected.add(cursor);
    }
    if (/\b(?:TypeError|ReferenceError|SyntaxError|AssertionError|Error|Exception)\b/.test(lines[index])) {
      let frames = 0;
      for (let cursor = index + 1; cursor < lines.length && frames < 15; cursor += 1) {
        if (/^\s*(?:at\s|Caused by:|\.{3}\s+\d+\s+more)/.test(lines[cursor])) {
          selected.add(cursor);
          frames += 1;
        } else if (lines[cursor].trim()) {
          break;
        }
      }
    }
  }
  return [...selected].sort((a, b) => a - b).map((index) => `${index + 1}: ${redact(lines[index])}`);
}

function excerptFor(content) {
  const lines = String(content ?? '').split(/\r?\n/);
  const errorIndexes = [];
  const warningIndexes = [];
  lines.forEach((line, index) => {
    if (ERROR_PATTERN.test(line)) errorIndexes.push(index);
    else if (WARNING_PATTERN.test(line)) warningIndexes.push(index);
  });

  let excerpt;
  let kind;
  if (errorIndexes.length) {
    excerpt = collectContext(lines, errorIndexes, 2);
    kind = 'diagnostic matches with surrounding context';
  } else {
    const nonEmpty = lines.map((line, index) => ({ line, index })).filter((item) => item.line.trim());
    excerpt = nonEmpty.slice(-Math.min(MAX_EXCERPT_LINES, nonEmpty.length)).map(({ line, index }) => `${index + 1}: ${redact(line)}`);
    kind = 'last output lines (no known error signature matched)';
  }

  if (excerpt.length > MAX_EXCERPT_LINES) {
    excerpt = [...excerpt.slice(0, 35), `... ${excerpt.length - 75} context lines omitted ...`, ...excerpt.slice(-40)];
  }
  let rendered = excerpt.join('\n');
  if (rendered.length > MAX_EXCERPT_CHARS) rendered = `${rendered.slice(0, MAX_EXCERPT_CHARS)}\n... excerpt truncated ...`;
  return {
    kind,
    text: rendered || '(log is empty)',
    errorCount: errorIndexes.length,
    warningCount: warningIndexes.length,
    fileReferences: extractFileReferences(lines),
    commands: extractCommands(lines),
    testFailures: extractTestFailureNames(lines),
    errorLines: errorIndexes.slice(0, 100).map((index) => `${index + 1}: ${redact(lines[index])}`),
  };
}

async function readText(file) {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return '';
  }
}

async function readJUnitReports(rootDir) {
  const reports = [];
  for (const directory of ['capability-reports', 'reports']) {
    const reportDir = join(rootDir, directory);
    const names = await readdir(reportDir).catch(() => []);
    const xmlNames = names.filter((name) => name.endsWith('.xml')).sort();
    for (const name of xmlNames) {
      const xml = await readText(join(reportDir, name));
      const cases = [...xml.matchAll(/<testcase\b([\s\S]*?)>([\s\S]*?)<\/testcase>/g)];
      const failed = [];
      let skipped = 0;
      for (const [, attributes, body] of cases) {
        if (/<failure\b|<error\b/.test(body)) {
          const caseName = (attributes.match(/\bname="([^"]*)"/) ?? [])[1] ?? 'unnamed test';
          const suite = (attributes.match(/\bclassname="([^"]*)"/) ?? [])[1] ?? '';
          const message = (body.match(/<(?:failure|error)\b[^>]*message="([^"]*)"/) ?? [])[1] ?? '';
          const detail = (body.match(/<(?:failure|error)\b[^>]*>([\s\S]*?)<\/(?:failure|error)>/) ?? [])[1] ?? '';
          failed.push({ suite, name: caseName, message: redact(message.replaceAll('&quot;', '"').replaceAll('&amp;', '&')), detail: redact(detail.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')).slice(0, 3000) });
        }
        if (/<skipped\b/.test(body)) skipped += 1;
      }
      reports.push({ name: `${directory}/${name}`, total: cases.length, failed, skipped });
    }
  }
  return reports;
}

async function readCapabilityReports(rootDir) {
  const reports = [];
  for (const directory of ['capability-reports', 'reports']) {
    const reportDir = join(rootDir, directory);
    const names = await readdir(reportDir).catch(() => []);
    const jsonNames = names.filter((name) => name.endsWith('.json')).sort();
    for (const name of jsonNames) {
      const displayName = `${directory}/${name}`;
      try {
        const report = JSON.parse(await readText(join(reportDir, name)));
        const records = Array.isArray(report.records) ? report.records : [];
        const actionable = records.filter((record) => record.status === 'failed' || record.status === 'drift');
        reports.push({
          name: displayName,
          platform: report.platform ?? 'unknown',
          node: report.node ?? 'unknown',
          totals: report.totals ?? {},
          actionable,
        });
      } catch (error) {
        reports.push({ name: displayName, parseError: error instanceof Error ? error.message : String(error), actionable: [] });
      }
    }
  }
  return reports;
}

function environmentLines(env, host) {
  const value = (key) => env[key] || 'unknown';
  return [
    `- Workflow: ${value('GITHUB_WORKFLOW')}`,
    `- Job: ${value('GITHUB_JOB')}`,
    `- Run: ${value('GITHUB_RUN_ID')} (attempt ${value('GITHUB_RUN_ATTEMPT')})`,
    `- Event/ref: ${value('GITHUB_EVENT_NAME')} / ${value('GITHUB_REF')}`,
    `- Commit: ${value('GITHUB_SHA')}`,
    `- Run URL: ${value('GITHUB_SERVER_URL') !== 'unknown' && value('GITHUB_REPOSITORY') !== 'unknown' && value('GITHUB_RUN_ID') !== 'unknown' ? `${value('GITHUB_SERVER_URL')}/${value('GITHUB_REPOSITORY')}/actions/runs/${value('GITHUB_RUN_ID')}` : 'unknown'}`,
    `- Matrix: OS=${value('RUNNER_OS')}, image=${value('ImageOS')}, arch=${host.arch}`,
    `- Runner: ${host.platform} ${host.release} ${host.arch} (${host.hostname})`,
    `- Node: ${process.version}; CPUs: ${host.cpuCount}; RAM GiB: ${host.ramGiB}`,
  ];
}

export async function buildSummary({ logsDir = DEFAULT_LOG_DIR, rootDir = '.', env = process.env, host = null } = {}) {
  const names = await readdir(logsDir).catch(() => []);
  const isGeneratorSidecar = (name) => /^\d+-generate-ai-debugging-summary\.(?:log|exit|summary\.md)$/.test(name);
  const logNames = names.filter((name) => name.endsWith('.log') && !isGeneratorSidecar(name)).sort();
  const exitNames = new Set(names.filter((name) => name.endsWith('.exit') && !isGeneratorSidecar(name)));
  const summaries = new Set(names.filter((name) => name.endsWith('.summary.md') && !isGeneratorSidecar(name)));
  const hostInfo = host ?? {
    hostname: hostname(), platform: platform(), release: release(), arch: arch(),
    cpuCount: cpus().length, ramGiB: (totalmem() / 2 ** 30).toFixed(1),
  };
  const steps = [];

  for (const name of logNames) {
    const content = await readText(join(logsDir, name));
    const exitName = name.replace(/\.log$/, '.exit');
    const hasExit = exitNames.has(exitName);
    const exitRaw = hasExit ? await readText(join(logsDir, exitName)) : '';
    const exitCode = hasExit ? normalizeExitCode(exitRaw) : null;
    const failed = exitCode !== null && exitCode !== 0;
    const excerpt = excerptFor(content);
    const summaryName = name.replace(/\.log$/, '.summary.md');
    const stepSummary = summaries.has(summaryName) ? await readText(join(logsDir, summaryName)) : '';
    steps.push({ name, content, exitCode, hasExit, failed, excerpt, stepSummary });
  }

  const failures = steps.filter((step) => step.failed);
  const suspicious = steps.filter((step) => !step.failed && step.excerpt.errorCount > 0);
  const emptyLogs = steps.filter((step) => !step.content.trim());
  const junit = await readJUnitReports(rootDir);
  const capabilityReports = await readCapabilityReports(rootDir);
  const capabilityIssues = capabilityReports.flatMap((report) => report.actionable.map((item) => ({ ...item, report: report.name })));
  const junitFailures = junit.flatMap((report) => report.failed.map((item) => ({ ...item, report: report.name })));
  const completed = steps.filter((step) => step.hasExit && step.exitCode === 0).length;
  const noMarker = steps.filter((step) => !step.hasExit).length;
  const invalidMarkers = steps.filter((step) => step.hasExit && step.exitCode === null).length;
  const out = [
    '# Reverse CI — AI debugging report',
    '',
    '> Paste this complete file into an AI assistant. It is designed to identify the earliest failure and propose a minimal fix without requiring the companion ZIP. Logs remain the source of truth.',
    '',
    '## 1. Run identity',
    ...environmentLines(env, hostInfo),
    '',
    '## 2. Executive diagnosis',
    `- Log files found: ${steps.length}`,
    `- Recorded failed steps: ${failures.length}`,
    `- Explicitly successful steps (exit marker = 0): ${completed}`,
    `- Steps without an exit marker: ${noMarker} (may be successful or skipped; the current workflow marker format cannot distinguish these states).`,
    `- Invalid/empty exit markers: ${invalidMarkers}` ,
    `- Empty log files: ${emptyLogs.length}` ,
    `- Capability JSON reports: ${capabilityReports.length}; failed/drift checks: ${capabilityIssues.length}`,
    `- JUnit reports found: ${junit.length}; failed test cases: ${junitFailures.length}`,
  ];

  if (failures.length) {
    const first = failures[0];
    out.push(`- **Earliest recorded failure:** \`${first.name}\` (exit ${first.exitCode}).`, `- **Failure category:** ${classifyFailure(first.name, first.content)}.`, '- The first failed step is the starting point for root-cause analysis; later failures may be downstream effects.');
  } else if (junitFailures.length || capabilityIssues.length) {
    out.push('- **Test/capability failure evidence:** structured reports contain failed cases or drift records. Inspect the named checks below, even if no non-zero step marker was recorded.');
  } else if (suspicious.length) {
    out.push('- **Review required:** error-like output exists in logs without a recorded non-zero exit code. Do not assume the workflow failed until the command status is confirmed.');
  } else if (!steps.length) {
    out.push('- **No step logs found.** The job may have failed before log initialization, or the expected `ci-logs/` directory was not uploaded.');
  } else {
    out.push('- No non-zero exit marker or JUnit failure was found. This is not proof that every expected workflow step ran.');
  }
  out.push('');

  if (failures.length) {
    out.push('## 3. Failed steps — evidence and context', '');
    for (const step of failures) {
      const category = classifyFailure(step.name, step.content);
      out.push(`### ${step.name}`, `- Exit code: \`${step.exitCode}\``, `- Category: ${category}`, `- Error-like lines: ${step.excerpt.errorCount}; warning-like lines: ${step.excerpt.warningCount}`);
      if (step.excerpt.commands.length) out.push(`- Commands detected: ${step.excerpt.commands.map((command) => `\`${command}\``).join('; ')}`);
      if (step.excerpt.testFailures.length) {
        out.push('- Test/capability failure markers:');
        for (const failure of step.excerpt.testFailures) out.push(`  - ${failure}`);
      }
      if (step.excerpt.fileReferences.length) out.push(`- File/line references: ${step.excerpt.fileReferences.map((file) => `\`${file}\``).join(', ')}`);
      out.push('', `**${step.excerpt.kind}:**`, '```text', step.excerpt.text, '```', '');
      if (step.stepSummary.trim()) out.push('**Step summary:**', '```text', redact(step.stepSummary.trim()).slice(0, 6000), '```', '');
    }
  }

  if (emptyLogs.length) {
    out.push('## Empty or unavailable step output', '');
    for (const step of emptyLogs) out.push(`- \`${step.name}\`: log file exists but contains no output; inspect its exit marker and workflow step condition.`);
    out.push('');
  }

  if (capabilityReports.length) {
    out.push('## 4. Capability report details (JSON)', '');
    for (const report of capabilityReports) {
      const totals = report.totals ?? {};
      out.push(`### ${report.name}`, `- Environment: ${report.platform ?? 'unknown'} / Node ${report.node ?? 'unknown'}`, `- Totals: verified=${totals.verified ?? '?'}, limitation=${totals.limitation ?? '?'}, drift=${totals.drift ?? '?'}, failed=${totals.failed ?? '?'}`);
      if (report.parseError) out.push(`- JSON parse error: ${redact(report.parseError)}`);
      for (const issue of report.actionable ?? []) out.push(`- **${issue.status.toUpperCase()} — ${issue.area} / ${issue.name}:** ${redact(issue.detail ?? '')}`);
      out.push('');
    }
  }

  if (junit.length) {
    out.push('## 5. Test report details (JUnit)', '');
    for (const report of junit) {
      out.push(`### ${report.name}`, `- Test cases: ${report.total}; failed: ${report.failed.length}; skipped: ${report.skipped}`);
      for (const item of report.failed) {
        out.push(`- **${item.suite ? `${item.suite} — ` : ''}${item.name}**${item.message ? `: ${item.message}` : ''}`);
        if (item.detail) out.push('  ```text', ...item.detail.split(/\r?\n/).slice(0, 35).map((line) => `  ${line}`), '  ```');
      }
      out.push('');
    }
  }

  if (suspicious.length) {
    out.push('## 6. Error-like output without a failed exit marker', '');
    for (const step of suspicious) {
      out.push(`### ${step.name}`, `- Exit marker: ${step.hasExit ? String(step.exitCode) : 'not recorded'}`, '```text', step.excerpt.errorLines.slice(0, 30).join('\n') || '(no matching lines)', '```', '');
    }
  }

  out.push('## 7. Complete step inventory', '', '| Step log | Status evidence | Exit code | Error-like lines | Warnings |', '|---|---|---:|---:|---:|');
  for (const step of steps) {
    const status = step.failed ? 'FAILED' : step.hasExit && step.exitCode === null ? 'INVALID EXIT' : !step.content.trim() ? 'EMPTY LOG' : step.hasExit ? 'EXIT 0' : 'NO MARKER';
    out.push(`| ${step.name.replace(/\|/g, '\\|')} | ${status} | ${step.exitCode ?? 'not recorded'} | ${step.excerpt.errorCount} | ${step.excerpt.warningCount} |`);
  }
  out.push('');

  const sidecarsWithoutLogs = [...summaries].filter((name) => !logNames.includes(name.replace(/\.summary\.md$/, '.log')));
  if (sidecarsWithoutLogs.length) {
    out.push('## 8. Step summaries without matching log files', '');
    for (const name of sidecarsWithoutLogs) {
      const content = redact((await readText(join(logsDir, name))).trim()).slice(0, 5000);
      out.push(`### ${name}`, '```text', content || '(summary file is empty)', '```', '');
    }
  }

  out.push(
    '## 9. Instructions for the AI assistant',
    '',
    '1. Start with the earliest recorded failed step, not the last visible symptom. Separate primary causes from downstream failures.',
    '2. Use the exact error text, command, file path and line number above as evidence. Do not invent missing diagnostics.',
    '3. Prefer concrete compiler diagnostics, assertion failures, TAP failure names, capability JSON records and JUnit details over broad keyword matches. Do not classify a test failure as formatting merely because a test or summary mentions formatting.',
    '4. If evidence is insufficient, request only the named missing log or report file; do not request the whole archive by default.',
    '5. Provide the exact commands to rerun and clearly label checks that have not actually been run.',
    '6. Correlate duplicate evidence across step logs, GitHub annotations, capability JSON and JUnit; report each root cause once while preserving every affected check/test name.',
    '7. Do not claim a fix or a green CI run until the relevant checks have been executed successfully.',
    '',
    '## 10. Companion artifact',
    '',
    '- Detailed logs, `.exit` markers and per-step `.summary.md` files: `ci-logs/` in the companion CI Logs ZIP.',
    '- Optional capability JUnit reports: `capability-reports/*.xml` (summarized above when present).',
    '- This report is a diagnostic index and evidence digest, not a replacement for raw logs. Secret-like values are redacted where recognized.',
    '',
  );

  let markdown = out.join('\n');
  if (markdown.length > MAX_SUMMARY_CHARS) {
    markdown = `${markdown.slice(0, MAX_SUMMARY_CHARS)}\n\n> Report truncated at ${MAX_SUMMARY_CHARS} characters to keep it practical to paste into a chat. Use the named log files in the companion artifact for omitted details.\n`;
  }
  return { markdown, stats: { logs: steps.length, failures: failures.length, junitFailures: junitFailures.length, capabilityIssues: capabilityIssues.length, suspicious: suspicious.length } };
}

export async function writeSummary({ logsDir = DEFAULT_LOG_DIR, rootDir = '.', outputPath = 'AI-DEBUG-SUMMARY.md', env = process.env, host = null } = {}) {
  const result = await buildSummary({ logsDir, rootDir, env, host });
  await writeFile(outputPath, result.markdown);
  return result.stats;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (invokedPath === import.meta.url) {
  const stats = await writeSummary();
  console.log(`Wrote AI-DEBUG-SUMMARY.md (${stats.logs} logs, ${stats.failures} failed steps, ${stats.junitFailures} failed test cases, ${stats.capabilityIssues} capability issues).`);
}
