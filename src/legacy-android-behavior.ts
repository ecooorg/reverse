/**
 * Android execution/observation helpers (Patch P steps 4–5).
 * Detect-only works/fails; host capture/replay; controlled install gated.
 * Never simulates emulator or adb output.
 */
import { captureScenario, replayScenario } from './behavior-capture.js';
import type { BehaviorScenario, CaptureRecord, ReplayComparison } from './behavior-capture.js';
import { bootstrapExecutionEnvironments, listExecutionEnvironments, } from './execution-environment.js';
import type { LegacyAuthorization } from './legacy-types.js';
import { operatingMode } from './benchmark-gate.js';
export interface AndroidBehaviorTrialResult {
    equal: boolean;
    differences: string[];
    limitations: string[];
    record: CaptureRecord | null;
    comparison: ReplayComparison | null;
}
export async function runAndroidWorksFailsMatrix(targets: string[], _auth: LegacyAuthorization, opts: {
    confirm?: boolean;
} = {}): Promise<Array<{
    target: string;
    engine: string;
    outcome: 'works' | 'fails' | 'unsupported' | 'error';
    detail: string;
}>> {
    void opts;
    bootstrapExecutionEnvironments();
    const android = listExecutionEnvironments().filter(e => e.kind === 'adb' || e.kind === 'emulator');
    const cells: Array<{
        target: string;
        engine: string;
        outcome: 'works' | 'fails' | 'unsupported' | 'error';
        detail: string;
    }> = [];
    for (const target of targets) {
        for (const env of android) {
            const available = await env.available();
            if (!available) {
                cells.push({
                    target,
                    engine: env.name,
                    outcome: 'unsupported',
                    detail: `${env.name} not on PATH; never simulated`,
                });
                continue;
            }
            const serial = process.env.REVERSE_ANDROID_SERIAL;
            const avd = process.env.REVERSE_ANDROID_AVD;
            if (env.kind === 'adb' && !serial) {
                cells.push({
                    target,
                    engine: env.name,
                    outcome: 'unsupported',
                    detail: 'adb present but REVERSE_ANDROID_SERIAL unset',
                });
                continue;
            }
            if (env.kind === 'emulator' && !avd) {
                cells.push({
                    target,
                    engine: env.name,
                    outcome: 'unsupported',
                    detail: 'emulator present but REVERSE_ANDROID_AVD unset',
                });
                continue;
            }
            cells.push({
                target,
                engine: env.name,
                outcome: 'unsupported',
                detail: 'P step 4–5: install/run still requires controlled path + confirm',
            });
        }
    }
    return cells;
}
/**
 * Host-deterministic capture/replay for Android scenarios (no device required).
 * Device-side logcat/uiautomator capture remains later when serial is configured.
 */
export async function runAndroidBehaviorRoundTrip(scenario: BehaviorScenario | undefined, _auth: LegacyAuthorization, opts: {
    confirm: boolean;
}): Promise<AndroidBehaviorTrialResult> {
    const limitations: string[] = [];
    if (!scenario) {
        return {
            equal: false,
            differences: ['no scenario'],
            limitations: ['scenario required'],
            record: null,
            comparison: null,
        };
    }
    if (operatingMode() !== 'CONTROLLED_EXECUTION' || !opts.confirm) {
        return {
            equal: false,
            differences: [],
            limitations: [
                'Behavior capture/replay requires REVERSE_MODE=CONTROLLED_EXECUTION and confirm=true',
            ],
            record: null,
            comparison: null,
        };
    }
    limitations.push('Host capture/replay only; device logcat not attached in P step 5');
    const record = await captureScenario(scenario, { confirm: true });
    const comparison = await replayScenario(scenario, record, { confirm: true });
    return {
        equal: comparison.equal,
        differences: comparison.differences,
        limitations,
        record,
        comparison,
    };
}
/**
 * Plan a controlled adb install — does not run adb unless CONTROLLED + confirm + serial.
 * Returns a structured plan for the operator / later MCP tool.
 */
export function planAndroidControlledInstall(opts: {
    apkPath: string;
    confirm: boolean;
    serial?: string;
}): {
    allowed: boolean;
    command: string[] | null;
    limitations: string[];
} {
    const serial = opts.serial ?? process.env.REVERSE_ANDROID_SERIAL;
    const limitations: string[] = [];
    if (operatingMode() !== 'CONTROLLED_EXECUTION') {
        limitations.push('REVERSE_MODE must be CONTROLLED_EXECUTION');
    }
    if (!opts.confirm)
        limitations.push('confirm=true required');
    if (!serial)
        limitations.push('REVERSE_ANDROID_SERIAL or serial option required');
    if (limitations.length)
        return { allowed: false, command: null, limitations };
    return {
        allowed: true,
        command: ['adb', '-s', serial as string, 'install', '-r', opts.apkPath],
        limitations: [
            'Plan only in P step 5; execution still goes through existing adb_install MCP with confirm',
        ],
    };
}
