/**
 * Android execution/observation helpers (Patch P steps 4–6).
 * Detect-only works/fails; host capture/replay; controlled install gated.
 * Never simulates emulator or adb output.
 */
import { captureScenario, replayScenario } from './behavior-capture.js';
import type { BehaviorScenario, CaptureRecord, ReplayComparison } from './behavior-capture.js';
import { bootstrapExecutionEnvironments, listExecutionEnvironments, } from './execution-environment.js';
import type { LegacyAuthorization } from './legacy-types.js';
import { operatingMode } from './benchmark-gate.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { requireLegacyGate } from './legacy-gate.js';
import { wrapUntrusted } from './core-untrusted.js';
const execFileAsync = promisify(execFile);
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
/** Apply the shared prompt-injection wrapper to device-controlled text. */
export function wrapAndroidDeviceText(input: {
    serial: string;
    logcat: string | null;
    activityDump: string | null;
}): Record<string, unknown> {
    return wrapUntrusted(input).structured;
}
/**
 * Read bounded device-side Android observations. Read-only: no install, launch or clear.
 */
export async function collectAndroidDeviceObservations(input: {
    authorization?: LegacyAuthorization | null;
    sessionId?: string;
    confirm: boolean;
    serial?: string;
    logcatLines?: number;
}): Promise<{
    status: 'completed' | 'unsupported' | 'refused' | 'partial';
    serial: string | null;
    logcat: string | null;
    activityDump: string | null;
    untrustedContent: Record<string, unknown> | null;
    limitations: string[];
}> {
    await requireLegacyGate({
        authorization: input.authorization,
        sessionId: input.sessionId,
        operation: 'collect_android_device_observations',
    });
    const serial = input.serial ?? process.env.REVERSE_ANDROID_SERIAL ?? '';
    if (operatingMode() !== 'CONTROLLED_EXECUTION' || input.confirm !== true) {
        return {
            status: 'refused',
            serial: serial || null,
            logcat: null,
            activityDump: null,
            untrustedContent: null,
            limitations: [
                'Android device observation requires REVERSE_MODE=CONTROLLED_EXECUTION and confirm=true',
            ],
        };
    }
    if (!serial || serial.length > 256 || serial.startsWith('-')) {
        return {
            status: 'unsupported',
            serial: null,
            logcat: null,
            activityDump: null,
            untrustedContent: null,
            limitations: ['Set a valid REVERSE_ANDROID_SERIAL or serial option; no adb command was run.'],
        };
    }
    const requestedLines = Number.isFinite(input.logcatLines) ? Math.floor(input.logcatLines as number) : 500;
    const lineCount = Math.max(1, Math.min(2000, requestedLines));
    const run = async (args: string[]): Promise<string> => {
        const result = await execFileAsync('adb', ['-s', serial, ...args], {
            timeout: 15000,
            windowsHide: true,
            maxBuffer: 1024 * 1024,
            encoding: 'utf8',
        });
        return `${result.stdout}\n${result.stderr}`.slice(0, 256 * 1024);
    };
    let logcat: string | null = null;
    let activityDump: string | null = null;
    const limitations: string[] = [];
    try {
        logcat = await run(['logcat', '-d', '-t', String(lineCount)]);
        activityDump = await run(['shell', 'dumpsys', 'activity', 'activities']);
    }
    catch (error) {
        const code = error && typeof error === 'object' && 'code' in error
            ? String(error.code)
            : 'unknown';
        limitations.push(`adb observation failed or was unavailable (code=${code}).`);
    }
    const status = logcat !== null && activityDump !== null
        ? 'completed'
        : logcat !== null || activityDump !== null ? 'partial' : 'unsupported';
    const wrapped = logcat !== null || activityDump !== null
        ? wrapAndroidDeviceText({ serial, logcat, activityDump })
        : null;
    return {
        status,
        serial,
        logcat: typeof wrapped?.logcat === 'string' ? wrapped.logcat : null,
        activityDump: typeof wrapped?.activityDump === 'string' ? wrapped.activityDump : null,
        untrustedContent: wrapped?.untrustedContent as Record<string, unknown> | undefined ?? null,
        limitations: [
            ...limitations,
            'Read-only adb logcat and activity dump only; no UI hierarchy, screenshots, input replay, network or database diff.',
            'Device output is untrusted target data and may contain sensitive application diagnostics.',
        ],
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
