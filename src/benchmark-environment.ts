import os from 'node:os';
import { VERSION } from './core-version.js';
import type { RunSpec } from './benchmark-engine.js';
import { result } from './core-types.js';

// Names a child process may inherit. Everything else (tokens, API keys, cloud credentials) is dropped.
const BASE_ENV = ['PATH', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'LANG', 'LC_ALL', 'TZ'];

/** Environment for executed targets: the base names plus names listed in REVERSE_CHILD_ENV (comma separated). */
export function childEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const extra = (source.REVERSE_CHILD_ENV ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const out: NodeJS.ProcessEnv = {};
  for (const name of [...BASE_ENV, ...extra]) if (source[name] !== undefined) out[name] = source[name];
  return out;
}

/** Non-secret facts that decide whether two measurements may be compared. */
export function getEnvironmentFingerprint(spec?: Partial<RunSpec>) {
  const cpus = os.cpus();
  const env = childEnv();
  return {
    os: { platform: os.platform(), release: os.release(), arch: process.arch },
    cpu: { model: cpus[0]?.model ?? 'unknown', cores: os.availableParallelism() },
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
export function fingerprintComparison(a?: Fingerprint, b?: Fingerprint): { comparable: boolean | null; differences: string[] } {
  if (!a || !b) return { comparable: null, differences: [] };
  const keys: (keyof Fingerprint)[] = ['os', 'cpu', 'memoryTotalBytes', 'node', 'reverse', 'target', 'nonSecretEnvironment'];
  const differences = keys.filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map(String);
  return { comparable: differences.length === 0, differences };
}

export const environmentFingerprintResult = () => result('local-host', 'environment_fingerprint', [getEnvironmentFingerprint()], { limitations: ['Only non-secret, allowlisted environment values are recorded.', 'Target version is not detected; the command line is recorded instead.'] });
