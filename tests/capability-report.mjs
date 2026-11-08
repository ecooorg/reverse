#!/usr/bin/env node
// Renders one or more capability reports (written by tests/capabilities.check.ts) as a Markdown
// summary, emits GitHub annotations, and exits non-zero if any capability check failed.
//
//   node tests/capability-report.mjs report1.json [report2.json ...]
//
// Output goes to $GITHUB_STEP_SUMMARY when set, otherwise to stdout.
import { readFileSync, appendFileSync } from 'node:fs';

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: capability-report.mjs <report.json>...'); process.exit(2); }

const ICON = { verified: '✅', limitation: '🚧', drift: '⚠️', failed: '❌' };
const reports = files.map(f => {
  const r = JSON.parse(readFileSync(f, 'utf8'));
  r.label = `${r.platform}-node${String(r.node).replace(/^v/, '').split('.')[0]}`;
  return r;
});
reports.sort((a, b) => a.label.localeCompare(b.label));

// key -> { area, name, cells: {label: {status, detail}} }
const rows = new Map();
for (const r of reports) for (const x of r.records) {
  const k = `${x.area}\u0000${x.name}`;
  if (!rows.has(k)) rows.set(k, { area: x.area, name: x.name, cells: {} });
  rows.get(k).cells[r.label] = x;
}
const esc = s => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const out = [];

out.push('# CREA capability verification', '');
out.push(`CREA ${reports[0].crea} — checked on ${reports.length} environment${reports.length > 1 ? 's' : ''}: ${reports.map(r => r.label).join(', ')}`, '');
out.push('| Environment | ✅ verified | 🚧 limitation confirmed | ⚠️ drift | ❌ failed |', '|---|---|---|---|---|');
for (const r of reports) out.push(`| ${r.label} | ${r.totals.verified} | ${r.totals.limitation} | ${r.totals.drift} | ${r.totals.failed} |`);
out.push('', '✅ works as documented · 🚧 a documented limitation is real (feature absent) · ⚠️ docs and behaviour disagree, or a defect was found · ❌ must-work capability is broken', '');

const areas = [...new Set([...rows.values()].map(r => r.area))];
const labels = reports.map(r => r.label);
for (const area of areas) {
  out.push(`## ${area}`, '');
  out.push(`| Check | ${labels.join(' | ')} |`, `|---|${labels.map(() => ':-:').join('|')}|`);
  for (const row of rows.values()) if (row.area === area)
    out.push(`| ${esc(row.name)} | ${labels.map(l => row.cells[l] ? ICON[row.cells[l].status] : '—').join(' | ')} |`);
  out.push('');
}

const section = (title, status) => {
  const items = [];
  for (const row of rows.values()) {
    const byDetail = new Map();
    for (const l of labels) { const c = row.cells[l]; if (c && c.status === status) byDetail.set(c.detail, [...(byDetail.get(c.detail) ?? []), l]); }
    for (const [detail, where] of byDetail) items.push({ row, detail, where });
  }
  if (!items.length) return;
  out.push(`## ${title}`, '');
  for (const { row, detail, where } of items)
    out.push(`- **${row.area} — ${esc(row.name)}**${where.length === labels.length ? '' : ` _(${where.join(', ')})_`}: ${esc(detail || 'see check')}`);
  out.push('');
  return items;
};
const failed = section('❌ Failed', 'failed');
const drift = section('⚠️ Drift and defects found', 'drift');
section('🚧 Confirmed limitations (what CREA cannot do today)', 'limitation');

const text = out.join('\n') + '\n';
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text); else process.stdout.write(text);

const ann = (level, title, msg) => console.log(`::${level} title=${title}::${msg.replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A')}`);
for (const { row, detail, where } of drift ?? []) ann('warning', 'CREA capability drift', `${row.area} — ${row.name}: ${detail} [${where.join(', ')}]`);
for (const { row, detail, where } of failed ?? []) ann('error', 'CREA capability failed', `${row.area} — ${row.name}: ${detail} [${where.join(', ')}]`);
process.exit(reports.some(r => r.totals.failed > 0) ? 1 : 0);
