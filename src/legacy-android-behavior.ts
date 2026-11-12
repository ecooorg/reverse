/**
 * Android execution/observation helpers (Patch P step 4).
 * Detect-only works/fails matrix — never simulates emulator or adb output.
 */
import type { LegacyAuthorization } from './legacy-types.js';
import { bootstrapExecutionEnvironments, listExecutionEnvironments, } from './execution-environment.js';
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
            // Presence alone does not prove a bootable AVD/device; stay unsupported
            // unless operator later supplies REVERSE_ANDROID_SERIAL / AVD name.
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
                detail: 'P step 4 detect-only; install/run not automated without operator confirm path',
            });
        }
    }
    return cells;
}
