import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { result } from './core-types.js';
import { loadWorkspace, requireChangePermission, type ChangePermission } from './optimization-workspace.js';
export type ChangeType = 'source_edit' | 'config_edit' | 'dependency_version' | 'remove_file' | 'runtime_flag';
export interface ApplyChangeSpec {
    workspace_id: string;
    changeType: ChangeType;
    /** Path relative to workspace workPath. */
    relativePath: string;
    /** Full new file contents for source_edit/config_edit. */
    contents?: string;
    /** For dependency_version: package name and new version. */
    dependency?: {
        name: string;
        version: string;
    };
    /** For runtime_flag: key=value recorded in reverse-runtime.json. */
    runtimeFlag?: {
        key: string;
        value: string;
    };
    permission: ChangePermission;
}
/**
 * Apply a single change only inside an existing workspace workPath.
 * Never writes outside workPath.
 */
export async function applyChange(spec: ApplyChangeSpec) {
    const gate = requireChangePermission(spec.permission);
    if (gate) {
        return result(spec.workspace_id, 'apply_change', [], {
            status: 'unsupported',
            limitations: [gate],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    const ws = await loadWorkspace(spec.workspace_id);
    if (!ws || ws.status === 'rolled_back') {
        return result(spec.workspace_id, 'apply_change', [], {
            status: 'failed',
            limitations: ['Workspace missing or already rolled back.'],
            errors: ['bad workspace'],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    const rel = spec.relativePath.replace(/^[/\\]+/, '');
    if (rel.includes('..')) {
        return result(spec.workspace_id, 'apply_change', [], {
            status: 'failed',
            limitations: ['relativePath must not contain ..'],
            errors: ['path traversal'],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    const target = path.join(ws.workPath, rel);
    if (!target.startsWith(ws.workPath)) {
        return result(spec.workspace_id, 'apply_change', [], {
            status: 'failed',
            limitations: ['Resolved path escapes workspace.'],
            errors: ['path escape'],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    try {
        if (spec.changeType === 'source_edit' || spec.changeType === 'config_edit') {
            if (spec.contents === undefined) {
                return result(spec.workspace_id, 'apply_change', [], {
                    status: 'failed',
                    limitations: ['contents required for source_edit/config_edit'],
                    errors: ['missing contents'],
                    coverage: { examined: false, complete: false, notes: [] }
                });
            }
            await writeFile(target, spec.contents, 'utf8');
        }
        else if (spec.changeType === 'dependency_version') {
            if (!spec.dependency) {
                return result(spec.workspace_id, 'apply_change', [], {
                    status: 'failed',
                    limitations: ['dependency {name,version} required'],
                    errors: ['missing dependency'],
                    coverage: { examined: false, complete: false, notes: [] }
                });
            }
            const pkgPath = path.join(ws.workPath, rel || 'package.json');
            const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
            let found = false;
            for (const g of [
                'dependencies',
                'devDependencies',
                'optionalDependencies',
                'peerDependencies'
            ]) {
                if (pkg[g]?.[spec.dependency.name] !== undefined) {
                    pkg[g][spec.dependency.name] = spec.dependency.version;
                    found = true;
                }
            }
            if (!found) {
                pkg.dependencies = pkg.dependencies ?? {};
                pkg.dependencies[spec.dependency.name] = spec.dependency.version;
            }
            await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
        }
        else if (spec.changeType === 'remove_file') {
            const { rm } = await import('node:fs/promises');
            await rm(target, { force: true });
        }
        else if (spec.changeType === 'runtime_flag') {
            const flagPath = path.join(ws.workPath, 'reverse-runtime.json');
            let flags: Record<string, string> = {};
            try {
                flags = JSON.parse(await readFile(flagPath, 'utf8'));
            }
            catch { /* new */ }
            if (!spec.runtimeFlag) {
                return result(spec.workspace_id, 'apply_change', [], {
                    status: 'failed',
                    limitations: ['runtimeFlag required'],
                    errors: ['missing runtimeFlag'],
                    coverage: { examined: false, complete: false, notes: [] }
                });
            }
            flags[spec.runtimeFlag.key] = spec.runtimeFlag.value;
            await writeFile(flagPath, JSON.stringify(flags, null, 2) + '\n', 'utf8');
        }
        else {
            return result(spec.workspace_id, 'apply_change', [], {
                status: 'failed',
                limitations: [`Unknown changeType: ${spec.changeType}`],
                errors: ['unknown changeType'],
                coverage: { examined: false, complete: false, notes: [] }
            });
        }
    }
    catch (e: any) {
        return result(spec.workspace_id, 'apply_change', [], {
            status: 'failed',
            limitations: [e?.message ?? String(e)],
            errors: [String(e?.message ?? e)],
            coverage: { examined: true, complete: false, notes: [] }
        });
    }
    return result(spec.workspace_id, 'apply_change', [{
            workspace_id: spec.workspace_id,
            changeType: spec.changeType,
            relativePath: rel,
            workPath: ws.workPath,
            originalUntouched: true
        }], {
        status: 'completed',
        limitations: [
            'Change applied only under workspace workPath.',
            'Closed binaries: only runtime_flag / config_edit / remove_file of accompanying files are supported — not binary patching.'
        ],
        coverage: {
            examined: true,
            complete: true,
            notes: [`applied ${spec.changeType} → ${rel}`]
        }
    });
}
