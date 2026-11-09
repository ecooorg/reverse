import { spawn } from 'node:child_process';import { performance } from 'node:perf_hooks';import { result } from './core-types.js';import { saveJson } from './core-util.js';import { killProcessTree } from './process-tree.js';
export interface RunSpec { command:string; args?:string[]; cwd?:string; timeoutMs?:number; repetitions?:number; label?:string; }
const OUTPUT_CAP = 1024 * 1024; // BYTES kept per stream; the excess is dropped and flagged
const KILL_GRACE_MS = 2000;     // how long to wait for stdio to close after the process tree was killed

/** Byte-accurate capture buffer: never holds more than OUTPUT_CAP bytes, whatever the chunk size. */
class CappedBuffer {
  private chunks: Buffer[] = [];
  private size = 0;
  truncated = false;
  push(chunk: Buffer): void {
    const room = OUTPUT_CAP - this.size;
    if (chunk.length <= room) { this.chunks.push(chunk); this.size += chunk.length; return; }
    if (room > 0) { this.chunks.push(chunk.subarray(0, room)); this.size += room; }
    this.truncated = true;
  }
  /** Decoded once at the end, so a multi-byte character is never split between chunks. */
  text(): string { return Buffer.concat(this.chunks).toString('utf8'); }
}

/** Median of an unsorted list; the mean of the two middle values for an even count. Null for an empty list. */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function one(spec: RunSpec): Promise<any> {
  return new Promise(resolve => {
    const start = performance.now();
    const out = new CappedBuffer(), err = new CappedBuffer();
    let timedOut = false, settled = false, terminated = 0;
    let timer: NodeJS.Timeout | undefined, grace: NodeJS.Timeout | undefined, killing: Promise<void> | undefined;
    const child = spawn(spec.command, spec.args ?? [], { cwd: spec.cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: false, env: process.env, windowsHide: true });
    const finish = (extra: Record<string, unknown>) => {
      if (settled) return; settled = true;
      clearTimeout(timer); clearTimeout(grace);
      resolve({ durationMs: performance.now() - start, timedOut, stdout: out.text(), stderr: err.text(), stdoutTruncated: out.truncated, stderrTruncated: err.truncated, processesTerminated: terminated, ...extra });
    };
        child.stdout!.on('data', (d: Buffer) => out.push(d));
    child.stderr!.on('data', (d: Buffer) => err.push(d));
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
export async function runBenchmark(spec:RunSpec){if(!spec.command?.trim())throw new Error('A command is required.');const n=Math.max(1,Math.min(20,Math.floor(spec.repetitions??3)));const runs=[];for(let i=0;i<n;i++){const r=await one(spec);runs.push({...r,index:i+1});if(r.error||r.timedOut)break;}const times=runs.map(x=>x.durationMs),mean=times.reduce((a,b)=>a+b,0)/Math.max(1,times.length),sorted=[...times].sort((a,b)=>a-b);const summary={label:spec.label??'benchmark',command:spec.command,args:spec.args??[],cwd:spec.cwd??process.cwd(),repetitionsRequested:n,repetitionsCompleted:runs.length,meanDurationMs:mean,medianDurationMs:median(times),minDurationMs:sorted.length?Math.min(...sorted):null,maxDurationMs:sorted.length?Math.max(...sorted):null,runs};const r=result(spec.command,'benchmark',[summary],{status:runs.some(x=>x.error||x.timedOut)?'partial':'completed',limitations:['This engine measures wall-clock duration and captures stdout/stderr bounded to 1 MiB per stream (excess output is dropped and flagged as truncated); the cap is counted in bytes.','On timeout the whole process tree is terminated, not only the direct child.','CPU/RAM sampling, cold/warm classification, disk/network I/O and hardware normalization are not yet integrated.','Run commands execute with the current user permissions. Use trusted commands and an isolated working directory.'],coverage:{examined:runs.length>0,complete:runs.length===n,notes:['No shell is used; command and arguments are passed directly.','Each repetition is a fresh process.']}});const saved=await saveJson('benchmarks',r);return {...r,findings:[{...summary,artifactPath:saved}]};}
export async function compareBenchmarks(before:any,after:any){const a=Number(before?.findings?.[0]?.meanDurationMs),b=Number(after?.findings?.[0]?.meanDurationMs);if(!Number.isFinite(a)||!Number.isFinite(b)||a<=0)throw new Error('Both inputs must be Reverse benchmark results with positive meanDurationMs.');const delta=b-a;return result('benchmark-pair','benchmark_comparison',[{beforeMeanMs:a,afterMeanMs:b,deltaMs:delta,changePercent:delta/a*100,improved:delta<0,interpretation:delta<0?'Lower wall-clock time was observed.':'No wall-clock improvement was observed.'}],{limitations:['A timing difference alone does not establish causality or functional equivalence.','Compare repeated runs under equivalent hardware, load, inputs and configuration.']});}
