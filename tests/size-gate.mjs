import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const MAX_FILE_LINES = 500;
const MAX_TOTAL_LINES = 50000;
const files = (await readdir('src')).filter(x => x.endsWith('.ts')).sort();
let total = 0; const tooLarge = [];
for (const name of files) {
  const lines = (await readFile(path.join('src', name), 'utf8')).split(/\r?\n/).length - 1;
  total += lines; if (lines > MAX_FILE_LINES) tooLarge.push(`${name}: ${lines} lines`);
}
if (total > MAX_TOTAL_LINES || tooLarge.length) {
  console.error(`Source size gate failed: ${total}/${MAX_TOTAL_LINES} total lines; ${tooLarge.join('; ')}`);
  process.exitCode = 1;
} else console.log(`Source size gate passed: ${files.length} files, ${total} lines.`);
