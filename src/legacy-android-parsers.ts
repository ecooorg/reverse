/**
 * Binary Android format parsers (Patch P step 3).
 * Pure Buffer walks — no JADX/Apktool. Hostile input must not throw.
 * AXML: string pool + XML element attributes (manifest fields).
 * ARSC: table header, package count, string pool sample.
 * DEX: header + class_defs name listing via type_ids/string_ids.
 * Signing: v1 JAR META-INF markers; v2/v3 APK Signing Block magic.
 */
export const AXML_FILE_MAGIC = 0x00080003;
export const RES_STRING_POOL_TYPE = 0x0001;
export const RES_XML_TYPE = 0x0003;
export const RES_XML_START_ELEMENT = 0x0102;
export const RES_XML_END_ELEMENT = 0x0103;
export const RES_TABLE_TYPE = 0x0002;
export const RES_TABLE_PACKAGE_TYPE = 0x0200;
export const DEX_MAGIC = Buffer.from('dex\n');
/** APK Signing Block magic (16 bytes, little-endian ASCII). */
export const APK_SIG_BLOCK_MAGIC = Buffer.from('APK Sig Block 42');

const TYPE_INT_DEC = 0x10;
const TYPE_STRING = 0x03;
const TYPE_REFERENCE = 0x01;
const TYPE_INT_BOOLEAN = 0x12;

export interface AxmlManifest {
    packageName: string | null;
    versionCode: number | null;
    versionName: string | null;
    minSdkVersion: number | null;
    targetSdkVersion: number | null;
    compileSdkVersion: number | null;
    permissions: string[];
    activities: string[];
    services: string[];
    receivers: string[];
    providers: string[];
    usesFeatures: string[];
    applicationLabel: string | null;
    debuggable: boolean | null;
    evidence: string[];
    limitations: string[];
}

export interface ArscSummary {
    packageCount: number | null;
    typeStringsSample: string[];
    keyStringsSample: string[];
    packageNames: string[];
    evidence: string[];
    limitations: string[];
}

export interface DexClassListing {
    magicOk: boolean;
    version: string | null;
    endian: 'le' | 'be' | null;
    fileSize: number | null;
    classCount: number;
    classNames: string[];
    obfuscationIndicators: string[];
    evidence: string[];
    limitations: string[];
}

export interface ApkSignatureInfo {
    schemes: string[];
    v1Entries: string[];
    hasSigningBlock: boolean;
    blockSize: number | null;
    evidence: string[];
    limitations: string[];
}

function u16(b: Buffer, o: number): number {
    return o + 2 <= b.length ? b.readUInt16LE(o) : 0;
}
function u32(b: Buffer, o: number): number {
    return o + 4 <= b.length ? b.readUInt32LE(o) : 0;
}
function i32(b: Buffer, o: number): number {
    return o + 4 <= b.length ? b.readInt32LE(o) : 0;
}

/** Decode ResStringPool (type 0x0001). Returns UTF-8/UTF-16 strings; empty on hostile input. */
export function parseStringPool(b: Buffer, poolOffset: number): string[] {
    const out: string[] = [];
    if (poolOffset < 0 || poolOffset + 28 > b.length) return out;
    const type = u16(b, poolOffset);
    if (type !== RES_STRING_POOL_TYPE) return out;
    const headerSize = u16(b, poolOffset + 2);
    const chunkSize = u32(b, poolOffset + 4);
    if (headerSize < 28 || chunkSize < headerSize || poolOffset + chunkSize > b.length) return out;
    const stringCount = u32(b, poolOffset + 8);
    const flags = u32(b, poolOffset + 16);
    const stringsStart = u32(b, poolOffset + 20);
    if (stringCount > 100_000) return out; // hostile cap
    const utf8 = (flags & (1 << 8)) !== 0;
    const offsetsBase = poolOffset + headerSize;
    const stringsBase = poolOffset + stringsStart;
    const max = Math.min(stringCount, 50_000);
    for (let i = 0; i < max; i++) {
        const offPos = offsetsBase + i * 4;
        if (offPos + 4 > b.length) break;
        const rel = u32(b, offPos);
        const abs = stringsBase + rel;
        if (abs < 0 || abs >= b.length) {
            out.push('');
            continue;
        }
        try {
            if (utf8) {
                // UTF-8: optional u16 charLen, then u16/u8 byteLen, then bytes, then 0
                let p = abs;
                // skip char length (1 or 2 bytes encoded)
                const c0 = b[p++];
                if (c0 === undefined) {
                    out.push('');
                    continue;
                }
                if ((c0 & 0x80) !== 0) p++; // high bit → 2-byte length
                if (p >= b.length) {
                    out.push('');
                    continue;
                }
                let byteLen = b[p++];
                if (byteLen === undefined) {
                    out.push('');
                    continue;
                }
                if ((byteLen & 0x80) !== 0) {
                    const b1 = b[p++] ?? 0;
                    byteLen = ((byteLen & 0x7f) << 8) | b1;
                }
                if (p + byteLen > b.length) {
                    out.push('');
                    continue;
                }
                out.push(b.toString('utf8', p, p + byteLen));
            }
            else {
                // UTF-16LE: u16 charLen (or u32 if high bit), then chars, then 0x0000
                let p = abs;
                if (p + 2 > b.length) {
                    out.push('');
                    continue;
                }
                let charLen = b.readUInt16LE(p);
                p += 2;
                if ((charLen & 0x8000) !== 0) {
                    if (p + 2 > b.length) {
                        out.push('');
                        continue;
                    }
                    charLen = ((charLen & 0x7fff) << 16) | b.readUInt16LE(p);
                    p += 2;
                }
                const byteLen = Math.min(charLen * 2, b.length - p);
                if (byteLen < 0) {
                    out.push('');
                    continue;
                }
                out.push(b.toString('utf16le', p, p + byteLen));
            }
        }
        catch {
            out.push('');
        }
    }
    return out;
}

function attrValue(
    b: Buffer,
    attrOff: number,
    strings: string[],
): string | number | boolean | null {
    // Res_value at attrOff+12: size(u16), res0(u8), dataType(u8), data(u32)
    if (attrOff + 20 > b.length) return null;
    const dataType = b[attrOff + 15] ?? 0;
    const data = u32(b, attrOff + 16);
    if (dataType === TYPE_STRING) {
        return data < strings.length ? strings[data]! : null;
    }
    if (dataType === TYPE_INT_DEC || dataType === 0x11 /* hex */) {
        return data | 0; // signed-ish via |0 for small SDK ints
    }
    if (dataType === TYPE_INT_BOOLEAN) {
        return data !== 0;
    }
    if (dataType === TYPE_REFERENCE) {
        return data < strings.length ? strings[data]! : `@ref:0x${data.toString(16)}`;
    }
    return null;
}

/**
 * Walk binary AndroidManifest AXML and extract structured manifest fields.
 * Never throws; returns limitations on malformed input.
 */
export function parseAxmlManifest(b: Buffer): AxmlManifest {
    const empty: AxmlManifest = {
        packageName: null,
        versionCode: null,
        versionName: null,
        minSdkVersion: null,
        targetSdkVersion: null,
        compileSdkVersion: null,
        permissions: [],
        activities: [],
        services: [],
        receivers: [],
        providers: [],
        usesFeatures: [],
        applicationLabel: null,
        debuggable: null,
        evidence: [],
        limitations: [],
    };
    if (!b || b.length < 8) {
        empty.limitations.push('AXML buffer too short');
        return empty;
    }
    const magic = u32(b, 0);
    if (magic !== AXML_FILE_MAGIC && magic !== 0x00080001) {
        empty.evidence.push(`AXML magic=0x${magic.toString(16)} (non-standard)`);
    }
    else {
        empty.evidence.push(`AXML magic ok 0x${magic.toString(16)}`);
    }
    // First chunk after file header is usually the string pool
    let poolOff = 8;
    // Some files put XML resource type at 0; string pool follows file header
    if (u16(b, 0) === RES_XML_TYPE) poolOff = u16(b, 2) >= 8 ? 8 : 0;
    const strings = parseStringPool(b, poolOff);
    if (strings.length === 0) {
        // try scan for string pool magic
        for (let o = 0; o + 8 < Math.min(b.length, 256); o += 4) {
            if (u16(b, o) === RES_STRING_POOL_TYPE) {
                const alt = parseStringPool(b, o);
                if (alt.length > strings.length) {
                    strings.push(...alt);
                    empty.evidence.push(`string pool at ${o}, count=${alt.length}`);
                    break;
                }
            }
        }
    }
    else {
        empty.evidence.push(`string pool count=${strings.length}`);
    }
    if (strings.length === 0) {
        empty.limitations.push('No ResStringPool found; manifest fields unavailable');
        return empty;
    }
    // Walk chunks for START_ELEMENT
    let off = 8;
    const limit = Math.min(b.length, 2 * 1024 * 1024);
    let elements = 0;
    while (off + 8 <= limit && elements < 10_000) {
        const chunkType = u16(b, off);
        const headerSize = u16(b, off + 2);
        const chunkSize = u32(b, off + 4);
        if (headerSize < 8 || chunkSize < headerSize || off + chunkSize > b.length) {
            // try advance by 4 to resync on hostile data
            off += 4;
            continue;
        }
        if (chunkType === RES_XML_START_ELEMENT && headerSize >= 16) {
            elements++;
            // ResXMLTree_node: lineNumber(u32), comment(u32) then ext
            // ResXMLTree_attrExt at off+headerSize? Actually layout:
            // off+0 type, +2 headerSize, +4 size
            // +8 lineNumber, +12 comment
            // +16 ns, +20 name, +24 attributeStart, +26 attributeSize, +28 attributeCount, ...
            const nameIdx = u32(b, off + 20);
            const elName = nameIdx < strings.length ? strings[nameIdx]! : '';
            const attrStart = u16(b, off + 24);
            const attrSize = u16(b, off + 26);
            const attrCount = u16(b, off + 28);
            const attrs: Record<string, string | number | boolean | null> = {};
            if (attrSize >= 20 && attrCount > 0 && attrCount < 256) {
                for (let a = 0; a < attrCount; a++) {
                    const aOff = off + attrStart + a * attrSize;
                    if (aOff + 20 > off + chunkSize || aOff + 20 > b.length) break;
                    const aNameIdx = u32(b, aOff + 4);
                    const aName = aNameIdx < strings.length ? strings[aNameIdx]! : `attr${a}`;
                    attrs[aName] = attrValue(b, aOff, strings);
                }
            }
            const str = (k: string): string | null => {
                const v = attrs[k];
                return typeof v === 'string' ? v : v != null ? String(v) : null;
            };
            const num = (k: string): number | null => {
                const v = attrs[k];
                if (typeof v === 'number' && Number.isFinite(v)) return v;
                if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v);
                return null;
            };
            if (elName === 'manifest') {
                empty.packageName = str('package') ?? empty.packageName;
                empty.versionCode = num('versionCode') ?? empty.versionCode;
                empty.versionName = str('versionName') ?? empty.versionName;
                // compileSdk sometimes on manifest in newer AXML
                empty.compileSdkVersion = num('compileSdkVersion') ?? empty.compileSdkVersion;
            }
            else if (elName === 'uses-sdk') {
                empty.minSdkVersion = num('minSdkVersion') ?? empty.minSdkVersion;
                empty.targetSdkVersion = num('targetSdkVersion') ?? empty.targetSdkVersion;
            }
            else if (elName === 'uses-permission' || elName === 'uses-permission-sdk-23') {
                const p = str('name');
                if (p && !empty.permissions.includes(p)) empty.permissions.push(p);
            }
            else if (elName === 'activity' || elName === 'activity-alias') {
                const n = str('name');
                if (n && !empty.activities.includes(n)) empty.activities.push(n);
            }
            else if (elName === 'service') {
                const n = str('name');
                if (n && !empty.services.includes(n)) empty.services.push(n);
            }
            else if (elName === 'receiver') {
                const n = str('name');
                if (n && !empty.receivers.includes(n)) empty.receivers.push(n);
            }
            else if (elName === 'provider') {
                const n = str('name');
                if (n && !empty.providers.includes(n)) empty.providers.push(n);
            }
            else if (elName === 'uses-feature') {
                const n = str('name');
                if (n && !empty.usesFeatures.includes(n)) empty.usesFeatures.push(n);
            }
            else if (elName === 'application') {
                empty.applicationLabel = str('label') ?? empty.applicationLabel;
                const d = attrs['debuggable'];
                if (typeof d === 'boolean') empty.debuggable = d;
                else if (typeof d === 'number') empty.debuggable = d !== 0;
            }
        }
        off += chunkSize;
    }
    if (empty.minSdkVersion != null) empty.evidence.push(`minSdkVersion=${empty.minSdkVersion}`);
    if (empty.targetSdkVersion != null) empty.evidence.push(`targetSdkVersion=${empty.targetSdkVersion}`);
    if (empty.packageName) empty.evidence.push(`package=${empty.packageName}`);
    if (empty.permissions.length) empty.evidence.push(`permissions=${empty.permissions.length}`);
    if (empty.activities.length) empty.evidence.push(`activities=${empty.activities.length}`);
    if (elements === 0) empty.limitations.push('No XML start elements parsed');
    // Cap list sizes for MCP budgets
    empty.permissions = empty.permissions.slice(0, 200);
    empty.activities = empty.activities.slice(0, 100);
    empty.services = empty.services.slice(0, 50);
    empty.receivers = empty.receivers.slice(0, 50);
    empty.providers = empty.providers.slice(0, 50);
    empty.usesFeatures = empty.usesFeatures.slice(0, 50);
    return empty;
}

/**
 * SDK hints via full AXML walker, with UTF-16 scan fallback for crafted/partial buffers.
 */
export function parseAxmlSdkHints(b: Buffer): {
    minSdk: number | null;
    targetSdk: number | null;
    evidence: string[];
} {
    const m = parseAxmlManifest(b);
    let minSdk = m.minSdkVersion;
    let targetSdk = m.targetSdkVersion;
    const evidence = m.evidence.concat(m.limitations);
    if (minSdk == null || targetSdk == null) {
        const scan = (label: string): number | null => {
            const needle = Buffer.from(label, 'utf16le');
            const idx = b.indexOf(needle);
            if (idx < 0) return null;
            const end = Math.min(b.length - 8, idx + 96);
            for (let i = idx; i < end; i++) {
                if (b[i] === 0x10 && i + 5 < b.length) {
                    const v = b.readInt32LE(i + 4);
                    if (v >= 1 && v <= 36) return v;
                }
            }
            return null;
        };
        if (minSdk == null) {
            const v = scan('minSdkVersion');
            if (v != null) {
                minSdk = v;
                evidence.push(`minSdkVersion~${v} (utf16-fallback)`);
            }
        }
        if (targetSdk == null) {
            const v = scan('targetSdkVersion');
            if (v != null) {
                targetSdk = v;
                evidence.push(`targetSdkVersion~${v} (utf16-fallback)`);
            }
        }
    }
    return { minSdk, targetSdk, evidence };
}

/** Minimal resources.arsc summary: packages and string samples. */
export function parseArscSummary(b: Buffer): ArscSummary {
    const out: ArscSummary = {
        packageCount: null,
        typeStringsSample: [],
        keyStringsSample: [],
        packageNames: [],
        evidence: [],
        limitations: [],
    };
    if (!b || b.length < 12) {
        out.limitations.push('ARSC buffer too short');
        return out;
    }
    const type = u16(b, 0);
    if (type !== RES_TABLE_TYPE) {
        out.limitations.push(`ARSC type=0x${type.toString(16)} (expected 0x0002)`);
        // still try to find packages
    }
    else {
        out.evidence.push('ResTable header ok');
    }
    const packageCount = u32(b, 8);
    out.packageCount = packageCount > 256 ? null : packageCount;
    if (out.packageCount != null) out.evidence.push(`packageCount=${out.packageCount}`);
    // Global string pool often follows ResTable header (headerSize at +2)
    const headerSize = u16(b, 2);
    if (headerSize >= 12 && headerSize < b.length) {
        const global = parseStringPool(b, headerSize);
        out.typeStringsSample = global.filter(Boolean).slice(0, 20);
        if (global.length) out.evidence.push(`globalStringPool=${global.length}`);
    }
    // Scan for ResTable_package chunks
    let off = headerSize >= 12 ? headerSize : 12;
    // skip global string pool chunk
    if (off + 8 <= b.length && u16(b, off) === RES_STRING_POOL_TYPE) {
        const cs = u32(b, off + 4);
        if (cs >= 8 && off + cs <= b.length) off += cs;
    }
    let packages = 0;
    while (off + 8 <= b.length && packages < 16) {
        const ct = u16(b, off);
        const cs = u32(b, off + 4);
        if (cs < 8 || off + cs > b.length) {
            off += 4;
            continue;
        }
        if (ct === RES_TABLE_PACKAGE_TYPE && cs >= 288) {
            packages++;
            // package name is 128 UTF-16LE chars at offset 12 inside package chunk? 
            // ResTable_package: id(u32) at +8, name[128] char16 at +12
            const nameBytes = b.subarray(off + 12, Math.min(off + 12 + 256, b.length));
            let end = 0;
            while (end + 1 < nameBytes.length && !(nameBytes[end] === 0 && nameBytes[end + 1] === 0)) end += 2;
            const name = nameBytes.toString('utf16le', 0, end).replace(/\0/g, '');
            if (name) out.packageNames.push(name);
            // typeStrings / keyStrings offsets at +208 / +212 relative? (API dependent)
            // Sample: look for nested string pools inside package
            for (let i = off + 288; i + 8 < off + cs && i + 8 < b.length; i += 4) {
                if (u16(b, i) === RES_STRING_POOL_TYPE) {
                    const sample = parseStringPool(b, i).filter(Boolean).slice(0, 15);
                    if (sample.length && out.keyStringsSample.length === 0) {
                        out.keyStringsSample = sample;
                    }
                    else if (sample.length && out.typeStringsSample.length < 5) {
                        out.typeStringsSample = [...out.typeStringsSample, ...sample].slice(0, 20);
                    }
                    break;
                }
            }
        }
        off += cs;
    }
    if (out.packageNames.length) out.evidence.push(`packages=${out.packageNames.join(',')}`);
    if (packages === 0) out.limitations.push('No ResTable_package chunks found');
    return out;
}

/** DEX header + class name listing (bounded). */
export function parseDexClasses(b: Buffer, maxClasses = 500): DexClassListing {
    const out: DexClassListing = {
        magicOk: false,
        version: null,
        endian: null,
        fileSize: null,
        classCount: 0,
        classNames: [],
        obfuscationIndicators: [],
        evidence: [],
        limitations: [],
    };
    if (!b || b.length < 0x70) {
        out.limitations.push('DEX buffer too short for header');
        return out;
    }
    if (!b.subarray(0, 4).equals(DEX_MAGIC)) {
        out.limitations.push('DEX magic mismatch');
        return out;
    }
    out.magicOk = true;
    out.version = b.toString('ascii', 4, 8).replace(/\0/g, '');
    out.evidence.push(`dex version=${out.version}`);
    const endianTag = u32(b, 40);
    if (endianTag === 0x12345678) out.endian = 'le';
    else if (endianTag === 0x78563412) out.endian = 'be';
    else out.limitations.push(`unusual endian_tag=0x${endianTag.toString(16)}`);
    // We only support little-endian layout (standard)
    if (out.endian === 'be') {
        out.limitations.push('Big-endian DEX not decoded');
        return out;
    }
    out.fileSize = u32(b, 32);
    const stringIdsSize = u32(b, 56);
    const stringIdsOff = u32(b, 60);
    const typeIdsSize = u32(b, 64);
    const typeIdsOff = u32(b, 68);
    const classDefsSize = u32(b, 96);
    const classDefsOff = u32(b, 100);
    out.classCount = classDefsSize;
    out.evidence.push(`class_defs_size=${classDefsSize}`);
    if (stringIdsSize > 2_000_000 || typeIdsSize > 2_000_000 || classDefsSize > 2_000_000) {
        out.limitations.push('DEX id tables exceed hostile-input caps');
        return out;
    }
    const readString = (idx: number): string | null => {
        if (idx < 0 || idx >= stringIdsSize) return null;
        const idOff = stringIdsOff + idx * 4;
        if (idOff + 4 > b.length) return null;
        const dataOff = u32(b, idOff);
        if (dataOff >= b.length) return null;
        // MUTF-8: uleb128 utf16_size then bytes
        let p = dataOff;
        let utf16Size = 0;
        let shift = 0;
        for (let n = 0; n < 5 && p < b.length; n++) {
            const by = b[p++]!;
            utf16Size |= (by & 0x7f) << shift;
            if ((by & 0x80) === 0) break;
            shift += 7;
        }
        void utf16Size;
        const start = p;
        while (p < b.length && b[p] !== 0) p++;
        try {
            return b.toString('utf8', start, p);
        }
        catch {
            return null;
        }
    };
    const typeName = (typeIdx: number): string | null => {
        if (typeIdx < 0 || typeIdx >= typeIdsSize) return null;
        const off = typeIdsOff + typeIdx * 4;
        if (off + 4 > b.length) return null;
        return readString(u32(b, off));
    };
    const n = Math.min(classDefsSize, maxClasses);
    let shortNames = 0;
    for (let i = 0; i < n; i++) {
        const off = classDefsOff + i * 32; // class_def_item = 32 bytes
        if (off + 4 > b.length) break;
        const classIdx = u32(b, off);
        const desc = typeName(classIdx);
        if (desc) {
            // Lfoo/bar/Baz; → foo.bar.Baz
            let name = desc;
            if (name.startsWith('L') && name.endsWith(';')) {
                name = name.slice(1, -1).replace(/\//g, '.');
            }
            out.classNames.push(name);
            const simple = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : name;
            if (simple.length <= 2 || /^[a-z]{1,3}$/.test(simple)) shortNames++;
        }
    }
    if (classDefsSize > maxClasses) {
        out.limitations.push(`class list truncated to ${maxClasses} of ${classDefsSize}`);
    }
    if (out.classNames.length >= 10 && shortNames / out.classNames.length > 0.4) {
        out.obfuscationIndicators.push('high-ratio short/simple class names');
    }
    if (out.classNames.some(n => n.startsWith('a.') || n.startsWith('o.') || /^[a-z]\.[a-z]\./.test(n))) {
        out.obfuscationIndicators.push('obfuscator-style package prefixes');
    }
    if (out.obfuscationIndicators.length) {
        out.evidence.push(...out.obfuscationIndicators);
    }
    return out;
}

/**
 * Detect APK signature schemes from full APK bytes (ZIP + optional signing block).
 * v1: META-INF/*.RSA|DSA|EC (+ MANIFEST.MF).
 * v2/v3: APK Signing Block magic before central directory.
 */
export function detectApkSignatures(apk: Buffer, zipEntryNames?: string[]): ApkSignatureInfo {
    const out: ApkSignatureInfo = {
        schemes: [],
        v1Entries: [],
        hasSigningBlock: false,
        blockSize: null,
        evidence: [],
        limitations: [],
    };
    const names = zipEntryNames ?? [];
    for (const n of names) {
        const lower = n.toLowerCase();
        if (lower.startsWith('meta-inf/') && /\.(rsa|dsa|ec)$/i.test(lower)) {
            out.v1Entries.push(n);
        }
        if (lower === 'meta-inf/manifest.mf' && !out.v1Entries.includes(n)) {
            out.evidence.push('MANIFEST.MF present');
        }
    }
    if (out.v1Entries.length) {
        out.schemes.push('v1-jar');
        out.evidence.push(`v1 entries=${out.v1Entries.slice(0, 5).join(',')}`);
    }
    // Locate EOCD and APK Signing Block
    if (apk.length >= 22) {
        const tailSize = Math.min(apk.length, 65536 + 22);
        const tailStart = apk.length - tailSize;
        const tail = apk.subarray(tailStart);
        let eocdRel = -1;
        for (let i = tail.length - 22; i >= 0; i--) {
            if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
                eocdRel = i;
                break;
            }
        }
        if (eocdRel >= 0) {
            const eocd = tailStart + eocdRel;
            const cdOffset = u32(apk, eocd + 16);
            // Signing block sits immediately before CD; size field is 8 bytes before magic
            // Footer: size(u64) + magic(16) = 24 bytes ending at cdOffset
            if (cdOffset >= 24 && cdOffset <= apk.length) {
                const magicOff = cdOffset - 16;
                if (apk.subarray(magicOff, magicOff + 16).equals(APK_SIG_BLOCK_MAGIC)) {
                    out.hasSigningBlock = true;
                    // size is u64 LE at cdOffset-24
                    const sizeLo = u32(apk, cdOffset - 24);
                    out.blockSize = sizeLo;
                    out.schemes.push('v2-block');
                    out.evidence.push(`APK Sig Block 42 at ${magicOff}, sizeLo=${sizeLo}`);
                    // Scan block for v3 ID-value pairs: 0x1b93ad61 (v2), 0xf05368c0 (v3)
                    const blockStart = cdOffset - sizeLo - 8;
                    if (blockStart >= 0 && blockStart < cdOffset) {
                        const region = apk.subarray(blockStart, cdOffset);
                        // look for known signature scheme IDs as LE u32
                        for (let i = 0; i + 4 <= region.length; i++) {
                            const id = region.readUInt32LE(i);
                            if (id === 0x7109871a || id === 0x1b93ad61) {
                                if (!out.schemes.includes('v2')) out.schemes.push('v2');
                            }
                            if (id === 0xf05368c0) {
                                if (!out.schemes.includes('v3')) out.schemes.push('v3');
                            }
                            if (id === 0x42726577) { // "Brew" padding often
                                // ignore
                            }
                        }
                    }
                }
            }
        }
        else {
            out.limitations.push('EOCD not found; v2/v3 block scan skipped');
        }
    }
    // Deduplicate schemes, prefer specific labels
    out.schemes = [...new Set(out.schemes)];
    if (!out.schemes.length) out.limitations.push('No signing scheme detected');
    return out;
}
