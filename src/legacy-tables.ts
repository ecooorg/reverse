/**
 * Sourced, versioned data tables for compatibility and detection facts (Patch M step 1).
 * Format: one entry per fact with source, license, retrieval date; hashes and signatures only.
 */

import type { SourcedDataTable, SourcedTableEntry, TableValidationResult } from './legacy-types.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[a-z0-9][a-z0-9_.-]{0,127}$/i;

/**
 * Validate a sourced data table. Returns structured errors; never throws for bad input.
 * A failing fixture must produce ok: false (capability check requirement).
 */
export function validateSourcedDataTable(table: unknown): TableValidationResult {
    const errors: string[] = [];

    if (!table || typeof table !== 'object')
        return { ok: false, errors: ['table must be an object'] };

    const t = table as Record<string, unknown>;

    if (t.schemaVersion !== '1.0')
        errors.push('schemaVersion must be "1.0"');
    if (typeof t.name !== 'string' || !t.name.trim())
        errors.push('name must be a non-empty string');
    if (typeof t.description !== 'string' || !t.description.trim())
        errors.push('description must be a non-empty string');
    if (typeof t.tableVersion !== 'string' || !t.tableVersion.trim())
        errors.push('tableVersion must be a non-empty string');
    if (!Array.isArray(t.entries))
        errors.push('entries must be an array');
    else {
        const ids = new Set<string>();
        t.entries.forEach((raw, i) => {
            const prefix = `entries[${i}]`;
            if (!raw || typeof raw !== 'object') {
                errors.push(`${prefix} must be an object`);
                return;
            }
            const e = raw as Record<string, unknown>;
            if (typeof e.id !== 'string' || !ID_RE.test(e.id))
                errors.push(`${prefix}.id must match ${ID_RE}`);
            else if (ids.has(e.id))
                errors.push(`${prefix}.id duplicate: ${e.id}`);
            else
                ids.add(e.id);
            if (typeof e.fact !== 'string' || !e.fact.trim())
                errors.push(`${prefix}.fact must be a non-empty string`);
            if (typeof e.source !== 'string' || !e.source.trim())
                errors.push(`${prefix}.source must be a non-empty string`);
            if (typeof e.license !== 'string' || !e.license.trim())
                errors.push(`${prefix}.license must be a non-empty string`);
            if (typeof e.retrievedAt !== 'string' || !DATE_RE.test(e.retrievedAt))
                errors.push(`${prefix}.retrievedAt must be YYYY-MM-DD`);
            if (e.contentHash !== undefined && (typeof e.contentHash !== 'string' || !/^[0-9a-f]{64}$/i.test(e.contentHash)))
                errors.push(`${prefix}.contentHash must be a 64-char hex SHA-256 when present`);
            if (e.signature !== undefined && typeof e.signature !== 'string')
                errors.push(`${prefix}.signature must be a string when present`);
            if (e.data !== undefined && (typeof e.data !== 'object' || e.data === null || Array.isArray(e.data)))
                errors.push(`${prefix}.data must be a plain object when present`);
        });
    }

    return { ok: errors.length === 0, errors };
}

/** Build a minimal valid table (for tests and as a template). */
export function exampleSourcedTable(): SourcedDataTable {
    return {
        schemaVersion: '1.0',
        name: 'windows-vb6-runtime',
        description: 'Facts about Visual Basic 6 runtime availability and common failure modes.',
        tableVersion: '2026-11-11',
        entries: [
            {
                id: 'msvbvm60-required',
                fact: 'VB6 executables typically require MSVBVM60.DLL at runtime.',
                source: 'Microsoft Visual Basic 6.0 documentation (public)',
                license: 'CC-BY-4.0-doc-excerpt',
                retrievedAt: '2026-11-11',
                signature: 'MSVBVM60.DLL'
            }
        ]
    };
}

/** Intentionally invalid table used as a failing fixture in capability checks. */
export function invalidSourcedTableFixture(): Record<string, unknown> {
    return {
        schemaVersion: '0.9',
        name: '',
        description: 'bad',
        tableVersion: '1',
        entries: [
            {
                id: 'Bad Id!',
                fact: '',
                source: '',
                license: '',
                retrievedAt: 'not-a-date',
                contentHash: 'too-short'
            }
        ]
    };
}
