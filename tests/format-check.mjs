import ts from 'typescript-api';
import { readdir, readFile } from 'node:fs/promises';

// Every TypeScript file in src/ and tests/ is subject to the formatter gate (the TypeScript printer is the formatter).
const files = [];
for (const dir of ['src', 'tests'])
    for (const name of (await readdir(dir)).filter(x => x.endsWith('.ts')).sort()) files.push(`${dir}/${name}`);
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: false });
const problems = [];
for (const file of files) {
    const text = await readFile(file, 'utf8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const formatted = printer.printFile(source);
    if (text !== (formatted.endsWith('\n') ? formatted : `${formatted}\n`)) problems.push(file);
}
if (problems.length) {
    console.error(`TypeScript formatting drift in ${problems.length} file(s):\n${problems.join('\n')}`);
    process.exitCode = 1;
} else console.log(`TypeScript format check passed (${files.length} files).`);
