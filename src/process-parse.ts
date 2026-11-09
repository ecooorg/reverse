// Pure parsers for the helper commands used on macOS and Windows.
// They take captured stdout and return rows, so they can be verified with fixtures on any host.
import path from 'node:path';

export interface ParsedProcess {
  pid: number;
  ppid?: number;
  name: string;
  command?: string;
  executable?: string;
  identityToken?: string;
  ownerUid?: number;
  startedAt?: string;
  uptimeSeconds?: number;
  threads?: number;
  rssBytes?: number;
  vmsBytes?: number;
  cpuPercent?: number;
}

/**
 * Columns requested from macOS/BSD `ps`, in order. `comm` must stay last because it can contain
 * spaces. BSD `ps` has no per-process thread-count column (`thcount` and `nlwp` do not exist
 * there), so threads are not collected on macOS.
 */
export const MAC_PS_FIELDS = ['pid=', 'ppid=', 'uid=', '%cpu=', 'rss=', 'vsz=', 'etime=', 'lstart=', 'comm='];
/** Second `ps` call: full command lines, kept separate because both `comm` and `args` contain spaces. */
export const MAC_PS_ARGS_FIELDS = ['pid=', 'args='];

/** Parse `ps` elapsed time: [[dd-]hh:]mm:ss. Returns undefined when the text does not match. */
export function parseEtime(text: string): number | undefined {
  const m = text.trim().match(/^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/);
  if (!m) return undefined;
  const [days, hours, minutes, seconds] = [m[1], m[2], m[3], m[4]].map(x => Number(x ?? 0));
  return ((days * 24 + hours) * 60 + minutes) * 60 + seconds;
}

const MAC_ROW = /^(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\w{3}\s+\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.+)$/;

function parseMacArgs(stdout: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.trim().match(/^(\d+)\s+(.*)$/);
    if (m) map.set(Number(m[1]), m[2]);
  }
  return map;
}

/** Parse the output of the two macOS `ps` calls. Lines that do not match are skipped. */
export function parseMacPs(psOutput: string, argsOutput = ''): ParsedProcess[] {
  const args = parseMacArgs(argsOutput);
  const rows: ParsedProcess[] = [];
  for (const line of psOutput.split(/\r?\n/)) {
    const m = line.trim().match(MAC_ROW);
    if (!m) continue;
    const pid = Number(m[1]);
    const startText = m[8].replace(/\s+/g, ' ');
    const started = new Date(startText);
    const comm = m[9].trim();
    rows.push({
      pid,
      ppid: Number(m[2]),
      ownerUid: Number(m[3]),
      cpuPercent: Number(m[4]),
      rssBytes: Number(m[5]) * 1024,
      vmsBytes: Number(m[6]) * 1024,
      uptimeSeconds: parseEtime(m[7]),
      startedAt: Number.isNaN(started.getTime()) ? undefined : started.toISOString(),
      name: path.posix.basename(comm) || comm,
      executable: comm.startsWith('/') ? comm : undefined,
      command: args.get(pid) || comm,
      identityToken: `mac:${pid}:${startText}`,
    });
  }
  return rows;
}

/**
 * PowerShell script for Windows. `Started` is formatted by PowerShell as a round-trip UTC string
 * because Windows PowerShell 5.1 serializes DateTime values as "/Date(ms)/", which `new Date()`
 * cannot read. Output is forced to UTF-8 so non-ASCII process names survive.
 */
export const WINDOWS_CIM_SCRIPT = [
  '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;',
  'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine,ExecutablePath,ThreadCount,WorkingSetSize,VirtualSize,',
  "@{n='Started';e={if($_.CreationDate){$_.CreationDate.ToUniversalTime().ToString('o')}}}",
  '| ConvertTo-Json -Compress',
].join(' ');

const positive = (value: unknown): number | undefined => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Parse the JSON produced by WINDOWS_CIM_SCRIPT. A single process arrives as an object, not an array. */
export function parseWindowsCim(stdout: string): ParsedProcess[] {
  const text = stdout.replace(/^\uFEFF/, '').trim();
  const data: any = JSON.parse(text || '[]');
  const rows: ParsedProcess[] = [];
  for (const x of Array.isArray(data) ? data : [data]) {
    const pid = Number(x?.ProcessId);
    if (!Number.isInteger(pid) || pid < 0) continue;
    const started = typeof x.Started === 'string' ? new Date(x.Started) : undefined;
    const valid = started !== undefined && !Number.isNaN(started.getTime());
    rows.push({
      pid,
      ppid: Number.isFinite(Number(x.ParentProcessId)) ? Number(x.ParentProcessId) : undefined,
      name: x.Name ?? '',
      command: x.CommandLine ?? '',
      executable: x.ExecutablePath ?? undefined,
      threads: positive(x.ThreadCount),
      rssBytes: positive(x.WorkingSetSize),
      vmsBytes: positive(x.VirtualSize),
      startedAt: valid ? started.toISOString() : undefined,
      uptimeSeconds: valid ? Math.max(0, (Date.now() - started.getTime()) / 1000) : undefined,
      identityToken: valid ? `windows:${x.Started}` : undefined,
    });
  }
  return rows;
}
