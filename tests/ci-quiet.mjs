#!/usr/bin/env node
// Rewrites workflows so that no `run` step prints to the Actions console:
//   every step writes to ci-logs/NN-name.log (and ci-logs/NN-name.exit on failure),
//   GITHUB_STEP_SUMMARY is redirected into ci-logs/NN-name.summary.md, so the run page shows no text at all;
//   each job uploads its ci-logs/ as a part.
// A final job `logs` merges every ci-parts-* artifact into ONE artifact `ci-logs` (a single zip per run) and deletes the parts.
// Idempotent: a workflow that already contains "ci-quiet" markers is left unchanged.
// Usage: node tests/ci-quiet.mjs .github/workflows/*.yml
import { readFileSync, writeFileSync } from 'node:fs';

const slug = s => s.toLowerCase().replace(/\$\{\{[^}]*\}\}/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'step';
const ind = n => ' '.repeat(n);

function wrap(body, nn, name, dir) {
  const f = `${dir}/${nn}-${name}`;
  return [`mkdir -p ${dir}`, `export GITHUB_STEP_SUMMARY=${f}.summary.md`, `trap 'rc=$?; [ "$rc" = 0 ] || echo "$rc" > ${f}.exit' EXIT`, '{', ...body, `} > ${f}.log 2>&1`];
}

function transform(text) {
  if (text.includes('ci-quiet')) return text;
  const lines = text.split('\n');
  const out = [];
  let job = null, nn = 0, i = 0;
  const jobs = [];
  const closeJob = () => {
    if (!job) return;
    const pad = ind(6);
    out.push(`${pad}- name: Upload job logs (merged later, ci-quiet)`, `${pad}  if: always()`, `${pad}  uses: actions/upload-artifact@v6`, `${pad}  with:`,
      `${pad}    name: ci-parts-logs-${job}${job === 'capabilities' ? '-\${{ matrix.os }}-node\${{ matrix.node }}' : job === 'structure' || job === 'package' ? '-\${{ matrix.os }}' : ''}`,
      `${pad}    path: |`, `${pad}      ci-logs/`, ...(job === 'structure' ? [`${pad}      structure-output.txt`] : []),
      `${pad}    retention-days: 14`, `${pad}    if-no-files-found: ignore`);
    job = null; nn = 0;
  };
  while (i < lines.length) {
    const l = lines[i];
    const jm = l.match(/^  ([a-z][\w-]*):\s*$/);
    if (jm && out.some(x => x === 'jobs:')) { closeJob(); job = jm[1]; jobs.push(job); nn = 0; out.push(l); i++; continue; }
    if (l === 'jobs:') { out.push(l); i++; continue; }
    if (job && /^\S/.test(l) && l.trim()) { closeJob(); }
    if (job && l.startsWith('      - ') ) {
      // collect one step
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith('      - ') && (lines[j] === '' ? lines.slice(j + 1).find(x => x !== '') ?.startsWith('      ') : lines[j].startsWith('      '))) j++;
      let step = lines.slice(i, j);
      while (step.length && step[step.length - 1] === '') { step.pop(); }
      const tail = lines.slice(i + step.length, j);
      const text = step.join('\n');
      // drop the old structure artifact upload, the logs artifact replaces it
      if (job === 'structure' && /name: Upload checker output/.test(text)) { i = j; continue; }
      const ri = step.findIndex(x => /^(      - |        )run:/.test(x));
      if (ri >= 0) {
        const m = step[ri].match(/^(      - |        )run:\s*(.*)$/);
        let body, end = ri + 1;
        if (m[2] === '|') { body = []; while (end < step.length && (step[end].startsWith(ind(10)) || step[end] === '')) body.push(step[end++].slice(10)); }
        else { body = [m[2]]; }
        const nameLine = step.find(x => /^(      - |        )name:/.test(x));
        const name = slug(nameLine ? nameLine.replace(/^.*name:\s*/, '') : body[0].split(/\s+/).slice(0, 3).join(' '));
        const wd = step.some(x => /^\s+working-directory:/.test(x));
        const num = String(++nn).padStart(2, '0');
        const wrapped = wrap(body, num, name, wd ? '../ci-logs' : 'ci-logs');
        const before = step.slice(0, ri);
        const head = m[1] === '      - ' ? `${m[1]}run: |` : `        run: |`;
        out.push(...before, head, ...wrapped.map(x => ind(10) + x), ...step.slice(end));
      } else out.push(...step);
      out.push(...tail);
      i = j; continue;
    }
    out.push(l); i++;
  }
  closeJob();
  out.push('', '  logs:', '    name: all logs (one artifact)', `    needs: [${jobs.join(', ')}]`, '    if: always()', '    runs-on: ubuntu-latest', '    timeout-minutes: 3', '    steps:',
    '      - uses: actions/upload-artifact/merge@v6', '        with:', '          name: ci-logs', '          pattern: ci-parts-*', '          separate-directories: true', '          delete-merged: true', '          retention-days: 14');
  return out.join('\n').replace(/\n*$/, '\n').replace(/capability-report-(\$\{\{ matrix\.os|\*)/g, 'ci-parts-report-$1');
}

for (const f of process.argv.slice(2)) writeFileSync(f, transform(readFileSync(f, 'utf8')));
