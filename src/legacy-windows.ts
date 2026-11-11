import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { result } from './core-types.js';
import { profileField, type LegacyAuthorization, type TargetProfile } from './legacy-types.js';
import { assertAuthorizationPresent, requireLegacyGate } from './legacy-gate.js';
import { diagnoseFromTables } from './legacy-compat-tables.js';
export type { LegacyAuthorization, TargetProfile } from './legacy-types.js';
export interface PeHardeningFlags {
    aslr: boolean | null;
    dep: boolean | null;
    cfg: boolean | null;
    seh: boolean | null;
    /** Raw DllCharacteristics when present. */
    dllCharacteristics: number | null;
    evidence: string[];
}
export interface PackerHeuristic {
    name: string;
    evidence: string[];
    confidence: number;
}
export interface LegacyWindowsFinding {
    format: 'DOS MZ' | 'Windows NE' | 'Windows LE' | 'Windows LX' | 'Windows PE' | 'unknown';
    architecture: string;
    bitness: number | null;
    targetEra: string | null;
    subsystem: string | null;
    toolchainMarkers: string[];
    structuralDetectors: Array<{
        name: string;
        evidence: string[];
        confidence: number;
    }>;
    importedLibraries: string[];
    importedFunctions: string[];
    /** Delay-load imported libraries (IMAGE_DIRECTORY_ENTRY_DELAY_IMPORT). */
    delayImportedLibraries: string[];
    /** PE DllCharacteristics-derived hardening flags (null when not PE / truncated). */
    hardening: PeHardeningFlags;
    /** Lightweight packer/protector heuristics (high-entropy sections, known stubs). */
    packerHeuristics: PackerHeuristic[];
    compatibilityFindings: Array<{
        cause: string;
        evidence: string;
        confidence: number;
        limitations: string[];
        needsExecutionEnvironment: boolean;
    }>;
    /** Shared Target Profile envelope (Patch M step 1). Existing flat fields are kept for compatibility. */
    targetProfile: TargetProfile;
    authorization: LegacyAuthorization;
    sha256: string;
}
const markerRules: Array<[
    RegExp,
    string
]> = [
    [/Borland|Turbo Pascal|Borland C\+\+|Delphi/i, 'Borland/Delphi toolchain marker'],
    [/Visual Basic 6|MSVBVM60|VB6/i, 'Visual Basic 6 runtime/toolchain marker'],
    [/MFC[0-9]{2,3}|Microsoft Foundation Classes/i, 'MFC marker'],
    [/MSVCP[0-9]+|MSVCR[0-9]+|Visual C\+\+/i, 'Microsoft Visual C++ runtime marker'],
    [/DirectDraw|Direct3D|DDRAW\.DLL|D3D9\.DLL/i, 'DirectX graphics dependency marker'],
    [/GLIDE2X?\.DLL|3DFX/i, '3dfx Glide dependency marker']
];
const MAX_READ = 8 * 1024 * 1024;
const MAX_IMPORTS = 4096;
function boundedCString(b: Buffer, offset: number, max = 256): string {
    if (offset < 0 || offset >= b.length)
        return '';
    let end = offset;
    while (end < Math.min(b.length, offset + max) && b[end] !== 0)
        end++;
    return b.toString('latin1', offset, end);
}
function parsePeImports(b: Buffer, peOffset: number): {
    libraries: string[];
    functions: string[];
} {
    const libraries: string[] = [], functions: string[] = [];
    try {
        const sectionCount = b.readUInt16LE(peOffset + 6), optionalSize = b.readUInt16LE(peOffset + 20);
        const optional = peOffset + 24, magic = b.readUInt16LE(optional);
        const directoryOffset = optional + (magic === 0x20b ? 112 : magic === 0x10b ? 96 : 0);
        if (!directoryOffset || directoryOffset + 16 > b.length
            || directoryOffset + 16 > optional + optionalSize)
            return { libraries, functions };
        const importRva = b.readUInt32LE(directoryOffset + 8);
        const sectionsAt = optional + optionalSize;
        const sections: Array<{
            va: number;
            size: number;
            raw: number;
            rawSize: number;
        }> = [];
        for (let i = 0; i < Math.min(sectionCount, 96); i++) {
            const at = sectionsAt + i * 40;
            if (at + 40 > b.length)
                break;
            sections.push({
                va: b.readUInt32LE(at + 12),
                size: b.readUInt32LE(at + 8),
                raw: b.readUInt32LE(at + 20),
                rawSize: b.readUInt32LE(at + 16)
            });
        }
        const rvaToOffset = (rva: number): number => {
            for (const section of sections) {
                const span = Math.max(section.size, section.rawSize);
                if (rva >= section.va && rva - section.va < span) {
                    const delta = rva - section.va;
                    return delta < section.rawSize && section.raw + delta < b.length ? section.raw + delta : -1;
                }
            }
            return rva < b.length ? rva : -1;
        };
        let descriptor = rvaToOffset(importRva);
        if (descriptor < 0)
            return { libraries, functions };
        if (!importRva)
            return { libraries, functions };
        for (let i = 0; i < 256 && descriptor + 20 <= b.length && functions.length < MAX_IMPORTS; i++, descriptor += 20) {
            const originalThunk = b.readUInt32LE(descriptor);
            const nameRva = b.readUInt32LE(descriptor + 12);
            const firstThunk = b.readUInt32LE(descriptor + 16);
            if (!originalThunk && !nameRva && !firstThunk)
                break;
            const library = boundedCString(b, rvaToOffset(nameRva)).toLowerCase();
            if (library)
                libraries.push(library);
            let thunk = rvaToOffset(originalThunk || firstThunk);
            if (thunk < 0)
                continue;
            const width = magic === 0x20b ? 8 : 4;
            for (let j = 0; j < MAX_IMPORTS && thunk + width <= b.length; j++, thunk += width) {
                const value = width === 8 ? Number(b.readBigUInt64LE(thunk)) : b.readUInt32LE(thunk);
                if (!value)
                    break;
                const ordinalFlag = width === 8 ? 0x8000000000000000 : 0x80000000;
                if (value >= ordinalFlag)
                    continue;
                const hintName = rvaToOffset(value);
                if (hintName >= 0) {
                    const fn = boundedCString(b, hintName + 2);
                    if (fn)
                        functions.push(fn);
                }
            }
        }
    }
    catch { /* Malformed tables remain bounded and are surfaced as incomplete coverage. */ }
    return {
        libraries: [...new Set(libraries)].slice(0, 256),
        functions: [...new Set(functions)].slice(0, MAX_IMPORTS)
    };
}
function detectStructure(text: string, libraries: string[]) {
    const lowerLibs = libraries.map(x => x.toLowerCase());
    const detectors: LegacyWindowsFinding['structuralDetectors'] = [];
    const add = (name: string, evidence: string[], confidence: number) => detectors.push({ name, evidence, confidence });
    const vbImports = lowerLibs.filter(x => /msvbvm(50|60)\.dll|vb40032\.dll/.test(x));
    const mfcImports = lowerLibs.filter(x => /mfc(30|40|42|70|71|80|90)(u)?\.dll/.test(x));
    if (vbImports.length)
        add('Visual Basic runtime import', vbImports, 0.99);
    if (mfcImports.length)
        add('MFC runtime import', mfcImports, 0.99);
    if (/TPF0/.test(text))
        add('Delphi/FPC form stream (DFM/FMX marker)', ['TPF0 binary form signature'], 0.92);
    const delphi = ['TForm', 'TApplication', 'TComponent', 'TControl', 'TWinControl'].filter(x => text.includes(x));
    if (delphi.length >= 3)
        add('Delphi/VCL RTTI-style class names', delphi, 0.82);
    const vb = ['MSVBVM60.DLL', '__vba', 'ThunRTMain', 'VB5!'].filter(x => text.toLowerCase().includes(x.toLowerCase()));
    if (vb.length >= 2 && !vbImports.length)
        add('Visual Basic runtime metadata', vb, 0.8);
    const mfc = ['AfxWndProc', 'AfxGetApp', 'CWnd', 'CCmdTarget', 'ON_COMMAND'].filter(x => text.includes(x));
    if (mfc.length >= 2 && !mfcImports.length)
        add('MFC message-map/class markers', mfc, 0.78);
    return detectors;
}
/**
 * Statically inspect a DOS/Windows binary.
 * Requires a valid authorization (session declaration or explicit object) — the shared gate (step 1).
 */
const IMAGE_DLLCHARACTERISTICS_NX_COMPAT = 0x0100;
const IMAGE_DLLCHARACTERISTICS_DYNAMIC_BASE = 0x0040;
const IMAGE_DLLCHARACTERISTICS_GUARD_CF = 0x4000;
const IMAGE_DLLCHARACTERISTICS_NO_SEH = 0x0400;
function parsePeHardening(b: Buffer, peOffset: number): PeHardeningFlags {
    const empty: PeHardeningFlags = {
        aslr: null, dep: null, cfg: null, seh: null,
        dllCharacteristics: null, evidence: []
    };
    try {
        const optional = peOffset + 24;
        const magic = b.readUInt16LE(optional);
        // DllCharacteristics is at optional+70 for PE32 and PE32+
        const dllCharOff = optional + 70;
        if (dllCharOff + 2 > b.length)
            return empty;
        if (magic !== 0x10b && magic !== 0x20b)
            return empty;
        const dll = b.readUInt16LE(dllCharOff);
        return {
            aslr: (dll & IMAGE_DLLCHARACTERISTICS_DYNAMIC_BASE) !== 0,
            dep: (dll & IMAGE_DLLCHARACTERISTICS_NX_COMPAT) !== 0,
            cfg: (dll & IMAGE_DLLCHARACTERISTICS_GUARD_CF) !== 0,
            seh: (dll & IMAGE_DLLCHARACTERISTICS_NO_SEH) === 0,
            dllCharacteristics: dll,
            evidence: [`PE DllCharacteristics=0x${dll.toString(16)} at optional+70`]
        };
    }
    catch {
        return empty;
    }
}
function parsePeDelayImports(b: Buffer, peOffset: number): string[] {
    const libraries: string[] = [];
    try {
        const sectionCount = b.readUInt16LE(peOffset + 6);
        const optionalSize = b.readUInt16LE(peOffset + 20);
        const optional = peOffset + 24;
        const magic = b.readUInt16LE(optional);
        // Delay import directory is data directory index 13
        const dirBase = optional + (magic === 0x20b ? 112 : magic === 0x10b ? 96 : 0);
        const delayEntry = dirBase + 13 * 8;
        if (delayEntry + 8 > b.length || delayEntry + 8 > optional + optionalSize)
            return libraries;
        const delayRva = b.readUInt32LE(delayEntry);
        if (!delayRva)
            return libraries;
        const sectionsAt = optional + optionalSize;
        const sections: Array<{
            va: number;
            size: number;
            raw: number;
            rawSize: number;
        }> = [];
        for (let i = 0; i < Math.min(sectionCount, 96); i++) {
            const at = sectionsAt + i * 40;
            if (at + 40 > b.length)
                break;
            sections.push({
                va: b.readUInt32LE(at + 12),
                size: b.readUInt32LE(at + 8),
                raw: b.readUInt32LE(at + 20),
                rawSize: b.readUInt32LE(at + 16)
            });
        }
        const rvaToOffset = (rva: number): number => {
            for (const section of sections) {
                const span = Math.max(section.size, section.rawSize);
                if (rva >= section.va && rva - section.va < span) {
                    const delta = rva - section.va;
                    return delta < section.rawSize && section.raw + delta < b.length
                        ? section.raw + delta : -1;
                }
            }
            return -1;
        };
        // ImgDelayDescr: attributes, name RVA at +4 (newer) or +4 depends on version
        let descr = rvaToOffset(delayRva);
        for (let i = 0; i < 64 && descr >= 0 && descr + 32 <= b.length; i++, descr += 32) {
            const nameRva = b.readUInt32LE(descr + 4);
            if (!nameRva)
                break;
            const lib = boundedCString(b, rvaToOffset(nameRva)).toLowerCase();
            if (lib)
                libraries.push(lib);
        }
    }
    catch { /* bounded best-effort */ }
    return libraries;
}
function detectPackerHeuristics(b: Buffer, peOffset: number | null): PackerHeuristic[] {
    const found: PackerHeuristic[] = [];
    const text = b.toString('latin1');
    const stubs: Array<[
        RegExp,
        string,
        number
    ]> = [
        [/UPX[0-9]!|UPX\d{1,3}/i, 'UPX packer stub', 0.9],
        [/\.themida|Themida|WinLicense/i, 'Themida/WinLicense protector marker', 0.85],
        [/VMProtect|\.vmp[0-9]/i, 'VMProtect marker', 0.85],
        [/ASPack|\.aspack/i, 'ASPack marker', 0.8],
        [/PECompact|PEC2/i, 'PECompact marker', 0.8],
    ];
    for (const [re, name, conf] of stubs) {
        if (re.test(text))
            found.push({ name, evidence: [`string match ${re}`], confidence: conf });
    }
    if (peOffset !== null) {
        try {
            const sectionCount = b.readUInt16LE(peOffset + 6);
            const optionalSize = b.readUInt16LE(peOffset + 20);
            const sectionsAt = peOffset + 24 + optionalSize;
            for (let i = 0; i < Math.min(sectionCount, 16); i++) {
                const at = sectionsAt + i * 40;
                if (at + 40 > b.length)
                    break;
                const name = b.toString('ascii', at, at + 8).replace(/\0.*$/, '');
                const rawSize = b.readUInt32LE(at + 16);
                const raw = b.readUInt32LE(at + 20);
                if (rawSize < 256 || raw + rawSize > b.length)
                    continue;
                // Shannon entropy of first 4 KiB of section
                const sample = b.subarray(raw, raw + Math.min(rawSize, 4096));
                const counts = new Array(256).fill(0);
                for (const byte of sample)
                    counts[byte]++;
                let entropy = 0;
                const n = sample.length;
                for (const c of counts) {
                    if (!c)
                        continue;
                    const p = c / n;
                    entropy -= p * Math.log2(p);
                }
                if (entropy >= 7.2) {
                    found.push({
                        name: `high-entropy section ${name || i}`,
                        evidence: [`section "${name}" entropy ${entropy.toFixed(2)} over ${n} bytes`],
                        confidence: entropy >= 7.5 ? 0.75 : 0.6
                    });
                }
            }
        }
        catch { /* best-effort */ }
    }
    return found;
}
export async function analyzeLegacyWindows(file: string, authorization: LegacyAuthorization | null = null, options: {
    sessionId?: string;
} = {}) {
    const auth = await requireLegacyGate({
        sessionId: options.sessionId,
        authorization,
        operation: 'analyze_legacy_windows'
    });
    assertAuthorizationPresent(auth, 'analyze_legacy_windows');
    const abs = path.resolve(file);
    const info = await stat(abs);
    const handle = await readFile(abs);
    const b = handle.subarray(0, Math.min(handle.length, MAX_READ));
    const sha256 = createHash('sha256').update(handle).digest('hex');
    let peOffset: number | null = null;
    let format: LegacyWindowsFinding['format'] = 'unknown';
    let architecture = 'unknown';
    let bitness: number | null = null;
    let targetEra: string | null = null;
    let subsystem: string | null = null;
    if (b.length >= 64 && b.toString('ascii', 0, 2) === 'MZ') {
        const off = b.readUInt32LE(0x3c);
        if (off + 4 <= b.length) {
            const sig2 = b.toString('ascii', off, off + 2);
            const sig4 = b.toString('ascii', off, off + 4);
            if (sig2 === 'NE') {
                format = 'Windows NE';
                architecture = 'x86';
                bitness = 16;
                targetEra = 'Windows 3.x';
            }
            else if (sig2 === 'LE' || sig2 === 'LX') {
                format = sig2 === 'LE' ? 'Windows LE' : 'Windows LX';
                architecture = 'x86';
                bitness = 32;
                targetEra = 'Win9x/NT legacy';
            }
            else if (sig4 === 'PE\u0000\u0000' && off + 24 <= b.length) {
                format = 'Windows PE';
                peOffset = off;
                const machine = b.readUInt16LE(off + 4);
                const architectures: Record<number, string> = {
                    0x14c: 'x86',
                    0x8664: 'x86_64',
                    0x1c0: 'ARM'
                };
                architecture = architectures[machine] ?? `machine-${machine}`;
                const magic = b.readUInt16LE(off + 24);
                bitness = magic === 0x10b ? 32 : magic === 0x20b ? 64 : null;
                const opt = off + 24;
                const sub = opt + 68;
                if (sub + 2 <= b.length) {
                    const subsystemId = b.readUInt16LE(sub);
                    const subsystems: Record<number, string> = {
                        2: 'Windows GUI',
                        3: 'Windows console',
                        9: 'Windows CE GUI'
                    };
                    subsystem = subsystems[subsystemId] ?? `subsystem-${subsystemId}`;
                }
                targetEra = bitness === 32 ? 'Win9x/NT through Windows 7 candidate' : 'modern PE candidate';
            }
            else
                format = 'DOS MZ';
        }
        else
            format = 'DOS MZ';
    }
    const text = b.toString('latin1');
    const imports = peOffset === null
        ? { libraries: [] as string[], functions: [] as string[] }
        : parsePeImports(b, peOffset);
    const delayImportedLibraries = peOffset === null
        ? []
        : parsePeDelayImports(b, peOffset);
    const hardening = peOffset === null
        ? {
            aslr: null, dep: null, cfg: null, seh: null,
            dllCharacteristics: null, evidence: [] as string[]
        }
        : parsePeHardening(b, peOffset);
    const packerHeuristics = detectPackerHeuristics(b, peOffset);
    const structuralDetectors = detectStructure(text, imports.libraries);
    const toolchainMarkers = markerRules.filter(([re]) => re.test(text)).map(([, label]) => label);
    const tableFindings = diagnoseFromTables({
        format,
        importedLibraries: imports.libraries,
        delayImportedLibraries,
        toolchainMarkers,
        hardening: { aslr: hardening.aslr, dep: hardening.dep },
        packerNames: packerHeuristics.map(p => p.name)
    });
    const compatibilityFindings: LegacyWindowsFinding['compatibilityFindings'] = tableFindings.map(f => ({
        cause: f.cause,
        evidence: f.evidence,
        confidence: f.confidence,
        limitations: f.limitations,
        needsExecutionEnvironment: f.needsExecutionEnvironment
    }));
    if (packerHeuristics.length && !compatibilityFindings.some(c => /Packer/i.test(c.cause))) {
        compatibilityFindings.push({
            cause: 'Packer/protector heuristics fired; static inventory may be incomplete.',
            evidence: packerHeuristics.map(p => p.name).join('; '),
            confidence: Math.max(...packerHeuristics.map(p => p.confidence)),
            limitations: [
                'Heuristics are not a substitute for diec/yara-x/capa providers.',
                'No sourced table row claims a specific packer family beyond the heuristic name.'
            ],
            needsExecutionEnvironment: true
        });
    }
    if (delayImportedLibraries.length &&
        !compatibilityFindings.some(c => /delay-load/i.test(c.cause))) {
        compatibilityFindings.push({
            cause: 'Binary uses delay-load imports; delayed modules may be absent at first load.',
            evidence: delayImportedLibraries.join(', '),
            confidence: 0.9,
            limitations: [
                'Delay-import presence does not prove the delayed path is taken.',
                'No OS-version availability is inferred without a matching table row.'
            ],
            needsExecutionEnvironment: true
        });
    }
    const formatEvidence = format === 'unknown'
        ? ['No recognized MZ/NE/LE/LX/PE signature in the bounded header window.']
        : [`Header signature for ${format} at offset 0 / e_lfanew.`];
    const eraNotes = targetEra
        ? []
        : ['Era is a heuristic from format/bitness, not a calibrated classifier.'];
    const bitnessNotes = bitness === null
        ? ['Bitness not determined from the bounded header window.']
        : [];
    const abiNotes = subsystem
        ? []
        : ['ABI/subsystem incomplete for non-PE or truncated optional headers.'];
    const depNotes = format === 'Windows PE' && imports.libraries.length === 0
        ? ['PE import table was absent, malformed, or outside the bounded read window.']
        : [];
    const peMachineEv = format === 'Windows PE' && peOffset !== null
        ? ['PE Machine field at PE+4']
        : formatEvidence;
    const peMagicEv = format === 'Windows PE' && peOffset !== null
        ? ['PE optional-header magic at PE+24']
        : formatEvidence;
    const abiEv = subsystem
        ? ['PE Subsystem field']
        : ['Subsystem not present or not applicable for this format.'];
    const depEv = imports.libraries.length
        ? [`Bounded PE import table: ${imports.libraries.length} libraries`]
        : ['No PE import table in the bounded window, or non-PE format.'];
    const toolValues = [
        ...toolchainMarkers,
        ...structuralDetectors.map(d => d.name)
    ];
    const toolEv = [
        ...toolchainMarkers.map(m => `string/marker: ${m}`),
        ...structuralDetectors.flatMap(d => d.evidence.slice(0, 3))
    ];
    const toolNotes = [
        'Markers are static indicators, not calibrated (H-08 pending).',
        'Confidence is uncalibrated until a ground-truth corpus exists.'
    ];
    const toolConf = structuralDetectors.length || toolchainMarkers.length
        ? 0.75
        : 0.4;
    const installNotes = [
        'Installer/packager detection is not implemented yet (Patch M checklist).'
    ];
    const targetProfile: TargetProfile = {
        schemaVersion: '1.0',
        osAndEra: profileField({
            value: { family: 'Windows', era: targetEra },
            evidence: formatEvidence,
            confidence: format === 'unknown' ? 0.2 : 0.9,
            coverageNotes: eraNotes,
            complete: format !== 'unknown'
        }),
        cpu: profileField({
            value: architecture,
            evidence: peMachineEv,
            confidence: architecture === 'unknown' ? 0.2 : 0.95
        }),
        bitness: profileField({
            value: bitness,
            evidence: peMagicEv,
            confidence: bitness === null ? 0.2 : 0.95,
            coverageNotes: bitnessNotes
        }),
        abi: profileField({
            value: subsystem,
            evidence: abiEv,
            confidence: subsystem ? 0.9 : 0.3,
            coverageNotes: abiNotes,
            complete: !!subsystem
        }),
        toolchainRuntimeFramework: profileField({
            value: toolValues,
            evidence: toolEv,
            confidence: toolConf,
            coverageNotes: toolNotes,
            complete: false
        }),
        installer: profileField({
            value: null,
            evidence: [],
            confidence: 0,
            coverageNotes: installNotes,
            complete: false
        }),
        dependencies: profileField({
            value: imports.libraries,
            evidence: depEv,
            confidence: imports.libraries.length ? 0.9 : 0.3,
            coverageNotes: depNotes,
            complete: format === 'Windows PE' && imports.libraries.length > 0
        })
    };
    const finding: LegacyWindowsFinding = {
        format, architecture, bitness, targetEra, subsystem, toolchainMarkers,
        structuralDetectors, importedLibraries: imports.libraries,
        importedFunctions: imports.functions,
        delayImportedLibraries, hardening, packerHeuristics,
        compatibilityFindings,
        targetProfile, authorization: auth, sha256
    };
    return result<LegacyWindowsFinding>(abs, 'legacy_windows_analysis', [finding], {
        status: format === 'unknown' ? 'partial' : 'completed',
        limitations: [
            'Windows wave 1 detector: DOS/NE/LE/LX/PE headers, bounded toolchain signatures and PE imports.',
            'This is not a complete compatibility diagnosis.',
            ...(format === 'Windows PE' && imports.libraries.length === 0
                ? ['PE import table was absent, malformed, or outside the bounded read window.']
                : []),
            'RTTI/form-stream and class-name signatures are static indicators, not proof that a framework is required at runtime.',
            `Read ${b.length} of ${info.size} bytes.`,
            'No execution, corpus lookup, similarity score, or license verification is performed.',
            'Target Profile fields carry per-field evidence and confidence; calibration (H-08) is not done.'
        ],
        coverage: {
            examined: true,
            complete: format !== 'unknown' && b.length === info.size,
            notes: [`SHA-256: ${sha256}`, `Detected format: ${format}`, 'Target Profile schema 1.0']
        },
        evidence: [{
                id: sha256.slice(0, 16),
                kind: 'file_hash',
                source: abs,
                observedAt: new Date().toISOString(),
                sha256
            }]
    });
}
