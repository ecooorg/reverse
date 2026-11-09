import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { result } from './core-types.js';
import { execTimeoutMs } from './core-util.js';
const exec = promisify(execFile);
export interface ProcessInfo { pid:number; ppid?:number; name:string; command?:string; }

/** Every process visible to the current user, without any row cap. */
async function enumerate(): Promise<{ rows: ProcessInfo[]; limitations: string[] }> {
  const limitations: string[] = [];
  let rows: ProcessInfo[] = [];
  try {
    if (process.platform === 'win32') {
      const { stdout } = await exec('tasklist', ['/FO', 'CSV', '/NH'], { timeout: execTimeoutMs(10000), maxBuffer: 8 * 1024 * 1024, windowsHide: true });
      rows = stdout.trim().split(/\r?\n/).map(x => {
        const a = x.match(/^"([^"]+)"\s*,\s*"(\d+)"/);
        return a ? { name: a[1], pid: Number(a[2]) } : null;
      }).filter((x): x is ProcessInfo => !!x);
    } else {
      const { stdout } = await exec('ps', ['-axo', 'pid=,ppid=,comm=,args='], { timeout: execTimeoutMs(5000), maxBuffer: 16 * 1024 * 1024 });
      rows = stdout.trim().split(/\r?\n/).map(line => {
        const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/);
        return m ? { pid: +m[1], ppid: +m[2], name: m[3], command: m[4] } : null;
      }).filter(Boolean) as ProcessInfo[];
    }
  } catch (e) { limitations.push(`Process enumeration failed: ${e instanceof Error ? e.message : String(e)}`); }
  return { rows, limitations };
}

export async function listProcesses(limit = 100) {
  const cap = Math.max(1, Math.min(500, Math.floor(limit)));
  const { rows, limitations } = await enumerate();
  const shown = rows.slice(0, cap);
  return result<ProcessInfo>('local-host', 'process_inventory', shown, {
    status: limitations.length ? 'partial' : 'completed',
    limitations,
    coverage: { examined: true, complete: false, notes: ['Process visibility is limited by operating-system permissions.', `Inventory is a point-in-time snapshot; ${shown.length} of ${rows.length} visible processes are returned (limit ${cap}, maximum 500).`] },
  });
}

export async function inspectProcess(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('PID must be a positive integer.');
  // Search the full inventory: the 500-row display cap of listProcesses must not hide a process.
  const { rows, limitations } = await enumerate();
  const p = rows.find(x => x.pid === pid);
  if (!p) return result<ProcessInfo>(String(pid), 'process_inspection', [], { status: 'partial', limitations: [...limitations, 'Process was not visible in the current process inventory.'] });
  return result<ProcessInfo>(String(pid), 'process_inspection', [p], {
    limitations: ['No memory maps, file handles, threads, or per-process I/O counters are collected by this basic inspector.'],
    coverage: { examined: true, complete: false, notes: ['Point-in-time process metadata only.'] },
  });
}
