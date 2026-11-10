import { access, constants } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { platform } from 'node:os';

const execFileAsync = promisify(execFile);

/** Resolve an executable by name: PATH first, then optional extra directories. No side effects beyond stat/exec -v. */
export async function findExecutable(
    names: string[],
    extraDirs: string[] = [],
    versionArgs: string[] = ['--version']
): Promise<{ path: string; version?: string } | null> {
    const pathEnv = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
    const dirs = [...pathEnv, ...extraDirs];
    const candidates: string[] = [];
    for (const dir of dirs) {
        for (const name of names) {
            candidates.push(path.join(dir, name));
            if (platform() === 'win32' && !name.endsWith('.exe') && !name.endsWith('.bat')) {
                candidates.push(path.join(dir, name + '.exe'), path.join(dir, name + '.bat'));
            }
        }
    }
    // bare names for PATH lookup via which-like
    for (const name of names) candidates.push(name);

    const seen = new Set<string>();
    for (const c of candidates) {
        if (seen.has(c)) continue;
        seen.add(c);
        try {
            if (c.includes(path.sep) || path.isAbsolute(c)) {
                await access(c, constants.X_OK).catch(async () => access(c, constants.F_OK));
            }
            const { stdout, stderr } = await execFileAsync(c, versionArgs, {
                timeout: 5000,
                windowsHide: true,
                env: process.env
            }).catch(async () => {
                // some tools use -v or -h
                return execFileAsync(c, ['-v'], { timeout: 5000, windowsHide: true, env: process.env });
            });
            const version = (stdout || stderr || '').toString().split(/\r?\n/)[0]?.trim().slice(0, 200);
            return { path: c, version: version || undefined };
        } catch {
            // try next
        }
    }
    return null;
}

export const GHIDRA_DIRS = [
    process.env.GHIDRA_INSTALL_DIR ?? '',
    process.env.GHIDRA_HOME ?? '',
    '/opt/ghidra',
    '/usr/share/ghidra',
    path.join(process.env.HOME ?? '', 'ghidra'),
    'C:\\ghidra'
].filter(Boolean);

export const COMMON_BIN_DIRS = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    path.join(process.env.HOME ?? '', '.local', 'bin'),
    'C:\\Program Files\\rizin\\bin',
    'C:\\tools'
].filter(Boolean);
