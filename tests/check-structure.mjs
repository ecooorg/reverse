#!/usr/bin/env node
// Repository integrity checks that need no build tools:
//   1. flat layout: no file deeper than one folder, except under .github
//   2. every relative Markdown link points at an existing file
//   3. every relative import in src/*.ts points at an existing src/*.ts file
//   4. package.json bin/exports/files targets exist (run with --built after `npm run build`)
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const built = process.argv.includes('--built');
const errors = [];
const IGNORE = new Set(['node_modules', '.git', 'dist', 'dist-tests', '.crea', 'coverage', '.tmp-pack', '.tmp-consumer']);

function walk(dir, depth, acc) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, depth + 1, acc); else acc.push({ p, depth });
  }
  return acc;
}
const files = walk('.', 0, []);

// 1. flat layout
for (const { p, depth } of files) {
  const top = p.split(path.sep)[0];
  if (depth >= 2 && top !== '.github') errors.push(`nested too deep (max one folder level, except .github): ${p}`);
}

// 2. markdown links
for (const { p } of files.filter(f => f.p.endsWith('.md'))) {
  const text = readFileSync(p, 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const href = m[1].split('#')[0];
    if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
    if (!existsSync(path.join(path.dirname(p), href))) errors.push(`${p}: broken link -> ${m[1]}`);
  }
}

// 3. src import graph
const srcDir = 'src';
if (existsSync(srcDir)) {
  for (const f of readdirSync(srcDir).filter(n => n.endsWith('.ts'))) {
    const text = readFileSync(path.join(srcDir, f), 'utf8');
    for (const m of text.matchAll(/(?:from\s+|import\(\s*|export\s+\*\s+from\s+)['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const target = path.join(srcDir, m[1]).replace(/\.js$/, '.ts');
      if (m[1].includes('/', 2) || m[1].startsWith('../')) errors.push(`src/${f}: import leaves flat src/: ${m[1]}`);
      else if (!existsSync(target)) errors.push(`src/${f}: unresolved import ${m[1]}`);
    }
  }
}

// 4. package.json targets
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
for (const f of pkg.files ?? []) {
  if (f === 'dist' && !built) continue;
  if (!existsSync(f)) errors.push(`package.json "files" lists "${f}" but it does not exist`);
}
if (built) {
  const targets = [...Object.values(pkg.bin ?? {}), pkg.exports?.['.']?.default, pkg.exports?.['.']?.types, pkg.main].filter(Boolean);
  for (const t of targets) if (!existsSync(t)) errors.push(`package.json points at missing file: ${t}`);
}
for (const s of Object.values(pkg.scripts ?? {})) {
  for (const m of String(s).matchAll(/(?:node|tsx)\s+((?:dist|src|tests)\/[\w./*-]+)/g))
    if (!m[1].includes('*') && !existsSync(m[1]) && !(m[1].startsWith('dist') && !built)) errors.push(`package.json script references missing ${m[1]}`);
}
for (const wf of files.filter(f => f.p.startsWith('.github') && /\.ya?ml$/.test(f.p))) {
  for (const m of readFileSync(wf.p, 'utf8').matchAll(/node\s+(tests\/[\w./-]+)/g))
    if (!existsSync(m[1])) errors.push(`${wf.p} references missing ${m[1]}`);
}

if (errors.length) { for (const e of errors) console.log(`::error title=Repository structure::${e}`); console.error(`${errors.length} problem(s)`); process.exit(1); }
console.log(`structure OK: ${files.length} files checked${built ? ' (including built targets)' : ''}`);
