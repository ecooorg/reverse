import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, mkdir, writeFile, stat, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
export const now = () => new Date().toISOString();
export const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
export const storeDir = () => process.env.REVERSE_HOME || path.join(homedir(), '.reverse');
export async function atomicWriteJson(file: string, value: unknown): Promise<void> {
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${randomUUID()}.tmp`;
    try {
        await writeFile(tmp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
        await rename(tmp, file);
    }
    catch (error) {
        await unlink(tmp).catch(() => undefined);
        throw error;
    }
}
export async function saveJson(kind: string, value: unknown): Promise<string> {
    const dir = path.join(storeDir(), kind);
    const id = typeof (value as any)?.id === 'string' ? (value as any).id : randomUUID();
    const file = path.join(dir, `${id}.json`);
    await atomicWriteJson(file, value);
    return file;
}
export async function readJson(file: string): Promise<any> { return JSON.parse(await readFile(file, 'utf8')); }
function hashFile(file: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const h = createHash('sha256');
        const stream = createReadStream(file);
        stream.on('data', chunk => h.update(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(h.digest('hex')));
    });
}
export async function fileEvidence(file: string) {
    const s = await stat(file);
    const isFile = s.isFile();
    const hash = isFile
        ? await hashFile(file)
        : undefined;
    const ref = {
        id: randomUUID(), kind: isFile ? 'file' : 'directory', source: path.resolve(file), observedAt: now(), ...(hash ? {
            sha256: hash
        } : {}), details: {
            sizeBytes: s.size, mtime: s.mtime.toISOString()
        }
    };
    const stored = await saveJson('evidence', ref);
    return {
        ...ref, details: {
            ...ref.details, artifactPath: stored
        }
    };
}
export function safeNumber(n: unknown): number | undefined { return typeof n === 'number' && Number.isFinite(n) ? n : undefined; }
/** Timeout for helper executables (ps, tasklist, powershell). Override with REVERSE_EXEC_TIMEOUT_MS (1..120000). */
export const execTimeoutMs = (fallback: number) => {
    const v = Number(process.env.REVERSE_EXEC_TIMEOUT_MS);
    return Number.isFinite(v) && v > 0 ? Math.min(v, 120000) : fallback;
};
