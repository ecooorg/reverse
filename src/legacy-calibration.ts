/**
 * Ground-truth manifest and calibration harness (Patch M step 2).
 * Reports precision, recall and confidence calibration per detector.
 * Corpus: crafted fixtures + operator-supplied local samples via hash manifest only.
 * Nothing is bundled or uploaded (H-06, H-08).
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { analyzeLegacyWindows } from './legacy-windows.js';
import { requireLegacyGate } from './legacy-gate.js';
import type { LegacyAuthorization } from './legacy-types.js';
/** Expected labels for one fixture (ground truth). */
export interface CalibrationExpectation {
    /** Stable fixture id. */
    id: string;
    /** Path relative to the manifest file, or absolute. */
    file: string;
    /** Expected format label from the detector. */
    format?: 'DOS MZ' | 'Windows NE' | 'Windows LE' | 'Windows LX' | 'Windows PE' | 'unknown';
    /** Expected bitness when known. */
    bitness?: number | null;
    /** Detector names that must fire (structuralDetectors / toolchainMarkers). */
    mustDetect?: string[];
    /** Detector names that must not fire. */
    mustNotDetect?: string[];
    /** Required SHA-256 of the referenced fixture; the harness verifies it before analysis. */
    sha256: string;
    /** Required source/origin note (including for project-generated fixtures). */
    source: string;
    /** Required license or consent basis for the referenced fixture. */
    license: string;
}
export interface CalibrationManifest {
    schemaVersion: '1.0';
    name: string;
    description: string;
    /** ISO date the manifest was last reviewed. */
    reviewedAt: string;
    expectations: CalibrationExpectation[];
}
export interface DetectorScore {
    detector: string;
    truePositives: number;
    falsePositives: number;
    falseNegatives: number;
    precision: number | null;
    recall: number | null;
    /** Mean confidence on true positives; null if none. */
    meanConfidenceOnTp: number | null;
    brierScore: number | null;
    expectedCalibrationError: number | null;
    calibrationBins: Array<{
        count: number;
        meanConfidence: number;
        observedPositiveRate: number;
    }>;
    sampleSize: number;
}
export interface CalibrationReport {
    authorization: LegacyAuthorization;
    manifestName: string;
    fixtureCount: number;
    evaluated: number;
    skipped: number;
    scores: DetectorScore[];
    failures: string[];
    limitations: string[];
}

/** Load and lightly validate a calibration manifest. */
export async function loadCalibrationManifest(manifestPath: string): Promise<CalibrationManifest> {
    const raw = JSON.parse(await readFile(manifestPath, 'utf8')) as CalibrationManifest;
    if (raw.schemaVersion !== '1.0')
        throw new Error('calibration manifest schemaVersion must be "1.0"');
    if (typeof raw.name !== 'string' || !raw.name.trim() ||
        typeof raw.description !== 'string' || !raw.description.trim() ||
        typeof raw.reviewedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.reviewedAt) ||
        !Array.isArray(raw.expectations)) {
        throw new Error('calibration manifest requires name, description, reviewedAt and expectations[]');
    }
    const baseDir = path.dirname(path.resolve(manifestPath));
    const ids = new Set<string>();
    const allowed = new Set([
        'id', 'file', 'format', 'bitness', 'mustDetect', 'mustNotDetect',
        'sha256', 'source', 'license'
    ]);
    for (const exp of raw.expectations) {
        if (!exp || typeof exp !== 'object' || Array.isArray(exp) ||
            typeof exp.id !== 'string' || !exp.id.trim() ||
            typeof exp.file !== 'string' || !exp.file.trim()) {
            throw new Error('calibration expectations require non-empty string id and file');
        }
        if (ids.has(exp.id))
            throw new Error(`duplicate calibration expectation id: ${exp.id}`);
        ids.add(exp.id);
        for (const key of Object.keys(exp)) {
            if (!allowed.has(key))
                throw new Error(
                    `calibration expectation "${exp.id}" contains unsupported field "${key}"; ` +
                    'manifests reference files and never embed binaries'
                );
        }
        if (typeof exp.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(exp.sha256))
            throw new Error(`calibration expectation "${exp.id}" requires a valid SHA-256`);
        if (typeof exp.source !== 'string' || !exp.source.trim() ||
            typeof exp.license !== 'string' || !exp.license.trim()) {
            throw new Error(`calibration entry "${exp.id}" requires source and license`);
        }
        if (!path.isAbsolute(exp.file)) {
            const resolved = path.resolve(baseDir, exp.file);
            if (resolved !== baseDir && !resolved.startsWith(`${baseDir}${path.sep}`))
                throw new Error(`calibration expectation "${exp.id}" escapes the manifest directory`);
        }
        for (const field of ['mustDetect', 'mustNotDetect'] as const) {
            const values = exp[field];
            if (values !== undefined && (!Array.isArray(values) || values.some(v => typeof v !== 'string'))) {
                throw new Error(`calibration expectation "${exp.id}" ${field} must be a string array`);
            }
        }
    }
    return raw;
}
/**
 * Run detectors against every fixture in the manifest and score them.
 * Operator corpus entries are resolved relative to the manifest directory.
 */
export async function runCalibration(manifestPath: string, options: {
    authorization?: LegacyAuthorization | null;
    sessionId?: string;
}): Promise<CalibrationReport> {
    const auth = await requireLegacyGate({
        authorization: options.authorization,
        sessionId: options.sessionId,
        operation: 'run_windows_calibration'
    });
    const manifest = await loadCalibrationManifest(manifestPath);
    const baseDir = path.dirname(path.resolve(manifestPath));
    const failures: string[] = [];
    const limitations: string[] = [
        'Confidence values and calibration errors are descriptive only; tiny crafted corpora are not statistically representative;',
        'precision/recall are reported per detector name match (substring).',
        'No third-party binaries are bundled; operator samples use hash manifests only.'
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
    for (const exp of manifest.expectations) {
        const file = path.isAbsolute(exp.file)
            ? exp.file
            : path.join(baseDir, exp.file);
        try {
            await stat(file);
        }
        catch {
            skipped++;
            failures.push(`${exp.id}: fixture missing at ${file}`);
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
        const result = await analyzeLegacyWindows(file, auth);
        const finding = result.findings[0];
        evaluated++;
        if (exp.format !== undefined && finding.format !== exp.format) {
            failures.push(`${exp.id}: format expected ${exp.format}, got ${finding.format}`);
        }
        if (exp.bitness !== undefined && finding.bitness !== exp.bitness) {
            failures.push(`${exp.id}: bitness expected ${exp.bitness}, got ${finding.bitness}`);
        }
        const firedNames = [
            ...finding.structuralDetectors.map(d => d.name),
            ...finding.toolchainMarkers
        ];
        const confByName = new Map<string, number>();
        for (const d of finding.structuralDetectors)
            confByName.set(d.name, d.confidence);
        for (const name of exp.mustDetect ?? []) {
            const hit = firedNames.some(n => n.includes(name) || name.includes(n));
            events.push({
                detector: name,
                expected: true,
                fired: hit,
                confidence: hit ? (confByName.get(firedNames.find(n => n.includes(name) || name.includes(n)) ?? '') ?? 0.5) : 0
            });
            if (!hit)
                failures.push(`${exp.id}: expected detector "${name}" did not fire`);
        }
        for (const name of exp.mustNotDetect ?? []) {
            const hit = firedNames.some(n => n.includes(name) || name.includes(n));
            events.push({
                detector: name,
                expected: false,
                fired: hit,
                confidence: hit ? (confByName.get(firedNames.find(n => n.includes(name) || name.includes(n)) ?? '') ?? 0.5) : 0
            });
            if (hit)
                failures.push(`${exp.id}: detector "${name}" fired unexpectedly`);
        }
    }
    const byDetector = new Map<string, Event[]>();
    for (const e of events) {
        const list = byDetector.get(e.detector) ?? [];
        list.push(e);
        byDetector.set(e.detector, list);
    }
    const scores: DetectorScore[] = [];
    for (const [detector, list] of [...byDetector.entries()].sort()) {
        let tp = 0, fp = 0, fn = 0;
        const tpConf: number[] = [];
        for (const e of list) {
            if (e.expected && e.fired) {
                tp++;
                tpConf.push(e.confidence);
            }
            else if (e.expected && !e.fired)
                fn++;
            else if (!e.expected && e.fired)
                fp++;
        }
        const precision = tp + fp > 0 ? tp / (tp + fp) : null;
        const recall = tp + fn > 0 ? tp / (tp + fn) : null;
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
            precision,
            recall,
            meanConfidenceOnTp: tpConf.length
                ? tpConf.reduce((a, b) => a + b, 0) / tpConf.length
                : null,
            brierScore,
            expectedCalibrationError,
            calibrationBins: bins,
            sampleSize: list.length
        });
    }
    return {
        authorization: auth,
        manifestName: manifest.name,
        fixtureCount: manifest.expectations.length,
        evaluated,
        skipped,
        scores,
        failures,
        limitations
    };
}
/**
 * Build a minimal in-memory crafted-fixture set and write files under dir.
 * Returns a CalibrationManifest ready to save next to the fixtures.
 */
export async function writeCraftedCalibrationFixtures(dir: string): Promise<CalibrationManifest> {
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir(dir, { recursive: true });
    // NE 16-bit
    const ne = Buffer.alloc(256);
    ne.write('MZ', 0, 'ascii');
    ne.writeUInt32LE(128, 0x3c);
    ne.write('NE', 128, 'ascii');
    await writeFile(path.join(dir, 'crafted-ne.exe'), ne);
    // PE console x86
    const pe = Buffer.alloc(256);
    const peOff = 128;
    pe.write('MZ', 0, 'ascii');
    pe.writeUInt32LE(peOff, 0x3c);
    pe.write('PE\u0000\u0000', peOff, 'ascii');
    pe.writeUInt16LE(0x14c, peOff + 4);
    pe.writeUInt16LE(224, peOff + 20);
    pe.writeUInt16LE(0x10b, peOff + 24);
    pe.writeUInt16LE(3, peOff + 24 + 68);
    await writeFile(path.join(dir, 'crafted-pe-console.exe'), pe);
    // Delphi markers in MZ shell
    const delphi = Buffer.alloc(256);
    delphi.write('MZ', 0, 'ascii');
    delphi.write('TPF0 TForm TApplication TComponent TControl', 64, 'ascii');
    await writeFile(path.join(dir, 'crafted-delphi.exe'), delphi);
    // VB6 string markers
    const vb = Buffer.alloc(256);
    vb.write('MZ', 0, 'ascii');
    vb.write('MSVBVM60 ThunRTMain Visual Basic 6', 64, 'ascii');
    await writeFile(path.join(dir, 'crafted-vb6.exe'), vb);
    return {
        schemaVersion: '1.0',
        name: 'crafted-windows-detectors',
        description: 'Crafted headers and string markers for baseline/VB6/MFC/PE/NE detectors.',
        reviewedAt: new Date().toISOString().slice(0, 10),
        expectations: [
            {
                id: 'crafted-ne-16',
                file: 'crafted-ne.exe',
                source: 'Reverse crafted fixture',
                license: 'CC0-1.0',
                sha256: createHash('sha256').update(ne).digest('hex'),
                format: 'Windows NE',
                bitness: 16
            },
            {
                id: 'crafted-pe-console',
                file: 'crafted-pe-console.exe',
                source: 'Reverse crafted fixture',
                license: 'CC0-1.0',
                sha256: createHash('sha256').update(pe).digest('hex'),
                format: 'Windows PE',
                bitness: 32
            },
            {
                id: 'crafted-delphi-markers',
                file: 'crafted-delphi.exe',
                source: 'Reverse crafted fixture',
                license: 'CC0-1.0',
                sha256: createHash('sha256').update(delphi).digest('hex'),
                format: 'DOS MZ',
                mustDetect: ['form stream', 'RTTI-style']
            },
            {
                id: 'crafted-vb6-markers',
                file: 'crafted-vb6.exe',
                source: 'Reverse crafted fixture',
                license: 'CC0-1.0',
                sha256: createHash('sha256').update(vb).digest('hex'),
                format: 'DOS MZ',
                mustDetect: ['Visual Basic']
            }
        ]
    };
}
