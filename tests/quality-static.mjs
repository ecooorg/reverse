#!/usr/bin/env node
/** Lightweight static hygiene (R-05 partial): no new dependencies. */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const issues = [];

async function walk(dir, files = []) {
  for (const n of await readdir(dir, { withFileTypes: true })) {
    if (n.name === 'node_modules' || n.name === 'dist' || n.name === 'dist-tests') continue;
    const p = path.join(dir, n.name);
    if (n.isDirectory()) await walk(p, files);
    else if (n.name.endsWith('.ts')) files.push(p);
  }
  return files;
}

const files = await walk(path.join(root, 'src'));
const texts = new Map();
for (const f of files) texts.set(f, await readFile(f, 'utf8'));

// duplicate identical files (jscpd-lite)
const byHash = new Map();
for (const [f, t] of texts) {
  if (t.length < 200) continue;
  const key = t.replace(/\s+/g, ' ').slice(0, 2000);
  if (!byHash.has(key)) byHash.set(key, []);
  byHash.get(key).push(f);
}
for (const [, group] of byHash) {
  if (group.length > 1) issues.push(`duplicate-ish sources: ${group.map(g => path.relative(root, g)).join(', ')}`);
}

// forbid TODO/FIXME in src (hygiene)
for (const [f, t] of texts) {
  if (/\bTODO\b|\bFIXME\b/.test(t)) {
    issues.push(`TODO/FIXME in ${path.relative(root, f)}`);
  }
}

if (issues.length) {
  console.error('quality-static findings:');
  for (const i of issues) console.error(' -', i);
  process.exit(1);
}
console.log(`quality-static ok (${files.length} src files)`);
