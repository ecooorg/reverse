import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { result } from './core-types.js';
export async function analyzeDependencies(root) { const base = path.resolve(root); let p = {}; try {
    p = JSON.parse(await readFile(path.join(base, 'package.json'), 'utf8'));
}
catch {
    return result(base, 'dependency_analysis', [], { status: 'partial', limitations: ['No readable package.json found. This MVP currently inventories npm package manifests only.'] });
} const deps = { ...(p.dependencies ?? {}), ...(p.devDependencies ?? {}), ...(p.optionalDependencies ?? {}) }; const findings = Object.entries(deps).map(([name, version]) => ({ name, declaredVersion: String(version), source: 'package.json', resolvedVersion: null })); return result(base, 'dependency_analysis', findings, { status: 'completed', limitations: ['Versions are declared ranges, not resolved installed versions.', 'No vulnerability database, transitive dependency graph, license audit, or replacement recommendation is included.'], coverage: { examined: true, complete: true, notes: ['Read direct dependencies from package.json.'] } }); }
//# sourceMappingURL=analysis-dependencies.js.map