import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { platform } from 'node:os';
import { result, type Result } from './core-types.js';
import type { AnalyzerProvider, ProviderRunOptions } from './providers-registry.js';
import { findExecutable, COMMON_BIN_DIRS } from './providers-discover.js';
const execFileAsync = promisify(execFile);
type Cache = {
    path: string;
    version?: string;
} | null | undefined;
const caches: Record<string, Cache> = {};
async function resolve(name: string, bins: string[], versionArgs = ['--version']) {
    if (caches[name] !== undefined)
        return caches[name]!;
    caches[name] = await findExecutable(bins, COMMON_BIN_DIRS, versionArgs);
    return caches[name]!;
}
type Bin = {
    path: string;
    version?: string;
};
type AnalyzeFn = (bin: Bin, target: string, opts?: ProviderRunOptions) => Promise<Result<unknown>>;
function makeProvider(name: string, bins: string[], capabilities: string[], analyze: AnalyzeFn): AnalyzerProvider {
    return {
        name,
        capabilities,
        async available() {
            return (await resolve(name, bins)) !== null;
        },
        async detail() {
            const b = await resolve(name, bins);
            return b ? `${b.path}${b.version ? ' (' + b.version + ')' : ''}` : undefined;
        },
        async analyze(target: string, opts?: ProviderRunOptions) {
            const b = await resolve(name, bins);
            if (!b) {
                return result(target, `${name}_profile`, [], {
                    status: 'unsupported',
                    limitations: [
                        `${name} is not installed on this host.`,
                        'Hotspots are reported only when a real profiler produced them.'
                    ],
                    coverage: { examined: false, complete: false, notes: [] }
                });
            }
            return analyze(b, target, opts);
        },
        async shutdown() {
            caches[name] = undefined;
        }
    };
}
export function createPerfProvider(): AnalyzerProvider {
    return makeProvider('perf', ['perf'], ['cpu-samples', 'hotspots', 'callgraph'], async (bin, target, opts) => {
        if (platform() !== 'linux') {
            return result(target, 'perf_profile', [], {
                status: 'unsupported',
                limitations: ['perf is Linux-only.'],
                coverage: { examined: false, complete: false, notes: [] }
            });
        }
        try {
            const { stdout, stderr } = await execFileAsync(bin.path, ['record', '-o', '/dev/null', '--', 'true'], {
                timeout: opts?.timeoutMs ?? 10000,
                windowsHide: true,
                signal: opts?.signal as any
            });
            return result(target, 'perf_profile', [{
                    engine: 'perf',
                    enginePath: bin.path,
                    note: 'perf present; use get_hotspots(pid) for process sampling',
                    logExcerpt: `${stdout}\n${stderr}`.slice(0, 2000)
                }], {
                status: 'partial',
                limitations: [
                    'Full perf record -p PID needs CONTROLLED_EXECUTION.',
                    'This probe only verifies that perf can start.'
                ],
                coverage: {
                    examined: true,
                    complete: false,
                    notes: ['perf detected']
                }
            });
        }
        catch (e: any) {
            return result(target, 'perf_profile', [], {
                status: 'failed',
                limitations: [`perf probe failed: ${e?.message ?? String(e)}`],
                errors: [String(e?.message ?? e)],
                coverage: { examined: true, complete: false, notes: [] }
            });
        }
    });
}
export function createEbpfProvider(): AnalyzerProvider {
    const caps = ['ebpf-trace', 'kernel-probes'];
    return makeProvider('ebpf', ['bpftrace', 'bpftool'], caps, async (bin, target) => {
        const findings = [{
                engine: 'ebpf',
                enginePath: bin.path,
                note: 'eBPF tooling detected; scripts are host-specific and not auto-run.'
            }];
        return result(target, 'ebpf_profile', findings, {
            status: 'partial',
            limitations: [
                'No generic eBPF program is injected automatically (safety).',
                'Operators supply scripts under CONTROLLED_EXECUTION.'
            ],
            coverage: {
                examined: true,
                complete: false,
                notes: ['bpftrace/bpftool present']
            }
        });
    });
}
export function createEtwProvider(): AnalyzerProvider {
    return makeProvider('etw', ['logman', 'wpr', 'xperf'], ['etw-trace', 'windows-hotspots'], async (bin, target) => {
        if (platform() !== 'win32') {
            return result(target, 'etw_profile', [], {
                status: 'unsupported',
                limitations: ['ETW providers are Windows-only.'],
                coverage: { examined: false, complete: false, notes: [] }
            });
        }
        return result(target, 'etw_profile', [{
                engine: 'etw',
                enginePath: bin.path,
                note: 'ETW tool detected; capture sessions are operator-driven.'
            }], {
            status: 'partial',
            limitations: [
                'Auto-start of system-wide ETW sessions is not performed.'
            ],
            coverage: {
                examined: true,
                complete: false,
                notes: ['ETW tool present']
            }
        });
    });
}
export function createInstrumentsProvider(): AnalyzerProvider {
    const bins = ['instruments', 'sample', 'xctrace'];
    const caps = ['macos-samples', 'hotspots'];
    return makeProvider('instruments', bins, caps, async (bin, target) => {
        if (platform() !== 'darwin') {
            return result(target, 'instruments_profile', [], {
                status: 'unsupported',
                limitations: ['Instruments/sample/xctrace are macOS-only.'],
                coverage: { examined: false, complete: false, notes: [] }
            });
        }
        return result(target, 'instruments_profile', [{
                engine: 'instruments',
                enginePath: bin.path
            }], {
            status: 'partial',
            limitations: [
                'GUI Instruments templates are not launched automatically.'
            ],
            coverage: {
                examined: true,
                complete: false,
                notes: ['macOS sampling tool present']
            }
        });
    });
}
export function createValgrindProvider(): AnalyzerProvider {
    const caps = ['memcheck', 'callgrind', 'hotspots'];
    return makeProvider('valgrind', ['valgrind'], caps, async (bin, target, opts) => {
        try {
            const { stdout, stderr } = await execFileAsync(bin.path, ['--version'], {
                timeout: opts?.timeoutMs ?? 5000,
                windowsHide: true
            });
            return result(target, 'valgrind_profile', [{
                    engine: 'valgrind',
                    enginePath: bin.path,
                    version: `${stdout}${stderr}`.trim().slice(0, 200)
                }], {
                status: 'partial',
                limitations: [
                    'Callgrind/massif runs need CONTROLLED_EXECUTION.'
                ],
                coverage: {
                    examined: true,
                    complete: false,
                    notes: ['valgrind detected']
                }
            });
        }
        catch (e: any) {
            return result(target, 'valgrind_profile', [], {
                status: 'failed',
                limitations: [String(e?.message ?? e)],
                errors: [String(e?.message ?? e)],
                coverage: { examined: true, complete: false, notes: [] }
            });
        }
    });
}
export function createSimpleperfProvider(): AnalyzerProvider {
    const caps = ['android-cpu', 'hotspots'];
    return makeProvider('simpleperf', ['simpleperf'], caps, async (bin, target) => {
        const findings = [{
                engine: 'simpleperf',
                enginePath: bin.path
            }];
        return result(target, 'simpleperf_profile', findings, {
            status: 'partial',
            limitations: [
                'Device-side simpleperf needs adb and a connected Android target.'
            ],
            coverage: {
                examined: true,
                complete: false,
                notes: ['simpleperf host binary present']
            }
        });
    });
}
