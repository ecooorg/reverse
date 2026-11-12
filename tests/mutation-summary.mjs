#!/usr/bin/env node
/**
 * Mutation score summary for the manual Mutation testing workflow.
 * Reads the Stryker JSON report, prints a Markdown table with the run identity and keeps a copy for the artifact.
 * It never fails the job: the floor is enforced by `thresholds.break` in stryker.config.json.
 *
 * Usage: node tests/mutation-summary.mjs [report=reports/mutation/mutation.json] [copyTo=ci-logs/mutation-report.json]
 */
import { copyFile, readFile } from 'node:fs/promises';

const reportPath = process.argv[2] || 'reports/mutation/mutation.json';
const copyTo = process.argv[3];
const e = process.env;
const lines = [`# Mutation testing — run ${e.GITHUB_RUN_ID ?? 'unknown'} (#${e.GITHUB_RUN_NUMBER ?? 'unknown'})`, ''];

let report = null;
try {
  report = JSON.parse(await readFile(reportPath, 'utf8'));
} catch (error) {
  lines.push(`No mutation report at ${reportPath}: ${error instanceof Error ? error.message : String(error)}`);
}

if (report) {
  const sum = (counts) => {
    const detected = (counts.Killed ?? 0) + (counts.Timeout ?? 0);
    const total = Object.values(counts).reduce((n, c) => n + c, 0);
    const valid = total - (counts.CompileError ?? 0) - (counts.Ignored ?? 0);
    return { detected, valid, survived: counts.Survived ?? 0, noCoverage: counts.NoCoverage ?? 0 };
  };
  const all = {};
  lines.push('| File | Score | Detected | Survived | No coverage | Valid mutants |', '|---|---|---|---|---|---|');
  const row = (name, counts) => {
    const s = sum(counts);
    const score = s.valid ? ((s.detected / s.valid) * 100).toFixed(2) : 'n/a';
    lines.push(`| ${name} | ${score} % | ${s.detected} | ${s.survived} | ${s.noCoverage} | ${s.valid} |`);
  };
  for (const [file, value] of Object.entries(report.files ?? {})) {
    const counts = {};
    for (const mutant of value.mutants ?? []) {
      counts[mutant.status] = (counts[mutant.status] ?? 0) + 1;
      all[mutant.status] = (all[mutant.status] ?? 0) + 1;
    }
    row(file, counts);
  }
  row('**All files**', all);
  const floor = report.thresholds?.break ?? 'none';
  lines.push('', `Floor (thresholds.break): ${floor} %. Commit: ${e.GITHUB_SHA ?? 'unknown'}.`);
  if (copyTo) await copyFile(reportPath, copyTo);
}
console.log(lines.join('\n'));
