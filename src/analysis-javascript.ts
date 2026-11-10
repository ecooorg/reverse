import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { result } from './core-types.js';
import { sha256 } from './core-util.js';
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);
async function walk(dir: string, out: string[], budget: {
    n: number;
}) {
    if (budget.n <= 0)
        return;
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    }
    catch {
        return;
    }
    for (const e of entries) {
        if (budget.n <= 0)
            break;
        if (e.name.startsWith('.') && e.name !== '.env.example')
            continue;
        if (SKIP.has(e.name))
            continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory())
            await walk(p, out, budget);
        else if (/\.(js|mjs|cjs|ts|tsx|jsx|json)$/i.test(e.name)) {
            out.push(p);
            budget.n--;
        }
    }
}
/** Static inventory for JS/TS and Electron-ish trees. */
export async function analyzeJavascript(target: string) {
    let st;
    try {
        st = await stat(target);
    }
    catch (e: any) {
        return result(target, 'javascript_analysis', [], {
            status: 'failed',
            limitations: [e?.message ?? String(e)],
            errors: [String(e?.message ?? e)],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    const root = st.isDirectory() ? target : path.dirname(target);
    const files: string[] = [];
    await walk(root, files, { n: 2000 });
    let packageJson: any = null;
    const pkgPath = path.join(root, 'package.json');
    try {
        packageJson = JSON.parse(await readFile(pkgPath, 'utf8'));
    }
    catch { /* optional */ }
    const imports = new Set<string>();
    const electronHints: string[] = [];
    for (const f of files.slice(0, 400)) {
        let text = '';
        try {
            text = await readFile(f, 'utf8');
            if (text.length > 512000)
                text = text.slice(0, 512000);
        }
        catch {
            continue;
        }
        for (const m of text.matchAll(/(?:import\s+(?:[^'"]+\s+from\s+)?|require\s*\(\s*)['"]([^'"]+)['"]/g)) {
            imports.add(m[1]);
        }
        if (/from\s+['"]electron['"]|require\s*\(\s*['"]electron['"]/.test(text)) {
            electronHints.push(path.relative(root, f));
        }
        if (/BrowserWindow|app\.whenReady/.test(text)) {
            electronHints.push(path.relative(root, f));
        }
    }
    const main = packageJson?.main ?? packageJson?.module ?? null;
    const isElectron = !!(packageJson?.dependencies?.electron
        || packageJson?.devDependencies?.electron
        || electronHints.length);
    return result(target, 'javascript_analysis', [{
            root,
            fileCount: files.length,
            packageName: packageJson?.name ?? null,
            main,
            isElectron,
            electronHints: [...new Set(electronHints)].slice(0, 20),
            dependencyNames: Object.keys({
                ...(packageJson?.dependencies ?? {}),
                ...(packageJson?.devDependencies ?? {})
            }).slice(0, 100),
            importSample: [...imports].slice(0, 80),
            sha256: st.isFile()
                ? sha256(await readFile(target))
                : undefined
        }], {
        status: 'completed',
        limitations: [
            'Static inventory only; no runtime execution or full AST.',
            'node_modules is skipped; lockfile resolution is in analyze_dependencies.'
        ],
        coverage: {
            examined: true,
            complete: true,
            notes: [
                `files=${files.length}`,
                isElectron ? 'electron-hints' : 'no-electron'
            ]
        }
    });
}
