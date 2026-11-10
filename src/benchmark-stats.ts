/** Median of an unsorted list; the mean of the two middle values for an even count. Null for an empty list. */
export function median(values: number[]): number | null {
    if (!values.length)
        return null;
    const s = [...values].sort((a, b) => a - b), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export interface Summary {
    n: number;
    mean: number;
    median: number;
    min: number;
    max: number;
    p95: number;
    stddev: number;
    mad: number;
    outliers: number[];
    ci95: [
        number,
        number
    ] | null;
}
// Two-sided 97.5% Student t quantiles for df = 1..30; larger samples use the normal value.
const T975 = [
    12.706,
    4.303,
    3.182,
    2.776,
    2.571,
    2.447,
    2.365,
    2.306,
    2.262,
    2.228,
    2.201,
    2.179,
    2.160,
    2.145,
    2.131,
    2.120,
    2.110,
    2.101,
    2.093,
    2.086,
    2.080,
    2.074,
    2.069,
    2.064,
    2.060,
    2.056,
    2.052,
    2.048,
    2.045,
    2.042
];
const tQuantile = (df: number) => (df <= 30 ? T975[df - 1] : 1.96);
/** Nearest-rank percentile (p in 0..100) of an unsorted list. */
export function percentile(values: number[], p: number): number {
    const s = [...values].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
}
/** Descriptive statistics. Outliers use the modified z-score (|0.6745 * (x - median) / MAD| > 3.5). */
export function summarize(values: number[]): Summary | null {
    const n = values.length;
    if (!n)
        return null;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const med = median(values) as number;
    const variance = n > 1 ? values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
    const stddev = Math.sqrt(variance);
    const mad = median(values.map(v => Math.abs(v - med))) as number;
    const outliers = mad > 0 ? values.filter(v => Math.abs((0.6745 * (v - med)) / mad) > 3.5) : [];
    const half = n > 1 ? (tQuantile(n - 1) * stddev) / Math.sqrt(n) : 0;
    return {
        n,
        mean,
        median: med,
        min: Math.min(...values),
        max: Math.max(...values),
        p95: percentile(values, 95),
        stddev,
        mad,
        outliers,
        ci95: n > 1 ? [
            mean - half, mean + half
        ] : null
    };
}
/** Deterministic xorshift32, so bootstrap intervals are reproducible. */
function rng(seed: number) { let x = seed || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; }
/** Percentile-bootstrap 95% interval of the median difference (after - before). */
export function bootstrapShiftCi(before: number[], after: number[], iterations = 2000): [
    number,
    number
] {
    const rand = rng(12345), pick = (a: number[]) => a[Math.floor(rand() * a.length)];
    const diffs: number[] = [];
    for (let i = 0; i < iterations; i++) {
        const b = before.map(() => pick(before)), a = after.map(() => pick(after));
        diffs.push((median(a) as number) - (median(b) as number));
    }
    return [percentile(diffs, 2.5), percentile(diffs, 97.5)];
}
/** Two-sided Mann-Whitney U with normal approximation and tie correction; also the Hodges-Lehmann shift. */
export function mannWhitney(x: number[], y: number[]): {
    u: number;
    p: number;
    shift: number;
} {
    const all = [...x.map(v => ({ v, g: 0 })), ...y.map(v => ({ v, g: 1 }))].sort((a, b) => a.v - b.v);
    const ranks = new Array(all.length).fill(0);
    let tieTerm = 0;
    for (let i = 0; i < all.length;) {
        let j = i;
        while (j + 1 < all.length && all[j + 1].v === all[i].v)
            j++;
        const r = (i + j) / 2 + 1, t = j - i + 1;
        for (let k = i; k <= j; k++)
            ranks[k] = r;
        tieTerm += t ** 3 - t;
        i = j + 1;
    }
    const n1 = x.length, n2 = y.length, N = n1 + n2;
    const r1 = all.reduce((s, e, i) => s + (e.g === 0 ? ranks[i] : 0), 0);
    const u = r1 - (n1 * (n1 + 1)) / 2;
    const mu = (n1 * n2) / 2, sigma = Math.sqrt(((n1 * n2) / 12) * (N + 1 - tieTerm / (N * (N - 1))));
    const z = sigma > 0 ? (Math.abs(u - mu) - 0.5) / sigma : 0;
    const p = sigma > 0 ? Math.min(1, 2 * (1 - normalCdf(Math.max(0, z)))) : 1;
    const pairwise: number[] = [];
    for (const b of x)
        for (const a of y)
            pairwise.push(a - b);
    return { u, p, shift: median(pairwise) as number };
}
function normalCdf(z: number): number {
    const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
    const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    const erf = 1 - poly * Math.exp(-(z * z) / 2);
    return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}
export type Verdict = 'improved' | 'regressed' | 'no_significant_change' | 'insufficient_evidence';
export const MIN_RUNS = 5;
/** Verdict from repeated measurements. A lower mean alone never yields `improved`. */
export function compareSamples(before: number[], after: number[], alpha = 0.05) {
    if (before.length < MIN_RUNS || after.length < MIN_RUNS) {
        return {
            verdict: 'insufficient_evidence' as Verdict,
            reason: `At least ${MIN_RUNS} successful runs per side are required (got ${before.length} and ${after.length}).`
        };
    }
    const mw = mannWhitney(before, after), ci = bootstrapShiftCi(before, after);
    const medBefore = median(before) as number;
    const ciExcludesZero = ci[0] > 0 || ci[1] < 0;
    const significant = mw.p < alpha && ciExcludesZero;
    const verdict: Verdict = !significant ? 'no_significant_change' : mw.shift < 0 ? 'improved' : 'regressed';
    const pooled = Math.sqrt(((before.length - 1) * (summarize(before) as Summary).stddev ** 2
        + (after.length - 1) * (summarize(after) as Summary).stddev ** 2) / (before.length + after.length - 2));
    return {
        verdict,
        pValue: mw.p,
        hodgesLehmannShiftMs: mw.shift,
        medianShiftCi95Ms: ci,
        shiftPercentOfBeforeMedian: medBefore > 0 ? (mw.shift / medBefore) * 100 : null,
        cohensD: pooled > 0
            ? ((summarize(after) as Summary).mean - (summarize(before) as Summary).mean) / pooled
            : null, alpha
    };
}
