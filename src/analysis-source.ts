import { glob, readFile, lstat, open } from 'node:fs/promises';
import path from 'node:path';
import { result } from './core-types.js';
import { fileEvidence } from './core-util.js';
const MAX_FILES = 5000;
const MAX_FILE_BYTES = 2 * 1024 * 1024; // larger files are counted but not read (no unbounded memory use)
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|cs|cpp|c|h|hpp)$/i;
export async function analyzeSource(root: string) {
    const base = path.resolve(root), files: string[] = [];
    let bytes = 0;
    const candidates = (async function* () {
        for await (const p of glob('**/*', { cwd: base }))
            yield p;
        try {
            for await (const p of glob('.github/**/*', { cwd: base }))
                yield p;
        }
        catch { /* no .github directory */ }
    })();
    for await (const rel of candidates) {
        if (files.length >= MAX_FILES)
            break;
        const parts = rel.split(/[\\/]/);
        if (parts.some(x => SKIP.has(x)) || parts.some(x => x.startsWith('.') && x !== '.github'))
            continue;
        const name = parts.at(-1) ?? '';
        if (!SOURCE.test(name))
            continue;
        const f = path.join(base, rel);
        try {
            const st = await lstat(f);
            if (!st.isFile())
                continue;
            bytes += st.size;
            files.push(f);
        }
        catch { /* vanished or unreadable entry */ }
    }
    const ext: Record<string, number> = {}, imports: Record<string, number> = {};
    let lines = 0, skipped = 0;
    for (const f of files) {
        const x = path.extname(f) || '<none>';
        ext[x] = (ext[x] ?? 0) + 1;
        try {
            const fh = await open(f, 'r');
            let t: string;
            try {
                const st = await fh.stat();
                if (st.size > MAX_FILE_BYTES) {
                    skipped++;
                    continue;
                }
                t = await fh.readFile('utf8');
            }
            finally {
                await fh.close();
            }
            lines += t.split(/\r?\n/).length;
            for (const m of t.matchAll(/(?:from\s+|require\()['"]([^./][^'"]*)/g)) {
                const pkg = m[1].split('/')[0];
                imports[pkg] = (imports[pkg] ?? 0) + 1;
            }
        }
        catch { }
    }
    let manifest: Record<string, unknown> = {};
    try {
        manifest = JSON.parse(await readFile(path.join(base, 'package.json'), 'utf8'));
    }
    catch { }
    const ev = await fileEvidence(base + '/');
    return result(base, 'source_inventory', [{ fileCount: files.length, totalBytes: bytes, approximateLines: lines, filesByExtension: ext, externalImportReferences: Object.entries(imports).sort((a, b) => b[1] - a[1]).slice(0, 100), packageManifest: manifest }], { evidence: [ev], status: files.length >= MAX_FILES ? 'partial' : 'completed', limitations: ['Heuristic source inventory only; no AST, call graph, dead-code proof, vulnerability scan, or dependency version resolution.', 'Import counts are textual approximations and may include false positives.'], coverage: { examined: true, complete: files.length < MAX_FILES, notes: [`Scanned up to ${files.length} source files.`, `Excluded directories: ${[...SKIP].join(', ')}.`, ...(skipped ? [`${skipped} file(s) larger than ${MAX_FILE_BYTES} bytes were counted but not read.`] : [])] } });
}
