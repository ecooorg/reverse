import { glob, readFile, lstat, open } from 'node:fs/promises';
import path from 'node:path';
import { result } from './core-types.js';
import { fileEvidence } from './core-util.js';

const MAX_FILES = 5000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|cs|cpp|c|h|hpp)$/i;

/** Strip //, /* *\/, # (python), and string/template literals enough to avoid counting commented imports. */
function codeWithoutCommentsAndStrings(src: string, ext: string): string {
    const out: string[] = [];
    let i = 0;
    const n = src.length;
    const isPy = ext === '.py';
    while (i < n) {
        const c = src[i];
        const c2 = src[i + 1];
        // line comment
        if (!isPy && c === '/' && c2 === '/') {
            i += 2;
            while (i < n && src[i] !== '\n') i++;
            continue;
        }
        if (isPy && c === '#') {
            i++;
            while (i < n && src[i] !== '\n') i++;
            continue;
        }
        // block comment
        if (!isPy && c === '/' && c2 === '*') {
            i += 2;
            while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
            i += 2;
            continue;
        }
        // strings
        if (c === '"' || c === "'" || c === '`') {
            const q = c;
            i++;
            while (i < n) {
                if (src[i] === '\\') {
                    i += 2;
                    continue;
                }
                if (src[i] === q) {
                    i++;
                    break;
                }
                // template ${ }
                if (q === '`' && src[i] === '$' && src[i + 1] === '{') {
                    i += 2;
                    let depth = 1;
                    while (i < n && depth > 0) {
                        if (src[i] === '{') depth++;
                        else if (src[i] === '}') depth--;
                        i++;
                    }
                    continue;
                }
                i++;
            }
            out.push(' ');
            continue;
        }
        out.push(c);
        i++;
    }
    return out.join('');
}

function extractImports(code: string, ext: string): string[] {
    const names: string[] = [];
    if (/\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(ext)) {
        for (const m of code.matchAll(
            /(?:import\s+(?:[\s\S]*?\s+from\s+)?|export\s+[\s\S]*?\s+from\s+|require\s*\(\s*)['"]([^./][^'"]*)['"]/g
        )) {
            names.push(m[1].split('/')[0]);
        }
    } else if (ext === '.py') {
        for (const m of code.matchAll(/(?:^|\n)\s*(?:from\s+([A-Za-z_][\w.]*)\s+import|import\s+([A-Za-z_][\w.]*))/g)) {
            const mod = (m[1] || m[2] || '').split('.')[0];
            if (mod) names.push(mod);
        }
    } else if (ext === '.go') {
        for (const m of code.matchAll(/import\s+(?:\w+\s+)?["']([^."'][^"']*)["']/g)) {
            names.push(m[1].split('/')[0] === m[1] ? m[1] : m[1]);
        }
        for (const m of code.matchAll(/["']([a-z][\w.\/-]+)["']/g)) {
            if (m[1].includes('.')) names.push(m[1]);
        }
    } else if (ext === '.rs') {
        for (const m of code.matchAll(/(?:^|\n)\s*use\s+([a-zA-Z_][\w:]*)/g)) {
            names.push(m[1].split('::')[0]);
        }
    } else if (ext === '.java') {
        for (const m of code.matchAll(/(?:^|\n)\s*import\s+(static\s+)?([a-zA-Z_][\w.]*)\s*;/g)) {
            names.push(m[2].split('.')[0]);
        }
    }
    return names;
}

export async function analyzeSource(root: string) {
    const base = path.resolve(root);
    const files: string[] = [];
    let bytes = 0;
    const candidates = (async function* () {
        for await (const p of glob('**/*', { cwd: base })) yield p;
        try {
            for await (const p of glob('.github/**/*', { cwd: base })) yield p;
        } catch { /* no .github */ }
    })();
    for await (const rel of candidates) {
        if (files.length >= MAX_FILES) break;
        const parts = rel.split(/[\\/]/);
        if (parts.some(x => SKIP.has(x)) || parts.some(x => x.startsWith('.') && x !== '.github')) continue;
        const name = parts.at(-1) ?? '';
        if (!SOURCE.test(name)) continue;
        const f = path.join(base, rel);
        try {
            const st = await lstat(f);
            if (!st.isFile()) continue;
            bytes += st.size;
            files.push(f);
        } catch { /* vanished */ }
    }
    const extCount: Record<string, number> = {};
    const imports: Record<string, number> = {};
    let lines = 0, skipped = 0;
    for (const f of files) {
        const x = path.extname(f) || '<none>';
        extCount[x] = (extCount[x] ?? 0) + 1;
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
            } finally {
                await fh.close();
            }
            lines += t.split(/\r?\n/).length;
            const cleaned = codeWithoutCommentsAndStrings(t, x);
            for (const pkg of extractImports(cleaned, x)) {
                imports[pkg] = (imports[pkg] ?? 0) + 1;
            }
        } catch { /* unreadable */ }
    }
    let manifest: Record<string, unknown> = {};
    try {
        manifest = JSON.parse(await readFile(path.join(base, 'package.json'), 'utf8'));
    } catch { /* none */ }
    const ev = await fileEvidence(base + '/');
    return result(base, 'source_inventory', [{
        fileCount: files.length,
        totalBytes: bytes,
        approximateLines: lines,
        filesByExtension: extCount,
        externalImportReferences: Object.entries(imports).sort((a, b) => b[1] - a[1]).slice(0, 100),
        packageManifest: manifest
    }], {
        evidence: [ev],
        status: files.length >= MAX_FILES ? 'partial' : 'completed',
        limitations: [
            'Source inventory with comment- and string-aware import extraction (not a full language AST).',
            'No call graph, dead-code proof, or vulnerability scan.',
            'Import extraction covers JS/TS, Python, Go, Rust and Java patterns; other languages are inventory-only.'
        ],
        coverage: {
            examined: true,
            complete: files.length < MAX_FILES,
            notes: [
                `Scanned up to ${files.length} source files.`,
                `Excluded directories: ${[...SKIP].join(', ')}.`,
                ...(skipped ? [`${skipped} file(s) larger than ${MAX_FILE_BYTES} bytes were counted but not read.`] : []),
                'Commented-out and string-literal imports are not counted.'
            ]
        }
    });
}
