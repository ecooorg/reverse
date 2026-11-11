/**
 * Sourced compatibility tables for old Linux (Patch N step 4 start).
 * Documentary rows only — hashes/signatures and provenance, no binaries.
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
}): SourcedTableEntry {
    return {
        id: parts.id,
        fact: parts.fact,
        source: parts.source,
        license: parts.license,
        retrievedAt: parts.retrievedAt,
        signature: parts.signature
    };
}
/** glibc / loader availability facts (documentary). */
export const LINUX_LIBC_TABLE: SourcedDataTable = {
    schemaVersion: '1.0',
    name: 'linux-libc-loader',
    description: 'libc and dynamic linker sonames by era (documentary).',
    tableVersion: '2026-11-11',
    entries: [
        entry({
            id: 'linux-libc5-soname',
            fact: 'Linux libc5 used soname libc.so.5; not provided by modern glibc.',
            source: 'GNU glibc historical notes (documentary)',
            license: 'Documentary',
            retrievedAt: '2026-11-11',
            signature: 'libc.so.5'
        }),
        entry({
            id: 'linux-glibc-libc-so-6',
            fact: 'glibc 2.x exposes libc.so.6; GLIBC_2.y needs a matching host.',
            source: 'https://sourceware.org/glibc/wiki/ABI',
            license: 'Documentary',
            retrievedAt: '2026-11-11',
            signature: 'libc.so.6'
        }),
        entry({
            id: 'linux-ld-linux-so-2',
            fact: 'i386 glibc dynamic linker path /lib/ld-linux.so.2.',
            source: 'GNU glibc documentation (documentary)',
            license: 'Documentary',
            retrievedAt: '2026-11-11',
            signature: 'ld-linux.so.2'
        }),
        entry({
            id: 'linux-ld-linux-x86-64',
            fact: 'x86-64 glibc dynamic linker path /lib64/ld-linux-x86-64.so.2.',
            source: 'GNU glibc documentation (documentary)',
            license: 'Documentary',
            retrievedAt: '2026-11-11',
            signature: 'ld-linux-x86-64.so.2'
        }),
        entry({
            id: 'linux-aout-loader-removed',
            fact: 'Mainstream distros removed a.out kernel/toolchain support.',
            source: 'Historical Linux a.out notes (documentary)',
            license: 'Documentary',
            retrievedAt: '2026-11-11',
            signature: 'a.out'
        })
    ]
};
/** libstdc++ / GCC ABI generation facts. */
export const LINUX_LIBSTDCPP_TABLE: SourcedDataTable = {
    schemaVersion: '1.0',
    name: 'linux-libstdc++-generations',
    description: 'libstdc++ soname generations vs GCC eras (documentary).',
    tableVersion: '2026-11-11',
    entries: [
        entry({
            id: 'linux-libstdcpp-so-5',
            fact: 'libstdc++.so.5 is GCC 3.0–3.3 ABI; not interchangeable with .so.6.',
            source: 'GCC libstdc++ ABI notes (documentary)',
            license: 'Documentary',
            retrievedAt: '2026-11-11',
            signature: 'libstdc++.so.5'
        }),
        entry({
            id: 'linux-libstdcpp-so-6',
            fact: 'libstdc++.so.6 is GCC 3.4+ / 4.x; GLIBCXX_3.y versions apply.',
            source: 'GCC libstdc++ ABI notes (documentary)',
            license: 'Documentary',
            retrievedAt: '2026-11-11',
            signature: 'libstdc++.so.6'
        }),
        entry({
            id: 'linux-libstdcpp-libc6',
            fact: 'GCC 2.95 libstdc++-libc6 is incompatible with libstdc++.so.6.',
            source: 'GCC historical notes (documentary)',
            license: 'Documentary',
            retrievedAt: '2026-11-11',
            signature: 'libstdc++-libc6'
        })
    ]
};
/** Desktop / audio path facts for old Linux (documentary). */
export const LINUX_DESKTOP_AUDIO_TABLE: SourcedDataTable = {
    schemaVersion: '1.0',
    name: 'linux-desktop-audio',
    description: 'OSS/ALSA and X11-era path and library facts (documentary).',
    tableVersion: '2026-11-11',
    entries: [
        entry({
            id: 'linux-oss-dev-dsp',
            fact: 'OSS programs open /dev/dsp and /dev/mixer; modern hosts need padsp/aoss or ALSA OSS.',
            source: 'OSS / ALSA OSS emulation notes (documentary)',
            license: 'Documentary',
            retrievedAt: '2026-11-11',
            signature: '/dev/dsp'
        }),
        entry({
            id: 'linux-libx11',
            fact: 'X11 clients link libX11.so.6; missing X libraries need Xephyr/Xvfb or host X.',
            source: 'X.Org / XFree86 library sonames (documentary)',
            license: 'Documentary',
            retrievedAt: '2026-11-11',
            signature: 'libX11.so.6'
        }),
        entry({
            id: 'linux-gtk1',
            fact: 'GTK 1.x uses libgtk-1.2.so.0; not provided by GTK 3/4 stacks.',
            source: 'GTK historical sonames (documentary)',
            license: 'Documentary',
            retrievedAt: '2026-11-11',
            signature: 'libgtk-1.2.so.0'
        }),
        entry({
            id: 'linux-qt3',
            fact: 'Qt3 clients use libqt-mt.so.3 / libqt.so.3; incompatible with Qt5/6 alone.',
            source: 'Qt3 library notes (documentary)',
            license: 'Documentary',
            retrievedAt: '2026-11-11',
            signature: 'libqt-mt.so.3'
        })
    ]
};
export function allLinuxCompatTables(): SourcedDataTable[] {
    return [LINUX_LIBC_TABLE, LINUX_LIBSTDCPP_TABLE, LINUX_DESKTOP_AUDIO_TABLE];
}
export function assertLinuxTablesValid(): string[] {
    const errors: string[] = [];
    for (const table of allLinuxCompatTables()) {
        const r = validateSourcedDataTable(table);
        if (!r.ok)
            errors.push(`${table.name}: ${r.errors.join('; ')}`);
    }
    return errors;
}
export interface LinuxCompatDiagnosis {
    cause: string;
    evidence: string;
    confidence: number;
    limitations: string[];
    needsExecutionEnvironment: boolean;
    tableEntryIds: string[];
}
/**
 * Map Linux target facts to sourced table rows.
 * Emits findings only when a table row and a target fact match.
 */
export function diagnoseLinuxFromTables(input: {
    format: string;
    neededLibraries: string[];
    interpreter: string | null;
    libcMarkers: string[];
    compilerMarkers: string[];
    maxGlibc?: string | null;
    maxGlibcxx?: string | null;
}): LinuxCompatDiagnosis[] {
    const findings: LinuxCompatDiagnosis[] = [];
    const needed = input.neededLibraries.map(x => x.toLowerCase());
    const markers = [...input.libcMarkers, ...input.compilerMarkers]
        .join(' | ')
        .toLowerCase();
    const interp = (input.interpreter ?? '').toLowerCase();
    const byId = new Map<string, SourcedTableEntry>();
    for (const t of allLinuxCompatTables()) {
        for (const e of t.entries)
            byId.set(e.id, e);
    }
    const push = (spec: {
        id: string;
        cause: string;
        evidence: string;
        confidence: number;
        needsExec: boolean;
    }) => {
        const row = byId.get(spec.id);
        if (!row)
            return;
        findings.push({
            cause: spec.cause,
            evidence: `${spec.evidence} [table:${spec.id}; source:${row.source}]`,
            confidence: spec.confidence,
            limitations: [
                'Table entry is documentary; host runtime is not probed.',
                'No execution environment is started by diagnosis alone.'
            ],
            needsExecutionEnvironment: spec.needsExec,
            tableEntryIds: [spec.id]
        });
    };
    if (input.format === 'a.out') {
        push({
            id: 'linux-aout-loader-removed',
            cause: 'a.out needs an old userland; modern distros dropped support.',
            evidence: 'format=a.out',
            confidence: 0.9,
            needsExec: true
        });
    }
    if (needed.some(n => /libc\.so\.5/.test(n)) || /libc5/.test(markers)) {
        push({
            id: 'linux-libc5-soname',
            cause: 'Depends on libc.so.5 (libc5); not provided by modern glibc.',
            evidence: 'soname/marker libc.so.5',
            confidence: 0.9,
            needsExec: true
        });
    }
    if (needed.some(n => /libc\.so\.6/.test(n)) || /glibc/.test(markers)) {
        push({
            id: 'linux-glibc-libc-so-6',
            cause: 'Links to libc.so.6; GLIBC versions need a matching era.',
            evidence: 'soname/marker libc.so.6 or GLIBC',
            confidence: 0.75,
            needsExec: true
        });
    }
    if (/ld-linux\.so\.2/.test(interp)) {
        push({
            id: 'linux-ld-linux-so-2',
            cause: 'i386 glibc loader; host needs compatible ld-linux.so.2.',
            evidence: `PT_INTERP ${input.interpreter}`,
            confidence: 0.85,
            needsExec: true
        });
    }
    if (/ld-linux-x86-64\.so\.2/.test(interp)) {
        push({
            id: 'linux-ld-linux-x86-64',
            cause: 'x86-64 glibc loader; host needs ld-linux-x86-64.so.2.',
            evidence: `PT_INTERP ${input.interpreter}`,
            confidence: 0.85,
            needsExec: true
        });
    }
    if (needed.some(n => /libstdc\+\+\.so\.5/.test(n)) ||
        /libstdc\+\+\.so\.5/.test(markers)) {
        push({
            id: 'linux-libstdcpp-so-5',
            cause: 'Needs libstdc++.so.5 (GCC 3.0–3.3), not .so.6 alone.',
            evidence: 'soname libstdc++.so.5',
            confidence: 0.85,
            needsExec: true
        });
    }
    if (needed.some(n => /libstdc\+\+\.so\.6/.test(n)) ||
        /libstdc\+\+\.so\.6/.test(markers)) {
        push({
            id: 'linux-libstdcpp-so-6',
            cause: 'Needs libstdc++.so.6; GLIBCXX may fail on older hosts.',
            evidence: 'soname libstdc++.so.6',
            confidence: 0.75,
            needsExec: true
        });
    }
    if (/libstdc\+\+-libc6/.test(markers) ||
        needed.some(n => /libstdc\+\+-libc6/.test(n))) {
        push({
            id: 'linux-libstdcpp-libc6',
            cause: 'Needs GCC 2.95 libstdc++-libc6; requires an old userland.',
            evidence: 'marker libstdc++-libc6',
            confidence: 0.85,
            needsExec: true
        });
    }
    if (needed.some(n => /libx11\.so/.test(n)) || /libx11\.so/.test(markers)) {
        push({
            id: 'linux-libx11',
            cause: 'Links to libX11; needs an X11 library stack or nested X server.',
            evidence: 'soname/marker libX11',
            confidence: 0.8,
            needsExec: true
        });
    }
    if (needed.some(n => /libgtk-1\.2/.test(n)) || /libgtk-1\.2/.test(markers)) {
        push({
            id: 'linux-gtk1',
            cause: 'Links to GTK 1.2; not provided by modern GTK 3/4 alone.',
            evidence: 'soname/marker libgtk-1.2',
            confidence: 0.85,
            needsExec: true
        });
    }
    if (needed.some(n => /libqt-mt\.so\.3|libqt\.so\.3/.test(n)) ||
        /libqt-mt\.so\.3/.test(markers)) {
        push({
            id: 'linux-qt3',
            cause: 'Links to Qt3; needs a Qt3 userland, not Qt5/6 alone.',
            evidence: 'soname/marker libqt-mt.so.3',
            confidence: 0.85,
            needsExec: true
        });
    }
    if (/\/dev\/dsp|\/dev\/mixer/.test(markers) ||
        needed.some(n => /liboss|libasound/.test(n))) {
        push({
            id: 'linux-oss-dev-dsp',
            cause: 'May need OSS /dev/dsp or an OSS→ALSA shim (padsp/aoss).',
            evidence: 'OSS device or audio library marker',
            confidence: 0.7,
            needsExec: true
        });
    }
    if (input.maxGlibc) {
        push({
            id: 'linux-glibc-libc-so-6',
            cause: `Requires symbol version ${input.maxGlibc}; host glibc must be at least that era.`,
            evidence: `max version string ${input.maxGlibc}`,
            confidence: 0.8,
            needsExec: true
        });
    }
    if (input.maxGlibcxx) {
        push({
            id: 'linux-libstdcpp-so-6',
            cause: `Requires ${input.maxGlibcxx}; host libstdc++ must expose that GLIBCXX version.`,
            evidence: `max version string ${input.maxGlibcxx}`,
            confidence: 0.8,
            needsExec: true
        });
    }
    return findings;
}
