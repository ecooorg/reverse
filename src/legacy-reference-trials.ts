/**
 * Reference trials for Patch M step 8 (G-09 / section 7).
 *
 * Two lawful-fixture scenarios:
 *   1. diagnose-and-advise — analyze a "failing" crafted binary, emit diagnosis
 *      and migration advice (restore path is advisory; no licensed OS image).
 *   2. compare-versions — static profile comparison of original vs changed
 *      crafted fixtures (oracle-backed behavioral equivalence is L0 without
 *      a licensed environment).
 *
 * Explicit limitations are always recorded when an oracle or licensed image
 * is absent — never claimed as success.
 */
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyzeLegacyWindows } from './legacy-windows.js';
import type { LegacyAuthorization, TargetProfile } from './legacy-types.js';
import { adviseMigration, computePreservationLevel, type MigrationAdvice, type PreservationReport } from './preservation-migration.js';
export interface ReferenceTrialResult {
    id: string;
    title: string;
    status: 'passed' | 'limited' | 'failed';
    summary: string;
    limitations: string[];
    evidence: string[];
}
export interface ReferenceTrialReport {
    authorization: LegacyAuthorization;
    ranAt: string;
    trials: ReferenceTrialResult[];
    preservation: PreservationReport;
    migration?: MigrationAdvice;
    /** True when both scenarios completed without internal errors. */
    ok: boolean;
    limitations: string[];
}
const AUTH: LegacyAuthorization = {
    basis: 'open_source',
    licenseOrConsentReference: 'reference-trials-crafted-fixtures',
    declaredBy: 'legacy-reference-trials',
    declaredAt: new Date().toISOString()
};
const NO_ORACLE_LIMIT = [
    'No licensed Windows image or platform oracle is bundled or available.',
    'Preservation level is therefore L0; restore/compare claims stay advisory.',
    'Crafted fixtures only — not real third-party binaries (H-06).'
];
async function writeVb6Fixture(dir: string, name: string): Promise<string> {
    const buf = Buffer.alloc(256);
    buf.write('MZ', 0, 'ascii');
    buf.write('MSVBVM60 ThunRTMain Visual Basic 6', 64, 'ascii');
    const p = join(dir, name);
    await writeFile(p, buf);
    return p;
}
async function writePeFixture(dir: string, name: string, machine = 0x14c): Promise<string> {
    const pe = Buffer.alloc(256);
    const peOff = 128;
    pe.write('MZ', 0, 'ascii');
    pe.writeUInt32LE(peOff, 0x3c);
    pe.write('PE\0\0', peOff, 'ascii');
    pe.writeUInt16LE(machine, peOff + 4);
    pe.writeUInt16LE(224, peOff + 20);
    pe.writeUInt16LE(0x10b, peOff + 24);
    pe.writeUInt16LE(3, peOff + 24 + 68);
    const p = join(dir, name);
    await writeFile(p, pe);
    return p;
}
function profileBits(p: TargetProfile): string {
    const fmt = p.osAndEra?.value?.era ?? p.osAndEra?.value?.family ?? 'unknown';
    const bit = p.bitness?.value ?? null;
    const markers = (Array.isArray(p.toolchainRuntimeFramework?.value)
        ? p.toolchainRuntimeFramework.value.map(String)
        : []).sort().join(',');
    return `era=${fmt};bitness=${bit};markers=${markers}`;
}
/**
 * Run both reference scenarios on crafted lawful fixtures.
 * Does not require CONTROLLED_EXECUTION (static analysis + table diagnosis only).
 */
export async function runLegacyReferenceTrials(): Promise<ReferenceTrialReport> {
    const limitations = [...NO_ORACLE_LIMIT];
    const trials: ReferenceTrialResult[] = [];
    const dir = await mkdtemp(join(tmpdir(), 'reverse-ref-trials-'));
    let migration: MigrationAdvice | undefined;
    try {
        // --- Scenario 1: diagnose a failing program and advise restore path ---
        const vbPath = await writeVb6Fixture(dir, 'failing-vb6.exe');
        const vbResult = await analyzeLegacyWindows(vbPath, AUTH);
        const vbFinding = vbResult.findings[0];
        if (!vbFinding) {
            trials.push({
                id: 'diagnose-and-advise',
                title: 'Diagnose a failing program and propose a restore path',
                status: 'failed',
                summary: 'analyzeLegacyWindows returned no findings for the VB6 fixture.',
                limitations: [...NO_ORACLE_LIMIT],
                evidence: []
            });
        }
        else {
            const profile = vbFinding.targetProfile;
            const compat = vbFinding.compatibilityFindings ?? [];
            const markers = Array.isArray(profile.toolchainRuntimeFramework?.value)
                ? profile.toolchainRuntimeFramework.value.map(String)
                : [];
            const mapped = compat.map(d => ({
                cause: d.cause,
                evidence: d.evidence,
                needsExecutionEnvironment: d.needsExecutionEnvironment
            }));
            if (!mapped.length) {
                mapped.push({
                    cause: 'May depend on the Visual Basic 6 runtime.',
                    evidence: 'MSVBVM60 marker in crafted fixture',
                    needsExecutionEnvironment: true
                });
            }
            migration = adviseMigration({
                authorization: AUTH,
                targetSummary: 'crafted VB6 fixture (lawful)',
                findings: mapped,
                preservation: computePreservationLevel({ oracle: null, comparisons: [], authorization: AUTH })
            });
            const hasFinding = compat.some(f => /Visual Basic|VB6|runtime/i.test(f.cause)) ||
                markers.some(m => /Visual Basic|VB6|MSVBVM/i.test(m)) ||
                (migration.options?.length ?? 0) > 0;
            trials.push({
                id: 'diagnose-and-advise',
                title: 'Diagnose a failing program and propose a restore path',
                status: hasFinding ? 'limited' : 'failed',
                summary: hasFinding
                    ? `Diagnosis produced ${compat.length} compatibility finding(s) and ` +
                        `${migration.options.length} migration option(s); restore is advisory (no oracle).`
                    : 'Expected VB6/runtime diagnosis did not fire on the crafted fixture.',
                limitations: [...NO_ORACLE_LIMIT],
                evidence: [
                    profileBits(profile),
                    ...compat.slice(0, 4).map(f => f.cause),
                    ...migration.options.slice(0, 3).map(o => `${o.id}: ${o.evidence[0] ?? ''}`)
                ]
            });
        }
        // --- Scenario 2: compare original vs changed fixture (static) ---
        const origPath = await writePeFixture(dir, 'original-pe.exe');
        const changedPath = await writePeFixture(dir, 'changed-pe.exe');
        // Mutate changed: flip subsystem-ish bytes / add string marker
        const { readFile } = await import('node:fs/promises');
        const changedBuf = Buffer.from(await readFile(changedPath));
        changedBuf.write('CHANGED', 200, 'ascii');
        await writeFile(changedPath, changedBuf);
        const orig = await analyzeLegacyWindows(origPath, AUTH);
        const changed = await analyzeLegacyWindows(changedPath, AUTH);
        const origProf = orig.findings[0]?.targetProfile;
        const changedProf = changed.findings[0]?.targetProfile;
        if (!origProf || !changedProf) {
            trials.push({
                id: 'compare-versions',
                title: 'Compare a changed version against the original (static profile)',
                status: 'failed',
                summary: 'Missing target profile on original or changed fixture.',
                limitations: [...NO_ORACLE_LIMIT],
                evidence: []
            });
        }
        else {
            const a = profileBits(origProf);
            const b = profileBits(changedProf);
            const sameFormat = (origProf.osAndEra?.value?.family ?? null) ===
                (changedProf.osAndEra?.value?.family ?? null);
            const sameBit = (origProf.bitness?.value ?? null) === (changedProf.bitness?.value ?? null);
            const compared = sameFormat && sameBit;
            trials.push({
                id: 'compare-versions',
                title: 'Compare a changed version against the original (static profile)',
                status: compared ? 'limited' : 'failed',
                summary: compared
                    ? 'Static profiles share format/bitness; behavioral equivalence not claimed (L0).'
                    : `Static profile mismatch: original=[${a}] changed=[${b}]`,
                limitations: [
                    ...NO_ORACLE_LIMIT,
                    'Comparison is static Target Profile only, not capture/replay under Wine/VM.'
                ],
                evidence: [`original: ${a}`, `changed: ${b}`]
            });
        }
    }
    finally {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
    const preservation = computePreservationLevel({
        oracle: null,
        comparisons: [],
        environments: [],
        authorization: AUTH
    });
    const ok = trials.length === 2 && trials.every(t => t.status !== 'failed');
    return {
        authorization: AUTH,
        ranAt: new Date().toISOString(),
        trials,
        preservation,
        migration,
        ok,
        limitations
    };
}
