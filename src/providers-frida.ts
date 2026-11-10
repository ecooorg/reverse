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
    cached = await findExecutable(['frida', 'frida-ps'], COMMON_BIN_DIRS, ['--version']);
    return cached;
}
/** Compact Frida -e script: modules + thread count + one backtrace sample. */
const ATTACH_SCRIPT = [
    'var info = { pid: Process.id, platform: Process.platform,',
    '  arch: Process.arch, threads: Process.enumerateThreads().length,',
    '  modules: Process.enumerateModules().slice(0, 30).map(function(m) {',
    '    return { name: m.name, base: m.base.toString() };',
    '  }), stacks: [] };',
    'Process.enumerateThreads().slice(0, 5).forEach(function(t) {',
    '  try {',
    '    var bt = Thread.backtrace(t.context, Backtracer.ACCURATE)',
    '      .slice(0, 8).map(DebugSymbol.fromAddress).map(String);',
    '    info.stacks.push({ tid: t.id, frames: bt });',
    '  } catch (e) { info.stacks.push({ tid: t.id, error: String(e) }); }',
    '});',
    'console.log("REVERSE_FRIDA " + JSON.stringify(info));'
].join('');
export function createFridaProvider(): AnalyzerProvider {
    return {
        name: 'frida',
        capabilities: [
            'dynamic-trace',
            'module-list',
            'thread-backtrace',
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
    const timeoutMs = opts?.timeoutMs ?? opts?.durationMs ?? 20000;
    const env = {
        ...process.env,
        ...(opts?.adb ? { ADB: opts.adb } : {})
    };
    try {
        let args: string[];
        if (opts?.pid != null) {
            args = ['-p', String(opts.pid), '-q', '-e', ATTACH_SCRIPT];
        }
        else if (/^\d+$/.test(target)) {
            args = ['-p', target, '-q', '-e', ATTACH_SCRIPT];
        }
        else {
            // Spawn target under Frida (file path)
            args = ['-f', target, '--pause', '-q', '-e', ATTACH_SCRIPT, '-e', 'Process.resume()'];
        }
        const { stdout, stderr } = await execFileAsync(f.path, args, {
            timeout: timeoutMs,
            windowsHide: true,
            maxBuffer: 4 * 1024 * 1024,
            signal: opts?.signal as any,
            env
        });
        const text = `${stdout}\n${stderr}`;
        let parsed: unknown = null;
        const m = text.match(/REVERSE_FRIDA\s+(\{[\s\S]*\})/);
        if (m) {
            try {
                parsed = JSON.parse(m[1]);
            }
            catch { /* keep raw */ }
        }
        return result(target, 'trace_execution', [{
                engine: 'frida',
                enginePath: f.path,
                mode: 'controlled',
                sample: parsed,
                logExcerpt: text.slice(0, 4000)
            }], {
            status: parsed ? 'completed' : 'partial',
            limitations: [
                'One-shot module/thread/backtrace sample; not a continuous call-frequency profile.',
                'Java/ART hooks (Java.perform) need a longer host-specific script.',
                'Target is only attached for the duration of this command.'
            ],
            coverage: {
                examined: true,
                complete: !!parsed,
                notes: [
                    parsed
                        ? 'Frida attach sample captured under CONTROLLED_EXECUTION.'
                        : 'Frida ran but REVERSE_FRIDA JSON marker was not parsed.'
                ]
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
