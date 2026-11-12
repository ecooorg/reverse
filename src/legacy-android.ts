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
/**
 * Best-effort scan of binary AndroidManifest AXML for minSdk/targetSdk.
 * Looks for UTF-16LE "minSdkVersion" / "targetSdkVersion" attribute names and a
 * nearby typed int (AXML type 0x10) — not a full AXML tree walker.
 */
export function parseAxmlSdkHints(b: Buffer): {
    minSdk: number | null;
    targetSdk: number | null;
    evidence: string[];
} {
    const evidence: string[] = [];
    let minSdk: number | null = null;
    let targetSdk: number | null = null;
    if (b.length < 8)
        return { minSdk, targetSdk, evidence: ['AXML buffer too short'] };
    // AXML file magic little-endian 0x00080003
    const magic = b.readUInt32LE(0);
    if (magic !== 0x00080003 && magic !== 0x00080001)
        evidence.push(`AXML magic=0x${magic.toString(16)} (non-standard; still scanning)`);
    else
        evidence.push(`AXML magic ok 0x${magic.toString(16)}`);
    const asUtf16 = (label: string): number | null => {
        const needle = Buffer.from(label, 'utf16le');
        let idx = b.indexOf(needle);
        if (idx < 0)
            return null;
        // Search forward up to 64 bytes for type=0x10 (int) value LE
        const end = Math.min(b.length - 8, idx + 96);
        for (let i = idx; i < end; i++) {
            if (b[i] === 0x10 && i + 5 < b.length) {
                // common pattern: type byte 0x10 then 3 bytes pad then int32 LE
                const v = b.readInt32LE(i + 4);
                if (v >= 1 && v <= 36)
                    return v;
            }
            // also try int32 immediately after attribute structure
            if (i + 4 < b.length) {
                const v = b.readInt32LE(i);
                if (v >= 1 && v <= 36 && i > idx + needle.length)
                    return v;
            }
        }
        return null;
    };
    minSdk = asUtf16('minSdkVersion');
    targetSdk = asUtf16('targetSdkVersion');
    if (minSdk != null)
        evidence.push(`minSdkVersion~${minSdk}`);
    if (targetSdk != null)
        evidence.push(`targetSdkVersion~${targetSdk}`);
    if (minSdk == null && targetSdk == null)
        evidence.push('minSdk/targetSdk not located in bounded scan');
    return { minSdk, targetSdk, evidence };
}
export interface LegacyAndroidFinding {
    format: 'APK' | 'AAB' | 'DEX' | 'unknown';
    abis: string[];
    dexFiles: string[];
    nativeLibs: string[];
    hasAndroidManifest: boolean;
    hasResourcesArsc: boolean;
    /** Best-effort signing scheme labels (v1 JAR META-INF; v2/v3 block not fully parsed). */
    signingSchemes: string[];
    /** Heuristic era / API band from package shape and optional AXML hints. */
    apiBand: string | null;
    minSdk: number | null;
    targetSdk: number | null;
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
async function readZipEntry(file: string, entryName: string, max = 512 * 1024): Promise<Buffer | null> {
    const buf = await readFile(file);
    const nameBuf = Buffer.from(entryName, 'utf8');
    let offset = 0;
    while (offset + 30 < buf.length) {
        if (buf.readUInt32LE(offset) !== 0x04034b50)
            break;
        const method = buf.readUInt16LE(offset + 8);
        const compSize = buf.readUInt32LE(offset + 18);
        const nameLen = buf.readUInt16LE(offset + 26);
        const extraLen = buf.readUInt16LE(offset + 28);
        const name = buf.toString('utf8', offset + 30, offset + 30 + nameLen);
        const dataStart = offset + 30 + nameLen + extraLen;
        const dataEnd = dataStart + compSize;
        if (name === entryName || name.endsWith('/' + entryName)) {
            if (method === 0 && dataEnd <= buf.length)
                return buf.subarray(dataStart, Math.min(dataEnd, dataStart + max));
            // deflate — skip full inflate in step 2 if not stored; try inflate raw
            if (method === 8 && dataEnd <= buf.length) {
                try {
                    const { inflateRawSync } = await import('node:zlib');
                    return inflateRawSync(buf.subarray(dataStart, dataEnd)).subarray(0, max);
                }
                catch {
                    return null;
                }
            }
            return null;
        }
        offset = dataEnd;
        if (compSize === 0 && nameLen === 0)
            break;
    }
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
    const runtimeHints: string[] = [];
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
    let minSdk: number | null = null;
    let targetSdk: number | null = null;
    if (format === 'APK' || format === 'AAB' || hasManifest) {
        try {
            const axml = await readZipEntry(abs, 'AndroidManifest.xml');
            if (axml && axml.length > 0) {
                const hints = parseAxmlSdkHints(axml);
                minSdk = hints.minSdk;
                targetSdk = hints.targetSdk;
                structuralDetectors.push({
                    name: 'axml-sdk-hints',
                    evidence: hints.evidence.slice(0, 6),
                    confidence: minSdk != null || targetSdk != null ? 0.7 : 0.35,
                });
            }
        }
        catch {
            /* ignore */
        }
    }
    if (minSdk != null)
        runtimeHints.push(`minSdk~${minSdk}`);
    if (targetSdk != null)
        runtimeHints.push(`targetSdk~${targetSdk}`);
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
            coverageNotes: ['AXML SDK hints are best-effort; full resource table walk is P later.'],
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
        minSdk,
        targetSdk,
        runtimeHints,
        obfuscationIndicators: obfuscation.slice(0, 50),
        structuralDetectors,
        targetProfile,
        authorization: auth,
        sha256,
    };
    const limitations = [
        'AXML is scanned for minSdk/targetSdk hints only; not a full manifest decoder.',
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
                'Patch P steps 0–2: authorization, Target Profile, AXML SDK hints, calibration.',
                `format=${format}; abis=${abis.join(',') || 'none'}; dex=${dexFiles.length}`,
            ],
        },
    });
}
