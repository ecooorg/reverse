/**
 * Classic Mac format parsers and structural scanners (Patch O).
 * Split from legacy-mac.ts to satisfy the 1000-line size gate.
 */
import { parseMachO } from './analysis-binary-parse.js';
/** Local alias to avoid a circular import with legacy-mac.ts */
type MacCodeModel = string;
export const MAX_READ = 8 * 1024 * 1024;
export const MH_MAGIC = 0xfeedface;
export const MH_CIGAM = 0xcefaedfe;
export const MH_MAGIC_64 = 0xfeedfacf;
export const MH_CIGAM_64 = 0xcffaedfe;
export const FAT_MAGIC = 0xcafebabe;
export const FAT_CIGAM = 0xbebafeca;
/** PEF container magic "Joy!" */
export const PEF_MAGIC = 0x4a6f7921;
/** AppleDouble magic (network byte order). */
export const APPLEDOUBLE_MAGIC = 0x00051607;
export function u32be(b: Buffer, o: number): number {
    return b.length >= o + 4 ? b.readUInt32BE(o) : 0;
}
export function u32le(b: Buffer, o: number): number {
    return b.length >= o + 4 ? b.readUInt32LE(o) : 0;
}
export function fourcc(b: Buffer, o: number): string {
    if (b.length < o + 4)
        return '';
    return b.toString('latin1', o, o + 4).replace(/\0/g, ' ');
}
function readCString(b: Buffer, off: number, max = 64): string | null {
    if (off < 0 || off >= b.length)
        return null;
    const end = Math.min(b.length, off + max);
    let i = off;
    while (i < end && b[i] !== 0)
        i++;
    if (i === off)
        return null;
    return b.toString('latin1', off, i);
}
export function detectPef(b: Buffer): {
    evidence: string;
    architecture: string;
    sectionCount: number | null;
    sectionNames: string[];
    loaderStrings: string[];
} | null {
    if (b.length < 40)
        return null;
    if (u32be(b, 0) !== PEF_MAGIC)
        return null;
    // PEF container header (big-endian): magic, arch, version, …
    // sectionCount at offset 32 (UInt16BE), section headers 28 bytes from 40.
    const archFcc = fourcc(b, 4).trim();
    const architecture = archFcc === 'pwpc' ? 'PowerPC' : archFcc === 'm68k' ? 'm68k' : archFcc || 'unknown';
    const sectionCount = b.length >= 34 ? b.readUInt16BE(32) : null;
    const sectionNames: string[] = [];
    const loaderStrings: string[] = [];
    // Heuristic string-table base: first section's defaultAddress/name area often
    // places loader strings after all section headers. Resolve nameOffset both as
    // absolute and as relative to (40 + sectionCount*28).
    const tableBase = sectionCount != null ? 40 + sectionCount * 28 : 40;
    if (sectionCount != null && sectionCount > 0 && sectionCount <= 64) {
        for (let i = 0; i < sectionCount; i++) {
            const off = 40 + i * 28;
            if (off + 28 > b.length)
                break;
            const nameOff = u32be(b, off);
            const abs = readCString(b, nameOff);
            const rel = readCString(b, tableBase + nameOff);
            const name = abs ?? rel;
            if (name) {
                sectionNames.push(name);
                if (!loaderStrings.includes(name))
                    loaderStrings.push(name);
            }
            else {
                sectionNames.push(`section[${i}]@nameOff=${nameOff}`);
            }
            // defaultAddress (offset +4) and totalSize (+12) retained only as evidence
            // when we cannot resolve a name.
        }
    }
    // Scan a short window after section headers for printable loader strings.
    if (tableBase < b.length) {
        const window = b.subarray(tableBase, Math.min(b.length, tableBase + 512));
        let i = 0;
        while (i < window.length && loaderStrings.length < 16) {
            if (window[i] >= 0x20 && window[i] < 0x7f) {
                let j = i;
                while (j < window.length && window[j] >= 0x20 && window[j] < 0x7f)
                    j++;
                if (j - i >= 3) {
                    const s = window.toString('latin1', i, j);
                    if (!loaderStrings.includes(s))
                        loaderStrings.push(s);
                }
                i = j + 1;
            }
            else {
                i++;
            }
        }
    }
    return {
        evidence: `PEF magic Joy! architecture=${architecture}`
            + (sectionCount != null ? ` sections=${sectionCount}` : '')
            + (loaderStrings.length ? ` loaderStrings=${loaderStrings.slice(0, 6).join(',')}` : ''),
        architecture,
        sectionCount,
        sectionNames,
        loaderStrings,
    };
}
export function parseCodeResourceInventory(b: Buffer): Array<{
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
export function readHfsMdb(b: Buffer): {
    kind: 'HFS' | 'HFS+' | 'HFSX';
    evidence: string;
    allocationBlockSize?: number;
    catalogFirstExtent?: {
        startBlock: number;
        blockCount: number;
    };
    volumeName?: string;
} | null {
    // Signature alone needs 1026 bytes; allocation block size needs 1024+24.
    if (b.length < 1024 + 2)
        return null;
    const sig = b.toString('latin1', 1024, 1026);
    if (sig === 'BD') {
        const alBlkSiz = b.length >= 1024 + 24 ? u32be(b, 1024 + 20) : 0;
        // Volume name: Pascal string at MDB+36 (length byte + up to 27 chars).
        let volumeName: string | undefined;
        if (b.length >= 1024 + 64) {
            const nlen = b[1024 + 36];
            if (nlen > 0 && nlen <= 27)
                volumeName = b.toString('latin1', 1024 + 37, 1024 + 37 + nlen);
        }
        // Catalog file first extent: ExtDataRec at MDB+0x5E (startBlock u16, count u16).
        let catalogFirstExtent: {
            startBlock: number;
            blockCount: number;
        } | undefined;
        if (b.length >= 1024 + 0x5e + 4) {
            const startBlock = b.readUInt16BE(1024 + 0x5e);
            const blockCount = b.readUInt16BE(1024 + 0x5e + 2);
            if (blockCount > 0)
                catalogFirstExtent = { startBlock, blockCount };
        }
        const parts = [
            alBlkSiz ? `allocationBlockSize=${alBlkSiz}` : 'allocationBlockSize unread',
            volumeName ? `volumeName=${volumeName}` : null,
            catalogFirstExtent
                ? `catalogExtent=${catalogFirstExtent.startBlock}:${catalogFirstExtent.blockCount}`
                : null,
        ].filter(Boolean);
        return {
            kind: 'HFS',
            evidence: `HFS MDB BD; ${parts.join('; ')}`,
            allocationBlockSize: alBlkSiz || undefined,
            catalogFirstExtent,
            volumeName,
        };
    }
    if (sig === 'H+' || sig === 'HX') {
        // HFS+ volume header: fileCount at +0x30, folderCount at +0x34 (BE u32)
        // relative to volume header base (1024).
        let extra = '';
        if (b.length >= 1024 + 0x38) {
            const fileCount = u32be(b, 1024 + 0x30);
            const folderCount = u32be(b, 1024 + 0x34);
            extra = `; fileCount=${fileCount}; folderCount=${folderCount}`;
        }
        return {
            kind: sig === 'HX' ? 'HFSX' : 'HFS+',
            evidence: `${sig === 'HX' ? 'HFSX' : 'HFS+'} volume header at offset 1024${extra}`,
        };
    }
    return null;
}
export function detectAppleDouble(b: Buffer): {
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
export function scanClassicCodeMarkers(b: Buffer): string[] {
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
export function machODetails(b: Buffer, magic: number): {
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
/** Best-effort PEF fragment graph from section names + loader strings. */
export function buildPefFragmentGraph(sectionNames: string[], loaderStrings: string[]): {
    nodes: string[];
    edges: Array<{
        from: string;
        to: string;
        kind: string;
    }>;
} {
    const nodes = Array.from(new Set([
        ...sectionNames.filter(s => !s.startsWith("section[")),
        ...loaderStrings.slice(0, 24),
    ])).slice(0, 32);
    const edges: Array<{
        from: string;
        to: string;
        kind: string;
    }> = [];
    const libs = loaderStrings.filter(s => /Lib|Interface|Carbon|StdC/i.test(s));
    const code = sectionNames.filter(s => /code|main|text/i.test(s) || !s.startsWith("section["));
    for (const c of code.slice(0, 8)) {
        for (const lib of libs.slice(0, 8)) {
            edges.push({ from: c, to: lib, kind: "import" });
        }
    }
    return { nodes, edges };
}
export function eraFromSignals(args: {
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
export function detectMacBinary(b: Buffer): {
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
export function detectBinHex(b: Buffer): {
    evidence: string;
} | null {
    const head = b.subarray(0, Math.min(b.length, 128)).toString('latin1');
    if (/This file must be converted with BinHex/i.test(head) || head.startsWith('(This file must be converted'))
        return { evidence: 'BinHex 4.0 banner at start of file' };
    if (b.length >= 2 && b[0] === 0x0d && head.includes('BinHex'))
        return { evidence: 'BinHex marker after CR' };
    return null;
}
export function detectHfsVolume(b: Buffer): {
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
export function detectArchiveContainers(b: Buffer): string[] {
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
export function parseInfoPlistSummary(text: string): string | null {
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
export function machOPieFlag(b: Buffer, magic: number): {
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
/** Best-effort 68k A-line Toolbox trap scan (0xA0xx–0xA7xx words, big-endian). */
/** Common Toolbox / OS trap names (selected; not a full Inside Macintosh index). */
const TOOLBOX_TRAP_NAMES: Record<number, string> = {
    0xa000: 'Open', 0xa001: 'Close', 0xa002: 'Read', 0xa003: 'Write',
    0xa009: 'GetFileInfo', 0xa00c: 'FlushVol', 0xa011: 'GetEOF',
    0xa029: 'HFSDispatch', 0xa146: 'GetMenuBar', 0xa1ad: 'GetNextEvent',
    0xa9eb: 'WaitNextEvent', 0xa9f4: 'ExitToShell', 0xa9ff: 'Unimplemented',
    0xa8bd: 'DrawString', 0xa8a6: 'NewPtr', 0xa8a7: 'DisposePtr',
    0xa9a0: 'GetResource', 0xa9a2: 'LoadResource', 0xa9a3: 'ReleaseResource',
    0xa9c9: 'SetTrapAddress', 0xa9c8: 'GetTrapAddress',
};
/** Best-effort 68k A-line Toolbox trap scan (0xA0xx–0xA7xx / 0xA8xx–0xABxx). */
export function scanToolboxTraps(b: Buffer): {
    count: number;
    samples: string[];
    named: string[];
} {
    const samples: string[] = [];
    const named: string[] = [];
    const seen = new Set<number>();
    let count = 0;
    for (let i = 0; i + 1 < b.length && count < 512; i += 2) {
        const w = b.readUInt16BE(i);
        if (w < 0xa000 || w > 0xabff)
            continue;
        count++;
        if (!seen.has(w)) {
            seen.add(w);
            const nm = TOOLBOX_TRAP_NAMES[w];
            if (nm)
                named.push(`${nm}(0x${w.toString(16)})`);
            else if (samples.length < 12)
                samples.push(`0x${w.toString(16)}`);
        }
    }
    return { count, samples, named };
}
/** Parse 68k CODE segment jump-table / near-header hints from a buffer. */
export function parseCodeSegments(b: Buffer): Array<{
    id: number;
    kind: string;
    detail: string;
}> {
    const out: Array<{
        id: number;
        kind: string;
        detail: string;
    }> = [];
    // Jump table header pattern: first word often 0x3F3C (move.w #n,-(SP)) sequences
    // or classic jt entry size 8. Best-effort: count CODE resource inventory + size.
    const inv = parseCodeResourceInventory(b);
    for (const c of inv.slice(0, 16)) {
        out.push({
            id: c.id,
            kind: c.id === 0 ? 'jump-table-candidate' : 'code-segment-candidate',
            detail: `sizeHint=${c.size}`,
        });
    }
    return out;
}
/**
 * Classic HFS catalog B-tree: follow MDB extent to first catalog nodes and
 * collect leaf key name strings (read-only, bounded).
 */
export function walkHfsCatalogLeaves(b: Buffer, mdb: {
    allocationBlockSize?: number;
    catalogFirstExtent?: {
        startBlock: number;
        blockCount: number;
    };
}): {
    nodeCount: number;
    names: string[];
    evidence: string[];
} {
    const names: string[] = [];
    const evidence: string[] = [];
    const alBlk = mdb.allocationBlockSize ?? 0;
    const ext = mdb.catalogFirstExtent;
    if (!alBlk || !ext || ext.blockCount < 1) {
        return { nodeCount: 0, names, evidence: ['catalog walk skipped: missing alBlkSiz or extent'] };
    }
    // HFS allocation blocks start after 2 reserved sectors relative to volume;
    // for a raw image with MDB at 1024 we treat startBlock * alBlk as file offset
    // into the catalog fork (approximation for crafted fixtures).
    const catOff = ext.startBlock * alBlk;
    if (catOff + 512 > b.length) {
        return {
            nodeCount: 0,
            names,
            evidence: [`catalog extent startBlock=${ext.startBlock} past EOF (off=${catOff})`],
        };
    }
    let nodeCount = 0;
    const maxNodes = Math.min(ext.blockCount, 8);
    for (let n = 0; n < maxNodes; n++) {
        const off = catOff + n * Math.min(alBlk, 512);
        if (off + 14 > b.length)
            break;
        // Node descriptor: ndType at offset 8 (signed byte): 0=index, 1=header, 2=map, -1=leaf
        const ndType = b.readInt8(off + 8);
        const ndNRecs = b.readUInt16BE(off + 10);
        nodeCount++;
        evidence.push(`node[${n}] type=${ndType} records=${ndNRecs} off=${off}`);
        if (ndType !== -1 && ndType !== 0xff)
            continue; // leaf is -1 (0xFF)
        // Leaf: scan for Pascal strings in record area (best-effort names)
        const window = b.subarray(off + 14, Math.min(b.length, off + Math.min(alBlk, 512)));
        for (let i = 0; i + 1 < window.length && names.length < 32; i++) {
            const len = window[i];
            if (len < 1 || len > 31 || i + 1 + len > window.length)
                continue;
            let ok = true;
            for (let k = 0; k < len; k++) {
                const c = window[i + 1 + k];
                if (c < 0x20 || c > 0x7e) {
                    ok = false;
                    break;
                }
            }
            if (ok) {
                const s = window.toString('latin1', i + 1, i + 1 + len);
                if (!names.includes(s))
                    names.push(s);
                i += len;
            }
        }
    }
    return { nodeCount, names, evidence };
}
