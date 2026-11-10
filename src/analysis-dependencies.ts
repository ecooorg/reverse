import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { result } from './core-types.js';
export interface DepFinding {
    name: string;
    declaredVersion?: string | null;
    resolvedVersion?: string | null;
    source: string;
    direct: boolean;
    notes?: string[];
}
interface LockNode {
    version: string;
    deps: Record<string, string>;
    dev?: boolean;
}
async function tryRead(p: string): Promise<string | null> {
    try {
        return await readFile(p, 'utf8');
    }
    catch {
        return null;
    }
}
function parsePackageLock(text: string): {
    nodes: Map<string, LockNode>;
    rootDeps: string[];
} {
    const nodes = new Map<string, LockNode>();
    const rootDeps: string[] = [];
    let data: any;
    try {
        data = JSON.parse(text);
    }
    catch {
        return { nodes, rootDeps };
    }
    if (data.packages && typeof data.packages === 'object') {
        for (const [key, val] of Object.entries(data.packages) as [
            string,
            any
        ][]) {
            if (!val || typeof val !== 'object')
                continue;
            if (key === '') {
                for (const d of Object.keys(val.dependencies ?? {}))
                    rootDeps.push(d);
                for (const d of Object.keys(val.devDependencies ?? {}))
                    rootDeps.push(d);
                continue;
            }
            const name = key.replace(/^node_modules\//, '').replace(/\/node_modules\//g, '>');
            const leaf = name.includes('>') ? name.slice(name.lastIndexOf('>') + 1) : name;
            const deps: Record<string, string> = { ...(val.dependencies ?? {}) };
            nodes.set(leaf + '@' + (val.version ?? '?'), {
                version: String(val.version ?? '?'),
                deps,
                dev: !!val.dev
            });
            if (!nodes.has(leaf)) {
                nodes.set(leaf, { version: String(val.version ?? '?'), deps, dev: !!val.dev });
            }
        }
        return { nodes, rootDeps };
    }
    if (data.dependencies && typeof data.dependencies === 'object') {
        const walk = (obj: any, parent: string | null) => {
            for (const [name, val] of Object.entries(obj) as [
                string,
                any
            ][]) {
                if (!val || typeof val !== 'object')
                    continue;
                const ver = String(val.version ?? '?');
                nodes.set(name, {
                    version: ver,
                    deps: val.dependencies
                        ? Object.fromEntries(Object.entries(val.dependencies).map(([k, v]: [
                            string,
                            any
                        ]) => [k, String(v.version ?? v)]))
                        : {},
                    dev: !!val.dev
                });
                if (!parent)
                    rootDeps.push(name);
                if (val.dependencies)
                    walk(val.dependencies, name);
            }
        };
        walk(data.dependencies, null);
    }
    return { nodes, rootDeps };
}
function parseCargoLock(text: string): Map<string, LockNode> {
    const nodes = new Map<string, LockNode>();
    let name = '', version = '';
    const deps: string[] = [];
    const flush = () => {
        if (name) {
            nodes.set(name, { version, deps: Object.fromEntries(deps.map(d => [d, '*'])) });
        }
        name = '';
        version = '';
        deps.length = 0;
    };
    for (const line of text.split(/\r?\n/)) {
        if (line.startsWith('[[package]]')) {
            flush();
            continue;
        }
        const nm = line.match(/^name\s*=\s*"([^"]+)"/);
        if (nm) {
            name = nm[1];
            continue;
        }
        const ver = line.match(/^version\s*=\s*"([^"]+)"/);
        if (ver) {
            version = ver[1];
            continue;
        }
        if (line.startsWith('dependencies') || line.match(/^\s*"/)) {
            const m = line.match(/"([^"]+)"/);
            if (m)
                deps.push(m[1].split(/\s+/)[0]);
        }
    }
    flush();
    return nodes;
}
function parseGoSum(text: string): Map<string, LockNode> {
    const nodes = new Map<string, LockNode>();
    for (const line of text.split(/\r?\n/)) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 2)
            continue;
        const mod = parts[0];
        const ver = parts[1].replace(/\/go\.mod$/, '');
        if (!nodes.has(mod) || ver > (nodes.get(mod)?.version ?? '')) {
            nodes.set(mod, { version: ver, deps: {} });
        }
    }
    return nodes;
}
function parseRequirements(text: string): Map<string, string> {
    const out = new Map<string, string>();
    for (const line of text.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#') || t.startsWith('-'))
            continue;
        const m = t.match(/^([A-Za-z0-9_.-]+)\s*([=<>!~].+)?/);
        if (m)
            out.set(m[1].toLowerCase(), (m[2] ?? '*').trim());
    }
    return out;
}
function parseYarnLock(text: string): Map<string, LockNode> {
    const nodes = new Map<string, LockNode>();
    let currentKeys: string[] = [];
    let version = '';
    for (const line of text.split(/\r?\n/)) {
        if (!line.startsWith(' ') && line.includes('@') && line.trim().endsWith(':')) {
            currentKeys = line.replace(/:$/, '').split(',').map(s => s.trim().replace(/^"|"$/g, ''));
            version = '';
            continue;
        }
        const vm = line.match(/^\s+version\s+"([^"]+)"/);
        if (vm) {
            version = vm[1];
            for (const k of currentKeys) {
                const bare = k.replace(/@[^@]+$/, '').replace(/^"/, '');
                nodes.set(bare, { version, deps: {} });
            }
        }
    }
    return nodes;
}
export async function analyzeDependencies(root: string) {
    const base = path.resolve(root);
    const findings: DepFinding[] = [];
    const limitations: string[] = [];
    const notes: string[] = [];
    let complete = true;
    let pkg: any = null;
    const pkgText = await tryRead(path.join(base, 'package.json'));
    if (pkgText) {
        try {
            pkg = JSON.parse(pkgText);
        }
        catch {
            limitations.push('package.json present but not valid JSON.');
        }
    }
    const declared: Record<string, string> = {};
    if (pkg) {
        for (const [k, v] of Object.entries({
            ...(pkg.dependencies ?? {}),
            ...(pkg.devDependencies ?? {}),
            ...(pkg.optionalDependencies ?? {}),
            ...(pkg.peerDependencies ?? {})
        })) {
            declared[k] = String(v);
        }
    }
    const lockText = await tryRead(path.join(base, 'package-lock.json'));
    let npmNodes = new Map<string, LockNode>();
    let rootDeps: string[] = [];
    if (lockText) {
        const parsed = parsePackageLock(lockText);
        npmNodes = parsed.nodes;
        rootDeps = parsed.rootDeps;
        notes.push('Parsed package-lock.json.');
    }
    else {
        const yarnText = await tryRead(path.join(base, 'yarn.lock'));
        if (yarnText) {
            npmNodes = parseYarnLock(yarnText);
            notes.push('Parsed yarn.lock (resolved versions only).');
        }
        else if (pkg) {
            limitations.push('No package-lock.json or yarn.lock; only declared ranges from package.json.');
            // Still completed: declared ranges are a valid result.
            complete = true;
        }
    }
    const seen = new Set<string>();
    const addNpm = (name: string, direct: boolean) => {
        if (seen.has(name))
            return;
        seen.add(name);
        const node = npmNodes.get(name);
        const resolved = node?.version ?? null;
        const decl = declared[name] ?? null;
        const notesLocal: string[] = [];
        if (decl && resolved && !decl.startsWith('file:') && !decl.startsWith('link:')) {
            const cleanDecl = decl.replace(/^[\^~>=<\s]+/, '');
            if (cleanDecl && resolved !== cleanDecl && !resolved.startsWith(cleanDecl)) {
                notesLocal.push(`declared ${decl}, resolved ${resolved}`);
            }
        }
        findings.push({
            name,
            declaredVersion: decl,
            resolvedVersion: resolved,
            source: node ? (lockText ? 'package-lock.json' : 'yarn.lock') : 'package.json',
            direct,
            notes: notesLocal.length ? notesLocal : undefined
        });
    };
    for (const name of Object.keys(declared))
        addNpm(name, true);
    for (const name of rootDeps)
        addNpm(name, true);
    for (const key of npmNodes.keys()) {
        if (key.includes('@') && /\d/.test(key))
            continue;
        if (!seen.has(key) && !key.includes('/'))
            addNpm(key, false);
    }
    const cargoLock = await tryRead(path.join(base, 'Cargo.lock'));
    const cargoToml = await tryRead(path.join(base, 'Cargo.toml'));
    if (cargoLock || cargoToml) {
        const nodes = cargoLock ? parseCargoLock(cargoLock) : new Map();
        if (cargoToml) {
            let inDeps = false;
            for (const line of cargoToml.split(/\r?\n/)) {
                if (line.match(/^\[dependencies/)) {
                    inDeps = true;
                    continue;
                }
                if (line.startsWith('[')) {
                    inDeps = false;
                    continue;
                }
                if (inDeps) {
                    const m = line.match(/^([A-Za-z0-9_-]+)\s*=/);
                    if (m) {
                        const n = m[1];
                        const node = nodes.get(n);
                        findings.push({
                            name: n,
                            declaredVersion: null,
                            resolvedVersion: node?.version ?? null,
                            source: node ? 'Cargo.lock' : 'Cargo.toml',
                            direct: true
                        });
                        seen.add('cargo:' + n);
                    }
                }
            }
        }
        for (const [n, node] of nodes) {
            if (seen.has('cargo:' + n))
                continue;
            findings.push({
                name: n,
                resolvedVersion: node.version,
                source: 'Cargo.lock',
                direct: false
            });
        }
        notes.push(cargoLock ? 'Parsed Cargo.lock.' : 'Cargo.toml only (no lock).');
    }
    const goSum = await tryRead(path.join(base, 'go.sum'));
    const goMod = await tryRead(path.join(base, 'go.mod'));
    if (goSum || goMod) {
        const nodes = goSum ? parseGoSum(goSum) : new Map();
        if (goMod) {
            for (const line of goMod.split(/\r?\n/)) {
                const m = line.match(/^\s*([A-Za-z0-9._\/\-]+)\s+v([0-9][^\s]*)/);
                if (m) {
                    const n = m[1];
                    findings.push({
                        name: n,
                        declaredVersion: 'v' + m[2],
                        resolvedVersion: nodes.get(n)?.version ?? ('v' + m[2]),
                        source: goSum ? 'go.sum' : 'go.mod',
                        direct: true
                    });
                    seen.add('go:' + n);
                }
            }
        }
        for (const [n, node] of nodes) {
            if (seen.has('go:' + n))
                continue;
            findings.push({
                name: n,
                resolvedVersion: node.version,
                source: 'go.sum',
                direct: false
            });
        }
        notes.push(goSum ? 'Parsed go.sum.' : 'go.mod only.');
    }
    for (const reqFile of ['requirements.txt', 'requirements.in', 'dev-requirements.txt']) {
        const t = await tryRead(path.join(base, reqFile));
        if (!t)
            continue;
        for (const [name, ver] of parseRequirements(t)) {
            findings.push({
                name,
                declaredVersion: ver,
                resolvedVersion: null,
                source: reqFile,
                direct: true
            });
        }
        notes.push(`Parsed ${reqFile}.`);
    }
    const poetry = await tryRead(path.join(base, 'poetry.lock'));
    if (poetry) {
        let name = '', version = '';
        for (const line of poetry.split(/\r?\n/)) {
            if (line.startsWith('[[package]]')) {
                if (name) {
                    findings.push({
                        name,
                        resolvedVersion: version,
                        source: 'poetry.lock',
                        direct: false
                    });
                }
                name = '';
                version = '';
            }
            const nm = line.match(/^name\s*=\s*"([^"]+)"/);
            if (nm)
                name = nm[1];
            const ver = line.match(/^version\s*=\s*"([^"]+)"/);
            if (ver)
                version = ver[1];
        }
        if (name) {
            findings.push({ name, resolvedVersion: version, source: 'poetry.lock', direct: false });
        }
        notes.push('Parsed poetry.lock.');
    }
    const byName = new Map<string, Set<string>>();
    for (const f of findings) {
        if (!f.resolvedVersion)
            continue;
        const set = byName.get(f.name) ?? new Set();
        set.add(f.resolvedVersion);
        byName.set(f.name, set);
    }
    const duplicates: string[] = [];
    for (const [n, vers] of byName) {
        if (vers.size > 1)
            duplicates.push(`${n} (${[...vers].join(', ')})`);
    }
    if (duplicates.length) {
        notes.push(`Possible duplicate versions: ${duplicates.slice(0, 20).join('; ')}`);
    }
    if (!findings.length) {
        return result(base, 'dependency_analysis', [], {
            status: 'partial',
            limitations: [
                'No package.json, package-lock.json, yarn.lock, Cargo.toml/lock, go.mod/sum, requirements.txt or poetry.lock found.'
            ],
            coverage: { examined: true, complete: false, notes: ['No recognized dependency manifests.'] }
        });
    }
    limitations.push('No CVE/vulnerability database lookup.');
    limitations.push('Outdated detection is limited to declared-vs-resolved mismatch notes; no registry query.');
    limitations.push('Size/resource impact and replacement recommendations are not computed.');
    limitations.push('Transitive graph edges are recovered from lockfiles where present; not a full install-time resolution.');
    return result(base, 'dependency_analysis', findings.slice(0, 5000), {
        status: complete ? 'completed' : 'partial',
        limitations,
        coverage: {
            examined: true,
            complete,
            notes: [
                ...notes,
                `${findings.length} dependency record(s).`,
                `${findings.filter(f => f.direct).length} direct, ${findings.filter(f => !f.direct).length} transitive/lock-only.`
            ]
        }
    });
}
