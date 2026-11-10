import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { result } from './core-types.js';
import type { AnalyzerProvider, ProviderRunOptions } from './providers-registry.js';
import { findExecutable, COMMON_BIN_DIRS } from './providers-discover.js';
import { operatingMode } from './benchmark-gate.js';
const execFileAsync = promisify(execFile);
let cached: {
    path: string;
    version?: string;
} | null | undefined;
async function resolveGdb() {
    if (cached !== undefined)
        return cached;
    cached = await findExecutable(['gdb', 'gdb-multiarch', 'lldb'], COMMON_BIN_DIRS, ['--version']);
    return cached;
}
export function createGdbProvider(): AnalyzerProvider {
    return {
        name: 'gdb',
        capabilities: ['backtrace', 'batch-inspect', 'attach-batch'],
        async available() {
            return (await resolveGdb()) !== null;
        },
        async detail() {
            const g = await resolveGdb();
            return g ? `${g.path}${g.version ? ' (' + g.version + ')' : ''}` : undefined;
        },
        async analyze(target: string, opts?: ProviderRunOptions) {
            return inspectWithGdb(target, opts);
        },
        async shutdown() {
            cached = undefined;
        }
    };
}
export async function inspectWithGdb(target: string, opts?: ProviderRunOptions & {
    pid?: number;
}) {
    const g = await resolveGdb();
    if (!g) {
        return result(target, 'gdb_inspect', [], {
            status: 'unsupported',
            limitations: [
                'GDB/LLDB not found on PATH.',
                'Results are never fabricated when the debugger is absent.'
            ],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    if (operatingMode() !== 'CONTROLLED_EXECUTION') {
        return result(target, 'gdb_inspect', [], {
            status: 'unsupported',
            limitations: [
                'Debugger attach/batch inspect requires REVERSE_MODE=CONTROLLED_EXECUTION.',
                `Debugger present at ${g.path} but was refused by the safety gate.`
            ],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    const isLldb = /lldb/i.test(g.path);
    const pid = opts?.pid ?? (/^\d+$/.test(target) ? Number(target) : undefined);
    try {
        let args: string[];
        if (pid != null && !isLldb) {
            args = [
                '-batch',
                '-ex', `attach ${pid}`,
                '-ex', 'info threads',
                '-ex', 'backtrace',
                '-ex', 'info sharedlibrary',
                '-ex', 'detach',
                '-ex', 'quit'
            ];
        }
        else if (pid != null && isLldb) {
            args = [
                '-b',
                '-o', `process attach --pid ${pid}`,
                '-o', 'bt',
                '-o', 'image list',
                '-o', 'process detach',
                '-o', 'quit'
            ];
        }
        else if (isLldb) {
            args = [
                '-b',
                '-o', `file ${target}`,
                '-o', 'image list',
                '-o', 'quit'
            ];
        }
        else {
            args = [
                '-batch',
                '-ex', `file ${target}`,
                '-ex', 'info files',
                '-ex', 'info functions',
                '-ex', 'quit'
            ];
        }
        const { stdout, stderr } = await execFileAsync(g.path, args, {
            timeout: opts?.timeoutMs ?? 30000,
            windowsHide: true,
            maxBuffer: 4 * 1024 * 1024,
            signal: opts?.signal as any
        });
        return result(target, 'gdb_inspect', [{
                engine: isLldb ? 'lldb' : 'gdb',
                enginePath: g.path,
                attached: pid != null,
                logExcerpt: `${stdout}\n${stderr}`.slice(0, 50000)
            }], {
            status: 'partial',
            limitations: [
                pid != null
                    ? 'Batch attach + backtrace; not a full interactive debug session.'
                    : 'Batch file inspection; live attach needs a numeric pid.',
                'Original process is detached after the batch commands.'
            ],
            coverage: {
                examined: true,
                complete: false,
                notes: ['Debugger batch commands completed under CONTROLLED_EXECUTION.']
            }
        });
    }
    catch (e: any) {
        return result(target, 'gdb_inspect', [], {
            status: 'failed',
            limitations: [`GDB failed: ${e?.message ?? String(e)}`],
            errors: [String(e?.message ?? e)],
            coverage: { examined: true, complete: false, notes: [] }
        });
    }
}
