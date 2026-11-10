import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { result } from './core-types.js';

export interface LegacyWindowsFinding {
    format: 'DOS MZ' | 'Windows NE' | 'Windows LE' | 'Windows LX' | 'Windows PE' | 'unknown';
    architecture: string;
    bitness: number | null;
    targetEra: string | null;
    subsystem: string | null;
    toolchainMarkers: string[];
    compatibilityFindings: Array<{ cause: string; evidence: string; confidence: number; limitations: string[]; needsExecutionEnvironment: boolean }>;
    sha256: string;
}

const markerRules: Array<[RegExp, string]> = [
    [/Borland|Turbo Pascal|Borland C\+\+|Delphi/i, 'Borland/Delphi toolchain marker'],
    [/Visual Basic 6|MSVBVM60|VB6/i, 'Visual Basic 6 runtime/toolchain marker'],
    [/MFC[0-9]{2,3}|Microsoft Foundation Classes/i, 'MFC marker'],
    [/MSVCP[0-9]+|MSVCR[0-9]+|Visual C\+\+/i, 'Microsoft Visual C++ runtime marker'],
    [/DirectDraw|Direct3D|DDRAW\.DLL|D3D9\.DLL/i, 'DirectX graphics dependency marker'],
    [/GLIDE2X?\.DLL|3DFX/i, '3dfx Glide dependency marker']
];

export async function analyzeLegacyWindows(file: string) {
    const abs = path.resolve(file);
    const info = await stat(abs);
    const handle = await readFile(abs);
    const b = handle.subarray(0, Math.min(handle.length, 8 * 1024 * 1024));
    const sha256 = createHash('sha256').update(handle).digest('hex');
    let format: LegacyWindowsFinding['format'] = 'unknown';
    let architecture = 'unknown', bitness: number | null = null, targetEra: string | null = null, subsystem: string | null = null;
    if (b.length >= 64 && b.toString('ascii', 0, 2) === 'MZ') {
        const off = b.readUInt32LE(0x3c);
        if (off + 4 <= b.length) {
            const sig = b.toString('ascii', off, off + 4);
            if (sig === 'NE') { format = 'Windows NE'; architecture = 'x86'; bitness = 16; targetEra = 'Windows 3.x'; }
            else if (sig === 'LE' || sig === 'LX') { format = sig === 'LE' ? 'Windows LE' : 'Windows LX'; architecture = 'x86'; bitness = 32; targetEra = 'Win9x/NT legacy'; }
            else if (sig === 'PE\u0000\u0000' && off + 24 <= b.length) {
                format = 'Windows PE';
                const machine = b.readUInt16LE(off + 4);
                architecture = ({ 0x14c: 'x86', 0x8664: 'x86_64', 0x1c0: 'ARM' } as Record<number,string>)[machine] ?? `machine-${machine}`;
                const magic = b.readUInt16LE(off + 24);
                bitness = magic === 0x10b ? 32 : magic === 0x20b ? 64 : null;
                const opt = off + 24;
                const sub = opt + (magic === 0x20b ? 68 : 68);
                if (sub + 2 <= b.length) subsystem = ({ 2: 'Windows GUI', 3: 'Windows console', 9: 'Windows CE GUI' } as Record<number,string>)[b.readUInt16LE(sub)] ?? `subsystem-${b.readUInt16LE(sub)}`;
                targetEra = bitness === 32 ? 'Win9x/NT through Windows 7 candidate' : 'modern PE candidate';
            } else format = 'DOS MZ';
        } else format = 'DOS MZ';
    }
    const text = b.toString('latin1');
    const toolchainMarkers = markerRules.filter(([re]) => re.test(text)).map(([, label]) => label);
    const compatibilityFindings: LegacyWindowsFinding['compatibilityFindings'] = [];
    if (format === 'DOS MZ' || format === 'Windows NE')
        compatibilityFindings.push({ cause: '16-bit DOS/Windows execution is not native on 64-bit Windows.', evidence: `Detected ${format} executable header.`, confidence: 0.99, limitations: ['Header detection does not prove the program is runnable or identify all DOS extenders.'], needsExecutionEnvironment: true });
    if (format === 'Windows LE' || format === 'Windows LX')
        compatibilityFindings.push({ cause: 'Legacy 32-bit linear-executable format may require a compatible loader or OS.', evidence: `Detected ${format} executable header.`, confidence: 0.99, limitations: ['The specific loader/runtime requirement is not inferred from the header alone.'], needsExecutionEnvironment: true });
    if (toolchainMarkers.some(x => x.includes('Visual Basic 6')))
        compatibilityFindings.push({ cause: 'The application may depend on the Visual Basic 6 runtime.', evidence: toolchainMarkers.find(x => x.includes('Visual Basic 6'))!, confidence: 0.85, limitations: ['A string marker is not proof that the runtime is required at launch.'], needsExecutionEnvironment: true });
    if (toolchainMarkers.some(x => x.includes('DirectX') || x.includes('Glide')))
        compatibilityFindings.push({ cause: 'The application may depend on legacy graphics APIs or drivers.', evidence: toolchainMarkers.filter(x => x.includes('DirectX') || x.includes('Glide')).join('; '), confidence: 0.8, limitations: ['Static strings do not prove an active code path or required driver version.'], needsExecutionEnvironment: true });
    return result<LegacyWindowsFinding>(abs, 'legacy_windows_analysis', [{
        format, architecture, bitness, targetEra, subsystem, toolchainMarkers, compatibilityFindings, sha256
    }], {
        status: format === 'unknown' ? 'partial' : 'completed',
        limitations: ['Windows wave 1 detector only: DOS/NE/LE/LX/PE headers and bounded toolchain strings; not a complete compatibility diagnosis.', `Read ${b.length} of ${info.size} bytes.`, 'No execution, corpus lookup, similarity score, or license verification is performed.'],
        coverage: { examined: true, complete: format !== 'unknown' && b.length === info.size, notes: [`SHA-256: ${sha256}`, `Detected format: ${format}`] }
    });
}
