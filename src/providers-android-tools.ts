import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { result } from './core-types.js';
import type { AnalyzerProvider, ProviderRunOptions } from './providers-registry.js';
import { findExecutable, COMMON_BIN_DIRS } from './providers-discover.js';
const execFileAsync = promisify(execFile);
let jadxCache: {
    path: string;
    version?: string;
} | null | undefined;
let apktoolCache: {
    path: string;
    version?: string;
} | null | undefined;
async function resolveJadx() {
    if (jadxCache !== undefined)
        return jadxCache;
    jadxCache = await findExecutable(['jadx', 'jadx.bat'], COMMON_BIN_DIRS, ['--version']);
    return jadxCache;
}
async function resolveApktool() {
    if (apktoolCache !== undefined)
        return apktoolCache;
    apktoolCache = await findExecutable(['apktool', 'apktool.bat'], COMMON_BIN_DIRS, ['--version']);
    return apktoolCache;
}
export function createJadxProvider(): AnalyzerProvider {
    return {
        name: 'jadx',
        capabilities: ['dex-decompile', 'java-source-export', 'apk-resources-list'],
        async available() {
            return (await resolveJadx()) !== null;
        },
        async detail() {
            const j = await resolveJadx();
            return j ? `${j.path}${j.version ? ' (' + j.version + ')' : ''}` : undefined;
        },
        async analyze(target: string, opts?: ProviderRunOptions) {
            const j = await resolveJadx();
            if (!j) {
                return result(target, 'jadx_analyze', [], {
                    status: 'unsupported',
                    limitations: [
                        'JADX not found on PATH. Install JADX to decompile DEX/APK.',
                        'Native .so libraries remain under Ghidra/Rizin when available.'
                    ],
                    coverage: { examined: false, complete: false, notes: [] }
                });
            }
            const work = await mkdtemp(path.join(tmpdir(), 'reverse-jadx-'));
            try {
                const { stdout, stderr } = await execFileAsync(j.path, ['--no-res', '-d', work, target], {
                    timeout: opts?.timeoutMs ?? 120000,
                    windowsHide: true,
                    maxBuffer: 4 * 1024 * 1024,
                    signal: opts?.signal as any
                });
                let javaFiles = 0;
                try {
                    const walk = async (dir: string): Promise<void> => {
                        const entries = await readdir(dir, { withFileTypes: true });
                        for (const e of entries) {
                            const p = path.join(dir, e.name);
                            if (e.isDirectory())
                                await walk(p);
                            else if (e.name.endsWith('.java'))
                                javaFiles++;
                        }
                    };
                    await walk(work);
                }
                catch { /* ignore */ }
                return result(target, 'jadx_analyze', [{
                        engine: 'jadx',
                        enginePath: j.path,
                        javaFilesExported: javaFiles,
                        logExcerpt: `${stdout}\n${stderr}`.slice(0, 2000)
                    }], {
                    status: javaFiles > 0 ? 'completed' : 'partial',
                    limitations: [
                        'Resources skipped (--no-res) for bounded runs.',
                        'Native libraries are not decompiled by JADX.'
                    ],
                    coverage: {
                        examined: true,
                        complete: javaFiles > 0,
                        notes: [`Exported ~${javaFiles} .java file(s) to a temp directory (cleaned after run).`]
                    }
                });
            }
            catch (e: any) {
                return result(target, 'jadx_analyze', [], {
                    status: 'failed',
                    limitations: [`JADX failed: ${e?.message ?? String(e)}`],
                    errors: [String(e?.message ?? e)],
                    coverage: { examined: true, complete: false, notes: [] }
                });
            }
            finally {
                await rm(work, { recursive: true, force: true }).catch(() => undefined);
            }
        },
        async shutdown() {
            jadxCache = undefined;
        }
    };
}
export function createApktoolProvider(): AnalyzerProvider {
    return {
        name: 'apktool',
        capabilities: ['apk-decode', 'smali', 'resources', 'android-manifest-decode'],
        async available() {
            return (await resolveApktool()) !== null;
        },
        async detail() {
            const a = await resolveApktool();
            return a ? `${a.path}${a.version ? ' (' + a.version + ')' : ''}` : undefined;
        },
        async analyze(target: string, opts?: ProviderRunOptions) {
            const a = await resolveApktool();
            if (!a) {
                return result(target, 'apktool_analyze', [], {
                    status: 'unsupported',
                    limitations: [
                        'Apktool not found on PATH.',
                        'Native .so analysis remains with Ghidra/Rizin when available.'
                    ],
                    coverage: { examined: false, complete: false, notes: [] }
                });
            }
            const work = await mkdtemp(path.join(tmpdir(), 'reverse-apktool-'));
            const outDir = path.join(work, 'out');
            try {
                const { stdout, stderr } = await execFileAsync(a.path, ['d', '-f', '-o', outDir, target], {
                    timeout: opts?.timeoutMs ?? 120000,
                    windowsHide: true,
                    maxBuffer: 4 * 1024 * 1024,
                    signal: opts?.signal as any
                });
                let smali = 0, hasManifest = false;
                try {
                    const walk = async (dir: string): Promise<void> => {
                        const entries = await readdir(dir, { withFileTypes: true });
                        for (const e of entries) {
                            const p = path.join(dir, e.name);
                            if (e.isDirectory())
                                await walk(p);
                            else if (e.name.endsWith('.smali'))
                                smali++;
                            else if (e.name === 'AndroidManifest.xml')
                                hasManifest = true;
                        }
                    };
                    await walk(outDir);
                }
                catch { /* ignore */ }
                return result(target, 'apktool_analyze', [{
                        engine: 'apktool',
                        enginePath: a.path,
                        smaliFiles: smali,
                        decodedManifest: hasManifest,
                        logExcerpt: `${stdout}\n${stderr}`.slice(0, 2000)
                    }], {
                    status: hasManifest || smali > 0 ? 'completed' : 'partial',
                    limitations: ['Decoded tree is temporary and removed after the run.'],
                    coverage: {
                        examined: true,
                        complete: hasManifest || smali > 0,
                        notes: [`smali=${smali}, manifest=${hasManifest}`]
                    }
                });
            }
            catch (e: any) {
                return result(target, 'apktool_analyze', [], {
                    status: 'failed',
                    limitations: [`Apktool failed: ${e?.message ?? String(e)}`],
                    errors: [String(e?.message ?? e)],
                    coverage: { examined: true, complete: false, notes: [] }
                });
            }
            finally {
                await rm(work, { recursive: true, force: true }).catch(() => undefined);
            }
        },
        async shutdown() {
            apktoolCache = undefined;
        }
    };
}
