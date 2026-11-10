import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { result } from './core-types.js';
import type { AnalyzerProvider, ProviderRunOptions } from './providers-registry.js';
import { findExecutable, COMMON_BIN_DIRS } from './providers-discover.js';
const execFileAsync = promisify(execFile);
let cached: {
    path: string;
    version?: string;
} | null | undefined;
let cachedRabin: {
    path: string;
    version?: string;
} | null | undefined;
async function resolveRizin() {
    if (cached !== undefined)
        return cached;
    cached = await findExecutable(['rizin', 'rz', 'radare2', 'r2'], COMMON_BIN_DIRS, ['-v']);
    return cached;
}
async function resolveRabin() {
    if (cachedRabin !== undefined)
        return cachedRabin;
    cachedRabin = await findExecutable(['rabin2', 'rz-bin'], COMMON_BIN_DIRS, ['-v']);
    return cachedRabin;
}
export function createRizinProvider(): AnalyzerProvider {
    return {
        name: 'rizin',
        capabilities: [
            'disassembly',
            'symbols',
            'imports',
            'exports',
            'sections',
            'entrypoints'
        ],
        async available() {
            return (await resolveRizin()) !== null || (await resolveRabin()) !== null;
        },
        async detail() {
            const r = await resolveRizin();
            const b = await resolveRabin();
            const parts = [r ? `rizin=${r.path}` : null, b ? `rabin2=${b.path}` : null].filter(Boolean);
            return parts.join(' ') || undefined;
        },
        async analyze(target: string, opts?: ProviderRunOptions) {
            const timeoutMs = opts?.timeoutMs ?? 60000;
            const rabin = await resolveRabin();
            const rizin = await resolveRizin();
            if (!rabin && !rizin) {
                return result(target, 'rizin_analyze', [], {
                    status: 'unsupported',
                    limitations: [
                        'Rizin/radare2 not found on PATH.',
                        'Install rizin (or radare2) to enable this provider. Results are never fabricated.'
                    ],
                    coverage: { examined: false, complete: false, notes: [] }
                });
            }
            try {
                const findings: Record<string, unknown> = { engine: 'rizin' };
                if (rabin) {
                    // Structured info without full disassembly
                    const { stdout } = await execFileAsync(rabin.path, ['-I', '-l', '-i', '-E', target], {
                        timeout: timeoutMs,
                        windowsHide: true,
                        maxBuffer: 4 * 1024 * 1024,
                        signal: opts?.signal as any
                    });
                    findings.rabinInfo = stdout.toString().slice(0, 100000);
                    findings.tool = rabin.path;
                }
                else if (rizin) {
                    const { stdout } = await execFileAsync(rizin.path, ['-q', '-c', 'iI;iS;ii;iE;afl', target], {
                        timeout: timeoutMs,
                        windowsHide: true,
                        maxBuffer: 4 * 1024 * 1024,
                        signal: opts?.signal as any
                    });
                    findings.rizinCommands = stdout.toString().slice(0, 100000);
                    findings.tool = rizin.path;
                }
                return result(target, 'rizin_analyze', [findings], {
                    status: 'completed',
                    limitations: [
                        'Output is raw tool text normalized into a Result envelope; not a full IR.',
                        'Deep decompilation is not provided by this adapter.'
                    ],
                    coverage: {
                        examined: true,
                        complete: true,
                        notes: ['Rizin/rabin2 invoked successfully.']
                    }
                });
            }
            catch (e: any) {
                if (opts?.signal?.aborted) {
                    return result(target, 'rizin_analyze', [], {
                        status: 'partial',
                        limitations: ['Rizin run aborted.'],
                        coverage: { examined: true, complete: false, notes: [] }
                    });
                }
                return result(target, 'rizin_analyze', [], {
                    status: 'failed',
                    limitations: [`Rizin failed: ${e?.message ?? String(e)}`],
                    errors: [String(e?.message ?? e)],
                    coverage: { examined: true, complete: false, notes: [] }
                });
            }
        },
        async shutdown() {
            cached = undefined;
            cachedRabin = undefined;
        }
    };
}
