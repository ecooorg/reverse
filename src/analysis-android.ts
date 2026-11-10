import { open, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { result } from './core-types.js';
import { fileEvidence } from './core-util.js';

export interface AndroidFinding {
    format: 'APK' | 'AAB' | 'unknown';
    entries: number;
    abis: string[];
    dexFiles: string[];
    nativeLibs: string[];
    hasAndroidManifest: boolean;
    hasResourcesArsc: boolean;
    hasClassesJar: boolean;
    obfuscationIndicators: string[];
    manifestNotes: string[];
    gradleLockNotes: string[];
    totalUncompressedHint: number;
}

/** Minimal ZIP central-directory walk (APK/AAB are zip). No external deps. */
async function listZipEntries(file: string, maxEntries = 5000): Promise<{
    names: string[];
    uncompressed: number;
}> {
    const s = await stat(file);
    const maxRead = Math.min(s.size, 8 * 1024 * 1024);
    const fh = await open(file, 'r');
    // header window reserved for future local reads
    try {
        // read tail for EOCD
        const tailSize = Math.min(s.size, 65536 + 22);
        const tail = Buffer.alloc(tailSize);
        await fh.read(tail, 0, tailSize, s.size - tailSize);
        let eocd = -1;
        for (let i = tail.length - 22; i >= 0; i--) {
            if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
                eocd = i;
                break;
            }
        }
        if (eocd < 0) return { names: [], uncompressed: 0 };
        const cdSize = tail.readUInt32LE(eocd + 12);
        const cdOffset = tail.readUInt32LE(eocd + 16);
        if (cdOffset + cdSize > s.size) return { names: [], uncompressed: 0 };
        const cd = Buffer.alloc(Math.min(cdSize, maxRead));
        await fh.read(cd, 0, cd.length, cdOffset);
        const names: string[] = [];
        let uncompressed = 0;
        let off = 0;
        while (off + 46 <= cd.length && names.length < maxEntries) {
            if (cd[off] !== 0x50 || cd[off + 1] !== 0x4b || cd[off + 2] !== 0x01 || cd[off + 3] !== 0x02) break;
            const nameLen = cd.readUInt16LE(off + 28);
            const extraLen = cd.readUInt16LE(off + 30);
            const commentLen = cd.readUInt16LE(off + 32);
            const uc = cd.readUInt32LE(off + 24);
            uncompressed += uc;
            const nameStart = off + 46;
            if (nameStart + nameLen > cd.length) break;
            const name = cd.toString('utf8', nameStart, nameStart + nameLen);
            names.push(name);
            off = nameStart + nameLen + extraLen + commentLen;
        }
        return { names, uncompressed };
    } finally {
        await fh.close();
    }
}

export async function analyzeAndroid(file: string) {
    const abs = path.resolve(file);
    const lower = abs.toLowerCase();
    const format: AndroidFinding['format'] =
        lower.endsWith('.apk') ? 'APK' : lower.endsWith('.aab') ? 'AAB' : 'unknown';

    let names: string[] = [];
    let uncompressed = 0;
    try {
        const z = await listZipEntries(abs);
        names = z.names;
        uncompressed = z.uncompressed;
    } catch (e) {
        return result(abs, 'android_static_inventory', [], {
            status: 'partial',
            limitations: [`Failed to read as ZIP: ${e instanceof Error ? e.message : String(e)}`],
            coverage: { examined: true, complete: false, notes: [] }
        });
    }

    if (!names.length && format === 'unknown') {
        return result(abs, 'android_static_inventory', [], {
            status: 'partial',
            limitations: ['Not an APK/AAB or ZIP central directory not found.'],
            coverage: { examined: true, complete: false, notes: [] }
        });
    }

    const abis = new Set<string>();
    const dexFiles: string[] = [];
    const nativeLibs: string[] = [];
    const obfuscation: string[] = [];
    let hasManifest = false;
    let hasArsc = false;
    let hasClassesJar = false;

    for (const n of names) {
        const ln = n.replace(/\\/g, '/');
        if (ln === 'AndroidManifest.xml' || ln.endsWith('/AndroidManifest.xml')) hasManifest = true;
        if (ln === 'resources.arsc') hasArsc = true;
        if (/classes\d*\.dex$/i.test(ln)) dexFiles.push(ln);
        if (/^lib\/([^/]+)\/.+\.so$/i.test(ln)) {
            const m = ln.match(/^lib\/([^/]+)\//i);
            if (m) abis.add(m[1]);
            nativeLibs.push(ln);
        }
        if (/classes\.jar$/i.test(ln)) hasClassesJar = true;
        if (/proguard|r8|mapping\.txt|seeds\.txt|usage\.txt/i.test(ln)) {
            obfuscation.push(ln);
        }
        if (/META-INF\/.+\.version/i.test(ln) && /r8|d8/i.test(ln)) obfuscation.push(ln);
    }

    // Heuristic: many short dex class names often mean obfuscation; we only flag known artifacts.
    if (obfuscation.some(x => /mapping\.txt/i.test(x))) {
        obfuscation.push('R8/ProGuard mapping present');
    }

    const manifestNotes: string[] = [];
    if (hasManifest) manifestNotes.push('Binary AndroidManifest.xml present (AXML; not decoded in this pass).');
    if (!hasManifest) manifestNotes.push('No AndroidManifest.xml at archive root.');

    // Optional: sibling Gradle lock / deps next to the APK (project tree analysis)
    const gradleLockNotes: string[] = [];
    const dir = path.dirname(abs);
    for (const cand of ['gradle.lockfile', 'libs.versions.toml', 'build.gradle', 'build.gradle.kts']) {
        try {
            await stat(path.join(dir, cand));
            gradleLockNotes.push(`Found sibling ${cand}`);
        } catch { /* none */ }
    }
    try {
        const lock = await readFile(path.join(dir, 'gradle.lockfile'), 'utf8');
        const deps = lock.split(/\r?\n/).filter(l => l && !l.startsWith('#') && l.includes(':')).slice(0, 50);
        if (deps.length) gradleLockNotes.push(`gradle.lockfile entries sample: ${deps.length}`);
    } catch { /* none */ }

    const finding: AndroidFinding = {
        format: format === 'unknown' && (dexFiles.length || hasManifest) ? 'APK' : format,
        entries: names.length,
        abis: [...abis].sort(),
        dexFiles: dexFiles.slice(0, 100),
        nativeLibs: nativeLibs.slice(0, 200),
        hasAndroidManifest: hasManifest,
        hasResourcesArsc: hasArsc,
        hasClassesJar,
        obfuscationIndicators: [...new Set(obfuscation)].slice(0, 50),
        manifestNotes,
        gradleLockNotes,
        totalUncompressedHint: uncompressed
    };

    const ev = await fileEvidence(abs);
    return result(abs, 'android_static_inventory', [finding], {
        evidence: [ev],
        status: 'completed',
        limitations: [
            'APK/AAB treated as ZIP; AndroidManifest.xml is not decoded (binary AXML).',
            'No DEX disassembly or class enumeration beyond file list.',
            'R8/ProGuard detection is path/heuristic based, not a full mapping parser.',
            'Gradle dependency resolution is limited to sibling lock/manifest presence.'
        ],
        coverage: {
            examined: true,
            complete: true,
            notes: [
                `${names.length} zip entries.`,
                `${dexFiles.length} dex, ${nativeLibs.length} native libs, ABIs: ${[...abis].join(', ') || 'none'}.`,
                ...(obfuscation.length ? [`Obfuscation indicators: ${obfuscation.length}`] : [])
            ]
        }
    });
}
