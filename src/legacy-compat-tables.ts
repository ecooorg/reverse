/**
 * Sourced, versioned Windows compatibility tables (Patch M step 4 / G-01).
 * Each entry has source, license, retrieval date; hashes/signatures only.
 * Diagnosis cites table ids + target facts; never invents OS-version facts
 * when the table has no row.
 */
import type { SourcedDataTable, SourcedTableEntry } from './legacy-types.js';
import { validateSourcedDataTable } from './legacy-tables.js';
/** Built-in tables shipped as data (no third-party binaries). */
export const WINDOWS_RUNTIME_TABLE: SourcedDataTable = {
    schemaVersion: '1.0',
    name: 'windows-runtime-availability',
    description: 'Runtime and API families for DOS through Windows 7-era software.',
    tableVersion: '2026-11-11',
    entries: [
        {
            id: 'vb6-runtime-msvbvm60',
            fact: 'Visual Basic 6 executables require MSVBVM60.DLL at runtime.',
            source: 'Microsoft Visual Basic 6.0 redistributable notes (public)',
            license: 'MS-doc-excerpt',
            retrievedAt: '2026-11-11',
            signature: 'MSVBVM60.DLL',
            data: {
                libraries: ['msvbvm60.dll', 'vb40032.dll'],
                era: 'Win9x-Win7'
            }
        },
        {
            id: 'mfc-versioned-dll',
            fact: 'Versioned MFC DLLs must match the link-time major version.',
            source: 'Microsoft C++ redistributable overview (public)',
            license: 'MS-doc-excerpt',
            retrievedAt: '2026-11-11',
            signature: 'mfc',
            data: { libraryPattern: '^mfc[0-9]' }
        },
        {
            id: 'directx-legacy-ddraw',
            fact: 'Legacy DirectDraw/Direct3D titles need OS or redistributable ddraw/d3d9.',
            source: 'DirectX End-User Runtime documentation (public)',
            license: 'MS-doc-excerpt',
            retrievedAt: '2026-11-11',
            signature: 'ddraw.dll',
            data: {
                libraries: ['ddraw.dll', 'd3d8.dll', 'd3d9.dll', 'd3drm.dll']
            }
        },
        {
            id: 'glide-3dfx',
            fact: '3dfx Glide titles need a Glide wrapper or era-appropriate stack.',
            source: '3dfx Glide open-source headers / community wrappers',
            license: 'DOC',
            retrievedAt: '2026-11-11',
            signature: 'glide',
            data: {
                libraries: ['glide.dll', 'glide2x.dll', 'glide3x.dll']
            }
        },
        {
            id: 'win16-not-on-64bit',
            fact: '16-bit DOS/Windows NE binaries do not run natively on 64-bit Windows.',
            source: 'Microsoft Windows 64-bit compatibility documentation (public)',
            license: 'MS-doc-excerpt',
            retrievedAt: '2026-11-11',
            data: { formats: ['DOS MZ', 'Windows NE'] }
        },
        {
            id: 'le-lx-loader',
            fact: 'LE/LX executables need a loader not present on modern Windows by default.',
            source: 'Executable-format references (public PE/NE/LE documentation)',
            license: 'DOC',
            retrievedAt: '2026-11-11',
            data: { formats: ['Windows LE', 'Windows LX'] }
        },
        {
            id: 'dep-aslr-absent',
            fact: 'Images without DYNAMIC_BASE/NX_COMPAT are fragile under mitigations.',
            source: 'PE COFF specification — DllCharacteristics (public)',
            license: 'MS-PE-COFF',
            retrievedAt: '2026-11-11',
            data: { flags: ['aslr', 'dep'] }
        }
    ]
};
export function allBuiltinCompatTables(): SourcedDataTable[] {
    return [WINDOWS_RUNTIME_TABLE];
}
export function assertBuiltinTablesValid(): string[] {
    const errors: string[] = [];
    for (const table of allBuiltinCompatTables()) {
        const r = validateSourcedDataTable(table);
        if (!r.ok)
            errors.push(`${table.name}: ${r.errors.join('; ')}`);
    }
    return errors;
}
export interface CompatDiagnosis {
    cause: string;
    evidence: string;
    confidence: number;
    limitations: string[];
    needsExecutionEnvironment: boolean;
    /** Table entry ids that support this finding (G-01). */
    tableEntryIds: string[];
}
/**
 * Map target facts to sourced table rows. Only emits findings when both a
 * table row and a target fact match — never invents availability from absence.
 */
export function diagnoseFromTables(input: {
    format: string;
    importedLibraries: string[];
    delayImportedLibraries: string[];
    toolchainMarkers: string[];
    hardening: {
        aslr: boolean | null;
        dep: boolean | null;
    };
    packerNames: string[];
}): CompatDiagnosis[] {
    const findings: CompatDiagnosis[] = [];
    const libList = [
        ...input.importedLibraries,
        ...input.delayImportedLibraries
    ].map(x => x.toLowerCase());
    const markers = input.toolchainMarkers.join(' | ').toLowerCase();
    const byId = new Map<string, SourcedTableEntry>();
    for (const t of allBuiltinCompatTables()) {
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
                ...extraLimits
            ],
            needsExecutionEnvironment: needsExec,
            tableEntryIds: [id]
        });
    };
    const vbLibs = libList.filter(l => /msvbvm|vb40032/.test(l));
    const mfcLibs = libList.filter(l => /mfc/.test(l));
    const dxLibs = libList.filter(l => /^(ddraw|d3d8|d3d9|d3drm)/.test(l));
    const glideLibs = libList.filter(l => /glide/.test(l));
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
            id: 'win16-not-on-64bit',
            when: input.format === 'DOS MZ' || input.format === 'Windows NE',
            cause: '16-bit DOS/Windows is not native on 64-bit Windows.',
            evidence: `Detected format ${input.format}.`,
            confidence: 0.99,
            needsExec: true
        },
        {
            id: 'le-lx-loader',
            when: input.format === 'Windows LE' || input.format === 'Windows LX',
            cause: 'LE/LX may require a compatible loader.',
            evidence: `Detected format ${input.format}.`,
            confidence: 0.99,
            needsExec: true
        },
        {
            id: 'vb6-runtime-msvbvm60',
            when: vbLibs.length > 0 || /visual basic 6/.test(markers),
            cause: 'May depend on the Visual Basic 6 runtime.',
            evidence: `Libraries/markers: ${vbLibs.join(', ') || markers}`,
            confidence: 0.95,
            needsExec: true
        },
        {
            id: 'mfc-versioned-dll',
            when: mfcLibs.length > 0 || /\bmfc\b/.test(markers),
            cause: 'Imports a versioned MFC runtime.',
            evidence: `Libraries: ${mfcLibs.join(', ') || 'MFC marker'}`,
            confidence: 0.95,
            needsExec: true
        },
        {
            id: 'directx-legacy-ddraw',
            when: dxLibs.length > 0 || /directx/.test(markers),
            cause: 'May depend on legacy DirectX components.',
            evidence: `Libraries: ${dxLibs.join(', ') || 'DirectX marker'}`,
            confidence: 0.9,
            needsExec: true
        },
        {
            id: 'glide-3dfx',
            when: glideLibs.length > 0 || /glide|3dfx/.test(markers),
            cause: 'May depend on 3dfx Glide.',
            evidence: `Libraries/markers: ${glideLibs.join(', ') || markers}`,
            confidence: 0.9,
            needsExec: true
        },
        {
            id: 'dep-aslr-absent',
            when: input.hardening.aslr === false || input.hardening.dep === false,
            cause: 'PE lacks modern hardening flags (ASLR and/or DEP).',
            evidence: `ASLR=${input.hardening.aslr} DEP=${input.hardening.dep}`,
            confidence: 0.95,
            needsExec: false,
            extra: ['Flags from DllCharacteristics; host policy not evaluated.']
        }
    ];
    for (const rule of rules) {
        if (rule.when)
            push(rule.id, rule.cause, rule.evidence, rule.confidence, rule.needsExec, rule.extra ?? []);
    }
    return findings;
}
