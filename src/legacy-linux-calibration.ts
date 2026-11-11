/**
 * Linux calibration harness (Patch N step 2).
 * Crafted a.out/ELF fixtures + optional operator hash manifest.
 * Reuses the calibration report shape from the Windows harness.
 */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { analyzeLegacyLinux } from './legacy-linux.js';
import { requireLegacyGate } from './legacy-gate.js';
import { loadCalibrationManifest } from './legacy-calibration.js';
import type { LegacyAuthorization } from './legacy-types.js';
import type { CalibrationExpectation, CalibrationManifest, CalibrationReport, DetectorScore } from './legacy-calibration.js';
export async function writeCraftedLinuxCalibrationFixtures(dir: string): Promise<CalibrationManifest> {
    await mkdir(dir, { recursive: true });
    // a.out ZMAGIC
    const aout = Buffer.alloc(64);
    aout.writeUInt32LE(0x0000010b, 0);
    await writeFile(path.join(dir, 'crafted-aout-zmagic'), aout);
    // ELF64 LE ET_DYN with PT_INTERP
    const elf64 = Buffer.alloc(256);
    elf64[0] = 0x7f;
    elf64.write('ELF', 1, 'ascii');
    elf64[4] = 2;
    elf64[5] = 1;
    elf64[6] = 1;
    elf64.writeUInt16LE(3, 16);
    elf64.writeUInt16LE(62, 18);
    elf64.writeUInt32LE(1, 20);
    elf64.writeBigUInt64LE(64n, 32);
    elf64.writeUInt16LE(64, 52);
    elf64.writeUInt16LE(56, 54);
    elf64.writeUInt16LE(1, 56);
    const interp64 = '/lib64/ld-linux-x86-64.so.2';
    elf64.write(interp64, 200, 'ascii');
    elf64.writeUInt32LE(3, 64);
    elf64.writeUInt32LE(4, 68);
    elf64.writeBigUInt64LE(200n, 72);
    elf64.writeBigUInt64LE(200n, 80);
    elf64.writeBigUInt64LE(BigInt(interp64.length + 1), 96);
    await writeFile(path.join(dir, 'crafted-elf64-pie'), elf64);
    // ELF32 with glibc/libstdc++ string markers
    const elf32 = Buffer.alloc(512);
    elf32[0] = 0x7f;
    elf32.write('ELF', 1, 'ascii');
    elf32[4] = 1;
    elf32[5] = 1;
    elf32[6] = 1;
    elf32.writeUInt16LE(2, 16);
    elf32.writeUInt16LE(3, 18);
    elf32.write('libc.so.6 libstdc++.so.6 GLIBC_2.3 GLIBCXX_3.4', 100, 'ascii');
    await writeFile(path.join(dir, 'crafted-elf32-glibc-markers'), elf32);
    // ELF-looking buffer with libc.so.5 marker
    const libc5 = Buffer.alloc(256);
    libc5[0] = 0x7f;
    libc5.write('ELF', 1, 'ascii');
    libc5[4] = 1;
    libc5[5] = 1;
    libc5.writeUInt16LE(2, 16);
    libc5.writeUInt16LE(3, 18);
    libc5.write('libc.so.5 ld-linux.so.1', 80, 'ascii');
    await writeFile(path.join(dir, 'crafted-elf32-libc5-markers'), libc5);
    return {
        schemaVersion: '1.0',
        name: 'crafted-linux-detectors',
        description: 'Crafted a.out/ELF fixtures for Linux format and libc markers.',
        reviewedAt: new Date().toISOString().slice(0, 10),
        expectations: [
            {
                id: 'crafted-aout-zmagic',
                file: 'crafted-aout-zmagic',
                sha256: createHash('sha256').update(aout).digest('hex'),
                source: 'Reverse crafted fixture',
                license: 'CC0-1.0',
                mustDetect: ['a.out']
            },
            {
                id: 'crafted-elf64-pie',
                file: 'crafted-elf64-pie',
                sha256: createHash('sha256').update(elf64).digest('hex'),
                source: 'Reverse crafted fixture',
                license: 'CC0-1.0',
                mustDetect: ['ELF', 'ld-linux']
            },
            {
                id: 'crafted-elf32-glibc',
                file: 'crafted-elf32-glibc-markers',
                sha256: createHash('sha256').update(elf32).digest('hex'),
                source: 'Reverse crafted fixture',
                license: 'CC0-1.0',
                mustDetect: ['ELF', 'glibc', 'libstdc']
            },
            {
                id: 'crafted-elf32-libc5',
                file: 'crafted-elf32-libc5-markers',
                sha256: createHash('sha256').update(libc5).digest('hex'),
                source: 'Reverse crafted fixture',
                license: 'CC0-1.0',
                mustDetect: ['ELF', 'libc5']
            }
        ]
    };
}
/**
 * Score Linux detectors against a calibration manifest.
 * mustDetect strings match against format + markers + interpreter + tools.
 */
export async function runLinuxCalibration(manifestPath: string, options: {
    authorization?: LegacyAuthorization | null;
    sessionId?: string;
}): Promise<CalibrationReport> {
    const auth = await requireLegacyGate({
        authorization: options.authorization,
        sessionId: options.sessionId,
        operation: 'run_linux_calibration'
    });
    const raw = await loadCalibrationManifest(manifestPath);
    const baseDir = path.dirname(path.resolve(manifestPath));
    const failures: string[] = [];
    const limitations: string[] = [
        'Linux calibration uses crafted fixtures; operator corpora are hash-manifest only.',
        'Brier score and five-bin expected calibration error are descriptive on this small corpus, not proof of calibrated confidence.',
        'Detector match is substring-based on format/markers/interpreter labels.'
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
        const file = path.isAbsolute(exp.file)
            ? exp.file
            : path.join(baseDir, exp.file);
        try {
            await stat(file);
        }
        catch {
            skipped++;
            failures.push(`${exp.id}: fixture missing`);
            continue;
        }
        if (exp.sha256) {
            const buf = await readFile(file);
            const hash = createHash('sha256').update(buf).digest('hex');
            if (hash !== exp.sha256.toLowerCase()) {
                skipped++;
                failures.push(`${exp.id}: sha256 mismatch`);
                continue;
            }
        }
        const r = await analyzeLegacyLinux(file, auth);
        const f = r.findings[0];
        if (!f) {
            skipped++;
            failures.push(`${exp.id}: no findings`);
            continue;
        }
        evaluated++;
        const labels = [
            f.format,
            f.architecture,
            f.interpreter ?? '',
            ...f.libcMarkers,
            ...f.compilerMarkers,
            ...f.targetProfile.toolchainRuntimeFramework.value
        ].join(' | ');
        for (const det of exp.mustDetect ?? []) {
            const fired = labels.toLowerCase().includes(det.toLowerCase()) ||
                f.format.toLowerCase().includes(det.toLowerCase());
            events.push({
                detector: det,
                expected: true,
                fired,
                confidence: fired ? 0.8 : 0
            });
            if (!fired)
                failures.push(`${exp.id}: expected detector "${det}" did not fire`);
        }
        for (const det of exp.mustNotDetect ?? []) {
            const fired = labels.toLowerCase().includes(det.toLowerCase());
            events.push({
                detector: det,
                expected: false,
                fired,
                confidence: 0.8
            });
            if (fired)
                failures.push(`${exp.id}: forbidden detector "${det}" fired`);
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
        let tp = 0;
        let fp = 0;
        let fn = 0;
        let confSum = 0;
        let confN = 0;
        for (const e of list) {
            if (e.expected && e.fired) {
                tp++;
                confSum += e.confidence;
                confN++;
            }
            else if (e.expected && !e.fired)
                fn++;
            else if (!e.expected && e.fired)
                fp++;
        }
        const brierScore = list.length
            ? list.reduce((sum, e) => sum + (e.confidence - (e.expected ? 1 : 0)) ** 2, 0) / list.length
            : null;
        const bins = Array.from({ length: 5 }, (_, index) => {
            const members = list.filter(e => Math.min(4, Math.floor(e.confidence * 5)) === index);
            if (!members.length)
                return null;
            return {
                count: members.length,
                meanConfidence: members.reduce((sum, e) => sum + e.confidence, 0) / members.length,
                observedPositiveRate: members.filter(e => e.fired).length / members.length
            };
        }).filter((bin): bin is NonNullable<typeof bin> => bin !== null);
        const expectedCalibrationError = list.length
            ? bins.reduce((sum, bin) => sum + bin.count / list.length *
                Math.abs(bin.meanConfidence - bin.observedPositiveRate), 0)
            : null;
        scores.push({
            detector,
            truePositives: tp,
            falsePositives: fp,
            falseNegatives: fn,
            precision: tp + fp > 0 ? tp / (tp + fp) : null,
            recall: tp + fn > 0 ? tp / (tp + fn) : null,
            meanConfidenceOnTp: confN > 0 ? confSum / confN : null,
            brierScore,
            expectedCalibrationError,
            calibrationBins: bins,
            sampleSize: list.length
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
        limitations
    };
}
// Re-export type for convenience
export type { CalibrationManifest, CalibrationExpectation, CalibrationReport };
