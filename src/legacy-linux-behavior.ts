/**
 * Linux-oriented behavior capture helpers (Patch N).
 * Reuses the shared capture/replay pipeline; scenarios stay deterministic
 * and never claim an old-rootfs oracle.
 */
import { captureScenario, replayScenario } from './behavior-capture.js';
import type { BehaviorScenario, CaptureRecord, ReplayComparison } from './behavior-capture.js';
import type { LegacyAuthorization } from './legacy-types.js';
export interface LinuxBehaviorTrialResult {
    equal: boolean;
    differences: string[];
    limitations: string[];
    record: CaptureRecord;
}
/**
 * Capture and replay a deterministic process under CONTROLLED_EXECUTION.
 * Default scenario is a host node one-liner (lawful); operator can pass a
 * custom scenario that points at an old binary + rootfs env.
 */
export async function runLinuxBehaviorRoundTrip(
    scenario: BehaviorScenario | undefined,
    authorization: LegacyAuthorization
): Promise<LinuxBehaviorTrialResult> {
    const sc: BehaviorScenario = scenario ?? {
        schemaVersion: '1.0',
        id: 'linux-det-hello',
        command: process.execPath,
        args: ['-e', 'console.log("linux-behavior-ok"); process.exit(0);'],
        volatileFields: ['timestamps', 'scratch-paths'],
        timeoutMs: 8000
    };
    const record = await captureScenario(sc, {
        confirm: true,
        authorization,
        environmentDetail: 'linux-behavior-round-trip'
    });
    const cmp: ReplayComparison = await replayScenario(sc, record, { confirm: true, authorization });
    return {
        equal: cmp.equal,
        differences: cmp.differences,
        limitations: [
            ...(record.observation.limitations ?? []),
            'Round-trip does not prove old-userland compatibility without a rootfs oracle.'
        ],
        record
    };
}
