#!/usr/bin/env node
// Rewrites workflows so that no `run` step prints to the Actions console:
//   every step writes to ci-logs/NN-name.log (and ci-logs/NN-name.exit on failure),
//   a final step puts log tails into the Job summary, one artifact per job carries ci-logs/.
// Idempotent: a workflow that already contains "ci-quiet" markers is left unchanged.
// Usage: node tests/ci-quiet.mjs .github/workflows/*.yml
import { readFileSync, writeFileSync } from 'node:fs';

const slug = s => s.toLowerCase().replace(/\$\{\{[^}]*\}\}/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'step';
const ind = n => ' '.repeat(n);

function wrap(body, nn, name, dir) {
  const f = `${dir}/${nn}-${name}`;
  return [`mkdir -p ${dir}`, `trap 'rc=$?; [ "$rc" = 0 ] || echo "$rc" > ${f}.exit' EXIT`, '{', ...body, `} > ${f}.log 2>&1`];
}

function summaryStep(job) {
  return {
    name: 'Job summary with log tails (ci-quiet)',
    cond: 'if: always()',
    body: [
      'set +e +o pipefail',
      '{',
      `  echo "### CI logs: ${job}"; echo`,
      '  for f in ci-logs/*.log; do',
      '    [ -f "$f" ] || continue',
      '    b=${f%.log}; if [ -f "$b.exit" ]; then mark="❌ exit $(cat "$b.exit")"; open=" open"; else mark="✅"; open=""; fi',
      '    echo "<details$open><summary>$mark $(basename "$b") ($(wc -l < "$f") lines)</summary>"; echo',
      '    echo "~~~~text"; tail -n 25 "$f" | cut -c1-300 | tr -d "\\r"; echo "~~~~"; echo "</details>"; echo',
      '  done',
      '  a=$(grep -h -E "^::(warning|error)" ci-logs/*.log 2>/dev/null | tr -d "\\r" | head -30)',
      '  if [ -n "$a" ]; then echo "#### Annotations found in logs"; echo; echo "$a" | sed -E "s/^::(warning|error)[^:]*::/- \\1: /"; echo; fi',
      '} >> "$GITHUB_STEP_SUMMARY"',
    ],
  };
}

function transform(text) {
  if (text.includes('ci-quiet')) return text;
  const lines = text.split('\n');
  const out = [];
  let job = null, nn = 0, i = 0, jobIndent = 4;
  const closeJob = () => {
    if (!job) return;
    const s = summaryStep(job);
    const pad = ind(6);
    const body = wrap(s.body, String(++nn).padStart(2, '0'), 'job-summary', 'ci-logs');
    out.push(`${pad}- name: ${s.name}`, `${pad}  ${s.cond}`, `${pad}  run: |`, ...body.map(l => `${pad}    ${l}`));
    out.push(`${pad}- name: Upload logs (one artifact, ci-quiet)`, `${pad}  if: always()`, `${pad}  uses: actions/upload-artifact@v6`, `${pad}  with:`,
      `${pad}    name: ci-logs-${job}${job === 'capabilities' ? '-\${{ matrix.os }}-node\${{ matrix.node }}' : job === 'structure' || job === 'package' ? '-\${{ matrix.os }}' : ''}`,
      `${pad}    path: |`, `${pad}      ci-logs/`, ...(job === 'structure' ? [`${pad}      structure-output.txt`] : []),
      `${pad}    retention-days: 14`, `${pad}    if-no-files-found: ignore`);
    job = null; nn = 0;
  };
  while (i < lines.length) {
    const l = lines[i];
    const jm = l.match(/^  ([a-z][\w-]*):\s*$/);
    if (jm && out.some(x => x === 'jobs:')) { closeJob(); job = jm[1]; nn = 0; out.push(l); i++; continue; }
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
  return out.join('\n').replace(/\n*$/, '\n');
}

for (const f of process.argv.slice(2)) writeFileSync(f, transform(readFileSync(f, 'utf8')));
