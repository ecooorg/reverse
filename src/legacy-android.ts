/**
 * Legacy Android static analysis (Patch P steps 0–3).
 * Authorization-gated Target Profile over APK/AAB/DEX inventory.
 * Binary AXML/ARSC/DEX/signature parsers in legacy-android-parsers (no JADX/Apktool).
 */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { result } from './core-types.js';
import { analyzeAndroid } from './analysis-android.js';
import { profileField, type LegacyAuthorization, type TargetProfile } from './legacy-types.js';
import { assertAuthorizationPresent, requireLegacyGate } from './legacy-gate.js';
import { diagnoseAndroidFromTables, type AndroidCompatDiagnosis } from './legacy-android-tables.js';
import { parseAxmlManifest } from './legacy-android-parsers.js';
import { parseArscSummary } from './legacy-android-parsers.js';
import { parseDexClasses } from './legacy-android-parsers.js';
import { detectApkSignatures } from './legacy-android-parsers.js';
import { extractDerNameHints } from './legacy-android-parsers.js';
import { detectApkBuildMarkers } from './legacy-android-parsers.js';
export { parseAxmlSdkHints } from './legacy-android-parsers.js';
export { parseAxmlManifest } from './legacy-android-parsers.js';
export { parseArscSummary } from './legacy-android-parsers.js';
export { parseDexClasses } from './legacy-android-parsers.js';
export { detectApkSignatures } from './legacy-android-parsers.js';
export { extractDerNameHints } from './legacy-android-parsers.js';
export { detectApkBuildMarkers } from './legacy-android-parsers.js';
export type { LegacyAuthorization, TargetProfile } from './legacy-types.js';
const DEX_MAGIC = Buffer.from('dex\n');
export interface LegacyAndroidFinding {
    format: 'APK' | 'AAB' | 'DEX' | 'unknown';
    abis: string[];
    dexFiles: string[];
    nativeLibs: string[];
    hasAndroidManifest: boolean;
    hasResourcesArsc: boolean;
    /** Signing scheme labels: v1-jar, v2, v3, v2-block. */
    signingSchemes: string[];
    certificateSubjects: string[];
    certificateIssuers: string[];
    buildSystems: string[];
    playServicesHints: string[];
    /** Heuristic era / API band from package shape and AXML SDK fields. */
    apiBand: string | null;
    minSdk: number | null;
    targetSdk: number | null;
    packageName: string | null;
    versionCode: number | null;
    versionName: string | null;
    permissions: string[];
    components: {
        activities: string[];
        services: string[];
        receivers: string[];
        providers: string[];
    };
    dexClassCount: number | null;
    dexClassNamesSample: string[];
    dexMethodCount: number | null;
    dexMethodNamesSample: string[];
    arscPackageNames: string[];
    runtimeHints: string[];
    obfuscationIndicators: string[];
    structuralDetectors: Array<{
        name: string;
        evidence: string[];
        confidence: number;
    }>;
    compatibilityFindings: AndroidCompatDiagnosis[];
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
    minSdk?: number | null;
}): string | null {
    if (args.minSdk != null) {
        if (args.minSdk <= 10)
            return `API-${args.minSdk}–22 era (minSdk=${args.minSdk})`;
        if (args.minSdk <= 22)
            return `API-${args.minSdk}+ legacy band (minSdk=${args.minSdk})`;
        return `API-${args.minSdk}+ (minSdk=${args.minSdk})`;
    }
    if (args.abis.includes('arm64-v8a') || args.abis.includes('x86_64')) {
        return 'API-21+ candidate (64-bit ABI present)';
    }
    if (args.hasMultidex || args.dexCount > 1)
        return 'API-14+ multidex-era candidate';
    if (args.abis.includes('armeabi') && !args.abis.includes('armeabi-v7a')) {
        return 'early-API armeabi candidate (pre-v7a emphasis)';
    }
    if (args.abis.length)
        return 'API-9–22 candidate (32-bit ABIs only; minSdk not decoded)';
    return null;
}
async function readZipEntry(file: string, entryName: string, max = 512 * 1024): Promise<Buffer | null> {
    const buf = await readFile(file);
    for (let offset = 0; offset + 30 < buf.length;) {
        if (buf.readUInt32LE(offset) !== 0x04034b50)
            return null;
        const method = buf.readUInt16LE(offset + 8);
        const compSize = buf.readUInt32LE(offset + 18);
        const nameLen = buf.readUInt16LE(offset + 26);
        const extraLen = buf.readUInt16LE(offset + 28);
        const name = buf.toString('utf8', offset + 30, offset + 30 + nameLen);
        const dataStart = offset + 30 + nameLen + extraLen;
        const dataEnd = dataStart + compSize;
        if (name === entryName || name.endsWith('/' + entryName)) {
            if (method === 0 && dataEnd <= buf.length) {
                return buf.subarray(dataStart, Math.min(dataEnd, dataStart + max));
            }
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
        if (compSize === 0 && nameLen === 0)
            return null;
        offset = dataEnd;
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
    const wholeFile = await readFile(abs);
    const sha256 = createHash('sha256').update(wholeFile).digest('hex');
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
            if (hasManifest) {
                structuralDetectors.push({
                    name: 'android-manifest-present',
                    evidence: ['AndroidManifest.xml present'],
                    confidence: 0.85,
                });
            }
            if (hasArsc) {
                structuralDetectors.push({
                    name: 'resources-arsc',
                    evidence: ['resources.arsc present'],
                    confidence: 0.85,
                });
            }
            if (f.hasV1Signing)
                signingSchemes = ['v1-jar'];
        }
    }
    let minSdk: number | null = null;
    let targetSdk: number | null = null;
    let packageName: string | null = null;
    let versionCode: number | null = null;
    let versionName: string | null = null;
    let permissions: string[] = [];
    let components = {
        activities: [] as string[],
        services: [] as string[],
        receivers: [] as string[],
        providers: [] as string[],
    };
    let dexClassCount: number | null = null;
    let dexClassNamesSample: string[] = [];
    let dexMethodCount: number | null = null;
    let dexMethodNamesSample: string[] = [];
    let arscPackageNames: string[] = [];
    if (format === 'APK' || format === 'AAB' || hasManifest) {
        try {
            const axml = await readZipEntry(abs, 'AndroidManifest.xml', 1024 * 1024);
            if (axml && axml.length > 0) {
                const manifest = parseAxmlManifest(axml);
                minSdk = manifest.minSdkVersion;
                targetSdk = manifest.targetSdkVersion;
                packageName = manifest.packageName;
                versionCode = manifest.versionCode;
                versionName = manifest.versionName;
                permissions = manifest.permissions;
                components = {
                    activities: manifest.activities,
                    services: manifest.services,
                    receivers: manifest.receivers,
                    providers: manifest.providers,
                };
                structuralDetectors.push({
                    name: 'axml-manifest',
                    evidence: manifest.evidence.slice(0, 10),
                    confidence: minSdk != null || packageName != null ? 0.9 : 0.45,
                });
            }
        }
        catch {
            /* ignore */
        }
    }
    if (hasArsc || format === 'APK' || format === 'AAB') {
        try {
            const arsc = await readZipEntry(abs, 'resources.arsc', 2 * 1024 * 1024);
            if (arsc && arsc.length > 0) {
                const summary = parseArscSummary(arsc);
                arscPackageNames = summary.packageNames;
                structuralDetectors.push({
                    name: 'resources-arsc-parse',
                    evidence: summary.evidence.slice(0, 8),
                    confidence: summary.packageCount != null ? 0.85 : 0.4,
                });
            }
        }
        catch {
            /* ignore */
        }
    }
    try {
        let dexBuf: Buffer | null = null;
        if (format === 'DEX') {
            dexBuf = wholeFile;
        }
        else if (dexFiles.length) {
            const primary = dexFiles.find(d => /classes\.dex$/i.test(d)) ?? dexFiles[0]!;
            dexBuf = await readZipEntry(abs, primary, 4 * 1024 * 1024);
        }
        if (dexBuf && dexBuf.length > 0) {
            const listing = parseDexClasses(dexBuf, 300);
            dexClassCount = listing.classCount;
            dexClassNamesSample = listing.classNames.slice(0, 40);
            dexMethodCount = listing.methodCount;
            dexMethodNamesSample = listing.methodNamesSample.slice(0, 40);
            if (listing.obfuscationIndicators.length) {
                obfuscation = [...new Set([...obfuscation, ...listing.obfuscationIndicators])];
            }
            structuralDetectors.push({
                name: 'dex-class-listing',
                evidence: listing.evidence.slice(0, 8),
                confidence: listing.magicOk ? 0.9 : 0.3,
            });
        }
    }
    catch {
        /* ignore */
    }
    const certificateSubjects: string[] = [];
    const certificateIssuers: string[] = [];
    if (format === 'APK' || format === 'AAB') {
        try {
            const sig = detectApkSignatures(wholeFile);
            if (signingSchemes.includes('v1-jar') && !sig.schemes.includes('v1-jar')) {
                sig.schemes.unshift('v1-jar');
            }
            signingSchemes = sig.schemes.length ? sig.schemes : signingSchemes;
            // Pull META-INF cert blobs for CN hints
            for (const name of ['META-INF/CERT.RSA', 'META-INF/CERT.DSA', 'META-INF/CERT.EC', 'META-INF/ANDROIDD.RSA']) {
                try {
                    const blob = await readZipEntry(abs, name, 256 * 1024);
                    if (blob && blob.length > 32) {
                        const hints = extractDerNameHints(blob);
                        for (const s of hints.subjects) {
                            if (!certificateSubjects.includes(s))
                                certificateSubjects.push(s);
                        }
                        for (const s of hints.issuers) {
                            if (!certificateIssuers.includes(s))
                                certificateIssuers.push(s);
                        }
                    }
                }
                catch {
                    /* ignore */
                }
            }
            if (certificateSubjects.length) {
                sig.evidence.push(`certSubjects=${certificateSubjects.slice(0, 3).join('|')}`);
            }
            structuralDetectors.push({
                name: 'apk-signatures',
                evidence: sig.evidence.slice(0, 10),
                confidence: sig.schemes.length ? 0.85 : 0.3,
            });
        }
        catch {
            /* ignore */
        }
    }
    if (minSdk != null)
        runtimeHints.push(`minSdk=${minSdk}`);
    if (targetSdk != null)
        runtimeHints.push(`targetSdk=${targetSdk}`);
    if (packageName)
        runtimeHints.push(`package=${packageName}`);
    const hasMultidex = dexFiles.some(d => /classes\d+\.dex$/i.test(d)) || dexFiles.length > 1;
    if (hasMultidex)
        runtimeHints.push('multidex');
    if (dexFiles.length || format === 'DEX')
        runtimeHints.push('Dalvik/ART bytecode container');
    if (abis.some(a => a.startsWith('arm')))
        runtimeHints.push('ARM native');
    if (dexClassCount != null)
        runtimeHints.push(`dexClasses=${dexClassCount}`);
    const apiBand = apiBandFromShape({ abis, dexCount: dexFiles.length, hasMultidex, minSdk });
    const bitness = abis.some(a => a.includes('64')) ? 64 : abis.length ? 32 : null;
    const targetProfile: TargetProfile = {
        schemaVersion: '1.0',
        osAndEra: profileField({
            value: { family: 'Android', era: apiBand },
            evidence: [
                format !== 'unknown' ? `format=${format}` : 'format unknown',
                ...(apiBand ? [apiBand] : []),
                ...(minSdk != null ? [`minSdk=${minSdk}`] : []),
            ],
            confidence: format === 'unknown' ? 0.2 : minSdk != null ? 0.85 : 0.7,
            complete: minSdk != null,
            coverageNotes: [
                'Binary AXML/ARSC/DEX parsers (P step 3); residual resource configs and full cert chain not expanded.',
            ],
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
            evidence: [...runtimeHints, ...signingSchemes, ...obfuscation.slice(0, 4)],
            confidence: runtimeHints.length ? 0.7 : 0.3,
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
            coverageNotes: ['Native .so paths only; Java deps not resolved from DEX constants.'],
        }),
        codeModel: profileField({
            value: format === 'unknown' ? null : format.toLowerCase(),
            evidence: structuralDetectors.flatMap(d => d.evidence).slice(0, 6),
            confidence: format === 'unknown' ? 0.15 : 0.9,
            complete: format !== 'unknown',
        }),
    };
    const compatibilityFindings = diagnoseAndroidFromTables({
        minSdk,
        targetSdk,
        abis,
        hasMultidex,
    });
    let buildSystems: string[] = [];
    let playServicesHints: string[] = [];
    try {
        const nameSet = [
            ...dexFiles,
            ...nativeLibs,
            ...(hasManifest ? ['AndroidManifest.xml'] : []),
            ...(hasArsc ? ['resources.arsc'] : []),
        ];
        const markers = detectApkBuildMarkers(nameSet);
        buildSystems = markers.buildSystems;
        playServicesHints = markers.playServicesHints;
        if (markers.evidence.length) {
            structuralDetectors.push({
                name: 'apk-build-markers',
                evidence: markers.evidence.slice(0, 8),
                confidence: markers.buildSystems.length || markers.playServicesHints.length ? 0.55 : 0.25,
            });
        }
    }
    catch {
        /* ignore */
    }
    const finding: LegacyAndroidFinding = {
        format,
        abis,
        dexFiles: dexFiles.slice(0, 100),
        nativeLibs: nativeLibs.slice(0, 200),
        hasAndroidManifest: hasManifest,
        hasResourcesArsc: hasArsc,
        signingSchemes,
        certificateSubjects: certificateSubjects.slice(0, 10),
        certificateIssuers: certificateIssuers.slice(0, 10),
        buildSystems: buildSystems.slice(0, 10),
        playServicesHints: playServicesHints.slice(0, 20),
        apiBand,
        minSdk,
        targetSdk,
        packageName,
        versionCode,
        versionName,
        permissions: permissions.slice(0, 200),
        components,
        dexClassCount,
        dexClassNamesSample,
        dexMethodCount,
        dexMethodNamesSample,
        arscPackageNames,
        runtimeHints,
        obfuscationIndicators: obfuscation.slice(0, 50),
        structuralDetectors,
        compatibilityFindings,
        targetProfile,
        authorization: auth,
        sha256,
    };
    const limitations = [
        'Binary AXML decoder covers manifest elements and typed attributes; nested resource refs are not fully resolved.',
        'ARSC parse is summary-level (packages + string samples); full config/value tables are not expanded.',
        'DEX class and method name listing only; no method bodies or disassembly.',
        'APK v2/v3 detection locates the signing block and scheme IDs; '
            + 'v1 cert CN hints are best-effort DER scans, not full chain validation.',
        'Authorization is an operator declaration, not legal verification.',
        'Build/Play-services markers are ZIP path residues only; not a resolved dependency graph.',
    ];
    return result<LegacyAndroidFinding>(abs, 'legacy_android_analysis', [finding], {
        status: format === 'unknown' ? 'partial' : 'completed',
        limitations,
        coverage: {
            examined: true,
            complete: false,
            notes: [
                'Patch P step 3: binary AXML, ARSC summary, DEX class listing, signature scheme detection.',
                `format=${format}; abis=${abis.join(',') || 'none'}; dex=${dexFiles.length}`
                    + (minSdk != null ? `; minSdk=${minSdk}` : '')
                    + (dexClassCount != null ? `; classes=${dexClassCount}` : ''),
            ],
        },
    });
}
