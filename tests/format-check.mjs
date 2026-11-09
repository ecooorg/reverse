import ts from 'typescript-api';
import { readFile } from 'node:fs/promises';

// Only files touched by this patch are subject to the formatter gate. Older
// untouched modules retain their original formatting and are not churned.
const files = [
    'src/analysis-source.ts', 'src/benchmark-engine.ts', 'src/benchmark-environment.ts',
    'src/benchmark-resources.ts', 'src/benchmark-suite.ts', 'src/cli-main.ts',
    'src/core-types.ts', 'src/core-untrusted.ts', 'src/core-util.ts', 'src/core-version.ts',
    'src/evidence-engine.ts', 'src/index.ts', 'src/mcp-server.ts', 'src/process-inspector.ts',
    'src/process-parse.ts', 'src/process-tree.ts',
    'tests/benchmark-stats.test.ts', 'tests/benchmark-suite.test.ts', 'tests/capabilities.check.ts',
    'tests/evidence.test.ts', 'tests/mcp-new-tools.test.ts', 'tests/process-inspector.test.ts',
    'tests/process-parse.test.ts', 'tests/research-cycle.test.ts', 'tests/untrusted.test.ts',
];
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
} else console.log(`TypeScript format check passed (${files.length} changed files).`);
