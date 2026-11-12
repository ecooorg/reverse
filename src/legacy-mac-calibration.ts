/**
 * Mac calibration harness (Patch O step 2).
 * Crafted Mach-O / PEF / AppleDouble / MacBinary / BinHex / HFS fixtures
 * + optional operator hash manifest. Reuses CalibrationReport from the Windows harness.
 */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { analyzeLegacyMac } from './legacy-mac.js';
import { requireLegacyGate } from './legacy-gate.js';
import { loadCalibrationManifest } from './legacy-calibration.js';
import type { LegacyAuthorization } from './legacy-types.js';
import type { CalibrationExpectation, CalibrationManifest, CalibrationReport, DetectorScore, } from './legacy-calibration.js';
function sha256(buf: Buffer): string {
    return createHash('sha256').update(buf).digest('hex');
}
function machO32(cpu = 7, pie = false): Buffer {
    const b = Buffer.alloc(28);
    b.writeUInt32LE(0xfeedface, 0);
    b.writeUInt32LE(cpu, 4);
    b.writeUInt32LE(0, 8);
    b.writeUInt32LE(2, 12);
    b.writeUInt32LE(0, 16);
    b.writeUInt32LE(0, 20);
    b.writeUInt32LE(pie ? 0x200000 : 0, 24);
    return b;
}
function pef(arch = 'pwpc'): Buffer {
    const b = Buffer.alloc(40);
    b.writeUInt32BE(0x4a6f7921, 0);
    Buffer.from(arch.padEnd(4, '\0')).copy(b, 4);
    return b;
}
function appleDoubleFinder(type = 'APPL', creator = 'ttxt'): Buffer {
    const b = Buffer.alloc(46);
    b.writeUInt32BE(0x00051607, 0);
    b.writeUInt32BE(0x00020000, 4);
    b.writeUInt16BE(1, 24);
    b.writeUInt32BE(9, 26);
    b.writeUInt32BE(38, 30);
    b.writeUInt32BE(8, 34);
    b.write(type.padEnd(4, ' ').slice(0, 4), 38);
    b.write(creator.padEnd(4, ' ').slice(0, 4), 42);
    return b;
}
function macBinaryII(name = 'Hello', type = 'TEXT', creator = 'ttxt'): Buffer {
    const b = Buffer.alloc(128);
    b[0] = 0;
    b[1] = Math.min(name.length, 63);
    b.write(name.slice(0, 63), 2);
    b.write(type.padEnd(4, ' ').slice(0, 4), 65);
    b.write(creator.padEnd(4, ' ').slice(0, 4), 69);
    b[122] = 129;
    return b;
}
function binHexBanner(): Buffer {
    return Buffer.from('(This file must be converted with BinHex 4.0)\r\n:');
}
function hfsPlusStub(): Buffer {
    const b = Buffer.alloc(1024 + 16);
    b.write('H+', 1024, 'ascii');
    return b;
}
function infoPlist(): Buffer {
    return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.example.demo</string>
<key>CFBundleExecutable</key><string>Demo</string>
<key>CFBundleName</key><string>Demo</string>
<key>LSMinimumSystemVersion</key><string>10.6</string>
</dict></plist>
`);
}
export async function writeCraftedMacCalibrationFixtures(dir: string): Promise<CalibrationManifest> {
    await mkdir(dir, { recursive: true });
    const files: Array<{
        name: string;
        buf: Buffer;
        mustDetect: string[];
    }> = [
        { name: 'crafted-macho32-x86', buf: machO32(7, false), mustDetect: ['mach-o'] },
        { name: 'crafted-macho32-pie', buf: machO32(7, true), mustDetect: ['mach-o', 'mach-o-pie'] },
        { name: 'crafted-pef-pwpc', buf: pef('pwpc'), mustDetect: ['pef-cfm'] },
        { name: 'crafted-appledouble-finder', buf: appleDoubleFinder(), mustDetect: ['appledouble'] },
        { name: 'crafted-macbinary', buf: macBinaryII(), mustDetect: ['macbinary'] },
        { name: 'crafted-binhex', buf: binHexBanner(), mustDetect: ['binhex'] },
        { name: 'crafted-hfsplus', buf: hfsPlusStub(), mustDetect: ['hfs-volume'] },
        { name: 'Info.plist', buf: infoPlist(), mustDetect: ['info-plist'] },
    ];
    for (const f of files)
        await writeFile(path.join(dir, f.name), f.buf);
    return {
        schemaVersion: '1.0',
        name: 'mac-crafted-o-step2',
        description: 'Crafted classic Mac / early macOS fixtures for format detectors (Patch O step 2).',
        reviewedAt: new Date().toISOString().slice(0, 10),
        expectations: files.map(f => ({
            id: f.name,
            file: f.name,
            sha256: sha256(f.buf),
            source: 'Reverse crafted fixture',
            license: 'CC0-1.0',
            mustDetect: f.mustDetect,
        })),
    };
}
/**
 * Score Mac detectors against a calibration manifest.
 * mustDetect matches structuralDetectors[].name or format string.
 */
export async function runMacCalibration(manifestPath: string, options: {
    authorization?: LegacyAuthorization | null;
    sessionId?: string;
}): Promise<CalibrationReport> {
    const auth = await requireLegacyGate({
        authorization: options.authorization,
        sessionId: options.sessionId,
        operation: 'run_mac_calibration',
    });
    const raw = await loadCalibrationManifest(manifestPath);
    const baseDir = path.dirname(path.resolve(manifestPath));
    const failures: string[] = [];
    const limitations: string[] = [
        'Mac calibration uses crafted fixtures; operator corpora are hash-manifest only.',
        'Precision/recall are per detector-name substring match; corpus is not representative.',
    ];
    type Event = {
        detector: string;
        expected: boolean;
        fired: boolean;
        confidence: number;
    };
    const events: Event[] = [];
    let evaluated = 0;
    let skipped = 0;
    for (const exp of raw.expectations) {
        const file = path.isAbsolute(exp.file) ? exp.file : path.join(baseDir, exp.file);
        try {
            await stat(file);
        }
        catch {
            skipped++;
            failures.push(`${exp.id}: fixture missing`);
            continue;
        }
        const buf = await readFile(file);
        if (sha256(buf) !== exp.sha256.toLowerCase()) {
            skipped++;
            failures.push(`${exp.id}: sha256 mismatch`);
            continue;
        }
        const result = await analyzeLegacyMac(file, auth);
        const finding = result.findings[0];
        evaluated++;
        const labels = new Set<string>([
            finding.format,
            ...finding.structuralDetectors.map(d => d.name),
        ]);
        const confBy = new Map(finding.structuralDetectors.map(d => [d.name, d.confidence]));
        confBy.set(finding.format, finding.format === 'unknown' ? 0.2 : 0.9);
        for (const name of exp.mustDetect ?? []) {
            const fired = [...labels].some(l => l.toLowerCase().includes(name.toLowerCase()));
            events.push({
                detector: name,
                expected: true,
                fired,
                confidence: confBy.get(name) ?? (fired ? 0.8 : 0),
            });
            if (!fired)
                failures.push(`${exp.id}: expected detector "${name}" did not fire`);
        }
        for (const name of exp.mustNotDetect ?? []) {
            const fired = [...labels].some(l => l.toLowerCase().includes(name.toLowerCase()));
            events.push({
                detector: name,
                expected: false,
                fired,
                confidence: confBy.get(name) ?? 0,
            });
            if (fired)
                failures.push(`${exp.id}: detector "${name}" fired unexpectedly`);
        }
    }
    const byDet = new Map<string, Event[]>();
    for (const e of events) {
        const list = byDet.get(e.detector) ?? [];
        list.push(e);
        byDet.set(e.detector, list);
    }
    const scores: DetectorScore[] = [];
    for (const [detector, list] of byDet) {
        let tp = 0, fp = 0, fn = 0;
        const tpConf: number[] = [];
        for (const e of list) {
            if (e.expected && e.fired) {
                tp++;
                tpConf.push(e.confidence);
            }
            else if (!e.expected && e.fired)
                fp++;
            else if (e.expected && !e.fired)
                fn++;
        }
        scores.push({
            detector,
            truePositives: tp,
            falsePositives: fp,
            falseNegatives: fn,
            precision: tp + fp > 0 ? tp / (tp + fp) : null,
            recall: tp + fn > 0 ? tp / (tp + fn) : null,
            meanConfidenceOnTp: tpConf.length ? tpConf.reduce((a, b) => a + b, 0) / tpConf.length : null,
            brierScore: null,
            expectedCalibrationError: null,
            calibrationBins: [],
            sampleSize: list.length,
        });
    }
    return {
        authorization: auth,
        manifestName: raw.name,
        fixtureCount: raw.expectations.length,
        evaluated,
        skipped,
        scores,
        failures,
        limitations,
    };
}
export type { CalibrationManifest, CalibrationExpectation, CalibrationReport };
