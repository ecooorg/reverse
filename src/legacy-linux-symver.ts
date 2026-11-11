/**
 * GNU symbol-version hints for ELF (Patch N step 3).
 * Bounded scan for GLIBC_/GLIBCXX_/CXXABI_ and .gnu.version string markers.
 * Full verneed graph walk is not claimed when section headers are truncated.
 */
export interface SymbolVersionHint {
    name: string;
    evidence: string;
    confidence: number;
}
/**
 * Extract symbol-version style strings from a bounded binary window.
 */
export function extractSymbolVersionHints(buf: Buffer): SymbolVersionHint[] {
    const text = buf.toString('latin1');
    const found = new Map<string, SymbolVersionHint>();
    const patterns: Array<{
        re: RegExp;
        label: string;
        conf: number;
    }> = [
        { re: /GLIBC_([0-9]+\.[0-9]+(?:\.[0-9]+)?)/g, label: 'GLIBC', conf: 0.85 },
        { re: /GLIBCXX_([0-9]+\.[0-9]+(?:\.[0-9]+)?)/g, label: 'GLIBCXX', conf: 0.85 },
        { re: /CXXABI_([0-9]+\.[0-9]+)/g, label: 'CXXABI', conf: 0.8 },
        { re: /GCC_[0-9]+\.[0-9]+(?:\.[0-9]+)?/g, label: 'GCC', conf: 0.7 }
    ];
    for (const { re, label, conf } of patterns) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
            const name = m[0];
            if (!found.has(name)) {
                found.set(name, {
                    name,
                    evidence: `string match ${label} at latin1 offset ${m.index}`,
                    confidence: conf
                });
            }
            if (found.size > 64)
                break;
        }
    }
    if (/\.gnu\.version/.test(text)) {
        found.set('.gnu.version', {
            name: '.gnu.version',
            evidence: 'section name .gnu.version present in string table window',
            confidence: 0.75
        });
    }
    return [...found.values()];
}
