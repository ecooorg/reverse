#!/usr/bin/env node
/**
 * Build the single workflow artifact payload:
 *   detailed-logs.zip  — full ci-logs tree (and optional extra paths)
 *   AI-DEBUG-SUMMARY.md — one failure-only brief (no success noise)
 *
 * Usage: node tests/ci-package-artifacts.mjs [logsDir=ci-logs] [outDir=artifact]
 */
import { mkdir, readdir, readFile, writeFile, cp, rm, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeSummary } from './ci-ai-summary.mjs';

const logsDir = process.argv[2] || 'ci-logs';
const outDir = process.argv[3] || 'artifact';

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

// Generate the single failure brief from whatever logs are present.
await writeSummary({ logsDir, rootDir: '.', outputPath: join(outDir, 'AI-DEBUG-SUMMARY.md') });

// Nested archive of detailed logs (zip when available, otherwise a tar.gz-compatible folder copy).
const zipPath = join(outDir, 'detailed-logs.zip');
const hasZip = spawnSync('zip', ['-v'], { encoding: 'utf8' }).status === 0;
if (hasZip) {
  const result = spawnSync('zip', ['-r', zipPath, logsDir], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
} else {
  // Fallback: copy tree next to the summary under detailed-logs/
  await cp(logsDir, join(outDir, 'detailed-logs'), { recursive: true });
  console.warn('zip not available; copied ci-logs/ to artifact/detailed-logs/');
}

const names = await readdir(outDir);
console.log(`Packaged artifact contents: ${names.join(', ')}`);
