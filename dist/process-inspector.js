import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { result } from './core-types.js';
const exec = promisify(execFile);
export async function listProcesses(limit = 100) {
    const cap = Math.max(1, Math.min(500, Math.floor(limit)));
    let rows = [];
    let limitations = [];
    try {
        if (process.platform === 'win32') {
            const { stdout } = await exec('tasklist', ['/FO', 'CSV', '/NH'], { timeout: 5000, maxBuffer: 2 * 1024 * 1024 });
            rows = stdout.trim().split(/\r?\n/).slice(0, cap).map(x => { const a = x.match(/^"([^"]+)"\s*,\s*"(\d+)"/); return a ? { name: a[1], pid: Number(a[2]) } : null; }).filter((x) => !!x);
        }
        else {
            const { stdout } = await exec('ps', ['-axo', 'pid=,ppid=,comm=,args='], { timeout: 5000, maxBuffer: 4 * 1024 * 1024 });
            rows = stdout.trim().split(/\r?\n/).slice(0, cap).map(line => { const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/); return m ? { pid: +m[1], ppid: +m[2], name: m[3], command: m[4] } : null; }).filter(Boolean);
        }
    }
    catch (e) {
        limitations.push(`Process enumeration failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    return result('local-host', 'process_inventory', rows, { status: limitations.length ? 'partial' : 'completed', limitations, coverage: { examined: true, complete: false, notes: ['Process visibility is limited by operating-system permissions.', 'Inventory is capped and is a point-in-time snapshot.'] } });
}
export async function inspectProcess(pid) { if (!Number.isInteger(pid) || pid <= 0)
    throw new Error('PID must be a positive integer.'); const inv = await listProcesses(500); const p = inv.findings.find(x => x.pid === pid); if (!p)
    return result(String(pid), 'process_inspection', [], { status: 'partial', limitations: ['Process was not visible in the current process inventory.'] }); return result(String(pid), 'process_inspection', [p], { limitations: ['No memory maps, file handles, threads, or per-process I/O counters are collected by this basic inspector.'], coverage: { examined: true, complete: false, notes: ['Point-in-time process metadata only.'] } }); }
//# sourceMappingURL=process-inspector.js.map