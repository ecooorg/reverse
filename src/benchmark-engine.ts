import { spawn } from 'node:child_process';import { performance } from 'node:perf_hooks';import { result } from './core-types.js';import { saveJson } from './core-util.js';import { killProcessTree } from './process-tree.js';
export interface RunSpec { command:string; args?:string[]; cwd?:string; timeoutMs?:number; repetitions?:number; label?:string; }
const OUTPUT_CAP = 1024 * 1024; // bytes of text kept per stream; the excess is dropped and flagged
const KILL_GRACE_MS = 2000;     // how long to wait for stdio to close after the process tree was killed

/** Appends `chunk` to `cur` without ever exceeding OUTPUT_CAP, whatever the chunk size. */
function appendCapped(cur: string, chunk: string): { text: string; truncated: boolean } {
  const room = OUTPUT_CAP - cur.length;
  if (chunk.length <= room) return { text: cur + chunk, truncated: false };
  return { text: room > 0 ? cur + chunk.slice(0, room) : cur, truncated: true };
}

function one(spec: RunSpec): Promise<any> {
  return new Promise(resolve => {
    const start = performance.now();
    let out = '', err = '', timedOut = false, stdoutTruncated = false, stderrTruncated = false, settled = false, terminated = 0;
    let timer: NodeJS.Timeout | undefined, grace: NodeJS.Timeout | undefined, killing: Promise<void> | undefined;
    const child = spawn(spec.command, spec.args ?? [], { cwd: spec.cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: false, env: process.env, windowsHide: true });
    const finish = (extra: Record<string, unknown>) => {
      if (settled) return; settled = true;
      clearTimeout(timer); clearTimeout(grace);
      resolve({ durationMs: performance.now() - start, timedOut, stdout: out, stderr: err, stdoutTruncated, stderrTruncated, processesTerminated: terminated, ...extra });
    };
    child.stdout!.setEncoding('utf8'); child.stderr!.setEncoding('utf8');
    child.stdout!.on('data', (d: string) => { const r = appendCapped(out, d); out = r.text; stdoutTruncated ||= r.truncated; });
    child.stderr!.on('data', (d: string) => { const r = appendCapped(err, d); err = r.text; stderrTruncated ||= r.truncated; });
    timer = setTimeout(() => {
      timedOut = true;
      // Kill the whole tree (the snapshot is taken first, so grandchildren cannot escape by being re-parented).
      killing = killProcessTree(child.pid ?? 0).then(n => { terminated = n; }, () => { try { child.kill('SIGKILL'); } catch { /* gone */ } });
      // A survivor can still hold the stdio pipes open; do not wait for 'close' forever.
      grace = setTimeout(() => { child.stdout!.destroy(); child.stderr!.destroy(); finish({ exitCode: null, signal: 'SIGKILL' }); }, KILL_GRACE_MS);
    }, Math.max(100, Math.min(120000, spec.timeoutMs ?? 30000)));
    child.on('error', e => finish({ exitCode: null, signal: null, error: e.message }));
    // The tree kill may still be reporting (taskkill is slow on Windows): wait for it, so the count is final and no survivor outlives the run.
    child.on('close', (code, signal) => { void (killing ?? Promise.resolve()).then(() => finish({ exitCode: code, signal })); });
  });
}
export async function runBenchmark(spec:RunSpec){if(!spec.command?.trim())throw new Error('A command is required.');const n=Math.max(1,Math.min(20,Math.floor(spec.repetitions??3)));const runs=[];for(let i=0;i<n;i++){const r=await one(spec);runs.push({...r,index:i+1});if(r.error||r.timedOut)break;}const times=runs.map(x=>x.durationMs),mean=times.reduce((a,b)=>a+b,0)/Math.max(1,times.length),sorted=[...times].sort((a,b)=>a-b);const summary={label:spec.label??'benchmark',command:spec.command,args:spec.args??[],cwd:spec.cwd??process.cwd(),repetitionsRequested:n,repetitionsCompleted:runs.length,meanDurationMs:mean,medianDurationMs:sorted.length?sorted[Math.floor(sorted.length/2)]:null,minDurationMs:sorted.length?Math.min(...sorted):null,maxDurationMs:sorted.length?Math.max(...sorted):null,runs};const r=result(spec.command,'benchmark',[summary],{status:runs.some(x=>x.error||x.timedOut)?'partial':'completed',limitations:['This engine measures wall-clock duration and captures stdout/stderr bounded to 1 MiB per stream (excess output is dropped and flagged as truncated).','On timeout the whole process tree is terminated, not only the direct child.','CPU/RAM sampling, cold/warm classification, disk/network I/O and hardware normalization are not yet integrated.','Run commands execute with the current user permissions. Use trusted commands and an isolated working directory.'],coverage:{examined:runs.length>0,complete:runs.length===n,notes:['No shell is used; command and arguments are passed directly.','Each repetition is a fresh process.']}});const saved=await saveJson('benchmarks',r);return {...r,findings:[{...summary,artifactPath:saved}]};}
export async function compareBenchmarks(before:any,after:any){const a=Number(before?.findings?.[0]?.meanDurationMs),b=Number(after?.findings?.[0]?.meanDurationMs);if(!Number.isFinite(a)||!Number.isFinite(b)||a<=0)throw new Error('Both inputs must be Reverse benchmark results with positive meanDurationMs.');const delta=b-a;return result('benchmark-pair','benchmark_comparison',[{beforeMeanMs:a,afterMeanMs:b,deltaMs:delta,changePercent:delta/a*100,improved:delta<0,interpretation:delta<0?'Lower wall-clock time was observed.':'No wall-clock improvement was observed.'}],{limitations:['A timing difference alone does not establish causality or functional equivalence.','Compare repeated runs under equivalent hardware, load, inputs and configuration.']});}
