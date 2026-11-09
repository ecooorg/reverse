import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

/** Parent -> children map of every process visible to the current user (POSIX only). */
async function childMap(): Promise<Map<number, number[]>> {
  const { stdout } = await exec('ps', ['-axo', 'pid=,ppid='], { timeout: 3000, maxBuffer: 4 * 1024 * 1024 });
  const map = new Map<number, number[]>();
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.trim().match(/^(\d+)\s+(\d+)$/);
    if (!m) continue;
    const pid = Number(m[1]), ppid = Number(m[2]);
    const list = map.get(ppid);
    if (list) list.push(pid); else map.set(ppid, [pid]);
  }
  return map;
}

/** All descendants of `rootPid`, deepest first. Not available on Windows (returns an empty list). */
export async function listDescendants(rootPid: number): Promise<number[]> {
  if (process.platform === 'win32') return [];
  const map = await childMap();
  const order: number[] = [];
  const queue = [rootPid];
  while (queue.length) {
    const next = map.get(queue.shift()!) ?? [];
    for (const pid of next) { order.push(pid); queue.push(pid); }
  }
  return order.reverse();
}

/**
 * Terminates a process and everything it started. The tree is snapshotted BEFORE anything is killed,
 * because orphans are re-parented and can no longer be found afterwards. Returns the number of
 * processes a kill was attempted on.
 */
export async function killProcessTree(pid: number): Promise<number> {
  if (!Number.isInteger(pid) || pid <= 0) return 0;
  if (process.platform === 'win32') {
    try { await exec('taskkill', ['/PID', String(pid), '/T', '/F'], { timeout: 10000, windowsHide: true }); } catch { /* already gone */ }
    return 1;
  }
  let victims: number[] = [];
  try { victims = await listDescendants(pid); } catch { /* fall back to killing the root only */ }
  victims.push(pid);
  let attempted = 0;
  for (const v of victims) { try { process.kill(v, 'SIGKILL'); attempted++; } catch { /* already gone */ } }
  return attempted;
}
