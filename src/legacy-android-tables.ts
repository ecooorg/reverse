/**
 * Sourced Android compatibility tables (Patch P step 3 / G-01 Android).
 * Documentary rows only — no third-party APKs.
 */
import type { SourcedDataTable, SourcedTableEntry, TargetProfile } from './legacy-types.js';
import { validateSourcedDataTable } from './legacy-tables.js';
function entry(parts: {
    id: string;
    fact: string;
    source: string;
    license: string;
    retrievedAt: string;
    signature?: string;
    data?: Record<string, unknown>;
}): SourcedTableEntry {
    return {
        id: parts.id,
        fact: parts.fact,
        source: parts.source,
        license: parts.license,
        retrievedAt: parts.retrievedAt,
        signature: parts.signature,
        data: parts.data,
    };
}
export const ANDROID_API_BEHAVIOR_TABLE: SourcedDataTable = {
    schemaVersion: '1.0',
    name: 'android-api-behavior',
    description: 'API-level behavior changes that break legacy apps on modern Android (documentary).',
    tableVersion: '2026-11-12',
    entries: [
        entry({
            id: 'android-runtime-permissions-23',
            fact: 'Dangerous permissions require runtime grant from API 23+; install-time only grants fail at use sites.',
            source: 'Android developer documentation — Requesting permissions (public)',
            license: 'Documentary',
            retrievedAt: '2026-11-12',
            data: { fromApi: 23, topic: 'permissions' },
        }),
        entry({
            id: 'android-apache-http-removed-23',
            fact: 'org.apache.http was removed from the boot classpath; apps must bundle or migrate to HttpURLConnection/OkHttp.',
            source: 'Android API 23 behavior changes (public)',
            license: 'Documentary',
            retrievedAt: '2026-11-12',
            data: { fromApi: 23, topic: 'network' },
        }),
        entry({
            id: 'android-background-limits-26',
            fact: 'Implicit broadcasts and background service starts are limited from API 26+.',
            source: 'Android 8.0 behavior changes (public)',
            license: 'Documentary',
            retrievedAt: '2026-11-12',
            data: { fromApi: 26, topic: 'background' },
        }),
        entry({
            id: 'android-cleartext-blocked-28',
            fact: 'Cleartext HTTP traffic is blocked by default from API 28 unless network security config allows it.',
            source: 'Android 9 behavior changes (public)',
            license: 'Documentary',
            retrievedAt: '2026-11-12',
            data: { fromApi: 28, topic: 'network' },
        }),
        entry({
            id: 'android-scoped-storage-29',
            fact: 'Scoped storage restricts broad filesystem access from API 29+.',
            source: 'Android 10 privacy changes (public)',
            license: 'Documentary',
            retrievedAt: '2026-11-12',
            data: { fromApi: 29, topic: 'storage' },
        }),
        entry({
            id: 'android-32bit-abis-deprecated',
            fact: '64-bit requirement on Play and many devices leaves armeabi/armeabi-v7a/x86-only packages unloadable.',
            source: 'Google Play 64-bit requirement (public)',
            license: 'Documentary',
            retrievedAt: '2026-11-12',
            data: { topic: 'abi' },
        }),
    ],
};
export const ANDROID_RUNTIME_TABLE: SourcedDataTable = {
    schemaVersion: '1.0',
    name: 'android-runtime-models',
    description: 'Dalvik vs early ART and multidex expectations (documentary).',
    tableVersion: '2026-11-12',
    entries: [
        entry({
            id: 'android-dalvik-to-art',
            fact: 'Dalvik was replaced by ART; JIT/AOT and GC differences can surface as timing or VerifyError issues.',
            source: 'Android runtime documentation (public)',
            license: 'Documentary',
            retrievedAt: '2026-11-12',
            data: { topic: 'runtime' },
        }),
        entry({
            id: 'android-multidex-pre-21',
            fact: 'Pre-API-21 multidex needs MultidexApplication support; otherwise NoClassDefFoundError on secondary dex.',
            source: 'Android Multidex documentation (public)',
            license: 'Documentary',
            retrievedAt: '2026-11-12',
            data: { topic: 'multidex', untilApi: 20 },
        }),
    ],
};
export type AndroidCompatDiagnosis = {
    id: string;
    fact: string;
    evidence: string[];
    confidence: number;
};
export function allAndroidCompatTables(): SourcedDataTable[] {
    return [ANDROID_API_BEHAVIOR_TABLE, ANDROID_RUNTIME_TABLE];
}
export function assertAndroidTablesValid(): void {
    for (const table of allAndroidCompatTables()) {
        const r = validateSourcedDataTable(table);
        if (!r.ok)
            throw new Error(`Android table ${table.name} invalid: ${r.errors.join('; ')}`);
    }
}
/**
 * Diagnose likely modern-host failures from static Target Profile / SDK hints.
 */
export function diagnoseAndroidFromTables(input: {
    minSdk: number | null;
    targetSdk: number | null;
    abis: string[];
    hasMultidex: boolean;
    profile?: TargetProfile;
}): AndroidCompatDiagnosis[] {
    assertAndroidTablesValid();
    const out: AndroidCompatDiagnosis[] = [];
    const hostApi = 34; // documentary "current" comparison anchor
    const appApi = input.targetSdk ?? input.minSdk;
    const evidenceBase = [
        input.minSdk != null ? `minSdk~${input.minSdk}` : 'minSdk unknown',
        input.targetSdk != null ? `targetSdk~${input.targetSdk}` : 'targetSdk unknown',
        `abis=${input.abis.join(',') || 'none'}`,
    ];
    const push = (table: SourcedDataTable, id: string, conf: number, extra: string[]) => {
        const e = table.entries.find(x => x.id === id);
        if (!e)
            return;
        out.push({
            id: e.id,
            fact: e.fact,
            evidence: [...evidenceBase, ...extra, `table=${table.name}`],
            confidence: conf,
        });
    };
    if (appApi != null && appApi < 23)
        push(ANDROID_API_BEHAVIOR_TABLE, 'android-runtime-permissions-23', 0.75, [`appApi~${appApi}`]);
    if (appApi != null && appApi < 23)
        push(ANDROID_API_BEHAVIOR_TABLE, 'android-apache-http-removed-23', 0.6, [`appApi~${appApi}`]);
    if (appApi != null && appApi < 26)
        push(ANDROID_API_BEHAVIOR_TABLE, 'android-background-limits-26', 0.55, [`appApi~${appApi}`]);
    if (appApi != null && appApi < 28)
        push(ANDROID_API_BEHAVIOR_TABLE, 'android-cleartext-blocked-28', 0.55, [`appApi~${appApi}`]);
    if (appApi != null && appApi < 29)
        push(ANDROID_API_BEHAVIOR_TABLE, 'android-scoped-storage-29', 0.5, [`appApi~${appApi}`]);
    const only32 = input.abis.length > 0 && input.abis.every(a => !a.includes('64'));
    if (only32)
        push(ANDROID_API_BEHAVIOR_TABLE, 'android-32bit-abis-deprecated', 0.8, ['32-bit-only native']);
    if (input.hasMultidex && (input.minSdk == null || input.minSdk < 21))
        push(ANDROID_RUNTIME_TABLE, 'android-multidex-pre-21', 0.7, ['multidex']);
    push(ANDROID_RUNTIME_TABLE, 'android-dalvik-to-art', 0.4, ['runtime-default']);
    void hostApi;
    return out;
}
