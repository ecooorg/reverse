import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { result } from './core-types.js';
import type { AnalyzerProvider, ProviderRunOptions, SimilarityProvider } from './providers-registry.js';
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
    const found = await findExecutable(['analyzeHeadless', 'ghidraRun', 'ghidra'], GHIDRA_DIRS, ['-help']);
    cached = found;
    return found;
}
/** Minimal GhidraScript: dump function names after analysis. */
const LIST_FNS_SCRIPT = `// @category Reverse
import ghidra.app.script.GhidraScript;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;
public class ReverseListFns extends GhidraScript {
    @Override
    public void run() throws Exception {
        if (currentProgram == null) {
            println("REVERSE_GHIDRA no_program");
            return;
        }
        FunctionIterator it = currentProgram.getFunctionManager().getFunctions(true);
        int n = 0;
        while (it.hasNext() && n < 500) {
            Function f = it.next();
            println("REVERSE_FN " + f.getName() + " @ " + f.getEntryPoint());
            n++;
        }
        println("REVERSE_GHIDRA_OK functions=" + n);
    }
}
`;
export function createGhidraProvider(): AnalyzerProvider {
    return {
        name: 'ghidra',
        capabilities: [
            'headless-import',
            'function-list',
            'post-script'
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
                        'Ghidra is not installed or analyzeHeadless was not found.',
                        'Set GHIDRA_INSTALL_DIR or put analyzeHeadless on PATH.',
                        'Results are never fabricated when Ghidra is absent.'
                    ],
                    coverage: { examined: false, complete: false, notes: [] }
                });
            }
            const timeoutMs = opts?.timeoutMs ?? 180000;
            const work = await mkdtemp(path.join(tmpdir(), 'reverse-ghidra-'));
            const scripts = path.join(work, 'scripts');
            const scriptPath = path.join(scripts, 'ReverseListFns.java');
            const logPath = path.join(work, 'analyze.log');
            try {
                await writeFile(scriptPath, LIST_FNS_SCRIPT, 'utf8');
                // Prefer analyzeHeadless entry; fall back to path as given.
                const bin = g.path;
                const args = [
                    work,
                    'revproj',
                    '-import',
                    target,
                    '-scriptPath',
                    scripts,
                    '-postScript',
                    'ReverseListFns.java',
                    '-analysisTimeoutPerFile',
                    '60',
                    '-deleteProject',
                    '-log',
                    logPath
                ];
                let stdout = '';
                let stderr = '';
                try {
                    const r = await execFileAsync(bin, args, {
                        timeout: timeoutMs,
                        windowsHide: true,
                        maxBuffer: 8 * 1024 * 1024,
                        signal: opts?.signal as any,
                        env: process.env
                    });
                    stdout = r.stdout?.toString() ?? '';
                    stderr = r.stderr?.toString() ?? '';
                }
                catch (e: any) {
                    stdout = e?.stdout?.toString() ?? '';
                    stderr = (e?.stderr?.toString() ?? '') + (e?.message ?? '');
                    // continue — parse whatever was emitted
                }
                let logText = '';
                try {
                    logText = await readFile(logPath, 'utf8');
                }
                catch { /* no log */ }
                const text = `${stdout}\n${stderr}\n${logText}`;
                const functions: {
                    name: string;
                    addr?: string;
                }[] = [];
                for (const line of text.split(/\r?\n/)) {
                    const m = line.match(/REVERSE_FN\s+(\S+)\s+@\s+(\S+)/);
                    if (m)
                        functions.push({ name: m[1], addr: m[2] });
                }
                const ok = /REVERSE_GHIDRA_OK/.test(text);
                const imported = /Importing|import completed|FINISHED/i.test(text)
                    || functions.length > 0;
                return result(target, 'ghidra_analyze', [{
                        engine: 'ghidra',
                        enginePath: bin,
                        functions: functions.slice(0, 500),
                        functionCount: functions.length,
                        postScriptOk: ok,
                        logExcerpt: text.slice(0, 4000)
                    }], {
                    status: ok || functions.length ? 'completed' : imported ? 'partial' : 'failed',
                    limitations: [
                        'Headless postScript dumps up to 500 function names when analysis succeeds.',
                        'Full decompilation and interactive xrefs remain outside this adapter.',
                        'Large binaries may hit analysisTimeoutPerFile (60s).'
                    ],
                    coverage: {
                        examined: true,
                        complete: ok || functions.length > 0,
                        notes: [
                            `functions=${functions.length}`,
                            ok ? 'postScript OK' : 'postScript markers absent'
                        ]
                    }
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
export function createGhidraSimilarityProvider(): SimilarityProvider {
    const base = createGhidraProvider();
    return {
        ...base,
        name: 'ghidra-similarity',
        kind: 'similarity',
        capabilities: ['function-similarity', 'bsim-when-configured'],
        async compareFunctions(a: string, b: string, _opts?: ProviderRunOptions) {
            const ok = await base.available();
            if (!ok) {
                return result(`${a}|${b}`, 'similarity_compare', [], {
                    status: 'unsupported',
                    limitations: [
                        'Ghidra similarity needs a local Ghidra install.',
                        'No reference corpus is bundled (H-06).'
                    ],
                    coverage: { examined: false, complete: false, notes: [] }
                });
            }
            return result(`${a}|${b}`, 'similarity_compare', [], {
                status: 'partial',
                limitations: [
                    'Ghidra is installed, but no BSim/Function ID database is configured.',
                    'No similarity score is computed or fabricated; configure a lawful local corpus to enable comparison.'
                ],
                coverage: {
                    examined: false,
                    complete: false,
                    notes: ['SimilarityProvider extension point is available; comparison data is absent.']
                }
            });
        }
    };
}
