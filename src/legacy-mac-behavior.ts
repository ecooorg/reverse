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
