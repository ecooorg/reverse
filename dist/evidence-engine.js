import { randomUUID } from 'node:crypto';
import { saveJson, now } from './core-util.js';
export class EvidenceEngine {
    async record(kind, source, details = {}, sha256) { return { id: randomUUID(), kind, source, observedAt: now(), ...(sha256 ? { sha256 } : {}), details }; }
    async persist(record) { return saveJson('evidence', record); }
    async get(id) { const { readdir, readFile } = await import('node:fs/promises'); const { join } = await import('node:path'); const dir = join((await import('./core-util.js')).storeDir(), 'evidence'); let files = []; try {
        files = await readdir(dir);
    }
    catch {
        return undefined;
    } for (const f of files) {
        const p = join(dir, f);
        try {
            const v = JSON.parse(await readFile(p, 'utf8'));
            if (v.id === id)
                return p;
        }
        catch { }
    } return undefined; }
}
//# sourceMappingURL=evidence-engine.js.map