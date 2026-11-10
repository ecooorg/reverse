import { cp, rm, access, writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { result } from './core-types.js';
import { storeDir, now, atomicWriteJson } from './core-util.js';
import { operatingMode } from './benchmark-gate.js';
export type ChangePermission = {
    /** Must be true; separate from REVERSE_MODE. */
    confirm: boolean;
    /** Optional explicit allow path prefix; defaults to workspace only. */
    allowPrefix?: string;
};
export interface ChangeWorkspace {
    workspace_id: string;
    originalPath: string;
    workPath: string;
    createdAt: string;
    status: 'active' | 'rolled_back' | 'accepted';
    snapshots: {
        label: string;
        at: string;
        note?: string;
    }[];
}
function requireChangePermission(perm?: ChangePermission): string | null {
    if (operatingMode() !== 'CONTROLLED_EXECUTION') {
        return 'Change application requires REVERSE_MODE=CONTROLLED_EXECUTION.';
    }
    if (!perm?.confirm) {
        return 'Change application requires explicit confirm:true (separate permission).';
    }
    return null;
}
function workspaceRoot() {
    return path.join(storeDir(), 'workspaces');
}
async function saveMeta(ws: ChangeWorkspace) {
    await atomicWriteJson(path.join(workspaceRoot(), `${ws.workspace_id}.json`), ws);
}
export async function loadWorkspace(id: string): Promise<ChangeWorkspace | undefined> {
    try {
        return JSON.parse(await readFile(path.join(workspaceRoot(), `${id}.json`), 'utf8'));
    }
    catch {
        return undefined;
    }
}
/**
 * Copy target into an isolated workspace. Original is never modified.
 */
export async function createChangeWorkspace(originalPath: string, perm: ChangePermission) {
    const gate = requireChangePermission(perm);
    if (gate) {
        return result(originalPath, 'create_change_workspace', [], {
            status: 'unsupported',
            limitations: [gate],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    const abs = path.resolve(originalPath);
    try {
        await access(abs);
    }
    catch {
        return result(originalPath, 'create_change_workspace', [], {
            status: 'failed',
            limitations: [`Target not accessible: ${abs}`],
            errors: [`ENOENT or EACCES: ${abs}`],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    const workspace_id = randomUUID();
    const workPath = path.join(workspaceRoot(), workspace_id, 'work');
    await mkdir(path.dirname(workPath), { recursive: true });
    await cp(abs, workPath, { recursive: true, errorOnExist: true });
    const ws: ChangeWorkspace = {
        workspace_id,
        originalPath: abs,
        workPath,
        createdAt: now(),
        status: 'active',
        snapshots: [{ label: 'initial_copy', at: now() }]
    };
    await saveMeta(ws);
    // Manifest of original path for audit
    await writeFile(path.join(workspaceRoot(), workspace_id, 'ORIGINAL.txt'), `${abs}\n`, 'utf8');
    return result(abs, 'create_change_workspace', [ws], {
        status: 'completed',
        limitations: [
            'Work happens only under workPath; originalPath is never written by Reverse.',
            'Caller must not point tools at originalPath when applying changes.'
        ],
        coverage: {
            examined: true,
            complete: true,
            notes: [`workspace_id=${workspace_id}`]
        }
    });
}
/** Restore workPath from a fresh copy of original (rollback). */
export async function rollbackChangeWorkspace(workspaceId: string, perm: ChangePermission) {
    const gate = requireChangePermission(perm);
    if (gate) {
        return result(workspaceId, 'rollback_change', [], {
            status: 'unsupported',
            limitations: [gate],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    const ws = await loadWorkspace(workspaceId);
    if (!ws) {
        return result(workspaceId, 'rollback_change', [], {
            status: 'failed',
            limitations: ['Unknown workspace_id.'],
            errors: ['workspace not found'],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    await rm(ws.workPath, { recursive: true, force: true });
    await cp(ws.originalPath, ws.workPath, { recursive: true });
    ws.status = 'rolled_back';
    ws.snapshots.push({ label: 'rollback', at: now() });
    await saveMeta(ws);
    return result(workspaceId, 'rollback_change', [ws], {
        status: 'completed',
        limitations: [
            'workPath restored from originalPath copy; original still untouched.'
        ],
        coverage: {
            examined: true,
            complete: true,
            notes: ['rolled_back']
        }
    });
}
export async function acceptChangeWorkspace(workspaceId: string, perm: ChangePermission) {
    const gate = requireChangePermission(perm);
    if (gate) {
        return result(workspaceId, 'accept_change', [], {
            status: 'unsupported',
            limitations: [gate],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    const ws = await loadWorkspace(workspaceId);
    if (!ws) {
        return result(workspaceId, 'accept_change', [], {
            status: 'failed',
            limitations: ['Unknown workspace_id.'],
            errors: ['workspace not found'],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    // Accept marks workspace only — does NOT write back to original automatically.
    ws.status = 'accepted';
    ws.snapshots.push({
        label: 'accepted',
        at: now(),
        note: 'Marked accepted; originalPath not overwritten by Reverse.'
    });
    await saveMeta(ws);
    return result(workspaceId, 'accept_change', [ws], {
        status: 'completed',
        limitations: [
            'Reverse never overwrites originalPath. Promote workPath yourself if desired.'
        ],
        coverage: {
            examined: true,
            complete: true,
            notes: ['accepted_workspace_only']
        }
    });
}
export { requireChangePermission };
