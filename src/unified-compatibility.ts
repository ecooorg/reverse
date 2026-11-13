/**
 * Unified compatibility surface (Patch Q).
 * One report envelope across Windows / Linux / Mac / Android families.
 * Does not replace per-family analyzers; aggregates their Target Profiles.
 */
import type { LegacyAuthorization, TargetProfile, ProfileField } from './legacy-types.js';
import { assertAuthorizationPresent } from './legacy-gate.js';
export type UnifiedFamily = 'windows' | 'linux' | 'mac' | 'android' | 'unknown';
export interface UnifiedProfileField<T> {
    family: UnifiedFamily;
    key: string;
    value: T;
    confidence: number;
    evidence: string[];
}
export interface UnifiedCompatibilityReport {
    authorization: LegacyAuthorization;
    family: UnifiedFamily;
    generation: 'legacy' | 'newer' | 'mixed' | 'unknown';
    /** Normalized OS / runtime era label when known. */
    eraLabel: string | null;
    fields: UnifiedProfileField<unknown>[];
    crossFamilyNotes: string[];
    limitations: string[];
    sourceProfiles: Array<{
        family: UnifiedFamily;
        present: boolean;
    }>;
}
export interface KnowledgeFact {
    id: string;
    family: UnifiedFamily;
    fact: string;
    source: string;
    license: string;
    retrievedAt: string;
    scope: string;
    confidence: number;
}
/** In-tree knowledge facts (M–P tables summarized + Q newer-gen notes). */
const KNOWLEDGE: KnowledgeFact[] = [
    {
        id: 'win-pe-cfg',
        family: 'windows',
        fact: 'PE Control Flow Guard (CFG) is indicated by IMAGE_DLLCHARACTERISTICS_GUARD_CF (0x4000) when present.',
        source: 'PE/COFF specification / Windows mitigation docs',
        license: 'public-specification-summary',
        retrievedAt: '2026-11-13',
        scope: 'Windows 8+ PE binaries',
        confidence: 0.75,
    },
    {
        id: 'linux-symbol-version',
        family: 'linux',
        fact: 'Older glibc binaries may require symbol versions not provided by a newer musl-only host.',
        source: 'glibc/musl compatibility practice',
        license: 'operator-knowledge-summary',
        retrievedAt: '2026-11-13',
        scope: 'Linux ELF DT_NEEDED / symbol versions',
        confidence: 0.65,
    },
    {
        id: 'mac-hardened-runtime',
        family: 'mac',
        fact: 'Hardened Runtime and notarization affect load of unsigned or legacy plug-ins on modern macOS.',
        source: 'Apple Platform Security documentation (summary)',
        license: 'public-documentation-summary',
        retrievedAt: '2026-11-13',
        scope: 'macOS 10.14+ signed apps',
        confidence: 0.7,
    },
    {
        id: 'android-api23-runtime-perms',
        family: 'android',
        fact: 'Dangerous permissions are runtime-granted from API 23; install-time grant assumptions break on newer Android.',
        source: 'Android developer documentation (summary)',
        license: 'public-documentation-summary',
        retrievedAt: '2026-11-13',
        scope: 'Android API 23+',
        confidence: 0.8,
    },
];
function fieldValue<T>(f: ProfileField<T> | undefined): T | null {
    if (!f)
        return null;
    return f.value ?? null;
}
export function detectFamilyFromProfile(profile: TargetProfile): UnifiedFamily {
    const family = profile.osAndEra?.value?.family?.toLowerCase?.() ?? '';
    if (family.includes('windows') || family.includes('dos'))
        return 'windows';
    if (family.includes('linux') || family.includes('unix'))
        return 'linux';
    if (family.includes('mac') || family.includes('darwin') || family.includes('classic'))
        return 'mac';
    if (family.includes('android'))
        return 'android';
    return 'unknown';
}
export function classifyGeneration(input: {
    family: UnifiedFamily;
    profile: TargetProfile;
    hints?: string[];
}): 'legacy' | 'newer' | 'mixed' | 'unknown' {
    const hints = (input.hints ?? []).join(' ').toLowerCase();
    const era = JSON.stringify(input.profile.osAndEra?.value ?? {}).toLowerCase();
    const blob = `${hints} ${era}`;
    const newerMarks = [
        'windows 10', 'windows 11', 'windows 8', 'net core', 'net 5', 'net 6', 'msix',
        'arm64', 'cfg', 'cet', 'glibc 2.3', 'systemd', 'wayland', 'flatpak', 'appimage',
        'hardened runtime', 'notar', 'rosetta', 'arm64e', 'api 23', 'api 24', 'api 26',
        'api 28', 'api 30', 'api 33', 'aab', 'app bundle', 'scoped storage',
    ];
    const legacyMarks = [
        'windows 95', 'windows 98', 'windows xp', 'windows 7', 'vb6', 'win16', 'ne ',
        'a.out', 'libc5', 'classic mac', 'carbon', 'dalvik', 'api 10', 'api 14', 'api 16',
        'armeabi ', 'ginger',
    ];
    const n = newerMarks.some(m => blob.includes(m));
    const l = legacyMarks.some(m => blob.includes(m));
    if (n && l)
        return 'mixed';
    if (n)
        return 'newer';
    if (l)
        return 'legacy';
    return 'unknown';
}
/** Build one unified report from a single-family Target Profile. */
export function buildUnifiedReport(input: {
    authorization: LegacyAuthorization;
    profile: TargetProfile;
    family?: UnifiedFamily;
    hints?: string[];
    extraEvidence?: string[];
}): UnifiedCompatibilityReport {
    assertAuthorizationPresent(input.authorization, 'build_unified_compatibility_report');
    const family = input.family ?? detectFamilyFromProfile(input.profile);
    const generation = classifyGeneration({ family, profile: input.profile, hints: input.hints });
    const fields: UnifiedProfileField<unknown>[] = [];
    const push = (key: string, value: unknown, confidence: number, evidence: string[]) => {
        fields.push({ family, key, value, confidence, evidence });
    };
    const os = fieldValue(input.profile.osAndEra);
    const osConf = input.profile.osAndEra?.confidence ?? 0.3;
    const osEv = input.profile.osAndEra?.evidence ?? [];
    push('osAndEra', os, osConf, osEv);
    const cpuVal = fieldValue(input.profile.cpu);
    const cpuConf = input.profile.cpu?.confidence ?? 0.3;
    const cpuEv = input.profile.cpu?.evidence ?? [];
    push('cpu', cpuVal, cpuConf, cpuEv);
    const bitVal = fieldValue(input.profile.bitness);
    const bitConf = input.profile.bitness?.confidence ?? 0.3;
    const bitEv = input.profile.bitness?.evidence ?? [];
    push('bitness', bitVal, bitConf, bitEv);
    const abiVal = fieldValue(input.profile.abi);
    const abiConf = input.profile.abi?.confidence ?? 0.2;
    const abiEv = input.profile.abi?.evidence ?? [];
    push('abi', abiVal, abiConf, abiEv);
    const tc = input.profile.toolchainRuntimeFramework;
    const tcVal = fieldValue(tc);
    const tcConf = tc?.confidence ?? 0.3;
    const tcEv = tc?.evidence ?? [];
    push('toolchain', tcVal, tcConf, tcEv);
    if (input.extraEvidence?.length)
        push('extraEvidence', input.extraEvidence.slice(0, 20), 0.5, input.extraEvidence.slice(0, 8));
    const eraLabel = os && typeof os === 'object' && os
        ? [(os as {
                family?: string;
            }).family, (os as {
                era?: string | null;
            }).era].filter(Boolean).join(' / ') || null
        : null;
    return {
        authorization: input.authorization,
        family,
        generation,
        eraLabel: eraLabel || null,
        fields,
        crossFamilyNotes: [
            'Unified report is an envelope over one family profile; multi-artifact merges are sequential operator steps.',
            'Confidence scores stay family-local; do not rank Windows vs Android confidence against each other.',
        ],
        limitations: [
            'Q unification does not re-run per-family parsers; feed an existing Target Profile.',
            'Newer-generation diagnosis depth is inventory-level unless a family analyzer already emitted the field.',
            'Cross-family contradiction detection is advisory only.',
        ],
        sourceProfiles: [
            { family: 'windows', present: family === 'windows' },
            { family: 'linux', present: family === 'linux' },
            { family: 'mac', present: family === 'mac' },
            { family: 'android', present: family === 'android' },
        ],
    };
}
export function queryKnowledgeBase(input: {
    family?: UnifiedFamily;
    text?: string;
}): {
    facts: KnowledgeFact[];
    limitations: string[];
} {
    const text = (input.text ?? '').toLowerCase();
    let facts = KNOWLEDGE.slice();
    if (input.family)
        facts = facts.filter(f => f.family === input.family);
    if (text)
        facts = facts.filter(f => f.fact.toLowerCase().includes(text) || f.id.includes(text) || f.scope.toLowerCase().includes(text));
    return {
        facts,
        limitations: [
            'In-tree knowledge base is a bounded summary store, not a full CVE/registry database.',
            'Each fact carries source and confidence; operator must treat summaries as non-normative.',
        ],
    };
}
export function listKnowledgeFamilies(): UnifiedFamily[] {
    return ['windows', 'linux', 'mac', 'android'];
}
