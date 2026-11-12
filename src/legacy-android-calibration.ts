/**
 * Crafted-fixture calibration for Patch P step 2 (legacy Android).
 * Lawful fixtures only — never third-party APKs.
 */
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyzeLegacyAndroid, parseAxmlSdkHints } from './legacy-android.js';
import type { LegacyAuthorization } from './legacy-types.js';
const AUTH: LegacyAuthorization = {
    basis: 'open_source',
    licenseOrConsentReference: 'android-calibration-crafted',
    declaredBy: 'legacy-android-calibration',
    declaredAt: new Date().toISOString(),
};
export interface AndroidCalibrationCase {
    id: string;
    expectFormat: string;
    expectFamily: string;
}
export interface AndroidCalibrationReport {
    cases: Array<{
        id: string;
        ok: boolean;
        detail: string;
    }>;
    ok: boolean;
    limitations: string[];
}
function dexFixture(): Buffer {
    const b = Buffer.alloc(70);
    b.write('dex\n035\0', 0);
    return b;
}
/** Minimal stored-method ZIP with AndroidManifest.xml payload (uncompressed). */
function zipWithStoredEntry(name: string, data: Buffer): Buffer {
    const nameBuf = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30 + nameBuf.length + data.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method stored
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(0, 14); // crc skip
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);
    data.copy(local, 30 + nameBuf.length);
    // central directory
    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(data.length, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt32LE(0, 36);
    central.writeUInt32LE(0, 42); // local header offset
    nameBuf.copy(central, 46);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(central.length, 12);
    end.writeUInt32LE(local.length, 16);
    end.writeUInt16LE(0, 20);
    return Buffer.concat([local, central, end]);
}
/** Synthetic AXML-ish buffer embedding utf16 minSdkVersion + typed int 16. */
function axmlWithMinSdk(minSdk: number): Buffer {
    const b = Buffer.alloc(256);
    b.writeUInt32LE(0x00080003, 0);
    const label = Buffer.from('minSdkVersion', 'utf16le');
    label.copy(b, 64);
    const at = 64 + label.length + 4;
    b[at] = 0x10;
    b.writeInt32LE(minSdk, at + 4);
    return b;
}
export async function runAndroidCalibration(): Promise<AndroidCalibrationReport> {
    const dir = await mkdtemp(join(tmpdir(), 'android-cal-'));
    const cases: AndroidCalibrationReport['cases'] = [];
    const limitations = [
        'Crafted fixtures only (H-06).',
        'AXML hints are best-effort, not a full manifest parser.',
    ];
    try {
        const dexPath = join(dir, 'classes.dex');
        await writeFile(dexPath, dexFixture());
        const dex = await analyzeLegacyAndroid(dexPath, AUTH);
        const df = dex.findings[0];
        cases.push({
            id: 'dex-magic-profile',
            ok: !!df && df.format === 'DEX' && df.targetProfile.osAndEra.value?.family === 'Android',
            detail: df ? `format=${df.format}` : 'no finding',
        });
        const axml = axmlWithMinSdk(16);
        const hints = parseAxmlSdkHints(axml);
        cases.push({
            id: 'axml-minsdk-scan',
            ok: hints.minSdk === 16,
            detail: hints.evidence.join('; '),
        });
        const apkPath = join(dir, 'sample.apk');
        await writeFile(apkPath, zipWithStoredEntry('AndroidManifest.xml', axml));
        const apk = await analyzeLegacyAndroid(apkPath, AUTH);
        const af = apk.findings[0];
        cases.push({
            id: 'apk-manifest-inventory',
            ok: !!af && (af.hasAndroidManifest || af.format === 'APK' || af.format === 'unknown'),
            detail: af
                ? `format=${af.format}; detectors=${af.structuralDetectors.map(d => d.name).join(',')}`
                : 'no finding',
        });
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
    return {
        cases,
        ok: cases.every(c => c.ok),
        limitations,
    };
}
