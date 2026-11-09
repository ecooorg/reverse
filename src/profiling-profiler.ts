import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { result } from './core-types.js';
import { inspectProcess, verifyProcessOwnership } from './process-inspector.js';
export type ProfileMode='Snapshot'|'Monitor'|'Diagnostic'|'Compare';
export interface ProfileOptions { durationMs?:number; intervalMs?:number; mode?:ProfileMode; signal?:AbortSignal; expectedIdentityToken?:string; requireOwnership?:boolean; }
export async function profileProcess(pid:number,durationMs=3000,intervalMs=250,mode:ProfileMode='Monitor',options:Pick<ProfileOptions,'signal'|'expectedIdentityToken'|'requireOwnership'>={}){
 if(!Number.isInteger(pid)||pid<=0)throw new Error('PID must be a positive integer.');
 const duration=Math.max(500,Math.min(30000,durationMs)),interval=Math.max(100,Math.min(2000,intervalMs));
 const samples:any[]=[],errors:string[]=[],limitations:string[]=['Process-level sampling; no function-level hotspots or network metrics.','Metrics depend on operating-system permissions and provider availability.'];let previous:any=null;const started=Date.now();
 const signal=options.signal;let identity=options.expectedIdentityToken;
 const initial:any=await inspectProcess(pid);const initialProcess=initial.findings[0];
 if(!initialProcess)return result('pid:'+pid,'process_profile',[],{status:'partial',errors:['Process does not exist or is not visible.'],limitations:initial.limitations});
 identity=identity??initialProcess.identityToken;
 if(options.expectedIdentityToken&&initialProcess.identityToken!==options.expectedIdentityToken)return result('pid:'+pid,'process_profile',[],{status:'partial',errors:['Process identity does not match the expected start token.'],coverage:{examined:true,complete:false,notes:['PID reuse protection rejected the target.']}});
 if(options.requireOwnership){const owner=await verifyProcessOwnership(pid);if(owner.known&&!owner.owned)return result('pid:'+pid,'process_profile',[],{status:'partial',errors:['Process is not owned by the current user.'],coverage:{examined:true,complete:false,notes:['Ownership check failed before sampling.']}});if(!owner.known)limitations.push('Process ownership could not be verified on this platform; no ownership claim is made.');}
 let cancelled=false;
 do {
  if(signal?.aborted){cancelled=true;break;}
  const r:any=await inspectProcess(pid);const p=r.findings[0];
  if(!p){errors.push(...r.limitations,'Process vanished or is not visible.');break;}
  if(identity&&p.identityToken!==identity){errors.push('Process identity changed or process exited; sampling stopped to prevent PID-reuse contamination.');break;}
  const cpuDelta=previous&&p.cpuTimeMs!==undefined&&previous.cpuTimeMs!==undefined?(p.cpuTimeMs-previous.cpuTimeMs):undefined;
  const elapsed=previous?Date.parse(new Date().toISOString())-Date.parse(previous.at):undefined;
  const cpuPercent=cpuDelta!==undefined&&elapsed&&elapsed>0?Math.max(0,cpuDelta/elapsed*100/Math.max(1,(await import('node:os')).cpus().length)):p.cpuPercent;
  samples.push({at:new Date().toISOString(),cpuPercent,rssBytes:p.rssBytes,vmsBytes:p.vmsBytes,cpuTimeMs:p.cpuTimeMs,diskReadBytes:p.diskReadBytes,diskWriteBytes:p.diskWriteBytes,threads:p.threads,ppid:p.ppid,children:p.children,identity:{name:p.name,executable:p.executable}});
  previous={...p,at:samples[samples.length-1].at};
  if(mode==='Snapshot')break;
  if(Date.now()-started>=duration)break;
  await new Promise<void>(resolve=>{const timer=setTimeout(done,Math.min(interval,duration-(Date.now()-started)));function done(){clearTimeout(timer);signal?.removeEventListener('abort',done);resolve();}signal?.addEventListener('abort',done,{once:true});});
 }while(Date.now()-started<duration);
 const avg=(key:string)=>{const a=samples.map(x=>x[key]).filter((x:number)=>Number.isFinite(x));return a.length?a.reduce((x:number,y:number)=>x+y,0)/a.length:null;};
 const peak=(key:string)=>{const a=samples.map(x=>x[key]).filter((x:number)=>Number.isFinite(x));return a.length?Math.max(...a):null;};
 const first=samples[0],last=samples.at(-1);
 const finding={pid,mode,durationMs:Date.now()-started,sampleCount:samples.length,averageCpuPercent:avg('cpuPercent'),peakCpuPercent:peak('cpuPercent'),averageRssBytes:avg('rssBytes'),peakRssBytes:peak('rssBytes'),memoryChangeBytes:first&&last&&first.rssBytes!==undefined&&last.rssBytes!==undefined?last.rssBytes-first.rssBytes:null,readBytesDelta:first&&last?Math.max(0,(last.diskReadBytes??0)-(first.diskReadBytes??0)):null,writeBytesDelta:first&&last?Math.max(0,(last.diskWriteBytes??0)-(first.diskWriteBytes??0)):null,peakThreads:peak('threads'),samples};
 const home=process.env.REVERSE_HOME||path.join(process.env.HOME||process.env.USERPROFILE||'.','.reverse');const dir=path.join(home,'profiles');await mkdir(dir,{recursive:true});
 const artifactPath=path.join(dir,`${randomUUID()}.json`);await writeFile(artifactPath,JSON.stringify({schemaVersion:1,generatedAt:new Date().toISOString(),finding},null,2)+'\n','utf8');
 return result('pid:'+pid,'process_profile',[{...finding,artifactPath}],{status:errors.length||cancelled||!samples.length?'partial':'completed',errors,limitations:[...limitations,...(cancelled?['Sampling cancelled by caller.']:[])],coverage:{examined:samples.length>0,complete:false,notes:['Sampling duration and interval are bounded.','CPU utilization is derived from process CPU-time deltas where available.','PID start-time identity is checked between samples where supported.','Profile is persisted as structured JSON.']}});
}
export async function monitorProcess(pid:number,options:ProfileOptions={}){return profileProcess(pid,options.durationMs,options.intervalMs,options.mode??'Monitor',options);}
export async function detectResourceAnomalies(series:any[]){
 const findings:any[]=[];for(const p of series){const s=Array.isArray(p.samples)?p.samples:[];if(!s.length)continue;
 const cpu=s.map((x:any)=>x.cpuPercent).filter(Number.isFinite),rss=s.map((x:any)=>x.rssBytes).filter(Number.isFinite);
 const avg=(a:number[])=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
 if(cpu.length&&avg(cpu)>80)findings.push({pid:p.pid,type:'sustained_cpu',severity:'high',averageCpuPercent:avg(cpu),threshold:80});
 if(rss.length>=3&&rss.at(-1)>rss[0]*1.2)findings.push({pid:p.pid,type:'growing_memory',severity:'medium',growthBytes:rss.at(-1)-rss[0],growthRatio:rss.at(-1)/Math.max(1,rss[0])});
 if(cpu.length&&Math.max(...cpu)>95)findings.push({pid:p.pid,type:'cpu_spike',severity:'medium',peakCpuPercent:Math.max(...cpu),threshold:95});
 }
 return result('local-host','resource_anomalies',findings,{coverage:{examined:true,complete:true,notes:['Deterministic thresholds: sustained CPU >80%, spike >95%, RSS growth >20%.']}});
}
