import { open, stat } from 'node:fs/promises';
import path from 'node:path';
import { result } from './core-types.js';
import { fileEvidence } from './core-util.js';
export interface BinarySection {
    name: string;
    addr?: string;
    size: number;
    offset?: number;
    type?: string;
    flags?: string;
}
export interface BinarySymbol {
    name: string;
    addr?: string;
    size?: number;
    type?: string;
    bind?: string;
}
export interface BinaryFinding {
    format: string;
    architecture: string;
    bitness: number | null;
    endian: string | null;
    fileSize: number;
    entryPoint?: string;
    sections?: BinarySection[];
    imports?: string[];
    exports?: string[];
    symbols?: BinarySymbol[];
    functions?: {
        name: string;
        addr?: string;
        size?: number;
    }[];
    /** Library/module edges only (import table); not a full intra-binary CFG. */
    callGraphEdges?: {
        from: string;
        to: string;
        kind: 'import' | 'export';
    }[];
    loadCommands?: string[];
    slices?: {
        offset: number;
        size: number;
        arch: string;
    }[];
}
const u16 = (b: Buffer, o: number, le = true) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o));
const u32 = (b: Buffer, o: number, le = true) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
const u64 = (b: Buffer, o: number, le = true) => (le ? b.readBigUInt64LE(o) : b.readBigUInt64BE(o)).toString(16);
const MAX_HEADER = 2 * 1024 * 1024;
async function readPrefix(abs: string, max: number): Promise<{
    buf: Buffer;
    size: number;
}> {
    const s = await stat(abs);
    const n = Math.min(s.size, max);
    const h = await open(abs, 'r');
    const buf = Buffer.alloc(n);
    try {
        await h.read(buf, 0, n, 0);
    }
    finally {
        await h.close();
    }
    return { buf, size: s.size };
}
function parseElf(b: Buffer, fileSize: number): BinaryFinding {
    const cls = b[4];
    const le = b[5] === 1;
    const is64 = cls === 2;
    const machine = u16(b, 18, le);
    const arch: Record<number, string> = {
        3: 'x86', 62: 'x86_64', 40: 'ARM', 183: 'AArch64', 243: 'RISC-V', 8: 'MIPS'
    };
    const e_shoff = is64 ? Number(le ? b.readBigUInt64LE(40) : b.readBigUInt64BE(40)) : u32(b, 32, le);
    const e_shentsize = u16(b, is64 ? 58 : 46, le);
    const e_shnum = u16(b, is64 ? 60 : 48, le);
    const e_shstrndx = u16(b, is64 ? 62 : 50, le);
    const entry = is64 ? u64(b, 24, le) : u32(b, 24, le).toString(16);
    const f: BinaryFinding = {
        format: 'ELF',
        bitness: is64 ? 64 : cls === 1 ? 32 : null,
        endian: le ? 'little' : 'big',
        architecture: arch[machine] ?? `machine-${machine}`,
        fileSize,
        entryPoint: entry
    };
    const sections: BinarySection[] = [];
    let shstrtab: Buffer = Buffer.alloc(0);
    if (e_shoff > 0 && e_shnum > 0 && e_shentsize >= (is64 ? 64 : 40) &&
        e_shoff + e_shnum * e_shentsize <= b.length) {
        if (e_shstrndx < e_shnum) {
            const sho = e_shoff + e_shstrndx * e_shentsize;
            const sh_offset = is64 ? Number(le ? b.readBigUInt64LE(sho + 24) : b.readBigUInt64BE(sho + 24)) : u32(b, sho + 16, le);
            const sh_size = is64 ? Number(le ? b.readBigUInt64LE(sho + 32) : b.readBigUInt64BE(sho + 32)) : u32(b, sho + 20, le);
            if (sh_offset + sh_size <= b.length)
                shstrtab = b.subarray(sh_offset, sh_offset + Math.min(sh_size, 65536));
        }
        const SHT: Record<number, string> = {
            0: 'NULL', 1: 'PROGBITS', 2: 'SYMTAB', 3: 'STRTAB', 4: 'RELA', 5: 'HASH',
            6: 'DYNAMIC', 7: 'NOTE', 8: 'NOBITS', 9: 'REL', 11: 'DYNSYM'
        };
        for (let i = 0; i < e_shnum && i < 256; i++) {
            const sho = e_shoff + i * e_shentsize;
            const nameOff = u32(b, sho, le);
            let name = '';
            if (nameOff < shstrtab.length) {
                const end = shstrtab.indexOf(0, nameOff);
                name = shstrtab.toString('utf8', nameOff, end === -1 ? Math.min(nameOff + 64, shstrtab.length) : end);
            }
            const type = u32(b, sho + 4, le);
            const flags = is64 ? Number(le ? b.readBigUInt64LE(sho + 8) : b.readBigUInt64BE(sho + 8)) : u32(b, sho + 8, le);
            const addr = is64 ? u64(b, sho + 16, le) : u32(b, sho + 12, le).toString(16);
            const offset = is64 ? Number(le ? b.readBigUInt64LE(sho + 24) : b.readBigUInt64BE(sho + 24)) : u32(b, sho + 16, le);
            const size = is64 ? Number(le ? b.readBigUInt64LE(sho + 32) : b.readBigUInt64BE(sho + 32)) : u32(b, sho + 20, le);
            const flagStr = [
                flags & 1 ? 'W' : '', flags & 2 ? 'A' : '', flags & 4 ? 'X' : ''
            ].join('') || undefined;
            sections.push({
                name: name || `[${i}]`,
                addr,
                size,
                offset,
                type: SHT[type] ?? `type-${type}`,
                flags: flagStr
            });
        }
        f.sections = sections;
        const symbols: BinarySymbol[] = [];
        const imports: string[] = [];
        const exports: string[] = [];
        for (const sec of sections) {
            if ((sec.type !== 'SYMTAB' && sec.type !== 'DYNSYM') || sec.offset == null || sec.size <= 0)
                continue;
            const entSize = is64 ? 24 : 16;
            const count = Math.min(Math.floor(sec.size / entSize), 4096);
            if (sec.offset + count * entSize > b.length)
                continue;
            let strtab: Buffer = Buffer.alloc(0);
            const strName = sec.name === '.dynsym' ? '.dynstr' : '.strtab';
            const strSec = sections.find(s => s.name === strName);
            if (strSec && strSec.offset != null && strSec.size > 0 && strSec.offset + strSec.size <= b.length) {
                strtab = b.subarray(strSec.offset, strSec.offset + Math.min(strSec.size, 256 * 1024));
            }
            for (let i = 0; i < count; i++) {
                const so = sec.offset + i * entSize;
                const st_name = u32(b, so, le);
                let name = '';
                if (st_name > 0 && st_name < strtab.length) {
                    const end = strtab.indexOf(0, st_name);
                    name = strtab.toString('utf8', st_name, end === -1 ? Math.min(st_name + 128, strtab.length) : end);
                }
                if (!name)
                    continue;
                const info = is64 ? b[so + 4] : b[so + 12];
                const bind = info >> 4;
                const typ = info & 0xf;
                const bindStr = bind === 0 ? 'LOCAL' : bind === 1 ? 'GLOBAL' : bind === 2 ? 'WEAK' : `bind-${bind}`;
                const typeStr = typ === 0 ? 'NOTYPE' : typ === 1 ? 'OBJECT' : typ === 2 ? 'FUNC' : typ === 3 ? 'SECTION' : `type-${typ}`;
                const value = is64 ? u64(b, so + 8, le) : u32(b, so + 4, le).toString(16);
                const size = is64 ? Number(le ? b.readBigUInt64LE(so + 16) : b.readBigUInt64BE(so + 16)) : u32(b, so + 8, le);
                const shndx = is64 ? u16(b, so + 6, le) : u16(b, so + 14, le);
                symbols.push({ name, addr: value, size, type: typeStr, bind: bindStr });
                if (sec.type === 'DYNSYM' && shndx === 0 && bind !== 0)
                    imports.push(name);
                if (bind === 1 && typ === 2 && shndx !== 0)
                    exports.push(name);
            }
        }
        if (symbols.length)
            f.symbols = symbols.slice(0, 2000);
        if (imports.length)
            f.imports = [...new Set(imports)].slice(0, 500);
        if (exports.length)
            f.exports = [...new Set(exports)].slice(0, 500);
    }
    return f;
}
function parsePe(b: Buffer, fileSize: number): BinaryFinding {
    const peOff = u32(b, 0x3c);
    if (peOff + 24 > b.length || b.toString('ascii', peOff, peOff + 4) !== 'PE\0\0') {
        return { format: 'DOS/PE-like', architecture: 'unknown', bitness: null, endian: 'little', fileSize };
    }
    const machine = u16(b, peOff + 4);
    const numSections = u16(b, peOff + 6);
    const optSize = u16(b, peOff + 20);
    const magicOpt = u16(b, peOff + 24);
    const is64 = magicOpt === 0x20b;
    const arch: Record<number, string> = { 0x14c: 'x86', 0x8664: 'x86_64', 0x1c0: 'ARM', 0xaa64: 'ARM64' };
    const entryRva = u32(b, peOff + 24 + 16);
    const f: BinaryFinding = {
        format: 'PE',
        architecture: arch[machine] ?? `machine-${machine}`,
        bitness: is64 ? 64 : magicOpt === 0x10b ? 32 : null,
        endian: 'little',
        fileSize,
        entryPoint: entryRva.toString(16)
    };
    const ddOff = peOff + 24 + (is64 ? 112 : 96);
    let importRva = 0, exportRva = 0;
    if (ddOff + 16 <= b.length) {
        exportRva = u32(b, ddOff);
        importRva = u32(b, ddOff + 8);
    }
    const secTable = peOff + 24 + optSize;
    const sections: BinarySection[] = [];
    for (let i = 0; i < numSections && i < 96; i++) {
        const so = secTable + i * 40;
        if (so + 40 > b.length)
            break;
        const name = b.toString('ascii', so, so + 8).replace(/\0.*$/, '');
        const vsize = u32(b, so + 8);
        const vaddr = u32(b, so + 12);
        const rawSize = u32(b, so + 16);
        const rawPtr = u32(b, so + 20);
        const chars = u32(b, so + 36);
        const flags = [
            chars & 0x20 ? 'CODE' : '', chars & 0x40 ? 'IDATA' : '', chars & 0x80 ? 'UDATA' : '',
            chars & 0x20000000 ? 'X' : '', chars & 0x40000000 ? 'R' : '', chars & 0x80000000 ? 'W' : ''
        ].filter(Boolean).join('|') || undefined;
        sections.push({
            name, addr: vaddr.toString(16), size: vsize || rawSize, offset: rawPtr, type: 'section', flags
        });
    }
    f.sections = sections;
    const rvaToOff = (rva: number): number | null => {
        for (const s of sections) {
            const va = parseInt(s.addr ?? '0', 16);
            const sz = s.size || 0;
            if (rva >= va && rva < va + sz && s.offset != null)
                return s.offset + (rva - va);
        }
        return null;
    };
    const imports: string[] = [];
    if (importRva) {
        let off = rvaToOff(importRva);
        if (off != null) {
            for (let i = 0; i < 256; i++) {
                if (off + 20 > b.length)
                    break;
                const nameRva = u32(b, off + 12);
                if (nameRva === 0)
                    break;
                const nameOff = rvaToOff(nameRva);
                if (nameOff != null && nameOff < b.length) {
                    const end = b.indexOf(0, nameOff);
                    const dll = b.toString('utf8', nameOff, end === -1 ? nameOff + 64 : end);
                    if (dll)
                        imports.push(dll);
                }
                off += 20;
            }
        }
    }
    if (imports.length)
        f.imports = imports;
    const exports: string[] = [];
    if (exportRva) {
        const expOff = rvaToOff(exportRva);
        if (expOff != null && expOff + 40 <= b.length) {
            const numNames = u32(b, expOff + 24);
            const namesRva = u32(b, expOff + 32);
            const namesOff = rvaToOff(namesRva);
            if (namesOff != null) {
                for (let i = 0; i < Math.min(numNames, 1000); i++) {
                    const nRva = u32(b, namesOff + i * 4);
                    const nOff = rvaToOff(nRva);
                    if (nOff != null && nOff < b.length) {
                        const end = b.indexOf(0, nOff);
                        const nm = b.toString('utf8', nOff, end === -1 ? nOff + 128 : end);
                        if (nm)
                            exports.push(nm);
                    }
                }
            }
        }
    }
    if (exports.length)
        f.exports = exports;
    return f;
}
function parseMachO(b: Buffer, fileSize: number, magic: number): BinaryFinding {
    const le = magic === 0xfeedface || magic === 0xfeedfacf;
    const is64 = magic === 0xfeedfacf || magic === 0xcffaedfe;
    const cpu = u32(b, 4, le);
    const ncmds = u32(b, is64 ? 16 : 12, le);
    const sizeofcmds = u32(b, is64 ? 20 : 16, le);
    const archMap: Record<number, string> = {
        7: 'x86', 0x1000007: 'x86_64', 12: 'ARM', 0x100000c: 'ARM64'
    };
    const f: BinaryFinding = {
        format: is64 ? 'Mach-O 64-bit' : 'Mach-O 32-bit',
        architecture: archMap[cpu] ?? `cpu-${cpu.toString(16)}`,
        bitness: is64 ? 64 : 32,
        endian: le ? 'little' : 'big',
        fileSize
    };
    const loadCommands: string[] = [];
    const sections: BinarySection[] = [];
    let off = is64 ? 32 : 28;
    const end = Math.min(off + sizeofcmds, b.length);
    for (let i = 0; i < ncmds && i < 256 && off + 8 <= end; i++) {
        const cmd = u32(b, off, le);
        const cmdsize = u32(b, off + 4, le);
        if (cmdsize < 8)
            break;
        const LC: Record<number, string> = {
            0x1: 'SEGMENT', 0x19: 'SEGMENT_64', 0x2: 'SYMTAB', 0xe: 'LOAD_DYLIB',
            0xc: 'LOAD_DYLINKER', 0x80000022: 'DYLD_INFO_ONLY', 0x2b: 'BUILD_VERSION'
        };
        const cname = LC[cmd] ?? `cmd-0x${cmd.toString(16)}`;
        loadCommands.push(cname);
        if ((cmd === 0x1 || cmd === 0x19) && cmdsize >= (is64 ? 72 : 56)) {
            const segName = b.toString('ascii', off + 8, off + 24).replace(/\0.*$/, '');
            const nsects = u32(b, off + (is64 ? 64 : 48), le);
            let secOff = off + (is64 ? 72 : 56);
            for (let s = 0; s < nsects && s < 64; s++) {
                const ent = is64 ? 80 : 68;
                if (secOff + ent > b.length)
                    break;
                const sname = b.toString('ascii', secOff, secOff + 16).replace(/\0.*$/, '');
                const addr = is64 ? u64(b, secOff + 32, le) : u32(b, secOff + 32, le).toString(16);
                const size = is64 ? Number(le ? b.readBigUInt64LE(secOff + 40) : b.readBigUInt64BE(secOff + 40)) : u32(b, secOff + 36, le);
                const fileoff = is64
                    ? Number(le ? b.readBigUInt64LE(secOff + 48) : b.readBigUInt64BE(secOff + 48))
                    : u32(b, secOff + 40, le);
                sections.push({
                    name: `${segName},${sname}`,
                    addr,
                    size,
                    offset: fileoff,
                    type: 'section'
                });
                secOff += ent;
            }
        }
        if (cmd === 0xe && cmdsize > 24) {
            const nameOff = u32(b, off + 8, le);
            if (nameOff < cmdsize) {
                const start = off + nameOff;
                const endz = b.indexOf(0, start);
                const lib = b.toString('utf8', start, endz === -1 ? start + 128 : endz);
                if (lib) {
                    f.imports = f.imports ?? [];
                    f.imports.push(lib);
                }
            }
        }
        off += cmdsize;
    }
    if (loadCommands.length)
        f.loadCommands = loadCommands;
    if (sections.length)
        f.sections = sections;
    if (f.imports)
        f.imports = [...new Set(f.imports)].slice(0, 200);
    return f;
}
function parseFat(b: Buffer, fileSize: number): BinaryFinding {
    const le = false;
    const nfat = u32(b, 4, le);
    const slices: {
        offset: number;
        size: number;
        arch: string;
    }[] = [];
    const archMap: Record<number, string> = {
        7: 'x86', 0x1000007: 'x86_64', 12: 'ARM', 0x100000c: 'ARM64'
    };
    for (let i = 0; i < Math.min(nfat, 8); i++) {
        const o = 8 + i * 20;
        if (o + 20 > b.length)
            break;
        const cpu = u32(b, o, le);
        const offset = u32(b, o + 8, le);
        const size = u32(b, o + 12, le);
        slices.push({ offset, size, arch: archMap[cpu] ?? `cpu-${cpu.toString(16)}` });
    }
    return {
        format: 'Mach-O universal',
        architecture: slices.map(s => s.arch).join(',') || 'unknown',
        bitness: null,
        endian: null,
        fileSize,
        slices
    };
}
function deriveFunctionsAndEdges(f: BinaryFinding): void {
    const functions: {
        name: string;
        addr?: string;
        size?: number;
    }[] = [];
    if (f.symbols) {
        for (const s of f.symbols) {
            if (s.type === 'FUNC' || (s.type === 'NOTYPE' && s.bind === 'GLOBAL' && s.name && !s.name.startsWith('.'))) {
                functions.push({ name: s.name, addr: s.addr, size: s.size });
            }
        }
    }
    if (f.exports) {
        for (const name of f.exports) {
            if (!functions.some(x => x.name === name))
                functions.push({ name });
        }
    }
    if (functions.length)
        f.functions = functions.slice(0, 2000);
    const edges: {
        from: string;
        to: string;
        kind: 'import' | 'export';
    }[] = [];
    const self = f.format || 'binary';
    if (f.imports) {
        for (const lib of f.imports)
            edges.push({ from: self, to: lib, kind: 'import' });
    }
    if (f.exports) {
        for (const name of f.exports.slice(0, 200))
            edges.push({ from: self, to: name, kind: 'export' });
    }
    if (edges.length)
        f.callGraphEdges = edges.slice(0, 500);
}
export async function analyzeBinary(file: string) {
    const abs = path.resolve(file);
    const { buf: b, size } = await readPrefix(abs, MAX_HEADER);
    let f: BinaryFinding = {
        format: 'unknown', architecture: 'unknown', bitness: null, endian: null, fileSize: size
    };
    if (b.length >= 4 && b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46) {
        f = parseElf(b, size);
    }
    else if (b.length >= 64 && b[0] === 0x4d && b[1] === 0x5a) {
        f = parsePe(b, size);
    }
    else if (b.length >= 4) {
        const m = u32(b, 0, false);
        if (m === 0xcafebabe && b.length >= 8) {
            const n = u32(b, 4, false);
            if (n < 0x20) {
                f = parseFat(b, size);
            }
            else {
                f = {
                    format: 'Java class',
                    architecture: 'JVM',
                    bitness: null,
                    endian: 'big',
                    fileSize: size
                };
            }
        }
        else if (m === 0xfeedface || m === 0xfeedfacf || m === 0xcefaedfe || m === 0xcffaedfe) {
            f = parseMachO(b, size, m);
        }
    }
    deriveFunctionsAndEdges(f);
    const hasStruct = !!(f.sections?.length || f.imports?.length || f.exports?.length ||
        f.symbols?.length || f.functions?.length || f.loadCommands?.length || f.slices?.length);
    const ev = await fileEvidence(abs);
    const limitations: string[] = [
        'No disassembly, decompilation or control-flow graph is produced.',
        'A recognized magic value does not prove the file is safe or executable.'
    ];
    if (!hasStruct && f.format !== 'unknown' && f.format !== 'Java class') {
        limitations.unshift('Header recognized but section/symbol/import tables were not fully recovered '
            + '(truncated header or unusual layout).');
    }
    if (f.format === 'ELF' && !f.symbols?.length) {
        limitations.push('No symbol table recovered (stripped binary or tables outside the read window).');
    }
    return result<BinaryFinding>(abs, 'binary_analysis', [f], {
        evidence: [ev],
        limitations,
        coverage: {
            examined: true,
            complete: hasStruct || f.format === 'Java class',
            notes: [
                `Read ${b.length} bytes of ${size}.`,
                ...(f.format === 'unknown' ? ['Unrecognized or truncated binary header.'] : []),
                ...(f.sections ? [`${f.sections.length} section(s).`] : []),
                ...(f.symbols ? [`${f.symbols.length} symbol(s).`] : []),
                ...(f.imports ? [`${f.imports.length} import(s).`] : []),
                ...(f.exports ? [`${f.exports.length} export(s).`] : []),
                ...(f.functions ? [`${f.functions.length} function(s).`] : [])
            ]
        },
        status: f.format === 'unknown' ? 'partial' : 'completed'
    });
}
