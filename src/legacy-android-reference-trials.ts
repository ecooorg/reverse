/**
 * Android L0 reference trials (Patch P steps 6–8).
 * Crafted fixtures only — no third-party APKs.
 */
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyzeLegacyAndroid } from './legacy-android.js';
import { diagnoseAndroidFromTables } from './legacy-android-tables.js';
import { parseAxmlManifest } from './legacy-android-parsers.js';
import { parseDexClasses } from './legacy-android-parsers.js';
import { detectApkSignatures } from './legacy-android-parsers.js';
import { extractDerNameHints } from './legacy-android-parsers.js';
import { AXML_FILE_MAGIC } from './legacy-android-parsers.js';
import { RES_STRING_POOL_TYPE } from './legacy-android-parsers.js';
import { RES_XML_START_ELEMENT } from './legacy-android-parsers.js';
import { DEX_MAGIC } from './legacy-android-parsers.js';
import { APK_SIG_BLOCK_MAGIC } from './legacy-android-parsers.js';
import { compareAndroidObservations, planAndroidFridaSession } from './legacy-android-capture.js';
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
    const b = Buffer.alloc(0x70);
    DEX_MAGIC.copy(b, 0);
    b.write('035\0', 4);
    b.writeUInt32LE(0x12345678, 40);
    b.writeUInt32LE(0x70, 32);
    return b;
}
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
        parts.push(len, chars, Buffer.alloc(2));
        cursor += 2 + chars.length + 2;
    }
    const strData = Buffer.concat(parts);
    const pad = Buffer.alloc((4 - (strData.length % 4)) % 4);
    const stringsStart = headerSize + offsets.length;
    const chunkSize = stringsStart + strData.length + pad.length;
    const header = Buffer.alloc(headerSize);
    header.writeUInt16LE(RES_STRING_POOL_TYPE, 0);
    header.writeUInt16LE(headerSize, 2);
    header.writeUInt32LE(chunkSize, 4);
    header.writeUInt32LE(strings.length, 8);
    header.writeUInt32LE(stringsStart, 20);
    return Buffer.concat([header, offsets, strData, pad]);
}
function craftedAxmlMinSdk(minSdk: number): Buffer {
    const strings = ['uses-sdk', 'minSdkVersion', 'targetSdkVersion'];
    const pool = buildStringPool(strings);
    const fileHeader = Buffer.alloc(8);
    fileHeader.writeUInt32LE(AXML_FILE_MAGIC, 0);
    const attrSize = 20;
    const contentBase = 36;
    const chunkSize = contentBase + 2 * attrSize;
    const el = Buffer.alloc(chunkSize);
    el.writeUInt16LE(RES_XML_START_ELEMENT, 0);
    el.writeUInt16LE(16, 2);
    el.writeUInt32LE(chunkSize, 4);
    el.writeUInt32LE(1, 8);
    el.writeUInt32LE(0xffffffff, 12);
    el.writeUInt32LE(0xffffffff, 16);
    el.writeUInt32LE(0, 20);
    el.writeUInt16LE(contentBase, 24);
    el.writeUInt16LE(attrSize, 26);
    el.writeUInt16LE(2, 28);
    for (const [i, nameIdx, data] of [[0, 1, minSdk], [1, 2, 22]] as const) {
        const off = contentBase + i * attrSize;
        el.writeUInt32LE(0xffffffff, off);
        el.writeUInt32LE(nameIdx, off + 4);
        el.writeUInt32LE(0xffffffff, off + 8);
        el.writeUInt16LE(8, off + 12);
        el.writeUInt8(0x10, off + 15);
        el.writeUInt32LE(data, off + 16);
    }
    const body = Buffer.concat([pool, el]);
    fileHeader.writeUInt32LE(8 + body.length, 4);
    return Buffer.concat([fileHeader, body]);
}
export async function runAndroidReferenceTrials(): Promise<AndroidReferenceTrialsReport> {
    const dir = await mkdtemp(join(tmpdir(), 'android-ref-'));
    const trials: AndroidReferenceTrialResult[] = [];
    const limitations = [
        'L0 only: structural identity on crafted fixtures.',
        'No operator APK oracle; device runs not part of L0.',
        'Network/proxy MITM and continuous Frida profiles remain operator-driven.',
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
        const listing = parseDexClasses(dexBytes());
        trials.push({
            id: 'dex-parser-l0',
            level: 'L0',
            ok: listing.magicOk && listing.version === '035',
            detail: `magic=${listing.magicOk}; ver=${listing.version}`,
        });
        const axml = craftedAxmlMinSdk(16);
        const manifest = parseAxmlManifest(axml);
        trials.push({
            id: 'axml-minsdk-l0',
            level: 'L0',
            ok: manifest.minSdkVersion === 16,
            detail: `minSdk=${manifest.minSdkVersion}; evidence=${manifest.evidence.slice(0, 3).join(',')}`,
        });
        const magic = Buffer.from(APK_SIG_BLOCK_MAGIC);
        const sizeLo = Buffer.alloc(8);
        sizeLo.writeUInt32LE(24, 0);
        const eocd = Buffer.alloc(22);
        eocd[0] = 0x50;
        eocd[1] = 0x4b;
        eocd[2] = 0x05;
        eocd[3] = 0x06;
        const beforeCd = Buffer.concat([Buffer.alloc(8), sizeLo, magic]);
        eocd.writeUInt32LE(beforeCd.length, 16);
        const sig = detectApkSignatures(Buffer.concat([beforeCd, eocd]));
        trials.push({
            id: 'apk-sig-block-l0',
            level: 'L0',
            ok: sig.hasSigningBlock === true,
            detail: `schemes=${sig.schemes.join(',')}`,
        });
        const derHints = extractDerNameHints(Buffer.alloc(64, 0x30));
        trials.push({
            id: 'der-cert-hints-l0',
            level: 'L0',
            ok: Array.isArray(derHints.subjects),
            detail: `subjects=${derHints.subjects.length}`,
        });
        const cmp = compareAndroidObservations({
            left: {
                hierarchyXml: '<hierarchy><node text="A"/></hierarchy>',
                screenshotSha256: 'aaa',
                monkeyExitCode: 0,
                monkeyStdoutTail: 'Events injected: 10',
            },
            right: {
                hierarchyXml: '<hierarchy><node text="A"/></hierarchy>',
                screenshotSha256: 'bbb',
                monkeyExitCode: 0,
                monkeyStdoutTail: 'Events injected: 10',
            },
        });
        trials.push({
            id: 'observation-compare-l0',
            level: 'L0',
            ok: cmp.equal && cmp.pixelDrift,
            detail: `equal=${cmp.equal}; pixelDrift=${cmp.pixelDrift}`,
        });
        const frida = planAndroidFridaSession({ packageName: 'com.example.app' });
        trials.push({
            id: 'frida-plan-l0',
            level: 'L0',
            ok: frida.allowed && !!frida.script && /Java\.perform/.test(frida.script),
            detail: frida.allowed ? 'script generated' : frida.limitations.join(';'),
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
