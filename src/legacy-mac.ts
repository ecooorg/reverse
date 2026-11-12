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
const MAX_READ = 8 * 1024 * 1024;
const MH_MAGIC = 0xfeedface;
const MH_CIGAM = 0xcefaedfe;
const MH_MAGIC_64 = 0xfeedfacf;
const MH_CIGAM_64 = 0xcffaedfe;
const FAT_MAGIC = 0xcafebabe;
const FAT_CIGAM = 0xbebafeca;
/** PEF container magic "Joy!" */
const PEF_MAGIC = 0x4a6f7921;
/** AppleDouble magic (network byte order). */
const APPLEDOUBLE_MAGIC = 0x00051607;
function u32be(b: Buffer, o: number): number {
    return b.length >= o + 4 ? b.readUInt32BE(o) : 0;
}
function u32le(b: Buffer, o: number): number {
    return b.length >= o + 4 ? b.readUInt32LE(o) : 0;
}
function fourcc(b: Buffer, o: number): string {
    if (b.length < o + 4)
        return '';
    return b.toString('latin1', o, o + 4).replace(/\0/g, ' ');
}
function detectPef(b: Buffer): {
    evidence: string;
    architecture: string;
    sectionCount: number | null;
    sectionNames: string[];
} | null {
    if (b.length < 40)
        return null;
    if (u32be(b, 0) !== PEF_MAGIC)
        return null;
    // PEF container header (big-endian): magic, arch, version, …
    // sectionCount at offset 32 (UInt16BE), then section headers follow.
    const archFcc = fourcc(b, 4).trim();
    const architecture = archFcc === 'pwpc' ? 'PowerPC' : archFcc === 'm68k' ? 'm68k' : archFcc || 'unknown';
    const sectionCount = b.length >= 34 ? b.readUInt16BE(32) : null;
    const sectionNames: string[] = [];
    // Section headers are 28 bytes starting at offset 40; name offset is relative
    // to a loader-string table — we only capture the raw nameOffset for evidence.
    if (sectionCount != null && sectionCount > 0 && sectionCount <= 64) {
        for (let i = 0; i < sectionCount; i++) {
            const off = 40 + i * 28;
            if (off + 28 > b.length)
                break;
            const nameOff = u32be(b, off);
            sectionNames.push(`section[${i}]@nameOff=${nameOff}`);
        }
    }
    return {
        evidence: `PEF magic Joy! architecture=${architecture}`
            + (sectionCount != null ? ` sections=${sectionCount}` : ''),
        architecture,
        sectionCount,
        sectionNames,
    };
}
function parseCodeResourceInventory(b: Buffer): Array<{
    id: number;
    size: number;
}> {
    // Best-effort scan for classic Resource Manager type list entries for CODE.
    // Looks for the fourcc CODE followed by a count and id/offset pairs.
    const out: Array<{
        id: number;
        size: number;
    }> = [];
    for (let i = 0; i + 8 < b.length; i++) {
        if (b[i] === 0x43 && b[i + 1] === 0x4f && b[i + 2] === 0x44 && b[i + 3] === 0x45) {
            // Possible type-list: CODE (4) + count-1 as Int16BE
            if (i + 6 >= b.length)
                continue;
            const countMinus1 = b.readInt16BE(i + 4);
            if (countMinus1 < 0 || countMinus1 > 255)
                continue;
            const count = countMinus1 + 1;
            let p = i + 6;
            for (let n = 0; n < count && p + 8 <= b.length && out.length < 64; n++) {
                const id = b.readInt16BE(p);
                // next 2 reserved, then 4-byte offset into resource data
                const sizeHint = b.readUInt16BE(p + 2);
                out.push({ id, size: sizeHint });
                p += 8;
            }
            if (out.length)
                break;
        }
    }
    return out;
}
function readHfsMdb(b: Buffer): {
    kind: 'HFS' | 'HFS+' | 'HFSX';
    evidence: string;
    allocationBlockSize?: number;
} | null {
    // Signature alone needs 1026 bytes; allocation block size needs 1024+24.
    if (b.length < 1024 + 2)
        return null;
    const sig = b.toString('latin1', 1024, 1026);
    if (sig === 'BD') {
        const alBlkSiz = b.length >= 1024 + 24 ? u32be(b, 1024 + 20) : 0;
        return {
            kind: 'HFS',
            evidence: alBlkSiz
                ? `HFS MDB BD; allocationBlockSize=${alBlkSiz}`
                : 'HFS MDB BD (truncated; allocationBlockSize not read)',
            allocationBlockSize: alBlkSiz || undefined,
        };
    }
    if (sig === 'H+' || sig === 'HX') {
        return {
            kind: sig === 'HX' ? 'HFSX' : 'HFS+',
            evidence: `${sig === 'HX' ? 'HFSX' : 'HFS+'} volume header at offset 1024`,
        };
    }
    return null;
}
function detectAppleDouble(b: Buffer): {
    evidence: string;
    resourceTypes: string[];
    creatorType: {
        creator: string;
        type: string;
    } | null;
} | null {
    if (b.length < 26)
        return null;
    if (u32be(b, 0) !== APPLEDOUBLE_MAGIC)
        return null;
    const version = u32be(b, 4);
    const entryCount = b.length >= 26 ? b.readUInt16BE(24) : 0;
    const resourceTypes: string[] = [];
    let creatorType: {
        creator: string;
        type: string;
    } | null = null;
    // Entry descriptors start at offset 26: each 12 bytes (id, offset, length).
    for (let i = 0; i < Math.min(entryCount, 32); i++) {
        const at = 26 + i * 12;
        if (at + 12 > b.length)
            break;
        const id = u32be(b, at);
        const off = u32be(b, at + 4);
        const len = u32be(b, at + 8);
        // id 2 = resource fork; id 9 = Finder info (type/creator)
        if (id === 9 && off + 8 <= b.length && len >= 8) {
            const type = fourcc(b, off);
            const creator = fourcc(b, off + 4);
            if (type.trim() || creator.trim())
                creatorType = { type: type.trimEnd(), creator: creator.trimEnd() };
        }
        if (id === 2 && off + 16 <= b.length && len > 16) {
            // Resource map is near the end of the fork; scan for type list fourccs.
            const end = Math.min(b.length, off + Math.min(len, 256 * 1024));
            for (let p = off; p + 4 <= end; p++) {
                const tag = fourcc(b, p);
                if (/^(CODE|DATA|PICT|snd |vers|BNDL|FREF|ICN#|STR |STR#|DLOG|ALRT|MENU|cfrg)$/.test(tag)) {
                    if (!resourceTypes.includes(tag.trimEnd()))
                        resourceTypes.push(tag.trimEnd());
                }
            }
        }
    }
    return {
        evidence: `AppleDouble magic 00 05 16 07 version=0x${version.toString(16)} entries=${entryCount}`,
        resourceTypes,
        creatorType,
    };
}
function scanClassicCodeMarkers(b: Buffer): string[] {
    const hits: string[] = [];
    const text = b.toString('latin1');
    // Avoid control escapes in regex (biome noControlCharactersInRegex).
    if (text.includes('CODE') && (text.includes('\0CODE') || text.includes('CODE\0')))
        hits.push('CODE resource fourcc');
    // Also accept bare CODE fourcc near resource-map patterns.
    if (/(?:^|[^A-Za-z])CODE(?:[^A-Za-z]|$)/.test(text) && !hits.includes('CODE resource fourcc'))
        hits.push('CODE resource fourcc');
    if (text.includes('cfrg'))
        hits.push('cfrg (Code Fragment Manager) resource');
    if (/CarbonLib|InterfaceLib|StdCLib|AppleDouble/.test(text))
        hits.push('classic/Carbon library name string');
    return hits;
}
function machODetails(b: Buffer, magic: number): {
    architecture: string;
    bitness: number | null;
    endian: 'big' | 'little';
    loadCommands: string[];
    dylibs: string[];
    minimumOsVersion: string | null;
    codeSignaturePresent: boolean;
} {
    const parsed = parseMachO(b, b.length, magic);
    // Magic is interpreted as big-endian uint32 from the file bytes.
    // MH_MAGIC/MH_MAGIC_64 → big-endian object file; MH_CIGAM/*_64 → little-endian.
    const le = magic === MH_CIGAM || magic === MH_CIGAM_64;
    const is64 = magic === MH_MAGIC_64 || magic === MH_CIGAM_64;
    const loadCommands = parsed.loadCommands ?? [];
    const dylibs = parsed.imports ?? [];
    let minimumOsVersion: string | null = null;
    let codeSignaturePresent = false;
    // Walk load commands for VERSION_MIN / BUILD_VERSION / CODE_SIGNATURE.
    const ncmds = b.length >= (is64 ? 20 : 16) ? (le ? u32le(b, is64 ? 16 : 12) : u32be(b, is64 ? 16 : 12)) : 0;
    const sizeofcmds = b.length >= (is64 ? 24 : 20)
        ? (le ? u32le(b, is64 ? 20 : 16) : u32be(b, is64 ? 20 : 16))
        : 0;
    let off = is64 ? 32 : 28;
    const end = Math.min(off + sizeofcmds, b.length);
    for (let i = 0; i < Math.min(ncmds, 256) && off + 8 <= end; i++) {
        const cmd = le ? u32le(b, off) : u32be(b, off);
        const cmdsize = le ? u32le(b, off + 4) : u32be(b, off + 4);
        if (cmdsize < 8)
            break;
        // LC_CODE_SIGNATURE = 0x1d
        if (cmd === 0x1d)
            codeSignaturePresent = true;
        // LC_VERSION_MIN_MACOSX = 0x24, LC_VERSION_MIN_IPHONEOS = 0x25
        if ((cmd === 0x24 || cmd === 0x25) && cmdsize >= 16) {
            const ver = le ? u32le(b, off + 8) : u32be(b, off + 8);
            const major = (ver >> 16) & 0xffff;
            const minor = (ver >> 8) & 0xff;
            const patch = ver & 0xff;
            minimumOsVersion = `${major}.${minor}.${patch}`;
        }
        // LC_BUILD_VERSION = 0x32
        if (cmd === 0x32 && cmdsize >= 24) {
            const minos = le ? u32le(b, off + 12) : u32be(b, off + 12);
            const major = (minos >> 16) & 0xffff;
            const minor = (minos >> 8) & 0xff;
            const patch = minos & 0xff;
            minimumOsVersion = `${major}.${minor}.${patch}`;
        }
        off += cmdsize;
    }
    return {
        architecture: parsed.architecture,
        bitness: parsed.bitness,
        endian: le ? 'little' : 'big',
        loadCommands,
        dylibs: dylibs.slice(0, 200),
        minimumOsVersion,
        codeSignaturePresent,
    };
}
function eraFromSignals(args: {
    format: MacCodeModel;
    architecture: string;
    minimumOsVersion: string | null;
    resourceTypes: string[];
    hasCarbon: boolean;
}): {
    family: string;
    era: string | null;
} {
    if (args.format === 'pef-cfm' || args.resourceTypes.includes('cfrg'))
        return { family: 'Classic Mac OS / CFM', era: 'Mac OS 7.1–9.x CFM candidate' };
    if (args.format === '68k-code' || args.resourceTypes.includes('CODE'))
        return { family: 'Classic Mac OS', era: 'System 6–9 68k candidate' };
    if (args.architecture.includes('PowerPC'))
        return { family: 'Mac OS X / Classic', era: 'PowerPC Mac OS X 10.0–10.6 or Classic' };
    if (args.minimumOsVersion) {
        const major = Number(args.minimumOsVersion.split('.')[0]);
        if (Number.isFinite(major) && major <= 10)
            return { family: 'Mac OS X', era: `minimum ${args.minimumOsVersion} (early macOS candidate)` };
    }
    if (args.hasCarbon)
        return { family: 'Mac OS X Carbon', era: 'Carbon transition era candidate' };
    if (args.format === 'mach-o' || args.format === 'fat-mach-o')
        return { family: 'macOS', era: 'Mach-O (era not pinned)' };
    return { family: 'Mac', era: null };
}
function detectMacBinary(b: Buffer): {
    evidence: string;
    creatorType: {
        creator: string;
        type: string;
    } | null;
    fileName: string | null;
} | null {
    // MacBinary II: byte0=0, nameLen 1..63, byte 122 = 129 (0x81)
    if (b.length < 128)
        return null;
    if (b[0] !== 0)
        return null;
    const nameLen = b[1];
    if (nameLen < 1 || nameLen > 63)
        return null;
    if (b[122] !== 129 && b[122] !== 130)
        return null;
    const fileName = b.toString('latin1', 2, 2 + nameLen).replace(/\0/g, '');
    const type = fourcc(b, 65);
    const creator = fourcc(b, 69);
    return {
        evidence: `MacBinary II header nameLen=${nameLen} versionByte=${b[122]}`,
        creatorType: (type.trim() || creator.trim())
            ? { type: type.trimEnd(), creator: creator.trimEnd() }
            : null,
        fileName: fileName || null,
    };
}
function detectBinHex(b: Buffer): {
    evidence: string;
} | null {
    const head = b.subarray(0, Math.min(b.length, 128)).toString('latin1');
    if (/This file must be converted with BinHex/i.test(head) || head.startsWith('(This file must be converted'))
        return { evidence: 'BinHex 4.0 banner at start of file' };
    if (b.length >= 2 && b[0] === 0x0d && head.includes('BinHex'))
        return { evidence: 'BinHex marker after CR' };
    return null;
}
function detectHfsVolume(b: Buffer): {
    evidence: string;
    kind: 'HFS' | 'HFS+';
} | null {
    // MDB / volume header sits at sector 2 (offset 1024); signature is 2 bytes.
    if (b.length < 1024 + 2)
        return null;
    const sig = b.toString('latin1', 1024, 1026);
    if (sig === 'BD')
        return { evidence: 'HFS Master Directory Block signature BD at offset 1024', kind: 'HFS' };
    if (sig === 'H+')
        return { evidence: 'HFS+ volume header signature H+ at offset 1024', kind: 'HFS+' };
    if (sig === 'HX')
        return { evidence: 'HFSX volume header signature HX at offset 1024', kind: 'HFS+' };
    return null;
}
function detectArchiveContainers(b: Buffer): string[] {
    const out: string[] = [];
    if (b.length >= 4) {
        const fcc = fourcc(b, 0);
        if (fcc === 'SIT!' || fcc === 'SIT5')
            out.push('StuffIt');
        if (fcc === 'Pack' || (b[0] === 0x1a && b[1] === 0xff))
            out.push('Compact Pro candidate');
        // NDIF / UDIF disk image
        if (fcc === 'koly' || (b.length >= 512 && fourcc(b, b.length >= 512 ? b.length - 512 : 0) === 'koly'))
            out.push('UDIF disk image (koly)');
        if (b.length >= 4 && b[0] === 0x78 && (b[1] === 0x01 || b[1] === 0x9c || b[1] === 0xda))
            out.push('zlib-compressed payload candidate');
    }
    const head = b.subarray(0, Math.min(64, b.length)).toString('latin1');
    if (/StuffIt|Stuffit/i.test(head))
        out.push('StuffIt string marker');
    return [...new Set(out)];
}
function parseInfoPlistSummary(text: string): string | null {
    // Minimal XML plist field grab; not a full parser.
    const grab = (key: string): string | null => {
        const re = new RegExp(`<key>${key}<\\/key>\\s*<string>([^<]+)<\\/string>`, 'i');
        const m = text.match(re);
        return m ? m[1].trim() : null;
    };
    const id = grab('CFBundleIdentifier');
    const exe = grab('CFBundleExecutable');
    const name = grab('CFBundleName');
    const min = grab('LSMinimumSystemVersion') || grab('MinimumSystemVersion');
    const parts = [
        id ? `id=${id}` : null,
        exe ? `exe=${exe}` : null,
        name ? `name=${name}` : null,
        min ? `minOS=${min}` : null,
    ].filter(Boolean);
    return parts.length ? parts.join('; ') : null;
}
function machOPieFlag(b: Buffer, magic: number): {
    pie: boolean | null;
    evidence: string[];
} {
    // Same endian rule as machODetails: BE-read CIGAM ⇒ little-endian header fields.
    const le = magic === MH_CIGAM || magic === MH_CIGAM_64;
    const flagsOff = 24; // flags at +24 in both mach_header and mach_header_64
    if (b.length < flagsOff + 4)
        return { pie: null, evidence: ['Mach-O header too short for flags'] };
    const flags = le ? u32le(b, flagsOff) : u32be(b, flagsOff);
    // MH_PIE = 0x200000
    const pie = (flags & 0x200000) !== 0;
    return {
        pie,
        evidence: [
            `Mach-O flags=0x${flags.toString(16)} endian=${le ? 'le' : 'be'}; `
                + `MH_PIE=${pie ? 'set' : 'clear'}`,
        ],
    };
}
/**
 * Analyze a classic Mac / early macOS binary under the shared legacy authorization gate.
 */
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
    const size = Math.min(st.size, MAX_READ);
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
    const magic = b.length >= 4 ? u32be(b, 0) : 0;
    const magicLe = b.length >= 4 ? u32le(b, 0) : 0;
    // Fat / universal first (cafebabe collides with Java; require nfat_arch sanity).
    if (magic === FAT_MAGIC || magic === FAT_CIGAM) {
        const fat = parseFat(b, st.size);
        const nfat = magic === FAT_MAGIC ? u32be(b, 4) : u32le(b, 4);
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
    const isMachOMagic = (v: number) => v === MH_MAGIC || v === MH_CIGAM
        || v === MH_MAGIC_64 || v === MH_CIGAM_64;
    if (format === 'unknown' && (isMachOMagic(magic) || isMachOMagic(magicLe))) {
        // Prefer the BE-read value when it is a known constant; otherwise LE-read.
        const m = isMachOMagic(magic) ? magic : magicLe;
        const details = machODetails(b, m);
        format = 'mach-o';
        architecture = details.architecture;
        bitness = details.bitness;
        endian = details.endian;
        loadCommands = details.loadCommands;
        dylibs = details.dylibs;
        minimumOsVersion = details.minimumOsVersion;
        codeSignaturePresent = details.codeSignaturePresent;
        machOFlags = machOPieFlag(b, m);
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
        const pef = detectPef(b);
        if (pef) {
            format = 'pef-cfm';
            architecture = pef.architecture;
            bitness = architecture === 'PowerPC' ? 32 : architecture === 'm68k' ? 32 : null;
            endian = 'big';
            formatEvidence.push(pef.evidence);
            structuralDetectors.push({
                name: 'pef-cfm',
                evidence: [pef.evidence, ...pef.sectionNames.slice(0, 8)],
                confidence: 0.9,
            });
        }
    }
    if (format === 'unknown') {
        const ad = detectAppleDouble(b);
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
    const classicHits = scanClassicCodeMarkers(b);
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
        const mb = detectMacBinary(b);
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
        const bh = detectBinHex(b);
        if (bh) {
            format = 'binhex';
            formatEvidence.push(bh.evidence);
            structuralDetectors.push({ name: 'binhex', evidence: [bh.evidence], confidence: 0.9 });
        }
    }
    if (format === 'unknown') {
        const hfs = readHfsMdb(b) ?? detectHfsVolume(b);
        if (hfs) {
            format = 'hfs-volume';
            endian = 'big';
            formatEvidence.push(hfs.evidence);
            structuralDetectors.push({
                name: 'hfs-volume',
                evidence: [hfs.evidence],
                confidence: 0.9,
            });
        }
    }
    // CODE resource inventory (68k) when markers or AppleDouble present
    const codeResources = parseCodeResourceInventory(b);
    if (codeResources.length) {
        structuralDetectors.push({
            name: 'code-resource-inventory',
            evidence: codeResources.slice(0, 12).map(c => `CODE id=${c.id} sizeHint=${c.size}`),
            confidence: 0.7,
        });
        if (format === 'unknown' || format === 'appledouble')
            format = '68k-code';
    }
    containers = detectArchiveContainers(b);
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
        bundleSummary = parseInfoPlistSummary(text);
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
    const era = eraFromSignals({
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
    if (st.size > MAX_READ)
        limitations.push(`File larger than ${MAX_READ} bytes; only the first ${MAX_READ} bytes were examined.`);
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
