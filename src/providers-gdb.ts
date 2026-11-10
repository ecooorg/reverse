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
        capabilities: ['backtrace', 'breakpoints', 'batch-inspect', 'dynamic-trace'],
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
                'Debugger attach requires REVERSE_MODE=CONTROLLED_EXECUTION.',
                `Debugger present at ${g.path} but attach was refused by the safety gate.`
            ],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    try {
        const args = g.path.includes('lldb')
            ? ['-b', '-o', `file ${target}`, '-o', 'image list', '-o', 'quit']
            : ['-batch', '-ex', `file ${target}`, '-ex', 'info files', '-ex', 'info functions', '-ex', 'quit'];
        const { stdout, stderr } = await execFileAsync(g.path, args, {
            timeout: opts?.timeoutMs ?? 30000,
            windowsHide: true,
            maxBuffer: 4 * 1024 * 1024,
            signal: opts?.signal as any
        });
        return result(target, 'gdb_inspect', [{
                engine: g.path.includes('lldb') ? 'lldb' : 'gdb',
                enginePath: g.path,
                logExcerpt: `${stdout}\n${stderr}`.slice(0, 50000)
            }], {
            status: 'partial',
            limitations: [
                'Batch file inspection only; live attach/step needs an interactive session.',
                'Original process is not modified when only a file is opened.'
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
