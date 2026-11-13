import test from 'node:test';
import assert from 'node:assert/strict';
import {
    parseAxmlManifest,
    parseAxmlSdkHints,
    parseArscSummary,
    parseDexClasses,
    detectApkSignatures,
    AXML_FILE_MAGIC,
    RES_STRING_POOL_TYPE,
    RES_XML_START_ELEMENT,
    RES_TABLE_TYPE,
    DEX_MAGIC,
    APK_SIG_BLOCK_MAGIC,
} from '../dist/legacy-android-parsers.js';

/** Build a minimal ResStringPool (UTF-16) with the given strings. */
function buildStringPool(strings: string[]): Buffer {
    const headerSize = 28;
    const offsets = Buffer.alloc(strings.length * 4);
    const parts: Buffer[] = [];
    let cursor = 0;
    for (let i = 0; i < strings.length; i++) {
        offsets.writeUInt32LE(cursor, i * 4);
        const chars = Buffer.from(strings[i]!, 'utf16le');
        const len = Buffer.alloc(2);
        len.writeUInt16LE(strings[i]!.length, 0);
        const nul = Buffer.alloc(2);
        parts.push(len, chars, nul);
        cursor += 2 + chars.length + 2;
    }
    const strData = Buffer.concat(parts);
    // align to 4
    const pad = Buffer.alloc((4 - (strData.length % 4)) % 4);
    const stringsStart = headerSize + offsets.length;
    const chunkSize = stringsStart + strData.length + pad.length;
    const header = Buffer.alloc(headerSize);
    header.writeUInt16LE(RES_STRING_POOL_TYPE, 0);
    header.writeUInt16LE(headerSize, 2);
    header.writeUInt32LE(chunkSize, 4);
    header.writeUInt32LE(strings.length, 8);
    header.writeUInt32LE(0, 12); // style count
    header.writeUInt32LE(0, 16); // flags (UTF-16)
    header.writeUInt32LE(stringsStart, 20);
    header.writeUInt32LE(0, 24); // styles start
    return Buffer.concat([header, offsets, strData, pad]);
}

/** Minimal AXML with one start element and typed attributes. */
function buildMinimalAxml(opts: {
    strings: string[];
    elementNameIdx: number;
    attrs: Array<{ nameIdx: number; type: number; data: number }>;
}): Buffer {
    const pool = buildStringPool(opts.strings);
    const fileHeader = Buffer.alloc(8);
    fileHeader.writeUInt32LE(AXML_FILE_MAGIC, 0);
    fileHeader.writeUInt32LE(0, 4); // size filled later

    const attrSize = 20;
    const attrCount = opts.attrs.length;
    const attrStart = 20; // relative to start of start-element chunk content after node?
    // Chunk layout:
    // 0 type u16, 2 headerSize u16, 4 size u32
    // 8 lineNumber u32, 12 comment u32
    // 16 ns u32, 20 name u32, 24 attrStart u16, 26 attrSize u16, 28 attrCount u16, 30 idIndex u16, 32 classIndex u16, 34 styleIndex u16
    // then attributes at offset attrStart from start of chunk
    const headerSize = 16; // common
    // Put attrs right after the 36-byte extended header
    const contentBase = 36;
    const chunkSize = contentBase + attrCount * attrSize;
    const el = Buffer.alloc(chunkSize);
    el.writeUInt16LE(RES_XML_START_ELEMENT, 0);
    el.writeUInt16LE(headerSize, 2);
    el.writeUInt32LE(chunkSize, 4);
    el.writeUInt32LE(1, 8); // line
    el.writeUInt32LE(0xffffffff, 12); // comment
    el.writeUInt32LE(0xffffffff, 16); // ns
    el.writeUInt32LE(opts.elementNameIdx, 20);
    el.writeUInt16LE(contentBase, 24); // attributeStart from chunk start
    el.writeUInt16LE(attrSize, 26);
    el.writeUInt16LE(attrCount, 28);
    for (let i = 0; i < attrCount; i++) {
        const a = opts.attrs[i]!;
        const off = contentBase + i * attrSize;
        el.writeUInt32LE(0xffffffff, off); // ns
        el.writeUInt32LE(a.nameIdx, off + 4);
        el.writeUInt32LE(0xffffffff, off + 8); // rawValue
        el.writeUInt16LE(8, off + 12); // size
        el.writeUInt8(0, off + 14);
        el.writeUInt8(a.type, off + 15);
        el.writeUInt32LE(a.data >>> 0, off + 16);
    }
    const body = Buffer.concat([pool, el]);
    fileHeader.writeUInt32LE(8 + body.length, 4);
    return Buffer.concat([fileHeader, body]);
}

test('parseAxmlManifest extracts uses-sdk minSdk from crafted AXML', () => {
    // strings: 0=uses-sdk, 1=minSdkVersion, 2=targetSdkVersion
    const strings = ['uses-sdk', 'minSdkVersion', 'targetSdkVersion'];
    const axml = buildMinimalAxml({
        strings,
        elementNameIdx: 0,
        attrs: [
            { nameIdx: 1, type: 0x10, data: 16 },
            { nameIdx: 2, type: 0x10, data: 22 },
        ],
    });
    const m = parseAxmlManifest(axml);
    assert.equal(m.minSdkVersion, 16);
    assert.equal(m.targetSdkVersion, 22);
    assert.ok(m.evidence.some(e => /minSdkVersion=16/.test(e)));
});

test('parseAxmlSdkHints delegates to full walker', () => {
    const strings = ['uses-sdk', 'minSdkVersion'];
    const axml = buildMinimalAxml({
        strings,
        elementNameIdx: 0,
        attrs: [{ nameIdx: 1, type: 0x10, data: 19 }],
    });
    const h = parseAxmlSdkHints(axml);
    assert.equal(h.minSdk, 19);
});

test('parseAxmlManifest does not throw on hostile buffers', () => {
    const cases = [
        Buffer.alloc(0),
        Buffer.alloc(7),
        Buffer.alloc(64, 0xff),
        Buffer.from('not axml at all'),
        Buffer.concat([Buffer.from([0x03, 0x00, 0x08, 0x00]), Buffer.alloc(100, 0x41)]),
    ];
    for (const b of cases) {
        const m = parseAxmlManifest(b);
        assert.ok(m);
        assert.ok(Array.isArray(m.permissions));
    }
});

test('parseArscSummary reads packageCount from ResTable header', () => {
    const b = Buffer.alloc(32);
    b.writeUInt16LE(RES_TABLE_TYPE, 0);
    b.writeUInt16LE(12, 2);
    b.writeUInt32LE(32, 4);
    b.writeUInt32LE(2, 8); // packageCount
    const s = parseArscSummary(b);
    assert.equal(s.packageCount, 2);
    assert.ok(s.evidence.some(e => /packageCount=2/.test(e)));
});

test('parseArscSummary tolerates garbage', () => {
    const s = parseArscSummary(Buffer.alloc(3));
    assert.ok(s.limitations.length >= 1);
});

test('parseDexClasses reads magic and empty class list', () => {
    const b = Buffer.alloc(0x70);
    DEX_MAGIC.copy(b, 0);
    b.write('035\0', 4);
    b.writeUInt32LE(0x12345678, 40); // endian
    b.writeUInt32LE(0x70, 32); // file_size
    // all sizes 0
    const d = parseDexClasses(b);
    assert.equal(d.magicOk, true);
    assert.equal(d.version, '035');
    assert.equal(d.endian, 'le');
    assert.equal(d.classCount, 0);
});

test('parseDexClasses rejects non-dex', () => {
    const d = parseDexClasses(Buffer.from('hello'));
    assert.equal(d.magicOk, false);
    assert.ok(d.limitations.length >= 1);
});

test('detectApkSignatures finds APK Sig Block magic', () => {
    // Minimal: EOCD + signing block footer
    // [block...][size u64][magic 16][CD empty][EOCD]
    const magic = Buffer.from(APK_SIG_BLOCK_MAGIC);
    const sizeLo = Buffer.alloc(8);
    sizeLo.writeUInt32LE(24, 0); // size
    const eocd = Buffer.alloc(22);
    eocd[0] = 0x50; eocd[1] = 0x4b; eocd[2] = 0x05; eocd[3] = 0x06;
    // cd offset = length of everything before CD = sizeLo+magic = 24, but we put block size field+magic = 24 bytes
    // Structure: [padding 8][size 8][magic 16] = 32 bytes before EOCD, cdOffset=32? 
    // Actually CD is empty at offset where magic ends.
    const prefix = Buffer.alloc(8);
    const beforeCd = Buffer.concat([prefix, sizeLo, magic]);
    eocd.writeUInt32LE(beforeCd.length, 16); // cd offset
    const apk = Buffer.concat([beforeCd, eocd]);
    const sig = detectApkSignatures(apk);
    assert.equal(sig.hasSigningBlock, true);
    assert.ok(sig.schemes.includes('v2-block'));
});

test('detectApkSignatures lists v1 META-INF entries', () => {
    const sig = detectApkSignatures(Buffer.alloc(22), [
        'META-INF/CERT.RSA',
        'META-INF/MANIFEST.MF',
        'classes.dex',
    ]);
    assert.ok(sig.schemes.includes('v1-jar'));
    assert.ok(sig.v1Entries.includes('META-INF/CERT.RSA'));
});
