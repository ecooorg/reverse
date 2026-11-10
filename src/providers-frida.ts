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
async function resolveFrida() {
    if (cached !== undefined)
        return cached;
    cached = await findExecutable(['frida', 'frida-ps', 'frida-trace'], COMMON_BIN_DIRS, ['--version']);
    return cached;
}
export function createFridaProvider(): AnalyzerProvider {
    return {
        name: 'frida',
        capabilities: [
            'dynamic-trace',
            'native-hooks',
            'java-art',
            'adb-transport'
        ],
        async available() {
            return (await resolveFrida()) !== null;
        },
        async detail() {
            const f = await resolveFrida();
            return f ? `${f.path}${f.version ? ' (' + f.version + ')' : ''}` : undefined;
        },
        async analyze(target: string, opts?: ProviderRunOptions) {
            return traceWithFrida(target, opts);
        },
        async shutdown() {
            cached = undefined;
        }
    };
}
/** Execution trace via Frida. Requires CONTROLLED_EXECUTION; never fakes data. */
export async function traceWithFrida(target: string, opts?: ProviderRunOptions & {
    pid?: number;
    durationMs?: number;
    adb?: string;
}) {
    const f = await resolveFrida();
    if (!f) {
        return result(target, 'trace_execution', [], {
            status: 'unsupported',
            limitations: [
                'Frida is not installed (frida/frida-ps not on PATH).',
                'Results are never fabricated when Frida is absent.'
            ],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    if (operatingMode() !== 'CONTROLLED_EXECUTION') {
        return result(target, 'trace_execution', [], {
            status: 'unsupported',
            limitations: [
                'Dynamic tracing requires REVERSE_MODE=CONTROLLED_EXECUTION.',
                'Frida is available on this host but tracing was refused by the safety gate.'
            ],
            coverage: { examined: false, complete: false, notes: [`frida=${f.path}`] }
        });
    }
    const timeoutMs = opts?.timeoutMs ?? opts?.durationMs ?? 15000;
    try {
        // Enumerate processes only — attach/hooks need an explicit session design.
        const args = opts?.pid != null
            ? ['-p', String(opts.pid), '-q', '-e', 'console.log(JSON.stringify({ok:true,pid:Process.id}))']
            : ['-U', '-q', '-e', 'console.log("frida-ok")'];
        const { stdout, stderr } = await execFileAsync(f.path, args, {
            timeout: timeoutMs,
            windowsHide: true,
            maxBuffer: 2 * 1024 * 1024,
            signal: opts?.signal as any,
            env: {
                ...process.env,
                ...(opts?.adb ? { ADB: opts.adb } : {})
            }
        });
        return result(target, 'trace_execution', [{
                engine: 'frida',
                enginePath: f.path,
                mode: 'controlled',
                logExcerpt: `${stdout}\n${stderr}`.slice(0, 4000)
            }], {
            status: 'partial',
            limitations: [
                'Session-style Java/native hooks and full call frequency need a longer opt-in script.',
                'Target process state is not modified beyond Frida attach lifetime.'
            ],
            coverage: {
                examined: true,
                complete: false,
                notes: ['Frida invoked under CONTROLLED_EXECUTION.']
            }
        });
    }
    catch (e: any) {
        return result(target, 'trace_execution', [], {
            status: 'failed',
            limitations: [`Frida failed: ${e?.message ?? String(e)}`],
            errors: [String(e?.message ?? e)],
            coverage: { examined: true, complete: false, notes: [] }
        });
    }
}
