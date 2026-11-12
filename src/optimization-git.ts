import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { result } from './core-types.js';
import { storeDir, now, atomicWriteJson } from './core-util.js';
import { requireChangePermission, type ChangePermission, type ChangeWorkspace } from './optimization-workspace.js';
import { findExecutable, COMMON_BIN_DIRS } from './providers-discover.js';
const execFileAsync = promisify(execFile);
async function gitOk() {
    return findExecutable(['git'], COMMON_BIN_DIRS, ['--version']);
}
/**
 * Create a git worktree workspace under REVERSE_HOME/workspaces.
 * Requires a git repo at originalPath (or containing it).
 */
export async function createGitWorktreeWorkspace(originalPath: string, perm: ChangePermission, opts?: {
    branchName?: string;
}) {
    const gate = requireChangePermission(perm);
    if (gate) {
        return result(originalPath, 'create_git_worktree', [], {
            status: 'unsupported',
            limitations: [gate],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    const git = await gitOk();
    if (!git) {
        return result(originalPath, 'create_git_worktree', [], {
            status: 'unsupported',
            limitations: ['git not found on PATH.'],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    const abs = path.resolve(originalPath);
    try {
        await access(abs);
    }
    catch {
        return result(originalPath, 'create_git_worktree', [], {
            status: 'failed',
            limitations: [`Path not accessible: ${abs}`],
            errors: ['ENOENT'],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    // Find repo root
    let repoRoot: string;
    try {
        const { stdout } = await execFileAsync(git.path, ['-C', abs, 'rev-parse', '--show-toplevel'], { timeout: 15000 });
        repoRoot = stdout.toString().trim();
    }
    catch (e: any) {
        return result(originalPath, 'create_git_worktree', [], {
            status: 'failed',
            limitations: [
                'Path is not inside a git repository; use create_change_workspace (directory copy) instead.',
                e?.message ?? String(e)
            ],
            coverage: { examined: true, complete: false, notes: [] }
        });
    }
    const workspace_id = randomUUID();
    const workPath = path.join(storeDir(), 'workspaces', workspace_id, 'work');
    await mkdir(path.dirname(workPath), { recursive: true });
    const branch = opts?.branchName ?? `reverse-opt-${workspace_id.slice(0, 8)}`;
    try {
        await execFileAsync(git.path, ['-C', repoRoot, 'worktree', 'add', '-b', branch, workPath], { timeout: 60000 });
    }
    catch {
        // Fallback: worktree from current HEAD without new branch name conflict
        try {
            await execFileAsync(git.path, ['-C', repoRoot, 'worktree', 'add', '--detach', workPath], { timeout: 60000 });
        }
        catch (e2: any) {
            return result(originalPath, 'create_git_worktree', [], {
                status: 'failed',
                limitations: [e2?.message ?? String(e2)],
                errors: [String(e2?.message ?? e2)],
                coverage: { examined: true, complete: false, notes: [] }
            });
        }
    }
    const ws: ChangeWorkspace & {
        kind: string;
        branch?: string;
        repoRoot: string;
    } = {
        workspace_id,
        originalPath: repoRoot,
        workPath,
        createdAt: now(),
        status: 'active',
        snapshots: [{ label: 'git_worktree', at: now(), note: branch }],
        kind: 'git_worktree',
        branch,
        repoRoot
    };
    await atomicWriteJson(path.join(storeDir(), 'workspaces', `${workspace_id}.json`), ws);
    await writeFile(path.join(storeDir(), 'workspaces', workspace_id, 'ORIGINAL.txt'), `${repoRoot}\n`, 'utf8');
    return result(repoRoot, 'create_git_worktree', [ws], {
        status: 'completed',
        limitations: [
            'Changes live in the worktree only; original branch is not modified until you merge.',
            'Remove with git worktree remove when finished (or rollback_git_worktree).'
        ],
        coverage: {
            examined: true,
            complete: true,
            notes: [`branch=${branch}`, `workPath=${workPath}`]
        }
    });
}
export async function removeGitWorktree(workspaceId: string, perm: ChangePermission) {
    const gate = requireChangePermission(perm);
    if (gate) {
        return result(workspaceId, 'remove_git_worktree', [], {
            status: 'unsupported',
            limitations: [gate],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    const metaPath = path.join(storeDir(), 'workspaces', `${workspaceId}.json`);
    let ws: any;
    try {
        ws = JSON.parse(await (await import('node:fs/promises')).readFile(metaPath, 'utf8'));
    }
    catch {
        return result(workspaceId, 'remove_git_worktree', [], {
            status: 'failed',
            limitations: ['Unknown workspace_id.'],
            errors: ['not found'],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    const git = await gitOk();
    if (!git) {
        return result(workspaceId, 'remove_git_worktree', [], {
            status: 'unsupported',
            limitations: ['git not found'],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    try {
        await execFileAsync(git.path, ['-C', ws.repoRoot ?? ws.originalPath, 'worktree', 'remove', '--force', ws.workPath], { timeout: 60000
        });
    }
    catch (e: any) {
        return result(workspaceId, 'remove_git_worktree', [], {
            status: 'failed',
            limitations: [e?.message ?? String(e)],
            errors: [String(e?.message ?? e)],
            coverage: { examined: true, complete: false, notes: [] }
        });
    }
    ws.status = 'rolled_back';
    ws.snapshots = [...(ws.snapshots ?? []), { label: 'worktree_removed', at: now() }];
    await atomicWriteJson(metaPath, ws);
    return result(workspaceId, 'remove_git_worktree', [ws], {
        status: 'completed',
        limitations: ['Worktree removed; original repo retained.'],
        coverage: { examined: true, complete: true, notes: [] }
    });
}
