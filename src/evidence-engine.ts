import { randomUUID } from 'node:crypto';
import { saveJson, now } from './core-util.js';
import type { EvidenceRef } from './core-types.js';
export class EvidenceEngine {
  async record(kind:string, source:string, details:Record<string,unknown>={}, sha256?:string):Promise<EvidenceRef> { return {id:randomUUID(),kind,source,observedAt:now(),...(sha256?{sha256}:{}),details}; }
  async persist(record:unknown):Promise<string> { return saveJson('evidence',record); }
  async get(id:string):Promise<string|undefined> { const {readdir,readFile}=await import('node:fs/promises'); const {join}=await import('node:path'); const dir=join((await import('./core-util.js')).storeDir(),'evidence'); let files:string[]=[]; try{files=await readdir(dir);}catch{return undefined;} for(const f of files){const p=join(dir,f);try{const v=JSON.parse(await readFile(p,'utf8'));if(v.id===id)return p;}catch{}} return undefined; }
}
