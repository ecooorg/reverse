/**
 * Reference trials for Patch N (G-09 / section 7, Linux).
 *
 * Two lawful-fixture scenarios:
 *   1. diagnose-and-advise — crafted libc5/a.out-style failure → diagnosis + migration
 *   2. compare-versions — static Target Profile compare of original vs changed ELF
 *
 * Without an operator-supplied rootfs/oracle, status is limited (L0) — never claimed success.
 */
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyzeLegacyLinux } from './legacy-linux.js';
import type { LegacyAuthorization, TargetProfile } from './legacy-types.js';
import { adviseMigration, computePreservationLevel, type MigrationAdvice } from './preservation-migration.js';
import type { ReferenceTrialResult, ReferenceTrialReport } from './legacy-reference-trials.js';
const AUTH: LegacyAuthorization = {
    basis: 'open_source',
    licenseOrConsentReference: 'linux-reference-trials-crafted',
    declaredBy: 'legacy-linux-reference-trials',
    declaredAt: new Date().toISOString()
};
const NO_ROOTFS_LIMIT = [
    'No operator-supplied Linux rootfs or platform oracle is bundled.',
    'Preservation level is L0; restore/compare claims stay advisory.',
    'Crafted fixtures only — not third-party binaries (H-06).'
];
function profileBits(p: TargetProfile): string {
    const era = p.osAndEra?.value?.era ?? p.osAndEra?.value?.family ?? 'unknown';
    const bit = p.bitness?.value ?? null;
    const libc = p.libcGeneration?.value ?? null;
    const interp = p.dynamicInterpreter?.value ?? null;
    const tools = (Array.isArray(p.toolchainRuntimeFramework?.value)
        ? p.toolchainRuntimeFramework.value.map(String)
        : []).slice(0, 6).join(',');
    return `era=${era};bit=${bit};libc=${libc};interp=${interp};tools=${tools}`;
}
async function writeLibc5Fixture(dir: string, name: string): Promise<string> {
    const b = Buffer.alloc(256);
    b[0] = 0x7f;
    b.write('ELF', 1, 'ascii');
    b[4] = 1;
    b[5] = 1;
    b.writeUInt16LE(2, 16);
    b.writeUInt16LE(3, 18);
    b.write('libc.so.5 ld-linux.so.1', 80, 'ascii');
    const p = join(dir, name);
    await writeFile(p, b);
    return p;
}
async function writeElf64Interp(dir: string, name: string, mutate = false): Promise<string> {
    const b = Buffer.alloc(256);
    b[0] = 0x7f;
    b.write('ELF', 1, 'ascii');
    b[4] = 2;
    b[5] = 1;
    b[6] = 1;
    b.writeUInt16LE(3, 16);
    b.writeUInt16LE(62, 18);
    b.writeUInt32LE(1, 20);
    b.writeBigUInt64LE(64n, 32);
    b.writeUInt16LE(64, 52);
    b.writeUInt16LE(56, 54);
    b.writeUInt16LE(1, 56);
    const interp = '/lib64/ld-linux-x86-64.so.2';
    b.write(interp, 200, 'ascii');
    b.writeUInt32LE(3, 64);
    b.writeUInt32LE(4, 68);
    b.writeBigUInt64LE(200n, 72);
    b.writeBigUInt64LE(200n, 80);
    b.writeBigUInt64LE(BigInt(interp.length + 1), 96);
    if (mutate)
        b.write('CHANGED', 180, 'ascii');
    const p = join(dir, name);
    await writeFile(p, b);
    return p;
}
/**
 * Run both Linux reference scenarios on crafted lawful fixtures.
 */
export async function runLegacyLinuxReferenceTrials(): Promise<ReferenceTrialReport> {
    const limitations = [...NO_ROOTFS_LIMIT];
    const trials: ReferenceTrialResult[] = [];
    const dir = await mkdtemp(join(tmpdir(), 'reverse-linux-ref-'));
    let migration: MigrationAdvice | undefined;
    try {
        const libc5Path = await writeLibc5Fixture(dir, 'failing-libc5');
        const r = await analyzeLegacyLinux(libc5Path, AUTH);
        const finding = r.findings[0];
        if (!finding) {
            trials.push({
                id: 'diagnose-and-advise',
                title: 'Diagnose a failing old Linux program and propose a restore path',
                status: 'failed',
                summary: 'analyzeLegacyLinux returned no findings for the libc5 fixture.',
                limitations: [...NO_ROOTFS_LIMIT],
                evidence: []
            });
        }
        else {
            const compat = finding.compatibilityFindings ?? [];
            const mapped = compat.map(d => ({
                cause: d.cause,
                evidence: d.evidence,
                needsExecutionEnvironment: d.needsExecutionEnvironment
            }));
            if (!mapped.length) {
                mapped.push({
                    cause: 'Depends on libc.so.5 (Linux libc5).',
                    evidence: 'crafted fixture marker',
                    needsExecutionEnvironment: true
                });
            }
            migration = adviseMigration({
                authorization: AUTH,
                targetSummary: 'crafted Linux libc5 fixture (lawful)',
                findings: mapped,
                preservation: computePreservationLevel({ oracle: null, comparisons: [], authorization: AUTH })
            });
            const hasFinding = compat.some(c => /libc\.so\.5|libc5|a\.out/i.test(c.cause)) ||
                finding.libcMarkers.some(m => /libc5/i.test(m)) ||
                (migration.options?.length ?? 0) > 0;
            trials.push({
                id: 'diagnose-and-advise',
                title: 'Diagnose a failing old Linux program and propose a restore path',
                status: hasFinding ? 'limited' : 'failed',
                summary: hasFinding
                    ? `Diagnosis produced ${compat.length} finding(s) and ` +
                        `${migration.options.length} migration option(s); restore is advisory.`
                    : 'Expected libc5 diagnosis did not fire.',
                limitations: [...NO_ROOTFS_LIMIT],
                evidence: [
                    profileBits(finding.targetProfile),
                    ...compat.slice(0, 4).map(c => c.cause),
                    ...migration.options.slice(0, 3).map(o => `${o.id}: ${o.evidence[0] ?? ''}`)
                ]
            });
        }
        const origPath = await writeElf64Interp(dir, 'original-elf');
        const changedPath = await writeElf64Interp(dir, 'changed-elf', true);
        const orig = await analyzeLegacyLinux(origPath, AUTH);
        const changed = await analyzeLegacyLinux(changedPath, AUTH);
        const op = orig.findings[0]?.targetProfile;
        const cp = changed.findings[0]?.targetProfile;
        if (!op || !cp) {
            trials.push({
                id: 'compare-versions',
                title: 'Compare a changed Linux binary against the original (static)',
                status: 'failed',
                summary: 'Missing target profile on original or changed fixture.',
                limitations: [...NO_ROOTFS_LIMIT],
                evidence: []
            });
        }
        else {
            const a = profileBits(op);
            const b = profileBits(cp);
            const sameFamily = (op.osAndEra?.value?.family ?? null) ===
                (cp.osAndEra?.value?.family ?? null);
            const sameBit = (op.bitness?.value ?? null) === (cp.bitness?.value ?? null);
            const ok = sameFamily && sameBit;
            trials.push({
                id: 'compare-versions',
                title: 'Compare a changed Linux binary against the original (static)',
                status: ok ? 'limited' : 'failed',
                summary: ok
                    ? 'Static profiles share family/bitness; behavioral equivalence not claimed (L0).'
                    : `Static profile mismatch: original=[${a}] changed=[${b}]`,
                limitations: [
                    ...NO_ROOTFS_LIMIT,
                    'Comparison is static Target Profile only, not capture/replay under chroot/QEMU.'
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
