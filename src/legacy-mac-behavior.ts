/**
 * Mac-oriented behavior capture helpers (Patch O step 6).
 * Reuses the shared capture/replay pipeline. Emulator engines (Basilisk II,
 * Mini vMac, SheepShaver, qemu-ppc) are detect-only: when absent, the trial
 * records unsupported limitations rather than inventing output. Operator-supplied
 * ROM/image paths are hashed into the fingerprint and never uploaded.
 */
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { captureScenario, replayScenario } from './behavior-capture.js';
import type { BehaviorScenario, CaptureRecord, ReplayComparison } from './behavior-capture.js';
import { bootstrapExecutionEnvironments, listExecutionEnvironments, type EnvironmentFingerprint, } from './execution-environment.js';
import type { LegacyAuthorization } from './legacy-types.js';
export interface MacRomFingerprint {
    path: string;
    sha256: string | null;
    size: number | null;
    limitation?: string;
}
export interface MacBehaviorTrialResult {
    equal: boolean;
    differences: string[];
    limitations: string[];
    record: CaptureRecord | null;
    environments: EnvironmentFingerprint[];
    roms: MacRomFingerprint[];
}
/**
 * Hash operator-supplied ROM or disk image paths for the environment fingerprint.
 * Missing files become structured limitations; contents are never transmitted.
 */
export async function fingerprintMacRoms(paths: string[]): Promise<MacRomFingerprint[]> {
    const out: MacRomFingerprint[] = [];
    for (const p of paths) {
        try {
            await access(p);
            const buf = await readFile(p);
            out.push({
                path: p,
                sha256: createHash('sha256').update(buf).digest('hex'),
                size: buf.length,
            });
        }
        catch {
            out.push({
                path: p,
                sha256: null,
                size: null,
                limitation: `ROM/image not readable: ${p}`,
            });
        }
    }
    return out;
}
/**
 * Snapshot detect-only Mac emulator availability for a works/fails matrix cell.
 */
export async function listMacEmulatorFingerprints(): Promise<EnvironmentFingerprint[]> {
    bootstrapExecutionEnvironments();
    const macKinds = new Set(['basiliskii', 'minivmac', 'sheepshaver', 'qemu-ppc']);
    const fps: EnvironmentFingerprint[] = [];
    for (const env of listExecutionEnvironments()) {
        if (!macKinds.has(env.kind))
            continue;
        fps.push(await env.fingerprint());
    }
    return fps;
}
/**
 * Capture and replay a deterministic host process under CONTROLLED_EXECUTION.
 * Default scenario is a lawful node one-liner; operators may point at an emulator
 * binary + config once ROMs are supplied. Absent emulators do not block the
 * deterministic host round-trip used for pipeline verification.
 */
export async function runMacBehaviorRoundTrip(scenario: BehaviorScenario | undefined, auth: LegacyAuthorization, opts: {
    romPaths?: string[];
} = {}): Promise<MacBehaviorTrialResult> {
    const limitations: string[] = [];
    const environments = await listMacEmulatorFingerprints();
    for (const fp of environments) {
        if (!fp.binary) {
            limitations.push(`Mac emulator ${fp.engine} not on PATH; detect-only, never simulated.`);
        }
    }
    const roms = await fingerprintMacRoms(opts.romPaths ?? []);
    for (const r of roms) {
        if (r.limitation)
            limitations.push(r.limitation);
        else if (r.sha256)
            limitations.push(`ROM/image hashed locally (${r.path}, ${r.size} bytes); not uploaded.`);
    }
    limitations.push('Apple OS / ROM licensing is the operator responsibility; Reverse records hashes only.');
    const sc: BehaviorScenario = scenario ?? {
        schemaVersion: '1.0',
        id: 'mac-det-hello',
        command: process.execPath,
        args: ['-e', 'console.log("mac-behavior-ok"); process.exit(0);'],
        volatileFields: ['timestamps', 'scratch-paths'],
        timeoutMs: 8000,
    };
    const record = await captureScenario(sc, {
        confirm: true,
        authorization: auth,
        environmentDetail: 'mac-behavior-round-trip',
    });
    const cmp: ReplayComparison = await replayScenario(sc, record, {
        confirm: true,
        authorization: auth,
    });
    return {
        equal: cmp.equal,
        differences: cmp.differences,
        limitations: [...limitations, ...cmp.limitations],
        record,
        environments,
        roms,
    };
}
/**
 * Compare two operator-supplied disk image / folder trees by file hashes.
 * Used as a stand-in for emulator disk-image snapshot diffs when the operator
 * exports before/after trees. Does not mount or mutate images.
 */
export async function diffDiskImageHashes(beforeRoot: string, afterRoot: string): Promise<{
    equal: boolean;
    onlyBefore: string[];
    onlyAfter: string[];
    changed: string[];
}> {
    const { createHash } = await import('node:crypto');
    const { readdir, readFile, stat } = await import('node:fs/promises');
    const { join, relative } = await import('node:path');
    async function walk(root: string): Promise<Record<string, string>> {
        const out: Record<string, string> = {};
        async function rec(dir: string): Promise<void> {
            let entries: string[];
            try {
                entries = await readdir(dir);
            }
            catch {
                return;
            }
            for (const name of entries) {
                const full = join(dir, name);
                const st = await stat(full);
                if (st.isDirectory())
                    await rec(full);
                else if (st.isFile()) {
                    const rel = relative(root, full).replace(/\\/g, '/');
                    const buf = await readFile(full);
                    out[rel] = createHash('sha256').update(buf).digest('hex');
                }
            }
        }
        await rec(root);
        return out;
    }
    const a = await walk(beforeRoot);
    const b = await walk(afterRoot);
    const onlyBefore: string[] = [];
    const onlyAfter: string[] = [];
    const changed: string[] = [];
    for (const k of Object.keys(a)) {
        if (!(k in b))
            onlyBefore.push(k);
        else if (a[k] !== b[k])
            changed.push(k);
    }
    for (const k of Object.keys(b)) {
        if (!(k in a))
            onlyAfter.push(k);
    }
    return {
        equal: onlyBefore.length === 0 && onlyAfter.length === 0 && changed.length === 0,
        onlyBefore,
        onlyAfter,
        changed,
    };
}
/**
 * Works/fails matrix over Mac emulator engines for a fixture path.
 * Absent engines or ROMs → outcome unsupported (never simulated).
 * Set REVERSE_MAC_ROM to a ROM path to record its hash in fingerprints.
 */
export async function runMacWorksFailsMatrix(targets: string[], auth: LegacyAuthorization, opts: {
    confirm?: boolean;
    romPaths?: string[];
} = {}): Promise<Array<{
    target: string;
    engine: string;
    outcome: "works" | "fails" | "unsupported" | "error";
    detail: string;
}>> {
    const { runWorksFailsMatrix, bootstrapExecutionEnvironments, listExecutionEnvironments } = await import("./execution-environment.js");
    bootstrapExecutionEnvironments();
    const roms = await fingerprintMacRoms(opts.romPaths ?? (process.env.REVERSE_MAC_ROM ? [process.env.REVERSE_MAC_ROM] : []));
    const cells: Array<{
        target: string;
        engine: string;
        outcome: "works" | "fails" | "unsupported" | "error";
        detail: string;
    }> = [];
    const mac = listExecutionEnvironments().filter(e => ["basiliskii", "minivmac", "sheepshaver", "qemu-ppc"].includes(e.kind));
    for (const target of targets) {
        for (const env of mac) {
            const available = await env.available();
            if (!available) {
                cells.push({
                    target,
                    engine: env.name,
                    outcome: "unsupported",
                    detail: `${env.name} not on PATH`,
                });
                continue;
            }
            // Without operator ROM most Mac emulators cannot boot; treat as unsupported
            // unless REVERSE_MAC_ROM is set and readable.
            const romOk = roms.some(r => r.sha256);
            if (!romOk) {
                cells.push({
                    target,
                    engine: env.name,
                    outcome: "unsupported",
                    detail: "No operator ROM/image (set REVERSE_MAC_ROM); never simulated",
                });
                continue;
            }
            try {
                const result = await env.run(target, {
                    confirm: opts.confirm === true,
                    authorization: auth,
                });
                const outcome = result.exitCode === 0 ? "works" : result.timedOut ? "fails" : "fails";
                cells.push({
                    target,
                    engine: env.name,
                    outcome,
                    detail: result.stderr?.slice(0, 200) || `exit=${result.exitCode}`,
                });
            }
            catch (e) {
                cells.push({
                    target,
                    engine: env.name,
                    outcome: "error",
                    detail: e instanceof Error ? e.message : String(e),
                });
            }
        }
    }
    return cells;
}
