import { access, mkdir, readFile, rmdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { result } from './core-types.js';
import { getProcessIdentity, verifyProcessIdentity, verifyProcessOwnership } from './process-inspector.js';

export type OperatingMode = 'READ_ONLY' | 'OBSERVE' | 'CONTROLLED_EXECUTION';
export interface ResourceLimits { memoryMaxBytes?: number; cpuQuotaPercent?: number; }

/** Reports actual enforcement support; detection alone never implies isolation. */
export async function getResourceControlStatus() {
  if (process.platform !== 'linux') return result('local-host','resource_control_status',[{supported:false,mechanism:null}],{status:'partial',limitations:['Hard process resource limits are implemented only for delegated Linux cgroup v2 hierarchies.']});
  try {
    const controllers=(await readFile('/sys/fs/cgroup/cgroup.controllers','utf8')).trim().split(/\s+/);
    const writable=await access('/sys/fs/cgroup', constants.W_OK).then(()=>true).catch(()=>false);
    return result('local-host','resource_control_status',[{supported:controllers.includes('cpu')&&controllers.includes('memory'),mechanism:'cgroup-v2',controllers,writable}],{status:controllers.includes('cpu')&&controllers.includes('memory')?'completed':'partial',limitations:writable?[]:['Cgroup root is not writable by this process; a delegated subtree is required.']});
  } catch(e) { return result('local-host','resource_control_status',[{supported:false,mechanism:'cgroup-v2'}],{status:'partial',errors:[e instanceof Error?e.message:String(e)],limitations:['cgroup v2 controllers are unavailable or not readable.']}); }
}

export async function withProcessResourceLimits<T>(pid:number, limits:ResourceLimits, mode:OperatingMode, confirm:boolean, operation:()=>Promise<T>):Promise<T>{
  if(mode!=='CONTROLLED_EXECUTION'||confirm!==true)throw new Error('Resource limits require mode CONTROLLED_EXECUTION and explicit confirm=true.');
  if(process.platform!=='linux')throw new Error('Enforced process limits are currently supported only on Linux cgroup v2.');
  if(!Number.isInteger(pid)||pid<=0)throw new Error('PID must be a positive integer.');
  if(!Object.keys(limits).length)throw new Error('At least one resource limit is required.');
  if(limits.memoryMaxBytes!==undefined&&(!Number.isSafeInteger(limits.memoryMaxBytes)||limits.memoryMaxBytes<16*1024*1024))throw new Error('memoryMaxBytes must be an integer >= 16 MiB.');
  if(limits.cpuQuotaPercent!==undefined&&(!Number.isFinite(limits.cpuQuotaPercent)||limits.cpuQuotaPercent<=0||limits.cpuQuotaPercent>10000))throw new Error('cpuQuotaPercent must be in (0, 10000].');
  const owner=await verifyProcessOwnership(pid);if(!owner.known||!owner.owned)throw new Error('Target ownership cannot be verified or target is not owned by the current user.');
  const identity=await getProcessIdentity(pid);if(!identity?.identityToken)throw new Error('Stable process identity is unavailable.');
  const raw=await readFile(`/proc/${pid}/cgroup`,'utf8');const match=raw.match(/^0::(.*)$/m);if(!match)throw new Error('Target is not in a unified cgroup v2 hierarchy.');
  const parent=path.join('/sys/fs/cgroup',match[1].replace(/^\/+/,''));const dir=path.join(parent,`reverse-${pid}-${randomUUID()}`);
  await mkdir(dir);
  let moved=false;
  try {
    if(limits.memoryMaxBytes!==undefined)await writeFile(path.join(dir,'memory.max'),String(limits.memoryMaxBytes));
    if(limits.cpuQuotaPercent!==undefined)await writeFile(path.join(dir,'cpu.max'),`${Math.max(1,Math.floor(limits.cpuQuotaPercent*1000))} 100000`);
    if(!(await verifyProcessIdentity(pid,identity.identityToken)))throw new Error('Process identity changed before resource control was applied.');
    await writeFile(path.join(dir,'cgroup.procs'),String(pid));moved=true;
    return await operation();
  } finally {
    if(moved)await writeFile(path.join(parent,'cgroup.procs'),String(pid)).catch(()=>{});
    await rmdir(dir).catch(()=>{});
  }
}
