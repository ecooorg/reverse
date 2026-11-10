import { open, stat } from 'node:fs/promises';
import path from 'node:path';
import { result } from './core-types.js';
import { fileEvidence } from './core-util.js';
import { parseElf, parsePe, parseMachO, parseFat } from './analysis-binary-parse.js';
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
const MAX_HEADER = 2 * 1024 * 1024;
async function readSlice(abs: string, offset: number, len: number): Promise<Buffer> {
    const h = await open(abs, 'r');
    const buf = Buffer.alloc(len);
    try {
        const { bytesRead } = await h.read(buf, 0, len, offset);
        return buf.subarray(0, bytesRead);
    }
    finally {
        await h.close();
    }
}
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
    const prefix = await readPrefix(abs, MAX_HEADER);
    let b = prefix.buf;
    const size = prefix.size;
    let f: BinaryFinding = {
        format: 'unknown', architecture: 'unknown', bitness: null, endian: null, fileSize: size
    };
    if (b.length >= 4 && b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46) {
        // Section header table is often at the end of large binaries (e.g. Node).
        // Expand the buffer when e_shoff lies beyond the initial window.
        if (b.length >= 52) {
            const cls = b[4];
            const le = b[5] === 1;
            const is64 = cls === 2;
            const e_shoff = is64
                ? Number(le ? b.readBigUInt64LE(40) : b.readBigUInt64BE(40))
                : u32(b, 32, le);
            const e_shentsize = u16(b, is64 ? 58 : 46, le);
            const e_shnum = u16(b, is64 ? 60 : 48, le);
            if (e_shoff > 0 && e_shnum > 0 && e_shentsize > 0) {
                const need = e_shoff + e_shnum * e_shentsize;
                if (need > b.length && need <= size && need <= 16 * 1024 * 1024) {
                    b = await readSlice(abs, 0, need);
                }
                else if (e_shoff >= b.length && e_shoff < size) {
                    // Read only the section header table and stitch: keep file header + shdrs
                    const shdrs = await readSlice(abs, e_shoff, Math.min(e_shnum * e_shentsize, size - e_shoff));
                    const merged = Buffer.alloc(e_shoff + shdrs.length);
                    b.copy(merged, 0, 0, Math.min(b.length, e_shoff));
                    shdrs.copy(merged, e_shoff);
                    b = merged;
                }
            }
        }
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
