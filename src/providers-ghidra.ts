import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { result } from './core-types.js';
import type { AnalyzerProvider, ProviderRunOptions, SimilarityProvider, SimilarityHit } from './providers-registry.js';
import { findExecutable, GHIDRA_DIRS } from './providers-discover.js';
const execFileAsync = promisify(execFile);
let cached: {
    path: string;
    version?: string;
} | null | undefined;
async function resolveGhidra(): Promise<{
    path: string;
    version?: string;
} | null> {
    if (cached !== undefined)
        return cached;
    // analyzeHeadless is the usual entry; also accept "ghidra" wrapper
    const found = await findExecutable(['analyzeHeadless', 'ghidraRun', 'ghidra'], GHIDRA_DIRS, ['-help']);
    cached = found;
    return found;
}
export function createGhidraProvider(): AnalyzerProvider {
    return {
        name: 'ghidra',
        capabilities: [
            'disassembly',
            'decompilation',
            'cross-references',
            'function-list',
            'headless-analysis'
        ],
        async available() {
            return (await resolveGhidra()) !== null;
        },
        async detail() {
            const g = await resolveGhidra();
            return g ? `${g.path}${g.version ? ' (' + g.version + ')' : ''}` : undefined;
        },
        async analyze(target: string, opts?: ProviderRunOptions) {
            const g = await resolveGhidra();
            if (!g) {
                return result(target, 'ghidra_analyze', [], {
                    status: 'unsupported',
                    limitations: [
                        'Ghidra is not installed or analyzeHeadless was not found on PATH / GHIDRA_INSTALL_DIR.',
                        'Install Ghidra and set GHIDRA_INSTALL_DIR, or put analyzeHeadless on PATH.'
                    ],
                    coverage: { examined: false, complete: false, notes: [] }
                });
            }
            const timeoutMs = opts?.timeoutMs ?? 120000;
            const work = await mkdtemp(path.join(tmpdir(), 'reverse-ghidra-'));
            const projectName = 'rev';
            const script = `
// Minimal headless export: function names if the API is present
try {
    var fm = currentProgram.getFunctionManager();
    var it = fm.getFunctions(true);
    var n = 0;
    while (it.hasNext() && n < 500) {
        var f = it.next();
        println("FN " + f.getName() + " @ " + f.getEntryPoint());
        n++;
    }
    println("GHIDRA_OK functions=" + n);
} catch (e) {
    println("GHIDRA_SCRIPT_ERROR " + e);
}
`;
            const scriptPath = path.join(work, 'ListFns.java');
            // Ghidra scripts are typically Java in a scripts dir; using -postScript requires a proper script.
            // Fallback: run analyzeHeadless import only and capture stderr/stdout for presence proof.
            try {
                await writeFile(scriptPath, script, 'utf8');
                const args = [
                    work,
                    projectName,
                    '-import',
                    target,
                    '-deleteProject',
                    '-noanalysis'
                ];
                const { stdout, stderr } = await execFileAsync(g.path, args, {
                    timeout: timeoutMs,
                    windowsHide: true,
                    maxBuffer: 4 * 1024 * 1024,
                    env: process.env,
                    signal: opts?.signal as any
                });
                const text = `${stdout}\n${stderr}`;
                const limitations = [
                    'Headless import completed; full decompilation/xrefs require a postScript and analysis mode (opt-in, longer).',
                    'Output is normalized presence evidence, not a substitute for interactive Ghidra.'
                ];
                return result(target, 'ghidra_analyze', [{
                        engine: 'ghidra',
                        enginePath: g.path,
                        importOk: !/ERROR|Exception/i.test(text) || /Importing complete|finished/i.test(text),
                        logExcerpt: text.slice(0, 2000)
                    }], {
                    status: 'partial',
                    limitations,
                    coverage: {
                        examined: true,
                        complete: false,
                        notes: ['Ghidra headless invoked; deep analysis scripts are optional and host-specific.']
                    }
                });
            }
            catch (e: any) {
                if (e?.name === 'AbortError' || opts?.signal?.aborted) {
                    return result(target, 'ghidra_analyze', [], {
                        status: 'partial',
                        limitations: ['Ghidra run aborted by signal.'],
                        coverage: { examined: true, complete: false, notes: [] }
                    });
                }
                return result(target, 'ghidra_analyze', [], {
                    status: 'failed',
                    limitations: [`Ghidra headless failed: ${e?.message ?? String(e)}`],
                    errors: [String(e?.message ?? e)],
                    coverage: { examined: true, complete: false, notes: [] }
                });
            }
            finally {
                await rm(work, { recursive: true, force: true }).catch(() => undefined);
            }
        },
        async shutdown() {
            cached = undefined;
        }
    };
}
/** Similarity via Ghidra only when installed; never bundles a corpus (H-06). */
export function createGhidraSimilarityProvider(): SimilarityProvider {
    const base = createGhidraProvider();
    return {
        ...base,
        name: 'ghidra-similarity',
        kind: 'similarity',
        capabilities: ['function-similarity', 'ghidra-function-id', 'bsim-when-configured'],
        async compareFunctions(a: string, b: string, _opts?: ProviderRunOptions) {
            const ok = await base.available();
            if (!ok) {
                return result(`${a}|${b}`, 'similarity_compare', [], {
                    status: 'unsupported',
                    limitations: [
                        'Ghidra similarity requires a local Ghidra install with Function ID / BSim configured.',
                        'No reference corpus is bundled with Reverse (H-06).'
                    ],
                    coverage: { examined: false, complete: false, notes: [] }
                });
            }
            // Without a configured BSim DB we only report capability presence, not fake scores.
            return result(`${a}|${b}`, 'similarity_compare', [{
                    score: 0,
                    confidence: 0,
                    method: 'ghidra-bsim',
                    notes: [
                        'Ghidra is available but BSim/Function ID database is not auto-configured by Reverse.',
                        'Point GHIDRA / BSim configuration at your own corpus to obtain scores.'
                    ]
                } satisfies SimilarityHit], {
                status: 'partial',
                limitations: ['No BSim database configured; score is not computed.'],
                coverage: { examined: true, complete: false, notes: [] }
            });
        }
    };
}
