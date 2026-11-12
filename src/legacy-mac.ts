/**
 * Classic Mac / early macOS static analysis (Patch O steps 1–3 inventory slice).
 * Recognizes Mach-O / fat, PEF/CFM, AppleDouble, MacBinary, BinHex, HFS headers,
 * selected archive/disk-image magics, Info.plist bundle fields and Mach-O PIE flag.
 * Never executes the target. Requires legacy authorization (same gate as M/N).
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { result } from './core-types.js';
import { profileField, type LegacyAuthorization, type TargetProfile } from './legacy-types.js';
import { assertAuthorizationPresent, requireLegacyGate } from './legacy-gate.js';
import { parseMachO, parseFat } from './analysis-binary-parse.js';
import { diagnoseMacFromTables, type MacCompatDiagnosis } from './legacy-mac-tables.js';
import * as macParsers from './legacy-mac-parsers.js';
export type { LegacyAuthorization, TargetProfile } from './legacy-types.js';
type MacExecutableFormat = 'mach-o' | 'fat-mach-o' | 'pef-cfm' | '68k-code';
type MacContainerFormat = 'appledouble' | 'macbinary' | 'binhex' | 'hfs-volume';
export type MacCodeModel = MacExecutableFormat | MacContainerFormat | 'unknown';
export interface LegacyMacFinding {
    format: MacCodeModel;
    architecture: string;
    bitness: number | null;
    endian: 'big' | 'little' | 'mixed' | null;
    /** Load-command / fragment names when available. */
    loadCommands: string[];
    /** Dylib / shared-library names from Mach-O LC_LOAD_DYLIB. */
    dylibs: string[];
    /** Resource-type fourccs when a resource map is visible. */
    resourceTypes: string[];
    /** Minimum OS version string when LC_VERSION_MIN_* / BUILD_VERSION is present. */
    minimumOsVersion: string | null;
    /** Code-signature load command presence (not validity). */
    codeSignaturePresent: boolean;
    /** Mach-O header flags of interest (PIE when known). */
    machOFlags: {
        pie: boolean | null;
        evidence: string[];
    };
    /** Container / archive hints (StuffIt, Compact Pro, disk image, …). */
    containers: string[];
    /** Creator/type codes when found in AppleDouble, MacBinary or classic headers. */
    creatorType: {
        creator: string;
        type: string;
    } | null;
    /** Bundle Info.plist summary when the path is an Info.plist. */
    bundleSummary: string | null;
    structuralDetectors: Array<{
        name: string;
        evidence: string[];
        confidence: number;
    }>;
    /** Sourced compatibility diagnosis (Patch O step 4). */
    compatibilityFindings: MacCompatDiagnosis[];
    targetProfile: TargetProfile;
    authorization: LegacyAuthorization;
    sha256: string;
}
export async function analyzeLegacyMac(filePath: string, authorization: LegacyAuthorization | null = null, options: {
    sessionId?: string;
} = {}) {
    const auth = await requireLegacyGate({
        sessionId: options.sessionId,
        authorization,
        operation: 'analyze_legacy_mac',
    });
    assertAuthorizationPresent(auth, 'analyze_legacy_mac');
    const abs = path.resolve(filePath);
    const st = await stat(abs);
    const size = Math.min(st.size, macParsers.MAX_READ);
    const b = size > 0
        ? await readFile(abs, { encoding: null }).then(buf => buf.subarray(0, size))
        : Buffer.alloc(0);
    const sha256 = createHash('sha256').update(b).digest('hex');
    let format: MacCodeModel = 'unknown';
    let architecture = 'unknown';
    let bitness: number | null = null;
    let endian: LegacyMacFinding['endian'] = null;
    let loadCommands: string[] = [];
    let dylibs: string[] = [];
    let resourceTypes: string[] = [];
    let minimumOsVersion: string | null = null;
    let codeSignaturePresent = false;
    let creatorType: LegacyMacFinding['creatorType'] = null;
    const structuralDetectors: LegacyMacFinding['structuralDetectors'] = [];
    const formatEvidence: string[] = [];
    let machOFlags: LegacyMacFinding['machOFlags'] = { pie: null, evidence: [] };
    let containers: string[] = [];
    let bundleSummary: string | null = null;
    // Always interpret the first 4 bytes as big-endian for magic classification
    // (Apple: MH_CIGAM on a BE read means a little-endian object file).
    const magic = b.length >= 4 ? macParsers.u32be(b, 0) : 0;
    const magicLe = b.length >= 4 ? macParsers.u32le(b, 0) : 0;
    // Fat / universal first (cafebabe collides with Java; require nfat_arch sanity).
    if (magic === macParsers.FAT_MAGIC || magic === macParsers.FAT_CIGAM) {
        const fat = parseFat(b, st.size);
        const nfat = magic === macParsers.FAT_MAGIC ? macParsers.u32be(b, 4) : macParsers.u32le(b, 4);
        if (nfat > 0 && nfat <= 16) {
            format = 'fat-mach-o';
            architecture = fat.architecture;
            endian = 'mixed';
            formatEvidence.push(`Mach-O universal (fat) nfat_arch=${nfat}`);
            structuralDetectors.push({
                name: 'fat-mach-o',
                evidence: formatEvidence.slice(),
                confidence: 0.95,
            });
        }
    }
    const isMachOMagic = (v: number) => v === macParsers.MH_MAGIC || v === macParsers.MH_CIGAM
        || v === macParsers.MH_MAGIC_64 || v === macParsers.MH_CIGAM_64;
    if (format === 'unknown' && (isMachOMagic(magic) || isMachOMagic(magicLe))) {
        // Prefer the BE-read value when it is a known constant; otherwise LE-read.
        const m = isMachOMagic(magic) ? magic : magicLe;
        const details = macParsers.machODetails(b, m);
        format = 'mach-o';
        architecture = details.architecture;
        bitness = details.bitness;
        endian = details.endian;
        loadCommands = details.loadCommands;
        dylibs = details.dylibs;
        minimumOsVersion = details.minimumOsVersion;
        codeSignaturePresent = details.codeSignaturePresent;
        machOFlags = macParsers.machOPieFlag(b, m);
        formatEvidence.push(`Mach-O magicBE=0x${magic.toString(16)} magicLE=0x${magicLe.toString(16)} `
            + `chosen=0x${m.toString(16)} endian=${endian} arch=${architecture} bitness=${bitness}`);
        structuralDetectors.push({
            name: 'mach-o',
            evidence: [...formatEvidence.slice(), ...machOFlags.evidence],
            confidence: 0.95,
        });
        if (machOFlags.pie)
            structuralDetectors.push({ name: 'mach-o-pie', evidence: machOFlags.evidence, confidence: 0.9 });
    }
    if (format === 'unknown') {
        const pef = macParsers.detectPef(b);
        if (pef) {
            format = 'pef-cfm';
            architecture = pef.architecture;
            bitness = architecture === 'PowerPC' ? 32 : architecture === 'm68k' ? 32 : null;
            endian = 'big';
            formatEvidence.push(pef.evidence);
            structuralDetectors.push({
                name: 'pef-cfm',
                evidence: [pef.evidence, ...pef.sectionNames.slice(0, 6), ...pef.loaderStrings.slice(0, 6)],
                confidence: 0.9,
            });
            const importRe = /Lib|Interface|Carbon|StdC|Threads|MathLib|\.o$/i;
            const imports = pef.loaderStrings
                .filter(s => importRe.test(s) || s.length >= 4)
                .slice(0, 16);
            if (imports.length) {
                structuralDetectors.push({
                    name: 'pef-imports',
                    evidence: imports.map(s => `import=${s}`),
                    confidence: 0.6,
                });
            }
        }
    }
    if (format === 'unknown') {
        const ad = macParsers.detectAppleDouble(b);
        if (ad) {
            format = 'appledouble';
            endian = 'big';
            resourceTypes = ad.resourceTypes;
            creatorType = ad.creatorType;
            formatEvidence.push(ad.evidence);
            structuralDetectors.push({
                name: 'appledouble-resource-fork',
                evidence: [ad.evidence, ...ad.resourceTypes.map(t => `resource type ${t}`)],
                confidence: 0.9,
            });
            if (ad.resourceTypes.includes('CODE') && !ad.resourceTypes.includes('cfrg'))
                format = '68k-code';
            if (ad.resourceTypes.includes('cfrg'))
                format = 'pef-cfm';
        }
    }
    const classicHits = macParsers.scanClassicCodeMarkers(b);
    for (const h of classicHits) {
        structuralDetectors.push({
            name: 'classic-marker',
            evidence: [h],
            confidence: 0.55,
        });
        if (format === 'unknown' && /CODE resource/.test(h))
            format = '68k-code';
        if (format === 'unknown' && /cfrg/.test(h))
            format = 'pef-cfm';
    }
    if (format === 'unknown') {
        const mb = macParsers.detectMacBinary(b);
        if (mb) {
            format = 'macbinary';
            endian = 'big';
            if (mb.creatorType)
                creatorType = mb.creatorType;
            formatEvidence.push(mb.evidence);
            structuralDetectors.push({
                name: 'macbinary',
                evidence: [mb.evidence, mb.fileName ? `name=${mb.fileName}` : 'unnamed'].filter(Boolean) as string[],
                confidence: 0.85,
            });
        }
    }
    if (format === 'unknown') {
        const bh = macParsers.detectBinHex(b);
        if (bh) {
            format = 'binhex';
            formatEvidence.push(bh.evidence);
            structuralDetectors.push({ name: 'binhex', evidence: [bh.evidence], confidence: 0.9 });
        }
    }
    if (format === 'unknown') {
        const hfs = macParsers.readHfsMdb(b) ?? macParsers.detectHfsVolume(b);
        if (hfs) {
            format = 'hfs-volume';
            endian = 'big';
            formatEvidence.push(hfs.evidence);
            structuralDetectors.push({
                name: 'hfs-volume',
                evidence: [hfs.evidence],
                confidence: 0.9,
            });
            if ('catalogFirstExtent' in hfs && hfs.catalogFirstExtent) {
                structuralDetectors.push({
                    name: 'hfs-catalog-extent',
                    evidence: [
                        `startBlock=${hfs.catalogFirstExtent.startBlock}`,
                        `blockCount=${hfs.catalogFirstExtent.blockCount}`,
                    ],
                    confidence: 0.75,
                });
                const walk = macParsers.walkHfsCatalogLeaves(b, {
                    allocationBlockSize: 'allocationBlockSize' in hfs
                        ? hfs.allocationBlockSize
                        : undefined,
                    catalogFirstExtent: hfs.catalogFirstExtent,
                });
                if (walk.nodeCount > 0 || walk.names.length) {
                    structuralDetectors.push({
                        name: 'hfs-catalog-btree',
                        evidence: [
                            ...walk.evidence.slice(0, 6),
                            ...walk.names.slice(0, 12).map(n => `name=${n}`),
                        ],
                        confidence: walk.names.length ? 0.7 : 0.45,
                    });
                }
            }
        }
    }
    // CODE resource inventory (68k) when markers or AppleDouble present
    const codeResources = macParsers.parseCodeResourceInventory(b);
    if (codeResources.length) {
        structuralDetectors.push({
            name: 'code-resource-inventory',
            evidence: codeResources.slice(0, 12).map(c => `CODE id=${c.id} sizeHint=${c.size}`),
            confidence: 0.7,
        });
        if (format === 'unknown' || format === 'appledouble')
            format = '68k-code';
    }
    const traps = macParsers.scanToolboxTraps(b);
    if (traps.count >= 3) {
        structuralDetectors.push({
            name: 'toolbox-traps',
            evidence: [
                `A-line trap words=${traps.count}`,
                ...traps.named.slice(0, 8),
                ...traps.samples.slice(0, 4),
            ],
            confidence: traps.count >= 8 ? 0.7 : 0.5,
        });
        if (format === 'unknown')
            format = '68k-code';
    }
    const codeSegs = macParsers.parseCodeSegments(b);
    if (codeSegs.length) {
        structuralDetectors.push({
            name: 'code-segments',
            evidence: codeSegs.slice(0, 12).map(s => `CODE ${s.id} ${s.kind} ${s.detail}`),
            confidence: 0.65,
        });
    }
    containers = macParsers.detectArchiveContainers(b);
    for (const c of containers) {
        structuralDetectors.push({
            name: 'container',
            evidence: [c],
            confidence: 0.7,
        });
    }
    // Info.plist path → bundle summary
    if (path.basename(abs).toLowerCase() === 'info.plist') {
        const text = b.toString('utf8');
        bundleSummary = macParsers.parseInfoPlistSummary(text);
        if (bundleSummary) {
            structuralDetectors.push({
                name: 'info-plist',
                evidence: [bundleSummary],
                confidence: 0.85,
            });
            if (!minimumOsVersion) {
                const m = bundleSummary.match(/minOS=([0-9.]+)/);
                if (m)
                    minimumOsVersion = m[1];
            }
        }
    }
    const hasCarbon = dylibs.some(d => /Carbon|ApplicationServices|CoreServices/i.test(d))
        || classicHits.some(h => /Carbon/i.test(h));
    const era = macParsers.eraFromSignals({
        format,
        architecture,
        minimumOsVersion,
        resourceTypes,
        hasCarbon,
    });
    const rosettaNotes: string[] = [];
    if (architecture.includes('PowerPC'))
        rosettaNotes.push('PowerPC slice may need Rosetta or a PPC emulator on Intel/Apple Silicon hosts');
    if (bitness === 32 && (architecture === 'x86' || architecture.includes('PowerPC')))
        rosettaNotes.push('32-bit Mac binary; modern macOS may refuse to load it');
    const targetProfile: TargetProfile = {
        schemaVersion: '1.0',
        osAndEra: profileField({
            value: era,
            evidence: formatEvidence.length ? formatEvidence.slice(0, 3) : ['No Mac format magic matched.'],
            confidence: format === 'unknown' ? 0.2 : 0.75,
            complete: format !== 'unknown',
            coverageNotes: [
                'Era is a static candidate from magic, architecture and version load commands.',
                'Confidence uncalibrated until O calibration corpus (step 2).',
            ],
        }),
        cpu: profileField({
            value: architecture,
            evidence: formatEvidence.slice(0, 2),
            confidence: architecture === 'unknown' ? 0.2 : 0.9,
        }),
        bitness: profileField({
            value: bitness,
            evidence: formatEvidence.slice(0, 2),
            confidence: bitness == null ? 0.2 : 0.95,
        }),
        abi: profileField({
            value: endian ? `${endian}-endian${minimumOsVersion ? `; minOS=${minimumOsVersion}` : ''}` : null,
            evidence: minimumOsVersion
                ? [`minimum OS version ${minimumOsVersion}`]
                : formatEvidence.slice(0, 1),
            confidence: minimumOsVersion ? 0.85 : 0.4,
            complete: !!minimumOsVersion,
        }),
        toolchainRuntimeFramework: profileField({
            value: [
                ...dylibs.slice(0, 12).map(d => path.posix.basename(d)),
                ...resourceTypes.map(t => `resource:${t}`),
                ...(hasCarbon ? ['Carbon'] : []),
            ],
            evidence: [
                ...dylibs.slice(0, 8).map(d => `dylib ${d}`),
                ...resourceTypes.map(t => `resource type ${t}`),
            ],
            confidence: dylibs.length || resourceTypes.length ? 0.7 : 0.25,
            complete: false,
            coverageNotes: ['Static names only; not a full API inventory (O step 3 continues).'],
        }),
        installer: profileField({
            value: null,
            evidence: [],
            confidence: 0,
            complete: false,
            coverageNotes: ['Mac installer/packager detectors not implemented yet (O step 3).'],
        }),
        dependencies: profileField({
            value: dylibs.slice(0, 100),
            evidence: dylibs.length
                ? [`LC_LOAD_DYLIB (${dylibs.length}): ${dylibs.slice(0, 4).join(', ')}`]
                : ['No LC_LOAD_DYLIB in the bounded load commands.'],
            confidence: dylibs.length ? 0.9 : 0.3,
            complete: format === 'mach-o' && dylibs.length > 0,
        }),
        codeModel: profileField({
            value: format === 'unknown' ? null : format,
            evidence: formatEvidence.length ? formatEvidence.slice(0, 3) : ['No code-model magic matched.'],
            confidence: format === 'unknown' ? 0.15 : 0.9,
            complete: format !== 'unknown',
        }),
        endianness: profileField({
            value: endian,
            evidence: formatEvidence.slice(0, 1),
            confidence: endian ? 0.9 : 0.2,
        }),
        resourceInventory: profileField({
            value: resourceTypes.slice(),
            evidence: resourceTypes.map(t => `resource type ${t}`),
            confidence: resourceTypes.length ? 0.7 : 0.2,
            complete: false,
            coverageNotes: [
                'Resource types are scanned from AppleDouble forks when present.',
                'Native HFS resource forks and full Resource Manager maps are O step 3.',
            ],
        }),
        creatorType: profileField({
            value: creatorType,
            evidence: creatorType
                ? [`Finder info type=${creatorType.type} creator=${creatorType.creator}`]
                : ['No Finder type/creator in the bounded AppleDouble entries.'],
            confidence: creatorType ? 0.8 : 0.2,
            complete: !!creatorType,
        }),
        bundleLayout: profileField({
            value: bundleSummary,
            evidence: bundleSummary ? [bundleSummary] : [],
            confidence: bundleSummary ? 0.85 : 0.15,
            complete: !!bundleSummary,
            coverageNotes: bundleSummary
                ? ['Parsed selected CFBundle* keys from Info.plist XML.']
                : ['Pass an Info.plist path for bundle summary; full .app tree walk not implemented.'],
        }),
        rosettaOr32BitDependence: profileField({
            value: rosettaNotes.slice(),
            evidence: rosettaNotes.slice(),
            confidence: rosettaNotes.length ? 0.7 : 0.3,
            complete: false,
            coverageNotes: ['Hints only; host policy is not evaluated.'],
        }),
    };
    const compatibilityFindings = diagnoseMacFromTables({
        format,
        architecture,
        bitness,
        dylibs,
        resourceTypes,
        containers,
        creatorType,
        codeSignaturePresent,
        structuralDetectorNames: structuralDetectors.map(d => d.name),
    });
    const finding: LegacyMacFinding = {
        format,
        architecture,
        bitness,
        endian,
        loadCommands,
        dylibs,
        resourceTypes,
        minimumOsVersion,
        codeSignaturePresent,
        machOFlags,
        containers,
        creatorType,
        bundleSummary,
        structuralDetectors,
        compatibilityFindings,
        targetProfile,
        authorization: auth,
        sha256,
    };
    const limitations: string[] = [];
    if (format === 'unknown')
        limitations.push('No classic Mac / early macOS format magic matched in the bounded window.');
    if (st.size > macParsers.MAX_READ)
        limitations.push(`File larger than ${macParsers.MAX_READ} bytes; only the first ${macParsers.MAX_READ} bytes were examined.`);
    limitations.push('Static recognition only; no execution, no Rosetta/emulator probe, no resource-fork write.');
    return result<LegacyMacFinding>(abs, 'legacy_mac_analysis', [finding], {
        status: format === 'unknown' ? 'partial' : 'completed',
        limitations,
        coverage: {
            examined: true,
            complete: false,
            notes: [
                'Patch O steps 1–4: inventory + sourced Mac diagnosis tables.',
                'Full 68k segment loader, PEF fragment graph and HFS catalog walk remain open.',
            ],
        },
    });
}
