/**
 * Sourced Mac compatibility tables (Patch O step 4 / G-01 Mac).
 * Documentary rows only — no binaries. Diagnosis cites table ids + target facts.
 */
import type { SourcedDataTable, SourcedTableEntry } from './legacy-types.js';
import { validateSourcedDataTable } from './legacy-tables.js';
function entry(parts: {
    id: string;
    fact: string;
    source: string;
    license: string;
    retrievedAt: string;
    signature?: string;
    data?: Record<string, unknown>;
}): SourcedTableEntry {
    return {
        id: parts.id,
        fact: parts.fact,
        source: parts.source,
        license: parts.license,
        retrievedAt: parts.retrievedAt,
        signature: parts.signature,
        data: parts.data,
    };
}
/** Code-model and loader availability. */
export const MAC_CODE_MODEL_TABLE: SourcedDataTable = {
    schemaVersion: '1.0',
    name: 'mac-code-models',
    description: 'Classic Mac / early macOS code models and host availability (documentary).',
    tableVersion: '2026-11-12',
    entries: [
        entry({
            id: 'mac-68k-code-needs-emulator',
            fact: '68k CODE-resource applications need a 68k emulator (Mini vMac / Basilisk II class).',
            source: 'Apple Macintosh Programmer\'s Workshop / classic Mac OS documentation (public)',
            license: 'Documentary',
            retrievedAt: '2026-11-12',
            signature: 'CODE',
            data: { formats: ['68k-code'] },
        }),
        entry({
            id: 'mac-pef-cfm-needs-classic-or-carbon',
            fact: 'PEF/CFM binaries need Classic Mac OS, CarbonLib, or a CFM-aware host; not native on modern macOS.',
            source: 'Apple Code Fragment Manager / Carbon Porting Guide (public)',
            license: 'Documentary',
            retrievedAt: '2026-11-12',
            signature: 'Joy!',
            data: { formats: ['pef-cfm'] },
        }),
        entry({
            id: 'mac-powerpc-needs-rosetta-or-emulator',
            fact: 'PowerPC Mac binaries need Rosetta (Intel Mac OS X) or a PPC emulator on non-PPC hosts.',
            source: 'Apple Rosetta documentation; QEMU/SheepShaver community notes (public)',
            license: 'Documentary',
            retrievedAt: '2026-11-12',
            signature: 'PowerPC',
            data: { architectures: ['PowerPC', 'PowerPC64'] },
        }),
        entry({
            id: 'mac-32bit-intel-removed',
            fact: '32-bit Intel Mac apps are refused on macOS 10.15+ without a compatibility layer.',
            source: 'Apple macOS Catalina release notes (public)',
            license: 'Documentary',
            retrievedAt: '2026-11-12',
            signature: 'x86-32',
            data: { bitness: 32, architectures: ['x86'] },
        }),
        entry({
            id: 'mac-classic-environment-removed',
            fact: 'The Classic environment was removed after Mac OS X 10.4 on Intel; Classic apps need an emulator.',
            source: 'Apple Mac OS X transition notes (public)',
            license: 'Documentary',
            retrievedAt: '2026-11-12',
            signature: 'Classic',
        }),
    ],
};
/** Resource fork, filesystem and packaging behaviour. */
export const MAC_RESOURCE_FS_TABLE: SourcedDataTable = {
    schemaVersion: '1.0',
    name: 'mac-resource-filesystem',
    description: 'Resource forks, AppleDouble, creator/type and path assumptions (documentary).',
    tableVersion: '2026-11-12',
    entries: [
        entry({
            id: 'mac-resource-fork-lost-on-copy',
            fact: 'Resource forks are lost when copied via non-Apple tools or non-HFS volumes without AppleDouble.',
            source: 'Apple Technical Q&A QA1013 / AppleDouble specification (public)',
            license: 'Documentary',
            retrievedAt: '2026-11-12',
            signature: 'AppleDouble',
            data: { formats: ['appledouble', 'macbinary'] },
        }),
        entry({
            id: 'mac-creator-type-reliance',
            fact: 'Classic apps rely on 4-byte type/creator codes; modern Launch Services may ignore them.',
            source: 'Inside Macintosh: Files / Launch Services notes (public)',
            license: 'Documentary',
            retrievedAt: '2026-11-12',
            signature: 'creator-type',
        }),
        entry({
            id: 'mac-colon-paths-31-char-names',
            fact: 'Classic Mac OS used colon path separators and 31-character file names.',
            source: 'Inside Macintosh: Files (public)',
            license: 'Documentary',
            retrievedAt: '2026-11-12',
            signature: 'HFS',
            data: { formats: ['hfs-volume', '68k-code'] },
        }),
        entry({
            id: 'mac-binhex-transport',
            fact: 'BinHex is a transfer encoding; the payload must be decoded before analysis or execution.',
            source: 'RFC 1741 BinHex 4.0 (public)',
            license: 'Documentary',
            retrievedAt: '2026-11-12',
            signature: 'BinHex',
            data: { formats: ['binhex'] },
        }),
    ],
};
/** Carbon / Cocoa / toolbox runtime markers. */
export const MAC_RUNTIME_TABLE: SourcedDataTable = {
    schemaVersion: '1.0',
    name: 'mac-runtime-frameworks',
    description: 'Carbon, Cocoa and classic library dependencies (documentary).',
    tableVersion: '2026-11-12',
    entries: [
        entry({
            id: 'mac-carbon-deprecated',
            fact: 'Carbon was deprecated and removed from 64-bit macOS; 32-bit Carbon apps need an older host.',
            source: 'Apple Carbon Release Notes / macOS 10.15 notes (public)',
            license: 'Documentary',
            retrievedAt: '2026-11-12',
            signature: 'Carbon',
            data: { libraries: ['Carbon', 'CarbonLib'] },
        }),
        entry({
            id: 'mac-quicktime-removed',
            fact: 'Classic QuickTime framework is not shipped on modern macOS; media code may fail.',
            source: 'Apple QuickTime deprecation notes (public)',
            license: 'Documentary',
            retrievedAt: '2026-11-12',
            signature: 'QuickTime',
            data: { libraries: ['QuickTime', 'QTKit'] },
        }),
        entry({
            id: 'mac-codesign-notarization',
            fact: 'Unsigned or ad-hoc signed Mac binaries face Gatekeeper/notarization blocks on modern macOS.',
            source: 'Apple Code Signing Guide / Notarization documentation (public)',
            license: 'Documentary',
            retrievedAt: '2026-11-12',
            signature: 'LC_CODE_SIGNATURE',
        }),
    ],
};
export function allBuiltinMacCompatTables(): SourcedDataTable[] {
    return [MAC_CODE_MODEL_TABLE, MAC_RESOURCE_FS_TABLE, MAC_RUNTIME_TABLE];
}
export function assertBuiltinMacTablesValid(): string[] {
    const errors: string[] = [];
    for (const table of allBuiltinMacCompatTables()) {
        const r = validateSourcedDataTable(table);
        if (!r.ok)
            errors.push(`${table.name}: ${r.errors.join('; ')}`);
    }
    return errors;
}
export interface MacCompatDiagnosis {
    cause: string;
    evidence: string;
    confidence: number;
    limitations: string[];
    needsExecutionEnvironment: boolean;
    tableEntryIds: string[];
}
/**
 * Map Mac target facts to sourced table rows. Emits a finding only when both
 * a table row and a target fact match.
 */
export function diagnoseMacFromTables(input: {
    format: string;
    architecture: string;
    bitness: number | null;
    dylibs: string[];
    resourceTypes: string[];
    containers: string[];
    creatorType: {
        creator: string;
        type: string;
    } | null;
    codeSignaturePresent: boolean;
    structuralDetectorNames: string[];
}): MacCompatDiagnosis[] {
    const findings: MacCompatDiagnosis[] = [];
    const byId = new Map<string, SourcedTableEntry>();
    for (const t of allBuiltinMacCompatTables()) {
        for (const e of t.entries)
            byId.set(e.id, e);
    }
    const push = (id: string, cause: string, evidence: string, confidence: number, needsExec: boolean, extraLimits: string[] = []) => {
        const entry = byId.get(id);
        if (!entry)
            return;
        findings.push({
            cause,
            evidence: `${evidence} [table:${id}; source:${entry.source}]`,
            confidence,
            limitations: [
                'Table entry is documentary; host runtime is not probed.',
                ...extraLimits,
            ],
            needsExecutionEnvironment: needsExec,
            tableEntryIds: [id],
        });
    };
    const libs = input.dylibs.map(d => d.toLowerCase());
    const arch = input.architecture.toLowerCase();
    const names = new Set(input.structuralDetectorNames.map(n => n.toLowerCase()));
    const rules: Array<{
        id: string;
        when: boolean;
        cause: string;
        evidence: string;
        confidence: number;
        needsExec: boolean;
        extra?: string[];
    }> = [
        {
            id: 'mac-68k-code-needs-emulator',
            when: input.format === '68k-code' || input.resourceTypes.includes('CODE'),
            cause: '68k CODE application likely needs a 68k emulator.',
            evidence: `format=${input.format}; resources=${input.resourceTypes.join(',') || 'none'}`,
            confidence: 0.9,
            needsExec: true,
        },
        {
            id: 'mac-pef-cfm-needs-classic-or-carbon',
            when: input.format === 'pef-cfm' || input.resourceTypes.includes('cfrg') || names.has('pef-cfm'),
            cause: 'PEF/CFM binary is not native on modern macOS.',
            evidence: `format=${input.format}`,
            confidence: 0.95,
            needsExec: true,
        },
        {
            id: 'mac-powerpc-needs-rosetta-or-emulator',
            when: /powerpc/i.test(input.architecture),
            cause: 'PowerPC binary needs Rosetta or a PPC emulator on non-PPC hosts.',
            evidence: `architecture=${input.architecture}`,
            confidence: 0.95,
            needsExec: true,
        },
        {
            id: 'mac-32bit-intel-removed',
            when: input.bitness === 32 && (arch === 'x86' || arch === 'i386'),
            cause: '32-bit Intel Mac binary is refused on macOS 10.15+.',
            evidence: `architecture=${input.architecture} bitness=${input.bitness}`,
            confidence: 0.95,
            needsExec: true,
        },
        {
            id: 'mac-classic-environment-removed',
            when: input.format === '68k-code' || input.format === 'pef-cfm',
            cause: 'Classic environment is unavailable on modern Macs.',
            evidence: `format=${input.format}`,
            confidence: 0.9,
            needsExec: true,
        },
        {
            id: 'mac-resource-fork-lost-on-copy',
            when: input.format === 'appledouble' || input.format === 'macbinary'
                || input.resourceTypes.length > 0,
            cause: 'Resource-fork data may be lost outside AppleDouble/HFS-aware tools.',
            evidence: `format=${input.format}; resourceTypes=${input.resourceTypes.join(',') || 'none'}`,
            confidence: 0.85,
            needsExec: false,
        },
        {
            id: 'mac-creator-type-reliance',
            when: !!input.creatorType,
            cause: 'Relies on classic type/creator codes.',
            evidence: `type=${input.creatorType?.type} creator=${input.creatorType?.creator}`,
            confidence: 0.8,
            needsExec: false,
        },
        {
            id: 'mac-colon-paths-31-char-names',
            when: input.format === 'hfs-volume' || input.format === '68k-code',
            cause: 'May assume colon paths and 31-character HFS names.',
            evidence: `format=${input.format}`,
            confidence: 0.7,
            needsExec: false,
        },
        {
            id: 'mac-binhex-transport',
            when: input.format === 'binhex',
            cause: 'BinHex-encoded payload must be decoded before use.',
            evidence: `format=${input.format}`,
            confidence: 0.95,
            needsExec: false,
        },
        {
            id: 'mac-carbon-deprecated',
            when: libs.some(l => /carbon/.test(l)) || names.has('classic-marker'),
            cause: 'Carbon dependency is not available on modern 64-bit macOS.',
            evidence: `dylibs=${input.dylibs.filter(d => /carbon/i.test(d)).join(',') || 'marker'}`,
            confidence: 0.9,
            needsExec: true,
        },
        {
            id: 'mac-quicktime-removed',
            when: libs.some(l => /quicktime|qtkit/.test(l)),
            cause: 'Classic QuickTime framework is not present on modern macOS.',
            evidence: `dylibs=${input.dylibs.filter(d => /quicktime|qtkit/i.test(d)).join(',')}`,
            confidence: 0.9,
            needsExec: true,
        },
        {
            id: 'mac-codesign-notarization',
            when: (input.format === 'mach-o' || input.format === 'fat-mach-o')
                && !input.codeSignaturePresent,
            cause: 'Mach-O without LC_CODE_SIGNATURE may be blocked by Gatekeeper.',
            evidence: 'codeSignaturePresent=false',
            confidence: 0.75,
            needsExec: false,
            extra: ['Absence of the load command is not proof the binary is unsigned on disk.'],
        },
    ];
    for (const r of rules) {
        if (r.when)
            push(r.id, r.cause, r.evidence, r.confidence, r.needsExec, r.extra ?? []);
    }
    return findings;
}
