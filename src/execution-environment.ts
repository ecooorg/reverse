/**
 * ExecutionEnvironment provider contract (Patch M step 5 / G-03).
 * Adapters detect, prepare, run with limits, and shut down. Absent engines
 * report unsupported — never simulated.
 */
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { runInSandbox, type SandboxLimits, type SandboxRunResult } from './execution-sandbox.js';
import { operatingMode } from './benchmark-gate.js';
import { requireLegacyGate } from './legacy-gate.js';
import type { LegacyAuthorization } from './legacy-types.js';
type WindowsEngineKind = 'wine' | 'dosbox' | 'qemu' | 'native' | 'chroot' | 'qemu-user' | 'oss-shim';
type MacEngineKind = 'basiliskii' | 'minivmac' | 'sheepshaver' | 'qemu-ppc';
export type EngineKind = WindowsEngineKind | MacEngineKind;
export interface EnvironmentFingerprint {
    engine: EngineKind;
    binary: string | null;
    version?: string;
    /** Hashes of operator-supplied images/ROMs (never uploaded). */
    imageHashes?: string[];
}
export interface LegacyExecutionResult extends SandboxRunResult {
    authorization: LegacyAuthorization;
}
export interface ExecutionEnvironment {
    name: string;
    kind: EngineKind;
    /** Cheap probe: binary on PATH / usable. */
    available(): Promise<boolean>;
    detail(): Promise<string>;
    fingerprint(): Promise<EnvironmentFingerprint>;
    /**
     * Run a target under this environment inside the sandbox.
     * Requires CONTROLLED_EXECUTION + confirm.
     */
    run(target: string, opts: {
        confirm: boolean;
        args?: string[];
        limits?: SandboxLimits;
        workDir?: string;
        authorization?: LegacyAuthorization | null;
        sessionId?: string;
    }): Promise<LegacyExecutionResult>;
}
async function which(bin: string): Promise<string | null> {
    const pathEnv = process.env.PATH ?? '';
    const sep = process.platform === 'win32' ? ';' : ':';
    for (const dir of pathEnv.split(sep)) {
        if (!dir)
            continue;
        const candidate = join(dir, bin);
        try {
            await access(candidate);
            return candidate;
        }
        catch { /* next */ }
    }
    return null;
}
function requireControlled(confirm: boolean): void {
    if (operatingMode() !== 'CONTROLLED_EXECUTION' || !confirm) {
        throw new Error('Execution environments require REVERSE_MODE=CONTROLLED_EXECUTION and confirm=true.');
    }
}
type PathEngineSpec = {
    name: string;
    kind: EngineKind;
    binaries: string[];
    buildArgs: (target: string, args: string[]) => string[];
};
function createPathEngine(spec: PathEngineSpec): ExecutionEnvironment {
    const { name, kind, binaries, buildArgs } = spec;
    let resolved: string | null | undefined;
    return {
        name,
        kind,
        async available() {
            for (const b of binaries) {
                const p = await which(b);
                if (p) {
                    resolved = p;
                    return true;
                }
            }
            resolved = null;
            return false;
        },
        async detail() {
            if (resolved === undefined)
                await this.available();
            return resolved
                ? `${name} at ${resolved}`
                : `${binaries.join('/')} not found on PATH`;
        },
        async fingerprint() {
            if (resolved === undefined)
                await this.available();
            return { engine: kind, binary: resolved ?? null };
        },
        async run(target, opts) {
            requireControlled(opts.confirm);
            const authorization = await requireLegacyGate({
                authorization: opts.authorization,
                sessionId: opts.sessionId,
                operation: `run_${kind}`
            });
            if (!(await this.available()) || !resolved) {
                // Represent absence as a structured sandbox-like result.
                return {
                    exitCode: null,
                    signal: null,
                    stdout: '',
                    stderr: `${name} is not installed`,
                    durationMs: 0,
                    scratchDir: '',
                    mechanism: {
                        id: 'none',
                        networkIsolated: false,
                        scratchIsolated: false,
                        detail: `${name} unavailable`
                    },
                    limitations: [
                        `${name} is not installed; install it and ensure it is on PATH.`,
                        'Reverse never simulates emulator output.'
                    ],
                    timedOut: false,
                    authorization
                };
            }
            const result = await runInSandbox({
                command: resolved,
                args: buildArgs(target, opts.args ?? []),
                confirm: true,
                limits: opts.limits
            });
            return { ...result, authorization };
        }
    };
}
/** Wine — primary Win32 compatibility layer. */
export function createWineEnvironment(): ExecutionEnvironment {
    return createPathEngine({
        name: 'wine',
        kind: 'wine',
        binaries: ['wine', 'wine64'],
        buildArgs: (target, args) => [target, ...args]
    });
}
/** DOSBox-class emulator for DOS / early Windows. */
export function createDosboxEnvironment(): ExecutionEnvironment {
    return createPathEngine({
        name: 'dosbox',
        kind: 'dosbox',
        binaries: ['dosbox', 'dosbox-x', 'dosbox-staging'],
        buildArgs: (target, args) => [target, '-exit', ...args]
    });
}
/** QEMU system emulator — needs operator-supplied images (hashed into fingerprint later). */
export function createQemuEnvironment(): ExecutionEnvironment {
    // Without an image, run only allows a version probe-style invocation.
    return createPathEngine({
        name: 'qemu',
        kind: 'qemu',
        binaries: ['qemu-system-x86_64', 'qemu-system-i386'],
        buildArgs: (_target, args) => (args.length ? args : ['--version'])
    });
}
/**
 * QEMU user-mode for foreign Linux arch (i386/x86_64/arm).
 * Detect-only when qemu-* missing; never simulates a rootfs.
 */
export function createQemuUserEnvironment(): ExecutionEnvironment {
    return createPathEngine({
        name: 'qemu-user',
        kind: 'qemu-user',
        binaries: ['qemu-x86_64', 'qemu-i386', 'qemu-arm', 'qemu-aarch64'],
        buildArgs: (target, args) => [target, ...args]
    });
}
/**
 * Operator-supplied rootfs via REVERSE_LINUX_ROOTFS + system chroot.
 * Absent rootfs or chroot binary → unsupported (never invents a tree).
 */
export function createChrootEnvironment(): ExecutionEnvironment {
    let resolved: string | null | undefined;
    let rootfs: string | null | undefined;
    return {
        name: 'chroot-rootfs',
        kind: 'chroot',
        async available() {
            rootfs = process.env.REVERSE_LINUX_ROOTFS?.trim() || null;
            resolved = await which('chroot');
            return !!(rootfs && resolved);
        },
        async detail() {
            if (resolved === undefined)
                await this.available();
            if (!rootfs)
                return 'REVERSE_LINUX_ROOTFS is not set (operator-supplied rootfs required)';
            if (!resolved)
                return 'chroot not found on PATH';
            return `chroot at ${resolved}; rootfs=${rootfs}`;
        },
        async fingerprint() {
            if (resolved === undefined)
                await this.available();
            return {
                engine: 'chroot',
                binary: resolved ?? null,
                imageHashes: rootfs ? [`rootfs-path:${rootfs}`] : []
            };
        },
        async run(target, opts) {
            requireControlled(opts.confirm);
            const authorization = await requireLegacyGate({
                authorization: opts.authorization,
                sessionId: opts.sessionId,
                operation: 'run_chroot'
            });
            if (!(await this.available()) || !resolved || !rootfs) {
                return {
                    exitCode: null,
                    signal: null,
                    stdout: '',
                    stderr: 'chroot-rootfs unavailable',
                    durationMs: 0,
                    timedOut: false,
                    mechanism: { id: 'none', detail: 'unavailable', networkIsolated: false, scratchIsolated: false },
                    limitations: [
                        'Set REVERSE_LINUX_ROOTFS to an operator-supplied old userland.',
                        'chroot binary must be on PATH. Reverse never bundles a rootfs.'
                    ],
                    scratchDir: '',
                    authorization
                };
            }
            const result = await runInSandbox({
                command: resolved,
                args: [rootfs, target, ...(opts.args ?? [])],
                confirm: opts.confirm,
                limits: opts.limits,
                env: {
                    REVERSE_LINUX_ROOTFS: rootfs
                }
            });
            return { ...result, authorization };
        }
    };
}
/**
 * OSS audio shim (padsp / aoss) — detect-only wrapper around the target.
 */
export function createOssShimEnvironment(): ExecutionEnvironment {
    return createPathEngine({
        name: 'oss-shim',
        kind: 'oss-shim',
        binaries: ['padsp', 'aoss'],
        buildArgs: (target, args) => [target, ...args]
    });
}
const registry: ExecutionEnvironment[] = [];
export function registerExecutionEnvironment(env: ExecutionEnvironment): void {
    if (registry.some(e => e.name === env.name))
        return;
    registry.push(env);
}
export function listExecutionEnvironments(): readonly ExecutionEnvironment[] {
    return registry;
}
/** Basilisk II class — 68k Mac OS emulator. Detect-only when absent. */
export function createBasiliskIiEnvironment(): ExecutionEnvironment {
    return createPathEngine({
        name: 'basiliskii',
        kind: 'basiliskii',
        binaries: ['BasiliskII', 'basiliskii', 'basiliskii.exe'],
        buildArgs: (target, args) => args.length ? args : ['--config', target],
    });
}
/** Mini vMac class — compact 68k Mac emulator. */
export function createMiniVmacEnvironment(): ExecutionEnvironment {
    return createPathEngine({
        name: 'minivmac',
        kind: 'minivmac',
        binaries: ['minivmac', 'Mini vMac', 'minivmac.exe'],
        buildArgs: (target, args) => [target, ...args],
    });
}
/** SheepShaver — PowerPC Mac OS emulator. */
export function createSheepShaverEnvironment(): ExecutionEnvironment {
    return createPathEngine({
        name: 'sheepshaver',
        kind: 'sheepshaver',
        binaries: ['SheepShaver', 'sheepshaver', 'sheepshaver.exe'],
        buildArgs: (target, args) => args.length ? args : ['--config', target],
    });
}
/** QEMU PowerPC system emulator (mac99 class). Needs operator-supplied ROM/image. */
export function createQemuPpcEnvironment(): ExecutionEnvironment {
    return createPathEngine({
        name: 'qemu-ppc',
        kind: 'qemu-ppc',
        binaries: ['qemu-system-ppc', 'qemu-system-ppc64'],
        buildArgs: (_target, args) => (args.length ? args : ['--version']),
    });
}
export function bootstrapExecutionEnvironments(): void {
    registerExecutionEnvironment(createWineEnvironment());
    registerExecutionEnvironment(createDosboxEnvironment());
    registerExecutionEnvironment(createQemuEnvironment());
    registerExecutionEnvironment(createQemuUserEnvironment());
    registerExecutionEnvironment(createChrootEnvironment());
    registerExecutionEnvironment(createOssShimEnvironment());
    registerExecutionEnvironment(createBasiliskIiEnvironment());
    registerExecutionEnvironment(createMiniVmacEnvironment());
    registerExecutionEnvironment(createSheepShaverEnvironment());
    registerExecutionEnvironment(createQemuPpcEnvironment());
}
export interface WorksFailsCell {
    target: string;
    environment: string;
    outcome: 'works' | 'fails' | 'unsupported' | 'timeout' | 'error';
    exitCode: number | null;
    evidence: string;
    limitations: string[];
    authorization: LegacyAuthorization;
}
/**
 * Run one fixture under each available environment; absent engines → unsupported.
 */
export async function runWorksFailsMatrix(targets: string[], opts: {
    confirm: boolean;
    limits?: SandboxLimits;
    authorization?: LegacyAuthorization | null;
    sessionId?: string;
}): Promise<WorksFailsCell[]> {
    requireControlled(opts.confirm);
    const authorization = await requireLegacyGate({
        authorization: opts.authorization,
        sessionId: opts.sessionId,
        operation: 'run_works_fails_matrix'
    });
    if (!registry.length)
        bootstrapExecutionEnvironments();
    const cells: WorksFailsCell[] = [];
    for (const target of targets) {
        for (const env of registry) {
            const available = await env.available();
            if (!available) {
                cells.push({
                    target,
                    environment: env.name,
                    outcome: 'unsupported',
                    exitCode: null,
                    evidence: await env.detail(),
                    limitations: [`${env.name} not installed`],
                    authorization
                });
                continue;
            }
            try {
                const r = await env.run(target, {
                    confirm: true,
                    limits: opts.limits ?? { timeoutMs: 10000 },
                    authorization
                });
                let outcome: WorksFailsCell['outcome'] = 'fails';
                if (r.timedOut)
                    outcome = 'timeout';
                else if (r.limitations.some(l => /not installed/i.test(l)))
                    outcome = 'unsupported';
                else if (r.exitCode === 0)
                    outcome = 'works';
                cells.push({
                    target,
                    environment: env.name,
                    outcome,
                    exitCode: r.exitCode,
                    evidence: (r.stdout || r.stderr).slice(0, 500),
                    limitations: r.limitations,
                    authorization
                });
            }
            catch (err) {
                cells.push({
                    target,
                    environment: env.name,
                    outcome: 'error',
                    exitCode: null,
                    evidence: String(err).slice(0, 500),
                    limitations: [],
                    authorization
                });
            }
        }
    }
    return cells;
}
