import { readFile, stat } from 'node:fs/promises';
import { result } from './core-types.js';
import { sha256 } from './core-util.js';
/** Detect .NET CLI header in a PE and surface basic metadata flags. */
export async function analyzeDotnet(file: string) {
    let buf: Buffer;
    try {
        const st = await stat(file);
        if (st.size > 32 * 1024 * 1024) {
            return result(file, 'dotnet_analysis', [], {
                status: 'partial',
                limitations: ['File larger than 32 MiB; refused for .NET scan.'],
                coverage: { examined: false, complete: false, notes: [] }
            });
        }
        buf = await readFile(file);
    }
    catch (e: any) {
        return result(file, 'dotnet_analysis', [], {
            status: 'failed',
            limitations: [e?.message ?? String(e)],
            errors: [String(e?.message ?? e)],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    if (buf.length < 0x40 || buf[0] !== 0x4d || buf[1] !== 0x5a) {
        return result(file, 'dotnet_analysis', [{ isPE: false, isDotnet: false }], {
            status: 'completed',
            limitations: ['Not a PE/MZ image.'],
            coverage: {
                examined: true,
                complete: true,
                notes: ['not-pe']
            }
        });
    }
    const e_lfanew = buf.readUInt32LE(0x3c);
    if (e_lfanew + 0x18 >= buf.length) {
        return result(file, 'dotnet_analysis', [{ isPE: true, isDotnet: false }], {
            status: 'partial',
            limitations: ['PE header out of range.'],
            coverage: { examined: true, complete: false, notes: [] }
        });
    }
    const peSig = buf.toString('ascii', e_lfanew, e_lfanew + 4);
    if (peSig !== 'PE\0\0') {
        return result(file, 'dotnet_analysis', [{ isPE: false, isDotnet: false }], {
            status: 'completed',
            limitations: ['MZ without PE signature.'],
            coverage: { examined: true, complete: true, notes: [] }
        });
    }
    const coff = e_lfanew + 4;
    const sizeOfOptional = buf.readUInt16LE(coff + 16);
    const optional = coff + 20;
    const magic = buf.readUInt16LE(optional);
    const isPE32Plus = magic === 0x20b;
    const ddOffset = optional + (isPE32Plus ? 112 : 96);
    // CLR runtime header is data directory index 14
    let clrRva = 0, clrSize = 0;
    if (ddOffset + 15 * 8 <= optional + sizeOfOptional && ddOffset + 15 * 8 <= buf.length) {
        clrRva = buf.readUInt32LE(ddOffset + 14 * 8);
        clrSize = buf.readUInt32LE(ddOffset + 14 * 8 + 4);
    }
    const isDotnet = clrRva > 0 && clrSize > 0;
    // Heuristic ASCII strings for assembly-ish names
    const text = buf.toString('binary');
    const mscorlib = /mscorlib|System\.Runtime|Microsoft\.NETCore/.test(text);
    return result(file, 'dotnet_analysis', [{
            isPE: true,
            isDotnet,
            pe32Plus: isPE32Plus,
            clrRva,
            clrSize,
            runtimeHints: mscorlib ? ['managed-runtime-strings'] : [],
            sha256: sha256(buf)
        }], {
        status: 'completed',
        limitations: [
            'Detects CLI directory presence; does not decompile IL or parse full metadata tables.',
            'For deep IL use an external provider (ilspycmd/dotpeek) when registered later.'
        ],
        coverage: {
            examined: true,
            complete: isDotnet,
            notes: [isDotnet ? 'cli-header-present' : 'no-cli-header']
        }
    });
}
