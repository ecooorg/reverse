/**
 * Reference trials for Patch O (G-09 / section 7, Mac).
 * Two lawful crafted-fixture scenarios. No Apple ROM/image is bundled;
 * preservation stays L0 without operator media.
 */
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyzeLegacyMac } from './legacy-mac.js';
import type { LegacyAuthorization, TargetProfile } from './legacy-types.js';
import type { ReferenceTrialResult, ReferenceTrialReport } from './legacy-reference-trials.js';
import { computePreservationLevel } from './preservation-migration.js';
const AUTH: LegacyAuthorization = {
    basis: 'open_source',
    licenseOrConsentReference: 'mac-reference-trials-crafted',
    declaredBy: 'legacy-mac-reference-trials',
    declaredAt: new Date().toISOString(),
};
const LIMITS = [
    'No Apple ROM or licensed Mac OS image is bundled.',
    'Preservation level is L0 without operator-supplied media.',
    'Crafted fixtures only — not third-party binaries (H-06).',
];
function profileBits(p: TargetProfile): string {
    return `codeModel=${p.codeModel?.value ?? 'unknown'};endian=${p.endianness?.value ?? null};bit=${p.bitness?.value ?? null}`;
}
function machO32(pie = false): Buffer {
    const b = Buffer.alloc(28);
    b.writeUInt32LE(0xfeedface, 0);
    b.writeUInt32LE(7, 4);
    b.writeUInt32LE(0, 8);
    b.writeUInt32LE(2, 12);
    b.writeUInt32LE(0, 16);
    b.writeUInt32LE(0, 20);
    b.writeUInt32LE(pie ? 0x200000 : 0, 24);
    return b;
}
function pefPwpc(): Buffer {
    const b = Buffer.alloc(40 + 28 + 16);
    b.writeUInt32BE(0x4a6f7921, 0);
    b.write('pwpc', 4);
    b.writeUInt16BE(1, 32);
    b.write('InterfaceLib', 40 + 28);
    return b;
}
export async function runLegacyMacReferenceTrials(): Promise<ReferenceTrialReport> {
    const limitations = [...LIMITS];
    const trials: ReferenceTrialResult[] = [];
    const dir = await mkdtemp(join(tmpdir(), 'reverse-mac-ref-'));
    try {
        const machoPath = join(dir, 'a.out');
        const pefPath = join(dir, 'app.pef');
        await writeFile(machoPath, machO32(false));
        await writeFile(pefPath, pefPwpc());
        const macho = await analyzeLegacyMac(machoPath, AUTH);
        const pef = await analyzeLegacyMac(pefPath, AUTH);
        const mf = macho.findings[0];
        const pf = pef.findings[0];
        if (!mf || !pf) {
            trials.push({
                id: 'mac-diagnose-formats',
                title: 'Diagnose crafted Mach-O and PEF fixtures',
                status: 'failed',
                summary: 'analyzeLegacyMac returned no findings.',
                limitations: [...LIMITS],
                evidence: [],
            });
        }
        else {
            trials.push({
                id: 'mac-diagnose-formats',
                title: 'Diagnose crafted Mach-O and PEF fixtures',
                status: 'passed',
                summary: `Mach-O=${mf.format}; PEF=${pf.format}`,
                limitations: [...LIMITS],
                evidence: [
                    profileBits(mf.targetProfile),
                    profileBits(pf.targetProfile),
                    `mach-o detectors=${mf.structuralDetectors.map(d => d.name).join(',')}`,
                    `pef detectors=${pf.structuralDetectors.map(d => d.name).join(',')}`,
                ],
            });
        }
        const beforePath = join(dir, 'before.out');
        const afterPath = join(dir, 'after.out');
        await writeFile(beforePath, machO32(false));
        await writeFile(afterPath, machO32(true));
        const before = await analyzeLegacyMac(beforePath, AUTH);
        const after = await analyzeLegacyMac(afterPath, AUTH);
        const bf = before.findings[0];
        const af = after.findings[0];
        if (!bf || !af) {
            trials.push({
                id: 'mac-compare-pie',
                title: 'Compare static profiles when MH_PIE changes',
                status: 'failed',
                summary: 'Missing findings on before/after fixtures.',
                limitations: [...LIMITS],
                evidence: [],
            });
        }
        else {
            const pieBefore = bf.machOFlags?.pie === true;
            const pieAfter = af.machOFlags?.pie === true;
            const changed = pieBefore !== pieAfter;
            trials.push({
                id: 'mac-compare-pie',
                title: 'Compare static profiles when MH_PIE changes',
                status: changed ? 'passed' : 'limited',
                summary: changed
                    ? 'Static profile detects MH_PIE change between fixtures'
                    : 'PIE flag did not differ on crafted fixtures',
                limitations: [
                    ...LIMITS,
                    'Comparison is static Target Profile only, not emulator capture/replay.',
                ],
                evidence: [`before.pie=${pieBefore}`, `after.pie=${pieAfter}`],
            });
        }
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
    const preservation = computePreservationLevel({
        oracle: null,
        comparisons: [],
        environments: ['mac-static-fixtures'],
        authorization: AUTH,
    });
    const ok = trials.length === 2 && trials.every(t => t.status !== 'failed');
    return {
        authorization: AUTH,
        ranAt: new Date().toISOString(),
        trials,
        preservation,
        ok,
        limitations,
    };
}
