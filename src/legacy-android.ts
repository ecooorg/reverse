/**
 * Legacy Android static analysis (Patch P steps 0–1).
 * Authorization-gated Target Profile over APK/AAB/DEX inventory.
 * Reuses ZIP inventory from analysis-android; does not decode AXML or disassemble DEX.
 */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { result } from './core-types.js';
import { analyzeAndroid } from './analysis-android.js';
import { profileField, type LegacyAuthorization, type TargetProfile } from './legacy-types.js';
import { assertAuthorizationPresent, requireLegacyGate } from './legacy-gate.js';
export type { LegacyAuthorization, TargetProfile } from './legacy-types.js';
const DEX_MAGIC = Buffer.from('dex\n');
export interface LegacyAndroidFinding {
    format: 'APK' | 'AAB' | 'DEX' | 'unknown';
    abis: string[];
    dexFiles: string[];
    nativeLibs: string[];
    hasAndroidManifest: boolean;
    hasResourcesArsc: boolean;
    /** Best-effort signing scheme labels (v1 JAR META-INF; v2/v3 block not fully parsed). */
    signingSchemes: string[];
    /** Heuristic era / API band from package shape (not a decoded minSdk). */
    apiBand: string | null;
    runtimeHints: string[];
    obfuscationIndicators: string[];
    structuralDetectors: Array<{
        name: string;
        evidence: string[];
        confidence: number;
    }>;
    targetProfile: TargetProfile;
    authorization: LegacyAuthorization;
    sha256: string;
}
function detectDexFile(b: Buffer): boolean {
    return b.length >= 8 && b.subarray(0, 4).equals(DEX_MAGIC);
}
function apiBandFromShape(args: {
    abis: string[];
    dexCount: number;
    hasMultidex: boolean;
}): string | null {
    if (args.abis.includes('arm64-v8a') || args.abis.includes('x86_64'))
        return 'API-21+ candidate (64-bit ABI present)';
    if (args.hasMultidex || args.dexCount > 1)
        return 'API-14+ multidex-era candidate';
    if (args.abis.includes('armeabi') && !args.abis.includes('armeabi-v7a'))
        return 'early-API armeabi candidate (pre-v7a emphasis)';
    if (args.abis.length)
        return 'API-9–22 candidate (32-bit ABIs only; minSdk not decoded)';
    return null;
}
export async function analyzeLegacyAndroid(filePath: string, authorization: LegacyAuthorization | null = null, options: {
    sessionId?: string;
} = {}): Promise<ReturnType<typeof result<LegacyAndroidFinding>>> {
    const auth = await requireLegacyGate({
        sessionId: options.sessionId,
        authorization,
        operation: 'analyze_legacy_android',
    });
    assertAuthorizationPresent(auth, 'analyze_legacy_android');
    const abs = path.resolve(filePath);
    const st = await stat(abs);
    const head = st.size > 0
        ? await readFile(abs, { encoding: null }).then(b => b.subarray(0, Math.min(b.length, 64)))
        : Buffer.alloc(0);
    const sha256 = createHash('sha256').update(await readFile(abs)).digest('hex');
    const structuralDetectors: LegacyAndroidFinding['structuralDetectors'] = [];
    let format: LegacyAndroidFinding['format'] = 'unknown';
    let abis: string[] = [];
    let dexFiles: string[] = [];
    let nativeLibs: string[] = [];
    let hasManifest = false;
    let hasArsc = false;
    let signingSchemes: string[] = [];
    let obfuscation: string[] = [];
    let runtimeHints: string[] = [];
    if (detectDexFile(head)) {
        format = 'DEX';
        structuralDetectors.push({
            name: 'dex-magic',
            evidence: ['dex\\n magic at offset 0'],
            confidence: 0.95,
        });
        runtimeHints.push('Dalvik/ART DEX container (standalone)');
    }
    else {
        const inv = await analyzeAndroid(abs);
        const f = inv.findings[0] as {
            format?: string;
            abis?: string[];
            dexFiles?: string[];
            nativeLibs?: string[];
            hasAndroidManifest?: boolean;
            hasResourcesArsc?: boolean;
            obfuscationIndicators?: string[];
            entries?: number;
            hasV1Signing?: boolean;
        } | undefined;
        if (f) {
            format = (f.format === 'APK' || f.format === 'AAB' ? f.format : 'unknown');
            abis = f.abis ?? [];
            dexFiles = f.dexFiles ?? [];
            nativeLibs = f.nativeLibs ?? [];
            hasManifest = !!f.hasAndroidManifest;
            hasArsc = !!f.hasResourcesArsc;
            obfuscation = f.obfuscationIndicators ?? [];
            structuralDetectors.push({
                name: 'android-zip-inventory',
                evidence: [
                    `entries=${f.entries ?? 0}`,
                    `dex=${dexFiles.length}`,
                    `native=${nativeLibs.length}`,
                    `abis=${abis.join(',') || 'none'}`,
                ],
                confidence: 0.9,
            });
            if (hasManifest)
                structuralDetectors.push({
                    name: 'android-manifest-present',
                    evidence: ['AndroidManifest.xml present (AXML not decoded)'],
                    confidence: 0.85,
                });
            if (hasArsc)
                structuralDetectors.push({
                    name: 'resources-arsc',
                    evidence: ['resources.arsc present'],
                    confidence: 0.85,
                });
            if ((f as {
                hasV1Signing?: boolean;
            }).hasV1Signing)
                signingSchemes = ['v1-jar'];
        }
    }
    const hasMultidex = dexFiles.some(d => /classes\d+\.dex$/i.test(d)) || dexFiles.length > 1;
    if (hasMultidex)
        runtimeHints.push('multidex');
    if (dexFiles.length || format === 'DEX')
        runtimeHints.push('Dalvik/ART bytecode container');
    if (abis.some(a => a.startsWith('arm')))
        runtimeHints.push('ARM native');
    const apiBand = apiBandFromShape({ abis, dexCount: dexFiles.length, hasMultidex });
    const bitness = abis.some(a => a.includes('64'))
        ? 64
        : abis.length
            ? 32
            : null;
    const targetProfile: TargetProfile = {
        schemaVersion: '1.0',
        osAndEra: profileField({
            value: { family: 'Android', era: apiBand },
            evidence: [
                format !== 'unknown' ? `format=${format}` : 'format unknown',
                ...(apiBand ? [apiBand] : []),
            ],
            confidence: format === 'unknown' ? 0.2 : 0.7,
            complete: false,
            coverageNotes: ['minSdk/targetSdk not decoded from binary AXML in P step 1.'],
        }),
        cpu: profileField({
            value: abis[0] ?? (format === 'DEX' ? 'dalvik-bytecode' : 'unknown'),
            evidence: abis.length ? abis.slice(0, 6) : ['no lib/ ABI paths'],
            confidence: abis.length ? 0.85 : 0.3,
        }),
        bitness: profileField({
            value: bitness,
            evidence: abis.length ? abis : ['bitness unknown without native ABIs or AXML'],
            confidence: bitness == null ? 0.2 : 0.8,
        }),
        abi: profileField({
            value: abis.length ? abis.join(',') : null,
            evidence: abis.slice(0, 8),
            confidence: abis.length ? 0.9 : 0.25,
        }),
        toolchainRuntimeFramework: profileField({
            value: [
                ...runtimeHints,
                ...signingSchemes.map(s => `signing:${s}`),
                ...(obfuscation.length ? ['obfuscation-indicators'] : []),
            ],
            evidence: [
                ...runtimeHints,
                ...signingSchemes,
                ...obfuscation.slice(0, 4),
            ],
            confidence: runtimeHints.length ? 0.65 : 0.3,
            complete: false,
        }),
        installer: profileField({
            value: format === 'APK' || format === 'AAB' ? format : null,
            evidence: [format],
            confidence: format === 'APK' || format === 'AAB' ? 0.8 : 0.2,
        }),
        dependencies: profileField({
            value: nativeLibs.slice(0, 50),
            evidence: nativeLibs.slice(0, 8).map(n => `native ${n}`),
            confidence: nativeLibs.length ? 0.7 : 0.2,
            complete: false,
            coverageNotes: ['Native .so paths only; Java deps not resolved in P step 1.'],
        }),
        codeModel: profileField({
            value: format === 'unknown' ? null : format.toLowerCase(),
            evidence: structuralDetectors.flatMap(d => d.evidence).slice(0, 4),
            confidence: format === 'unknown' ? 0.15 : 0.9,
            complete: format !== 'unknown',
        }),
    };
    const finding: LegacyAndroidFinding = {
        format,
        abis,
        dexFiles: dexFiles.slice(0, 100),
        nativeLibs: nativeLibs.slice(0, 200),
        hasAndroidManifest: hasManifest,
        hasResourcesArsc: hasArsc,
        signingSchemes,
        apiBand,
        runtimeHints,
        obfuscationIndicators: obfuscation.slice(0, 50),
        structuralDetectors,
        targetProfile,
        authorization: auth,
        sha256,
    };
    const limitations = [
        'Binary AndroidManifest.xml (AXML) is not decoded; minSdk/targetSdk not read.',
        'No DEX class enumeration or disassembly.',
        'APK Signature Scheme v2/v3 blocks are not parsed in P step 1.',
        'Authorization is an operator declaration, not legal verification.',
    ];
    return result<LegacyAndroidFinding>(abs, 'legacy_android_analysis', [finding], {
        status: format === 'unknown' ? 'partial' : 'completed',
        limitations,
        coverage: {
            examined: true,
            complete: false,
            notes: [
                'Patch P steps 0–1: authorization + Target Profile over static inventory.',
                `format=${format}; abis=${abis.join(',') || 'none'}; dex=${dexFiles.length}`,
            ],
        },
    });
}
