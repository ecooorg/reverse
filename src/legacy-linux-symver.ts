/**
 * GNU symbol-version hints and bounded verneed-oriented scan (Patch N).
 * Walks dynamic string residues for GLIBC_/GLIBCXX_/CXXABI_ and records
 * .gnu.version* section name hits. A full SHT_GNU_verneed graph requires
 * complete section headers; when truncated, limitations are explicit.
 */
export interface SymbolVersionHint {
    name: string;
    evidence: string;
    confidence: number;
}
export interface VerneedSummary {
    hints: SymbolVersionHint[];
    /** Highest GLIBC_* version string seen, if any. */
    maxGlibc: string | null;
    /** Highest GLIBCXX_* version string seen, if any. */
    maxGlibcxx: string | null;
    limitations: string[];
}
/**
 * Extract symbol-version style strings from a bounded binary window.
 */
export function extractSymbolVersionHints(buf: Buffer): SymbolVersionHint[] {
    return summarizeVerneed(buf).hints;
}
/**
 * Summarize GNU version requirements from string residues in a buffer.
 */
export function summarizeVerneed(buf: Buffer): VerneedSummary {
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
            if (found.size > 96)
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
    const hints = [...found.values()];
    const glibc = hints
        .map(h => h.name)
        .filter(n => n.startsWith('GLIBC_'))
        .sort(compareVersionTag);
    const glibcxx = hints
        .map(h => h.name)
        .filter(n => n.startsWith('GLIBCXX_'))
        .sort(compareVersionTag);
    const limitations: string[] = [
        'Bounded string scan is not a full SHT_GNU_verneed structure walk.',
        'When section headers are truncated, only residual version strings are reported.'
    ];
    return {
        hints,
        maxGlibc: glibc.length ? glibc[glibc.length - 1] : null,
        maxGlibcxx: glibcxx.length ? glibcxx[glibcxx.length - 1] : null,
        limitations
    };
}
function compareVersionTag(a: string, b: string): number {
    const pa = a.replace(/^GLIBC(?:XX)?_/, '').split('.').map(x => parseInt(x, 10) || 0);
    const pb = b.replace(/^GLIBC(?:XX)?_/, '').split('.').map(x => parseInt(x, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const da = pa[i] ?? 0;
        const db = pb[i] ?? 0;
        if (da !== db)
            return da - db;
    }
    return a.localeCompare(b);
}
