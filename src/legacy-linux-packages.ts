/**
 * Static package/installer metadata readers for old Linux (Patch N step 3).
 * Reads RPM lead/header markers, Debian .deb ar magic, makeself/Loki .run
 * signatures — never executes scriptlets or payloads.
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
const MAX_READ = 512 * 1024;
export interface PackageMetadata {
    kind: 'rpm' | 'deb' | 'makeself' | 'slackware-tgz' | 'unknown';
    evidence: string[];
    /** Best-effort name/version when present in a bounded header window. */
    label: string | null;
    limitations: string[];
}
/**
 * Inspect a file path for known Linux package/installer container markers.
 */
export async function readLinuxPackageMetadata(filePath: string): Promise<PackageMetadata> {
    const abs = path.resolve(filePath);
    const st = await stat(abs);
    const n = Math.min(st.size, MAX_READ);
    const b = n > 0
        ? (await readFile(abs)).subarray(0, n)
        : Buffer.alloc(0);
    return inspectPackageBuffer(b, abs);
}
export function inspectPackageBuffer(b: Buffer, source = 'buffer'): PackageMetadata {
    const limitations: string[] = [
        'Scriptlets and payload contents are not executed or fully unpacked.',
        'Only a bounded head window is examined.'
    ];
    // RPM: magic 0xedabeedb
    if (b.length >= 4 && b[0] === 0xed && b[1] === 0xab && b[2] === 0xee && b[3] === 0xdb) {
        return {
            kind: 'rpm',
            evidence: [`RPM lead magic ed ab ee db in ${source}`],
            label: 'rpm',
            limitations
        };
    }
    // deb: "!<arch>\ndebian" ar archive
    const head = b.toString('ascii', 0, Math.min(64, b.length));
    if (head.startsWith('!<arch>') && /debian/i.test(head)) {
        return {
            kind: 'deb',
            evidence: ['Debian ar archive magic !<arch> with debian marker'],
            label: 'deb',
            limitations
        };
    }
    if (head.startsWith('!<arch>')) {
        // Generic ar — could be .deb without debian string in first 64
        const wider = b.toString('latin1', 0, Math.min(4096, b.length));
        if (/debian-binary/i.test(wider)) {
            return {
                kind: 'deb',
                evidence: ['ar archive containing debian-binary member'],
                label: 'deb',
                limitations
            };
        }
    }
    // makeself / Loki .run: shell script header with makeself markers
    const text = b.toString('latin1', 0, Math.min(8192, b.length));
    if (/^#!/m.test(text) && /makeself|loki_setup|TAR_START|filesizes=/i.test(text)) {
        const label = /loki/i.test(text) ? 'loki-run' : 'makeself';
        return {
            kind: 'makeself',
            evidence: [`Shell installer markers (${label}) in head`],
            label,
            limitations
        };
    }
    // Slackware .tgz is just gzip; detect gzip + optional install/ hint is weak
    if (b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b) {
        return {
            kind: 'slackware-tgz',
            evidence: ['gzip magic 1f 8b (tar.gz / Slackware-style package candidate)'],
            label: 'tar.gz',
            limitations: [
                ...limitations,
                'gzip alone does not prove Slackware; treat as compressed archive.'
            ]
        };
    }
    return {
        kind: 'unknown',
        evidence: ['No RPM/DEB/makeself/gzip package magic in the bounded window.'],
        label: null,
        limitations
    };
}
