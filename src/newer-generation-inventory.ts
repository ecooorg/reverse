/**
 * Newer-generation static inventory hints (Patch Q step 4, bounded).
 * Pure Buffer / path walks — no external tools. Hostile input must not throw.
 */
export interface NewerGenerationInventory {
    familyHints: string[];
    windows: {
        peMachine: number | null;
        dllCharacteristics: number | null;
        guardCf: boolean;
        highEntropyVa: boolean;
        nxCompat: boolean;
        dotNet: boolean;
        msixMarkers: string[];
    };
    linux: {
        elfClass: number | null;
        interpreter: string | null;
        notes: string[];
    };
    mac: {
        magic: string | null;
        arm64: boolean;
        fat: boolean;
        codesignMarker: boolean;
    };
    android: {
        aabMarkers: string[];
        splitMarkers: string[];
        minSdkHint: number | null;
    };
    evidence: string[];
    limitations: string[];
}

function u16(b: Buffer, o: number): number {
    return o + 2 <= b.length ? b.readUInt16LE(o) : 0;
}
function u32(b: Buffer, o: number): number {
    return o + 4 <= b.length ? b.readUInt32LE(o) : 0;
}

export function inventoryNewerGeneration(input: {
    buffer?: Buffer;
    entryNames?: string[];
}): NewerGenerationInventory {
    const out: NewerGenerationInventory = {
        familyHints: [],
        windows: {
            peMachine: null,
            dllCharacteristics: null,
            guardCf: false,
            highEntropyVa: false,
            nxCompat: false,
            dotNet: false,
            msixMarkers: [],
        },
        linux: { elfClass: null, interpreter: null, notes: [] },
        mac: { magic: null, arm64: false, fat: false, codesignMarker: false },
        android: { aabMarkers: [], splitMarkers: [], minSdkHint: null },
        evidence: [],
        limitations: [
            'Bounded header/path inventory only; not a full modern-OS compatibility oracle.',
            'Mitigation flags are PE characteristics bits, not runtime enforcement proof.',
            'MSIX/AAB detection is path/marker based when entry names are supplied.',
        ],
    };
    const names = (input.entryNames ?? []).map(n => n.replace(/\\/g, '/'));
    const lower = names.map(n => n.toLowerCase());
    for (const n of lower) {
        if (n.includes('appxmanifest.xml') || n.endsWith('.msix') || n.includes('appxmetadata/')) {
            out.windows.msixMarkers.push(n.slice(0, 120));
            out.familyHints.push('windows-msix');
        }
        if (n.includes('bundletool') || n.includes('base/manifest/') || n.endsWith('.aab')) {
            out.android.aabMarkers.push(n.slice(0, 120));
            out.familyHints.push('android-aab');
        }
        if (/split_[a-z0-9]+\.apk$/i.test(n) || n.includes('split_config.')) {
            out.android.splitMarkers.push(n.slice(0, 120));
            out.familyHints.push('android-split');
        }
        if (n.includes('_codesignature') || n.includes('codesignature')) {
            out.mac.codesignMarker = true;
            out.familyHints.push('mac-codesign');
        }
    }
    const b = input.buffer;
    if (!b || b.length < 64) {
        out.limitations.push('Buffer too short for PE/ELF/Mach-O header walk');
        return out;
    }
    // PE
    if (b[0] === 0x4d && b[1] === 0x5a) {
        const peOff = u32(b, 0x3c);
        if (peOff > 0 && peOff + 0x5a < b.length && b[peOff] === 0x50 && b[peOff + 1] === 0x45) {
            out.familyHints.push('windows-pe');
            const machine = u16(b, peOff + 4);
            out.windows.peMachine = machine;
            const coffChars = u16(b, peOff + 22);
            void coffChars;
            const optMagic = u16(b, peOff + 24);
            const dllCharOff = optMagic === 0x20b ? peOff + 24 + 70 : peOff + 24 + 70;
            // PE32+ optional header: Magic 0x20b; DLLCharacteristics at +90 from optional header start for PE32, +70 for fields...
            // Use standard: OptionalHeader + 0x46 (70) for PE32 DLLCharacteristics, PE32+ same offset 70 from optional start? 
            // Actually PE32: DLLCharacteristics at optional+0x46 (70); PE32+: optional+0x46 (70) as well in the common layout after
            // BaseOfData removal - verify:
            // PE32 optional size fields: Magic@0, ... DLLCharacteristics @ 70 (0x46).
            // PE32+ : DLLCharacteristics also at 70 (0x46).
            const dllChar = u16(b, peOff + 24 + 70);
            out.windows.dllCharacteristics = dllChar;
            out.windows.nxCompat = (dllChar & 0x100) !== 0;
            out.windows.guardCf = (dllChar & 0x4000) !== 0;
            out.windows.highEntropyVa = (dllChar & 0x20) !== 0;
            out.evidence.push(`PE machine=0x${machine.toString(16)}; dllChars=0x${dllChar.toString(16)}`);
            // CLR directory: DataDirectory[14] for PE32 at optional+208, PE32+ at optional+224
            const dd0 = peOff + 24 + (optMagic === 0x20b ? 112 : 96);
            if (dd0 + 8 * 15 < b.length) {
                const clrRva = u32(b, dd0 + 14 * 8);
                const clrSize = u32(b, dd0 + 14 * 8 + 4);
                if (clrRva !== 0 && clrSize !== 0) {
                    out.windows.dotNet = true;
                    out.evidence.push('PE CLR data directory non-zero (.NET)');
                }
            }
        }
    }
    // ELF
    if (b[0] === 0x7f && b.toString('ascii', 1, 4) === 'ELF') {
        out.familyHints.push('linux-elf');
        out.linux.elfClass = b[4] ?? null;
        out.evidence.push(`ELF class=${b[4]}`);
        // crude PT_INTERP scan
        const slice = b.subarray(0, Math.min(b.length, 4096)).toString('binary');
        const interpIdx = slice.indexOf('/lib');
        if (interpIdx >= 0) {
            let end = interpIdx;
            while (end < slice.length && slice.charCodeAt(end) !== 0)
                end++;
            out.linux.interpreter = slice.slice(interpIdx, Math.min(end, interpIdx + 80));
            out.evidence.push(`interp~${out.linux.interpreter}`);
        }
    }
    // Mach-O
    const mag32 = b.readUInt32BE(0);
    if (mag32 === 0xcafebabe || mag32 === 0xcafed00d) {
        out.mac.fat = true;
        out.mac.magic = 'fat';
        out.familyHints.push('mac-fat');
        out.evidence.push('Mach-O fat/cafebabe');
    }
    else if (mag32 === 0xfeedface || mag32 === 0xfeedfacf || mag32 === 0xcefaedfe || mag32 === 0xcffaedfe) {
        out.mac.magic = mag32.toString(16);
        out.familyHints.push('mac-macho');
        // arm64 cputype 0x0100000c often little-endian facf
        if (b.length >= 12) {
            const cputype = b.readUInt32LE(4);
            if (cputype === 0x0100000c || cputype === 0x0c000001) {
                out.mac.arm64 = true;
                out.evidence.push('Mach-O arm64 cputype');
            }
        }
    }
    out.familyHints = [...new Set(out.familyHints)];
    return out;
}
