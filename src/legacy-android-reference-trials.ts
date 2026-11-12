/**
 * Android L0 reference trials (Patch P step 6).
 * Crafted fixtures only — no third-party APKs.
 */
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyzeLegacyAndroid } from './legacy-android.js';
import { diagnoseAndroidFromTables } from './legacy-android-tables.js';
import type { LegacyAuthorization } from './legacy-types.js';
const AUTH: LegacyAuthorization = {
    basis: 'open_source',
    licenseOrConsentReference: 'android-reference-trials',
    declaredBy: 'legacy-android-reference-trials',
    declaredAt: new Date().toISOString(),
};
export interface AndroidReferenceTrialResult {
    id: string;
    level: 'L0';
    ok: boolean;
    detail: string;
}
export interface AndroidReferenceTrialsReport {
    trials: AndroidReferenceTrialResult[];
    ok: boolean;
    limitations: string[];
}
function dexBytes(): Buffer {
    const b = Buffer.alloc(70);
    b.write('dex\n035\0', 0);
    return b;
}
export async function runAndroidReferenceTrials(): Promise<AndroidReferenceTrialsReport> {
    const dir = await mkdtemp(join(tmpdir(), 'android-ref-'));
    const trials: AndroidReferenceTrialResult[] = [];
    const limitations = [
        'L0 only: structural identity on crafted fixtures.',
        'No operator APK oracle; device runs not part of L0.',
    ];
    try {
        const dexPath = join(dir, 'classes.dex');
        await writeFile(dexPath, dexBytes());
        const dex = await analyzeLegacyAndroid(dexPath, AUTH);
        const f = dex.findings[0];
        trials.push({
            id: 'dex-profile-l0',
            level: 'L0',
            ok: !!f && f.format === 'DEX' && f.targetProfile.osAndEra.value?.family === 'Android',
            detail: f ? `format=${f.format}; family=${f.targetProfile.osAndEra.value?.family}` : 'missing',
        });
        const diag = diagnoseAndroidFromTables({
            minSdk: 16,
            targetSdk: 16,
            abis: ['armeabi-v7a'],
            hasMultidex: false,
        });
        trials.push({
            id: 'diagnosis-table-l0',
            level: 'L0',
            ok: diag.length >= 1,
            detail: `findings=${diag.length}`,
        });
        if (f) {
            trials.push({
                id: 'authorization-provenance-l0',
                level: 'L0',
                ok: f.authorization?.basis === 'open_source',
                detail: `basis=${f.authorization?.basis}`,
            });
        }
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
    return {
        trials,
        ok: trials.every(t => t.ok),
        limitations,
    };
}
