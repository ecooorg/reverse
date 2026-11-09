import { readFile, readdir, readlink, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { result } from './core-types.js';
import { execTimeoutMs } from './core-util.js';
const exec = promisify(execFile);
export interface ProcessInfo {
  pid:number; ppid?:number; name:string; command?:string; executable?:string;
  startedAt?:string; uptimeSeconds?:number; threads?:number; rssBytes?:number; vmsBytes?:number;
  cpuTimeMs?:number; cpuPercent?:number; diskReadBytes?:number; diskWriteBytes?:number;
  openFileDescriptors?:number; children?:number[]; state?:string;
}
const proc = '/proc';
async function linuxInfo(pid:number):Promise<ProcessInfo|null>{
  const base=`${proc}/${pid}`;
  try {
    const [raw,cmdline,exe,io,fd]=await Promise.all([
      readFile(`${base}/stat`,'utf8'), readFile(`${base}/cmdline`).catch(()=>Buffer.alloc(0)),
      readlink(`${base}/exe`).catch(()=>undefined), readFile(`${base}/io`,'utf8').catch(()=>''), readdir(`${base}/fd`).catch(()=>[])
    ]);
    const end=raw.lastIndexOf(')'); const name=raw.slice(raw.indexOf('(')+1,end); const v=raw.slice(end+2).trim().split(/\s+/);
    const ppid=Number(v[1]), utime=Number(v[11]), stime=Number(v[12]), threads=Number(v[17]), startTicks=Number(v[19]), vsize=Number(v[20]), rssPages=Number(v[21]);
    const page=4096, hz=100, btime=Number((await readFile(`${proc}/stat`,'utf8')).match(/^btime (\d+)/m)?.[1]??0);
    const ioVal=(k:string)=>Number(io.match(new RegExp(`^${k}:\\s*(\\d+)`,'m'))?.[1]??0);
    const args=cmdline.toString().split('\0').filter(Boolean).join(' ');
    const started=btime+startTicks/hz;
    return {pid,ppid,name,command:args||name,executable:exe,startedAt:new Date(started*1000).toISOString(),uptimeSeconds:Math.max(0,Date.now()/1000-started),threads,rssBytes:Math.max(0,rssPages)*page,vmsBytes:vsize,cpuTimeMs:(utime+stime)/hz*1000,diskReadBytes:ioVal('read_bytes'),diskWriteBytes:ioVal('write_bytes'),openFileDescriptors:fd.length,state:v[0]};
  } catch { return null; }
}
async function enumerate():Promise<{rows:ProcessInfo[];limitations:string[]}>{
 const limitations:string[]=[];let rows:ProcessInfo[]=[];
 if(process.platform==='linux'){
  try { const ids=(await readdir(proc)).filter(x=>/^\d+$/.test(x)); rows=(await Promise.all(ids.map(x=>linuxInfo(+x)))).filter((x):x is ProcessInfo=>!!x); }
  catch(e){limitations.push(`Process enumeration failed: ${String(e)}`);}
 } else try {
  if(process.platform==='win32'){
   const {stdout}=await exec('powershell.exe',['-NoProfile','-Command','Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine,ExecutablePath,ThreadCount,WorkingSetSize,VirtualSize,CreationDate | ConvertTo-Json -Compress'],{timeout:execTimeoutMs(15000),maxBuffer:32*1024*1024,windowsHide:true});
   const data=JSON.parse(stdout||'[]');for(const x of Array.isArray(data)?data:[data]) rows.push({pid:Number(x.ProcessId),ppid:Number(x.ParentProcessId),name:x.Name??'',command:x.CommandLine??'',executable:x.ExecutablePath??undefined,threads:Number(x.ThreadCount)||undefined,rssBytes:Number(x.WorkingSetSize)||undefined,vmsBytes:Number(x.VirtualSize)||undefined,startedAt:x.CreationDate?new Date(x.CreationDate).toISOString():undefined});
  } else {
   const {stdout}=await exec('ps',['-axo','pid=,ppid=,comm=,args=,%cpu=,rss=,etime=,nlwp='],{timeout:execTimeoutMs(10000),maxBuffer:32*1024*1024});
   const parsed: (ProcessInfo|null)[]=stdout.trim().split(/\r?\n/).map((line):ProcessInfo|null=>{const m=line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s*(.*?)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(\d+)$/);return m?{pid:+m[1],ppid:+m[2],name:m[3],command:m[4],cpuPercent:+m[5],rssBytes:+m[6]*1024,threads:+m[8]}:null;});rows=parsed.filter((x):x is ProcessInfo=>x!==null);
  }
 }catch(e){limitations.push(`Process enumeration failed: ${e instanceof Error?e.message:String(e)}`);}
 const byParent=new Map<number,number[]>();for(const p of rows){if(p.ppid!==undefined){const a=byParent.get(p.ppid)??[];a.push(p.pid);byParent.set(p.ppid,a);}}
 for(const p of rows)p.children=byParent.get(p.pid)??[];
 return {rows,limitations};
}
export async function listProcesses(limit=100){
 const cap=Math.max(1,Math.min(500,Math.floor(limit)));const {rows,limitations}=await enumerate();const shown=rows.slice(0,cap);
 return result<ProcessInfo>('local-host','process_inventory',shown,{status:limitations.length?'partial':'completed',limitations,coverage:{examined:true,complete:false,notes:[`Snapshot: ${shown.length}/${rows.length} visible processes (limit ${cap}).`,`Platform metrics are limited to those exposed by ${process.platform}.`]}});
}
export async function inspectProcess(pid:number){
 if(!Number.isInteger(pid)||pid<=0)throw new Error('PID must be a positive integer.');
 const {rows,limitations}=await enumerate();const p=rows.find(x=>x.pid===pid);
 if(!p)return result<ProcessInfo>(String(pid),'process_inspection',[],{status:'partial',limitations:[...limitations,'Process does not exist or is not visible.']});
 return result<ProcessInfo>(String(pid),'process_inspection',[p],{limitations,coverage:{examined:true,complete:false,notes:['Identity is re-read from the OS for each operation; PID reuse remains possible between calls.']}});
}
export async function getProcessTree(pid:number){
 const {rows,limitations}=await enumerate();if(!rows.some(p=>p.pid===pid))return result(String(pid),'process_tree',[],{status:'partial',limitations:[...limitations,'Process is not visible.']});
 const map=new Map(rows.map(p=>[p.pid,p]));const walk=(id:number,seen=new Set<number>()):any=>{if(seen.has(id))return null;seen.add(id);const p=map.get(id);if(!p)return null;return {...p,children:(p.children??[]).map(c=>walk(c,seen)).filter(Boolean)};};
 return result(String(pid),'process_tree',[walk(pid)],{limitations,coverage:{examined:true,complete:limitations.length===0,notes:['Tree includes only processes visible to the current user.']}});
}
export async function getProcessMetrics(pid:number){return inspectProcess(pid);}
export async function analyzeMemory(pid:number){const r=await inspectProcess(pid);return result(String(pid),'memory_analysis',r.findings.map((p:any)=>({pid:p.pid,rssBytes:p.rssBytes,vmsBytes:p.vmsBytes,threads:p.threads})),{status:r.status,limitations:r.limitations,coverage:r.coverage});}
export async function analyzeCpu(pid:number){const r=await inspectProcess(pid);return result(String(pid),'cpu_analysis',r.findings.map((p:any)=>({pid:p.pid,cpuPercent:p.cpuPercent,cpuTimeMs:p.cpuTimeMs})),{status:r.status,limitations:r.limitations,coverage:r.coverage});}
export async function analyzeIo(pid:number){const r=await inspectProcess(pid);return result(String(pid),'io_analysis',r.findings.map((p:any)=>({pid:p.pid,diskReadBytes:p.diskReadBytes,diskWriteBytes:p.diskWriteBytes})),{status:r.status,limitations:r.limitations,coverage:r.coverage});}
