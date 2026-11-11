/**
 * Legacy Linux static inventory (Patch N, steps 1+3 start).
 * a.out + ELF32/ELF64: headers, PT_INTERP, DT_NEEDED, RPATH/RUNPATH,
 * hardening hints, libc/libstdc++ generation markers.
 * Reuses the shared Target Profile and authorization gate from M.
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { result } from './core-types.js';
import { profileField, type LegacyAuthorization, type TargetProfile } from './legacy-types.js';
import { requireLegacyGate } from './legacy-gate.js';
import { diagnoseLinuxFromTables, type LinuxCompatDiagnosis } from './legacy-linux-tables.js';
import { extractSymbolVersionHints, type SymbolVersionHint } from './legacy-linux-symver.js';
import { inspectPackageBuffer, type PackageMetadata } from './legacy-linux-packages.js';
export interface LegacyLinuxFinding {
    format: 'a.out' | 'ELF' | 'unknown';
    architecture: string;
    bitness: number | null;
    endian: 'little' | 'big' | null;
    interpreter: string | null;
    neededLibraries: string[];
    rpath: string | null;
    runpath: string | null;
    hardening: {
        pie: boolean | null;
        nx: boolean | null;
        relro: 'none' | 'partial' | 'full' | null;
        evidence: string[];
    };
    libcMarkers: string[];
    compilerMarkers: string[];
    compatibilityFindings: LinuxCompatDiagnosis[];
    symbolVersionHints: SymbolVersionHint[];
    packageMetadata: PackageMetadata | null;
    targetProfile: TargetProfile;
    authorization: LegacyAuthorization;
    sha256: string;
}
const MAX_READ = 2 * 1024 * 1024;
function u16(b: Buffer, o: number, le: boolean): number {
    return le ? b.readUInt16LE(o) : b.readUInt16BE(o);
}
function u32(b: Buffer, o: number, le: boolean): number {
    return le ? b.readUInt32LE(o) : b.readUInt32BE(o);
}
/** Classic a.out magic numbers (little-endian host representation). */
function detectAout(b: Buffer): {
    format: 'a.out';
    architecture: string;
    bitness: number;
    evidence: string;
} | null {
    if (b.length < 32)
        return null;
    const mag = b.readUInt32LE(0);
    // OMAGIC 0407, NMAGIC 0410, ZMAGIC 0413, QMAGIC 0314 (octal)
    const map: Record<number, string> = {
        0x00000107: 'OMAGIC',
        0x00000108: 'NMAGIC',
        0x0000010b: 'ZMAGIC',
        0x000000cc: 'QMAGIC'
    };
    // Also accept network byte order variants seen on some archives
    const magBe = b.readUInt32BE(0);
    const kind = map[mag] ?? map[magBe];
    if (!kind)
        return null;
    return {
        format: 'a.out',
        architecture: 'x86',
        bitness: 32,
        evidence: `a.out ${kind} magic at offset 0`
    };
}
interface ElfDyn {
    needed: string[];
    rpath: string | null;
    runpath: string | null;
    interpreter: string | null;
    flags: number | null;
    flags1: number | null;
}
function parseElf(b: Buffer): {
    architecture: string;
    bitness: number;
    endian: 'little' | 'big';
    dyn: ElfDyn;
    pie: boolean | null;
    nx: boolean | null;
    relro: 'none' | 'partial' | 'full' | null;
    evidence: string[];
} | null {
    if (b.length < 52 || b[0] !== 0x7f || b.toString('ascii', 1, 4) !== 'ELF')
        return null;
    const cls = b[4]; // 1=32 2=64
    const data = b[5]; // 1=LE 2=BE
    if (cls !== 1 && cls !== 2)
        return null;
    if (data !== 1 && data !== 2)
        return null;
    const le = data === 1;
    const is64 = cls === 2;
    const bitness = is64 ? 64 : 32;
    const machine = u16(b, 18, le);
    const machines: Record<number, string> = {
        3: 'x86',
        62: 'x86-64',
        20: 'PowerPC',
        21: 'PowerPC64',
        40: 'ARM',
        183: 'AArch64',
        8: 'MIPS',
        4: 'm68k',
        2: 'SPARC',
        15: 'Alpha'
    };
    const architecture = machines[machine] ?? `ELF-machine-${machine}`;
    const e_type = u16(b, 16, le);
    const e_phoff = is64
        ? Number(le ? b.readBigUInt64LE(32) : b.readBigUInt64BE(32))
        : u32(b, 28, le);
    const e_phentsize = u16(b, is64 ? 54 : 42, le);
    const e_phnum = u16(b, is64 ? 56 : 44, le);
    const evidence: string[] = [
        `ELF class=${bitness} endian=${le ? 'LE' : 'BE'} machine=${architecture}`
    ];
    let interpreter: string | null = null;
    let nx: boolean | null = null;
    let relro: 'none' | 'partial' | 'full' | null = 'none';
    let hasRelro = false;
    let dynOff = 0;
    let dynSize = 0;
    const PT_INTERP = 3;
    const PT_LOAD = 1;
    const PT_DYNAMIC = 2;
    const PT_GNU_STACK = 0x6474e551;
    const PT_GNU_RELRO = 0x6474e552;
    let execStack: boolean | null = null;
    for (let i = 0; i < e_phnum && i < 256; i++) {
        const pho = e_phoff + i * e_phentsize;
        if (pho + e_phentsize > b.length)
            break;
        const p_type = u32(b, pho, le);
        const p_flags = is64 ? u32(b, pho + 4, le) : u32(b, pho + 24, le);
        const p_offset = is64
            ? Number(le ? b.readBigUInt64LE(pho + 8) : b.readBigUInt64BE(pho + 8))
            : u32(b, pho + 4, le);
        const p_filesz = is64
            ? Number(le ? b.readBigUInt64LE(pho + 32) : b.readBigUInt64BE(pho + 32))
            : u32(b, pho + 16, le);
        if (p_type === PT_INTERP && p_offset > 0 && p_filesz > 0) {
            const end = Math.min(p_offset + p_filesz, b.length);
            const raw = b.subarray(p_offset, end);
            const z = raw.indexOf(0);
            interpreter = raw.toString('utf8', 0, z === -1 ? raw.length : z);
            evidence.push(`PT_INTERP "${interpreter}"`);
        }
        if (p_type === PT_DYNAMIC && p_offset > 0) {
            dynOff = p_offset;
            dynSize = p_filesz;
        }
        if (p_type === PT_GNU_STACK) {
            execStack = (p_flags & 1) !== 0; // PF_X
            nx = !execStack;
            evidence.push(`PT_GNU_STACK PF_X=${execStack}`);
        }
        if (p_type === PT_GNU_RELRO) {
            hasRelro = true;
            evidence.push('PT_GNU_RELRO present');
        }
    }
    // PIE: ET_DYN (3) is typical for PIE executables
    const pie = e_type === 3 ? true : e_type === 2 ? false : null;
    if (pie === true)
        evidence.push('e_type=ET_DYN (PIE or shared object)');
    if (pie === false)
        evidence.push('e_type=ET_EXEC');
    const needed: string[] = [];
    let rpath: string | null = null;
    let runpath: string | null = null;
    let flags: number | null = null;
    let flags1: number | null = null;
    if (dynOff > 0 && dynSize > 0) {
        const ent = is64 ? 16 : 8;
        const count = Math.min(Math.floor(dynSize / ent), 512);
        // Collect string table from DT_STRTAB / DT_STRSZ
        let strtabOff = 0;
        let strtabSz = 0;
        const tags: Array<{
            tag: number;
            val: number;
        }> = [];
        for (let i = 0; i < count; i++) {
            const o = dynOff + i * ent;
            if (o + ent > b.length)
                break;
            let tag: number;
            let val: number;
            if (is64) {
                tag = Number(le ? b.readBigInt64LE(o) : b.readBigInt64BE(o));
                val = Number(le ? b.readBigUInt64LE(o + 8) : b.readBigUInt64BE(o + 8));
            }
            else {
                tag = u32(b, o, le) | 0;
                val = u32(b, o + 4, le);
            }
            if (tag === 0)
                break; // DT_NULL
            tags.push({ tag, val });
            if (tag === 5)
                strtabOff = val; // DT_STRTAB — may be VA; best-effort file offset match via PT_LOAD
            if (tag === 10)
                strtabSz = val;
        }
        // Map VA strtab to file offset using first PT_LOAD
        let strFile = strtabOff;
        for (let i = 0; i < e_phnum && i < 256; i++) {
            const pho = e_phoff + i * e_phentsize;
            if (pho + e_phentsize > b.length)
                break;
            const p_type = u32(b, pho, le);
            if (p_type !== PT_LOAD)
                continue;
            const p_offset = is64
                ? Number(le ? b.readBigUInt64LE(pho + 8) : b.readBigUInt64BE(pho + 8))
                : u32(b, pho + 4, le);
            const p_vaddr = is64
                ? Number(le ? b.readBigUInt64LE(pho + 16) : b.readBigUInt64BE(pho + 16))
                : u32(b, pho + 8, le);
            const p_filesz = is64
                ? Number(le ? b.readBigUInt64LE(pho + 32) : b.readBigUInt64BE(pho + 32))
                : u32(b, pho + 16, le);
            if (strtabOff >= p_vaddr && strtabOff < p_vaddr + p_filesz) {
                strFile = p_offset + (strtabOff - p_vaddr);
                break;
            }
        }
        const readDynStr = (off: number): string => {
            const start = strFile + off;
            if (start < 0 || start >= b.length)
                return '';
            const endLimit = strtabSz > 0
                ? Math.min(strFile + strtabSz, b.length)
                : b.length;
            let end = start;
            while (end < endLimit && b[end] !== 0)
                end++;
            return b.toString('utf8', start, end);
        };
        for (const { tag, val } of tags) {
            if (tag === 1) {
                const n = readDynStr(val);
                if (n)
                    needed.push(n);
            }
            else if (tag === 15) {
                rpath = readDynStr(val) || rpath;
            }
            else if (tag === 29) {
                runpath = readDynStr(val) || runpath;
            }
            else if (tag === 30)
                flags = val;
            else if (tag === 0x6ffffffb)
                flags1 = val;
        }
        if (needed.length)
            evidence.push(`DT_NEEDED: ${needed.slice(0, 8).join(', ')}`);
        if (hasRelro) {
            // DF_1_NOW (0x1) in flags_1 → full RELRO
            relro = flags1 != null && (flags1 & 0x1) !== 0 ? 'full' : 'partial';
        }
    }
    return {
        architecture,
        bitness,
        endian: le ? 'little' : 'big',
        dyn: { needed, rpath, runpath, interpreter, flags, flags1 },
        pie,
        nx,
        relro,
        evidence
    };
}
function detectLibcMarkers(text: string, needed: string[]): string[] {
    const out: string[] = [];
    const blob = `${text}\n${needed.join('\n')}`.toLowerCase();
    if (/libc\.so\.5|libc5/.test(blob))
        out.push('libc5');
    if (/ld-linux\.so\.1/.test(blob))
        out.push('ld-linux.so.1 (glibc 2.x era interpreter)');
    if (/ld-linux\.so\.2|ld-linux-x86-64\.so\.2/.test(blob))
        out.push('glibc dynamic linker (ld-linux.so.2)');
    if (/glibc_2\./i.test(text))
        out.push('GLIBC symbol versioning present');
    if (/uclibc/.test(blob))
        out.push('uClibc');
    if (/musl/.test(blob))
        out.push('musl');
    return [...new Set(out)];
}
function detectCompilerMarkers(text: string, needed: string[]): string[] {
    const out: string[] = [];
    const n = needed.join(' ').toLowerCase();
    if (/libstdc\+\+\.so\.6/.test(n))
        out.push('libstdc++.so.6 (GCC 3.4+/4.x)');
    if (/libstdc\+\+\.so\.5/.test(n))
        out.push('libstdc++.so.5 (GCC 3.0–3.3)');
    if (/libstdc\+\+.*libc6/.test(n))
        out.push('libstdc++-libc6 (GCC 2.95 era)');
    if (/GCC:/.test(text))
        out.push('GCC version string in .comment');
    if (/GLIBCXX_3\./i.test(text))
        out.push('GLIBCXX symbol versions');
    if (/CXXABI_/i.test(text))
        out.push('CXXABI symbol versions');
    return [...new Set(out)];
}
function guessLibcGeneration(markers: string[], needed: string[]): string | null {
    if (markers.some(m => /libc5/i.test(m)))
        return 'libc5';
    if (markers.some(m => /uClibc/i.test(m)))
        return 'uClibc';
    if (markers.some(m => /musl/i.test(m)))
        return 'musl';
    if (needed.some(n => /libc\.so\.6/.test(n)) || markers.some(m => /glibc/i.test(m)))
        return 'glibc-2.x';
    return null;
}
function guessCompilerAbi(markers: string[]): string | null {
    if (markers.some(m => /libstdc\+\+\.so\.6/.test(m)))
        return 'libstdc++.so.6 / GCC 3.4+';
    if (markers.some(m => /libstdc\+\+\.so\.5/.test(m)))
        return 'libstdc++.so.5 / GCC 3.x';
    if (markers.some(m => /GCC 2\.95|libstdc\+\+-libc6/.test(m)))
        return 'GCC 2.95-era libstdc++';
    if (markers.some(m => /GCC|GLIBCXX|CXXABI/.test(m)))
        return 'GCC (generation not pinned)';
    return null;
}
/**
 * Analyze an old Linux binary under the shared legacy authorization gate.
 */
export async function analyzeLegacyLinux(filePath: string, authorization?: LegacyAuthorization | null, sessionId?: string) {
    const auth = await requireLegacyGate({
        sessionId,
        authorization,
        operation: 'analyze_legacy_linux'
    });
    const abs = path.resolve(filePath);
    const st = await stat(abs);
    const size = Math.min(st.size, MAX_READ);
    const b = size > 0
        ? await readFile(abs, { encoding: null }).then(buf => buf.subarray(0, size))
        : Buffer.alloc(0);
    const sha256 = createHash('sha256').update(b).digest('hex');
    const text = b.toString('latin1');
    const aout = detectAout(b);
    const elf = aout ? null : parseElf(b);
    let format: LegacyLinuxFinding['format'] = 'unknown';
    let architecture = 'unknown';
    let bitness: number | null = null;
    let endian: LegacyLinuxFinding['endian'] = null;
    let interpreter: string | null = null;
    let needed: string[] = [];
    let rpath: string | null = null;
    let runpath: string | null = null;
    let hardening: LegacyLinuxFinding['hardening'] = {
        pie: null,
        nx: null,
        relro: null,
        evidence: []
    };
    const formatEvidence: string[] = [];
    if (aout) {
        format = 'a.out';
        architecture = aout.architecture;
        bitness = aout.bitness;
        endian = 'little';
        formatEvidence.push(aout.evidence);
    }
    else if (elf) {
        format = 'ELF';
        architecture = elf.architecture;
        bitness = elf.bitness;
        endian = elf.endian;
        interpreter = elf.dyn.interpreter;
        needed = elf.dyn.needed;
        rpath = elf.dyn.rpath;
        runpath = elf.dyn.runpath;
        hardening = {
            pie: elf.pie,
            nx: elf.nx,
            relro: elf.relro,
            evidence: elf.evidence.slice()
        };
        formatEvidence.push(...elf.evidence);
    }
    else {
        formatEvidence.push('No a.out or ELF magic in the bounded read window.');
    }
    const libcMarkers = detectLibcMarkers(text, needed);
    const compilerMarkers = detectCompilerMarkers(text, needed);
    const symbolVersionHints = extractSymbolVersionHints(b);
    // Package containers are a separate path; only annotate when magic matches.
    const pkg = inspectPackageBuffer(b, abs);
    const packageMetadata = pkg.kind === 'unknown' ? null : pkg;
    const libcGen = guessLibcGeneration(libcMarkers, needed);
    const compilerAbi = guessCompilerAbi(compilerMarkers);
    const targetProfile: TargetProfile = {
        schemaVersion: '1.0',
        osAndEra: profileField({
            value: {
                family: 'Linux',
                era: format === 'a.out'
                    ? 'a.out / early Linux (libc5 era candidate)'
                    : libcGen === 'libc5'
                        ? 'Linux libc5 era'
                        : 'Linux glibc 2.x era candidate'
            },
            evidence: formatEvidence,
            confidence: format === 'unknown' ? 0.2 : 0.85,
            coverageNotes: [
                'Era is a heuristic from format and libc markers, not a calibrated classifier.'
            ],
            complete: format !== 'unknown'
        }),
        cpu: profileField({
            value: architecture,
            evidence: formatEvidence.slice(0, 2),
            confidence: architecture === 'unknown' ? 0.2 : 0.95
        }),
        bitness: profileField({
            value: bitness,
            evidence: formatEvidence.slice(0, 2),
            confidence: bitness == null ? 0.2 : 0.95
        }),
        abi: profileField({
            value: endian ? `${endian}-endian${interpreter ? `; interp=${interpreter}` : ''}` : null,
            evidence: interpreter ? [`PT_INTERP ${interpreter}`] : formatEvidence.slice(0, 1),
            confidence: interpreter ? 0.9 : 0.4,
            complete: !!interpreter
        }),
        toolchainRuntimeFramework: profileField({
            value: [
                ...libcMarkers,
                ...compilerMarkers,
                ...symbolVersionHints.map(h => h.name)
            ],
            evidence: [
                ...libcMarkers.map(m => `marker: ${m}`),
                ...compilerMarkers.map(m => `marker: ${m}`),
                ...symbolVersionHints.slice(0, 8).map(h => h.evidence)
            ],
            confidence: libcMarkers.length || compilerMarkers.length ? 0.75 : 0.3,
            coverageNotes: [
                'Markers are static; not a full ABI audit.',
                'Confidence uncalibrated until N calibration corpus (step 2).'
            ],
            complete: false
        }),
        installer: profileField({
            value: null,
            evidence: [],
            confidence: 0,
            coverageNotes: ['Package/installer metadata readers are not implemented yet (N step 3).'],
            complete: false
        }),
        dependencies: profileField({
            value: needed,
            evidence: needed.length
                ? [`DT_NEEDED (${needed.length}): ${needed.slice(0, 6).join(', ')}`]
                : ['No DT_NEEDED in the bounded dynamic section.'],
            confidence: needed.length ? 0.9 : 0.3,
            complete: format === 'ELF' && needed.length > 0
        }),
        libcGeneration: profileField({
            value: libcGen,
            evidence: libcMarkers.length
                ? libcMarkers.map(m => `marker: ${m}`)
                : ['No libc generation marker matched.'],
            confidence: libcGen ? 0.7 : 0.2,
            complete: !!libcGen
        }),
        compilerAbiGeneration: profileField({
            value: compilerAbi,
            evidence: compilerMarkers.length
                ? compilerMarkers.map(m => `marker: ${m}`)
                : ['No compiler ABI marker matched.'],
            confidence: compilerAbi ? 0.7 : 0.2,
            complete: !!compilerAbi
        }),
        threadModel: profileField({
            value: null,
            evidence: [],
            confidence: 0,
            coverageNotes: [
                'LinuxThreads vs NPTL detection not implemented in this increment.'
            ],
            complete: false
        }),
        dynamicInterpreter: profileField({
            value: interpreter,
            evidence: interpreter ? [`PT_INTERP ${interpreter}`] : ['No PT_INTERP.'],
            confidence: interpreter ? 0.95 : 0.3,
            complete: !!interpreter
        })
    };
    const compatibilityFindings = diagnoseLinuxFromTables({
        format,
        neededLibraries: needed,
        interpreter,
        libcMarkers,
        compilerMarkers
    });
    const finding: LegacyLinuxFinding = {
        format,
        architecture,
        bitness,
        endian,
        interpreter,
        neededLibraries: needed,
        rpath,
        runpath,
        hardening,
        libcMarkers,
        compilerMarkers,
        compatibilityFindings,
        symbolVersionHints,
        packageMetadata,
        targetProfile,
        authorization: auth,
        sha256
    };
    return result(abs, 'legacy_linux_analysis', [finding], {
        status: format === 'unknown' ? 'partial' : 'completed',
        limitations: [
            'Bounded read of the file head only; truncated ELFs may miss dynamic data.',
            'No execution or loader simulation in this increment.',
            'Symbol-version tables (.gnu.version_r) are not fully walked yet.',
            ...hardening.evidence.length
                ? []
                : ['Hardening flags incomplete when GNU program headers are absent.']
        ]
    });
}
