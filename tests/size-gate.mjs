import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// Source budget: own-line count per file and in total, and a hard limit on the length of every line.
// REVERSE_GATE_ROOT points the gate at another tree (the capability suite uses it to prove the gate can fail).
const root = process.env.REVERSE_GATE_ROOT || '.';
const MAX_FILE_LINES = 1000;
const MAX_TOTAL_LINES = 50000;
const MAX_LINE_LENGTH = 140;
const tsFiles = async dir => (await readdir(path.join(root, dir)).catch(() => [])).filter(x => x.endsWith('.ts')).sort();
const srcFiles = await tsFiles('src');
const testFiles = await tsFiles('tests');
let total = 0;
const tooLarge = [];
const tooWide = [];
const scan = async (dir, name, counted) => {
  const lines = (await readFile(path.join(root, dir, name), 'utf8')).split(/\r?\n/);
  if (counted) {
    total += lines.length - 1;
    if (lines.length - 1 > MAX_FILE_LINES) tooLarge.push(`${name}: ${lines.length - 1} lines`);
  }
  lines.forEach((line, i) => { if (line.length > MAX_LINE_LENGTH) tooWide.push(`${dir}/${name}:${i + 1} (${line.length} chars)`); });
};
for (const name of srcFiles) await scan('src', name, true);
for (const name of testFiles) await scan('tests', name, false);
if (total > MAX_TOTAL_LINES || tooLarge.length || tooWide.length) {
  if (total > MAX_TOTAL_LINES || tooLarge.length)
    console.error(`Source size gate failed: ${total}/${MAX_TOTAL_LINES} total lines; ${tooLarge.join('; ')}`);
  if (tooWide.length)
    console.error(`Line length gate failed: ${tooWide.length} line(s) longer than ${MAX_LINE_LENGTH} characters:\n${tooWide.slice(0, 20).join('\n')}`);
  process.exitCode = 1;
} else console.log(`Source size gate passed: ${srcFiles.length} files, ${total} lines, no line over ${MAX_LINE_LENGTH} characters (src and tests).`);
