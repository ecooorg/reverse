import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
export const now = () => new Date().toISOString();
export const sha256 = (data: Buffer|string) => createHash('sha256').update(data).digest('hex');
export const storeDir = () => process.env.REVERSE_HOME || path.join(homedir(), '.reverse');
export async function saveJson(kind: string, value: unknown): Promise<string> { const dir=path.join(storeDir(),kind); await mkdir(dir,{recursive:true}); const file=path.join(dir,`${Date.now()}-${randomUUID()}.json`); await writeFile(file,JSON.stringify(value,null,2)+'\n','utf8'); return file; }
export async function readJson(file: string): Promise<any> { return JSON.parse(await readFile(file,'utf8')); }
export async function fileEvidence(file: string) { const s=await stat(file); const isFile=s.isFile(); const b=isFile?await readFile(file):undefined; const ref={ id: randomUUID(), kind:isFile?'file':'directory', source:path.resolve(file), observedAt:now(), ...(b?{sha256:sha256(b)}:{}), details:{sizeBytes:s.size,mtime:s.mtime.toISOString()} }; const stored=await saveJson('evidence',ref); return {...ref,details:{...ref.details,artifactPath:stored}}; }
export function safeNumber(n: unknown): number|undefined { return typeof n==='number' && Number.isFinite(n) ? n : undefined; }
