import os from 'node:os';
import { readFileSync } from 'node:fs';
import { VERSION } from './core-version.js';
import type { RunSpec } from './benchmark-engine.js';
import { result } from './core-types.js';
// Names a child process may inherit. Everything else (tokens, API keys, cloud credentials) is dropped.
const BASE_ENV = ['PATH', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'LANG', 'LC_ALL', 'TZ'];
/** Environment for executed targets: the base names plus names listed in REVERSE_CHILD_ENV (comma separated). */
export function childEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
    const extra = (source.REVERSE_CHILD_ENV ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const out: NodeJS.ProcessEnv = {};
    for (const name of [...BASE_ENV, ...extra])
        if (source[name] !== undefined)
            out[name] = source[name];
    return out;
}
/** Non-secret facts that decide whether two measurements may be compared. */
export function getEnvironmentFingerprint(spec?: Partial<RunSpec>) {
    const cpus = os.cpus();
    const env = childEnv();
    const loadAverage = os.loadavg();
    let cpuGovernor: string | null = null, thermalMilliC: number | null = null;
    if (process.platform === 'linux') {
        try {
            cpuGovernor = readFileSync('/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor', 'utf8').trim();
        }
        catch { /* unavailable */ }
        try {
            const t = Number(readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8').trim());
            if (Number.isFinite(t))
                thermalMilliC = t;
        }
        catch { /* unavailable */ }
    }
    const cores = os.availableParallelism();
    const noise = { loadAverage1m: loadAverage[0], loadPerCore: loadAverage[0] / cores, cpuGovernor, thermalMilliC, highLoad: loadAverage[0] / cores > 0.8 };
    return {
        os: { platform: os.platform(), release: os.release(), arch: process.arch },
        cpu: { model: cpus[0]?.model ?? 'unknown', cores },
        noise,
        memoryTotalBytes: os.totalmem(),
        node: process.version,
        reverse: VERSION,
        target: spec?.command ? { command: spec.command, args: spec.args ?? [] } : null,
        nonSecretEnvironment: { LANG: env.LANG ?? null, LC_ALL: env.LC_ALL ?? null, TZ: env.TZ ?? null },
        parameters: spec ? { repetitions: spec.repetitions ?? null, warmupRuns: spec.warmupRuns ?? null, timeoutMs: spec.timeoutMs ?? null } : null,
    };
}
export type Fingerprint = ReturnType<typeof getEnvironmentFingerprint>;
/** Names of the fingerprint parts that differ. Run parameters are listed as well: different counts are not a hardware problem, but they change the statistics. */
export function fingerprintComparison(a?: Fingerprint, b?: Fingerprint): {
    comparable: boolean | null;
    differences: string[];
} {
    if (!a || !b)
        return { comparable: null, differences: [] };
    const keys: (keyof Fingerprint)[] = ['os', 'cpu', 'memoryTotalBytes', 'node', 'reverse', 'target', 'nonSecretEnvironment'];
    const differences = keys.filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map(String);
    return { comparable: differences.length === 0, differences };
}
export const environmentFingerprintResult = () => result('local-host', 'environment_fingerprint', [getEnvironmentFingerprint()], { limitations: ['Only non-secret, allowlisted environment values are recorded.', 'Target version is not detected; the command line is recorded instead.'] });
