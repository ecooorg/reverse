/**
 * Shared contracts for legacy product work (Patch M step 1).
 * Every Target Profile field carries source evidence, confidence and coverage.
 * Sourced data tables hold only hashes/signatures with provenance; no binaries.
 */

/** One profile field: value + how we know it. */
export interface ProfileField<T> {
    value: T;
    /** Deterministic source of the value (header offset, import name, string match, table entry id, …). */
    evidence: string[];
    /** 0–1; uncalibrated indicators stay explicitly low or mid until H-08 calibration exists. */
    confidence: number;
    /** What was examined and what was not. */
    coverage: {
        examined: boolean;
        complete: boolean;
        notes: string[];
    };
}

export function profileField<T>(
    value: T,
    evidence: string[],
    confidence: number,
    coverageNotes: string[] = [],
    complete = true
): ProfileField<T> {
    return {
        value,
        evidence: evidence.slice(),
        confidence: Math.max(0, Math.min(1, confidence)),
        coverage: {
            examined: true,
            complete,
            notes: coverageNotes.slice()
        }
    };
}

/** Shared Target Profile envelope used by all legacy families (Windows first, then N–Q). */
export interface TargetProfile {
    schemaVersion: '1.0';
    /** OS family and era guess (e.g. "Windows", "Win9x/NT through Windows 7 candidate"). */
    osAndEra: ProfileField<{ family: string; era: string | null }>;
    cpu: ProfileField<string>;
    bitness: ProfileField<number | null>;
    /** ABI / subsystem / calling-convention hints when known. */
    abi: ProfileField<string | null>;
    /** Toolchain, runtime and framework markers (Delphi, VB6, MFC, MSVC, …). */
    toolchainRuntimeFramework: ProfileField<string[]>;
    /** Installer / packager when identified (null until detectors exist). */
    installer: ProfileField<string | null>;
    /** Named dependencies (imported libraries, sonames, …). */
    dependencies: ProfileField<string[]>;
    /** Optional analogy tag — never a bare label; always with confidence and deterministic basis (H-04). */
    analogyTag?: ProfileField<{ tag: string; basis: string[] }>;
}

/** Operator-declared legal basis for legacy analysis (not legal verification). */
export interface LegacyAuthorization {
    basis: 'open_source' | 'written_consent';
    licenseOrConsentReference: string;
    declaredBy: string;
    declaredAt: string;
}

/**
 * One fact in a sourced, versioned compatibility / detection table.
 * Only hashes and signatures; no third-party binaries (H-06).
 */
export interface SourcedTableEntry {
    /** Stable id inside the table (e.g. "msvbvm60-symbol-availability"). */
    id: string;
    /** The fact itself (short, structured when possible). */
    fact: string;
    /** Human-readable source (URL, document title, standard, corpus entry). */
    source: string;
    /** SPDX id or short license name of the source material. */
    license: string;
    /** ISO date when the fact was retrieved or last verified (YYYY-MM-DD). */
    retrievedAt: string;
    /** Optional content hash of the source material or signature blob. */
    contentHash?: string;
    /** Optional signature / rule text used by a detector (never a binary). */
    signature?: string;
    /** Optional structured payload for machines (version ranges, symbol lists, …). */
    data?: Record<string, unknown>;
}

export interface SourcedDataTable {
    schemaVersion: '1.0';
    /** Table name (e.g. "windows-vb6-runtime", "pe-subsystem-era"). */
    name: string;
    /** Short description of what the table answers. */
    description: string;
    /** Table format version for evolution. */
    tableVersion: string;
    entries: SourcedTableEntry[];
}

/** Result of validating a SourcedDataTable. */
export interface TableValidationResult {
    ok: boolean;
    errors: string[];
}
