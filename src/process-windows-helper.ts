import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
type Operation = 'list' | 'inspect' | 'tree' | 'sample';
interface Pending {
    resolve(value: string): void;
    reject(error: Error): void;
    timer: NodeJS.Timeout;
}
let child: ChildProcessWithoutNullStreams | undefined;
let pending: Pending | undefined;
let stderr = '';
let nextRequest = 0;
let helperStarts = 0;
process.once('exit', () => {
    if (child && child.exitCode === null)
        child.kill();
});
let queue = Promise.resolve();
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const SCRIPT = [
    '[Console]::InputEncoding=[System.Text.Encoding]::UTF8;',
    '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;',
    '$started = @{ n="Started"; e={ if($_.CreationDate) { $_.CreationDate.ToUniversalTime().ToString("o") } } };',
    '$props = @("ProcessId","ParentProcessId","Name","CommandLine","ExecutablePath",',
    '  "ThreadCount","WorkingSetSize","VirtualSize",$started);',
    '$treeProps = @("ProcessId","ParentProcessId",$started);',
    'while ($line = [Console]::In.ReadLine()) {',
    '  try {',
    '    $request = ConvertFrom-Json -InputObject $line;',
    '    switch ($request.op) {',
    '      "list" { $rows = @(Get-CimInstance Win32_Process | Select-Object $props) }',
    '      "inspect" {',
    '        $targetPid = [int]$request.pid;',
    '        if ($targetPid -le 0) { throw "Invalid PID" };',
    '        $filter = "ProcessId=$targetPid OR ParentProcessId=$targetPid";',
    '        $rows = @(Get-CimInstance Win32_Process -Filter $filter | Select-Object $props);',
    '      }',
    '      "tree" {',
    '        $rows = @(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,CreationDate | Select-Object $treeProps);',
    '      }',
    '      "sample" {',
    '        $targetPid = [int]$request.pid;',
    '        if ($targetPid -le 0) { throw "Invalid PID" };',
    '        $p = Get-Process -Id $targetPid -ErrorAction Stop;',
    '        $rows = [pscustomobject]@{ cpuMs=[int64]$p.TotalProcessorTime.TotalMilliseconds;',
    '          rss=[int64]$p.WorkingSet64; peak=[int64]$p.PeakWorkingSet64 };',
    '      }',
    '      default { throw "Unsupported helper operation" }',
    '    }',
    '    ConvertTo-Json -InputObject @($rows) -Compress -Depth 4;',
    '  } catch {',
    '    @{ error = $_.Exception.Message } | ConvertTo-Json -Compress;',
    '  }',
    '}',
].join('\n');
/** Build PowerShell arguments without passing multiline source through -Command quoting. */
export function windowsHelperLaunchArguments(): string[] {
    const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
    return ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded];
}
/** An idle helper must not keep the host process alive: pending requests are held by their own timers. */
function detachFromEventLoop(proc: ChildProcessWithoutNullStreams): void {
    proc.unref();
    for (const stream of [proc.stdin, proc.stdout, proc.stderr])
        (stream as unknown as { unref?: () => void }).unref?.();
}
function startHelper(): ChildProcessWithoutNullStreams {
    if (child && child.exitCode === null && !child.killed)
        return child;
    const proc = spawn('powershell.exe', windowsHelperLaunchArguments(), {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
    });
    child = proc;
    detachFromEventLoop(proc);
    helperStarts++;
    stderr = '';
    let stdoutBuffer = '';
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk: string) => {
        stdoutBuffer += chunk;
        if (Buffer.byteLength(stdoutBuffer) > MAX_RESPONSE_BYTES) {
            const active = pending;
            pending = undefined;
            if (active) {
                clearTimeout(active.timer);
                active.reject(new Error('Persistent PowerShell helper exceeded the 32 MiB response limit.'));
            }
            proc.kill();
            if (child === proc)
                child = undefined;
            return;
        }
        let newline = stdoutBuffer.indexOf('\n');
        while (newline >= 0) {
            const line = stdoutBuffer.slice(0, newline).replace(/\r$/, '');
            stdoutBuffer = stdoutBuffer.slice(newline + 1);
            const active = pending;
            if (active) {
                pending = undefined;
                clearTimeout(active.timer);
                try {
                    const parsed = JSON.parse(line);
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.error)
                        active.reject(new Error(String(parsed.error)));
                    else
                        active.resolve(line);
                }
                catch {
                    active.reject(new Error('Persistent PowerShell helper returned invalid JSON.'));
                    proc.kill();
                    if (child === proc)
                        child = undefined;
                }
            }
            newline = stdoutBuffer.indexOf('\n');
        }
    });
    proc.stderr.on('data', chunk => {
        stderr = (stderr + String(chunk)).slice(-4096);
    });
    const fail = (code: number | null, signal: NodeJS.Signals | null) => {
        if (child !== proc)
            return;
        const active = pending;
        pending = undefined;
        if (active) {
            clearTimeout(active.timer);
            active.reject(new Error(`Persistent PowerShell helper exited (${code ?? signal ?? 'unknown'}). ${stderr}`));
        }
        child = undefined;
    };
    proc.once('error', () => fail(null, null));
    proc.once('close', fail);
    return proc;
}
/** Execute one allow-listed CIM operation through a reusable PowerShell process. */
export function windowsHelperRequest(operation: Operation, pid?: number, timeoutMs = 15000): Promise<string> {
    if (process.platform !== 'win32')
        return Promise.reject(new Error('Persistent PowerShell helper is available only on Windows.'));
    const request = async (): Promise<string> => {
        const proc = startHelper();
        if (pending)
            throw new Error('Persistent PowerShell helper request overlap.');
        const id = ++nextRequest;
        return await new Promise<string>((resolve, reject) => {
            const timer = setTimeout(() => {
                if (pending?.timer !== timer)
                    return;
                pending = undefined;
                proc.kill();
                child = undefined;
                reject(new Error(`Persistent PowerShell helper timed out on request ${id}.`));
            }, timeoutMs);
            pending = { resolve, reject, timer };
            proc.stdin.write(`${JSON.stringify({ id, op: operation, ...(pid === undefined ? {} : { pid }) })}\n`, error => {
                if (!error)
                    return;
                if (pending?.timer === timer) {
                    pending = undefined;
                    clearTimeout(timer);
                    if (child === proc)
                        child = undefined;
                    proc.kill();
                    reject(error);
                }
            });
        });
    };
    const result = queue.then(request, request);
    queue = result.then(() => undefined, () => undefined);
    return result;
}
/** Stop the persistent helper; intended for orderly application shutdown and tests. */
export function closeWindowsHelper(): void {
    const proc = child;
    child = undefined;
    if (proc && proc.exitCode === null) {
        proc.stdin.end();
        const active = pending;
        pending = undefined;
        if (active) {
            clearTimeout(active.timer);
            active.reject(new Error('Persistent PowerShell helper was closed.'));
        }
    }
}
/** Diagnostic counter used by the cross-platform helper lifecycle test. */
export function windowsHelperStartCount(): number { return helperStarts; }
