import { readFile, stat } from 'node:fs/promises';
import { result } from './core-types.js';
import { sha256 } from './core-util.js';
const SECTION = [
    'custom', 'type', 'import', 'function', 'table', 'memory',
    'global', 'export', 'start', 'element', 'code', 'data', 'data_count'
];
function readU32v(buf: Buffer, i: number): [
    number,
    number
] {
    let r = 0, s = 0;
    while (i < buf.length) {
        const b = buf[i++];
        r |= (b & 0x7f) << s;
        if ((b & 0x80) === 0)
            break;
        s += 7;
    }
    return [r, i];
}
/** WebAssembly binary module section inventory. */
export async function analyzeWasm(file: string) {
    let buf: Buffer;
    try {
        const st = await stat(file);
        if (st.size > 32 * 1024 * 1024) {
            return result(file, 'wasm_analysis', [], {
                status: 'partial',
                limitations: ['WASM larger than 32 MiB refused.'],
                coverage: { examined: false, complete: false, notes: [] }
            });
        }
        buf = await readFile(file);
    }
    catch (e: any) {
        return result(file, 'wasm_analysis', [], {
            status: 'failed',
            limitations: [e?.message ?? String(e)],
            errors: [String(e?.message ?? e)],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    if (buf.length < 8 || buf.readUInt32LE(0) !== 0x6d736100) {
        return result(file, 'wasm_analysis', [{ isWasm: false }], {
            status: 'completed',
            limitations: ['Not a WASM binary (missing \\0asm magic).'],
            coverage: {
                examined: true,
                complete: true,
                notes: ['not-wasm']
            }
        });
    }
    const version = buf.readUInt32LE(4);
    const sections: {
        id: number;
        name: string;
        size: number;
    }[] = [];
    let i = 8;
    while (i < buf.length) {
        const id = buf[i++];
        const [size, ni] = readU32v(buf, i);
        i = ni;
        sections.push({
            id,
            name: SECTION[id] ?? `id_${id}`,
            size
        });
        i += size;
        if (sections.length > 64)
            break;
    }
    const exports = sections.filter(s => s.name === 'export').length;
    const imports = sections.filter(s => s.name === 'import').length;
    return result(file, 'wasm_analysis', [{
            isWasm: true,
            version,
            sections,
            sectionCount: sections.length,
            hasExportSection: exports > 0,
            hasImportSection: imports > 0,
            sha256: sha256(buf)
        }], {
        status: 'completed',
        limitations: [
            'Section inventory only; no validation of code bodies or WASI linking.'
        ],
        coverage: {
            examined: true,
            complete: true,
            notes: [`sections=${sections.length}`]
        }
    });
}
