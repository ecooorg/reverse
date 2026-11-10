import type { Result } from './core-types.js';
import type { EvidenceRecord, EvidenceType } from './evidence-engine.js';
/** Result operations that carry measured or statically derived facts, and the evidence type each one produces. */
const TYPE_BY_OPERATION: Record<string, EvidenceType> = {
    process_inspection: 'Process',
    process_tree: 'Process',
    process_profile: 'Process',
    memory_analysis: 'Memory',
    cpu_analysis: 'CPU',
    io_analysis: 'I/O',
    binary_analysis: 'Binary',
    benchmark: 'Benchmark',
    benchmark_comparison: 'Benchmark',
    compare_benchmarks: 'Benchmark',
    capture_baseline: 'Benchmark',
    behavior_validation: 'Validation'
};
export type CollectedEvidence = Pick<EvidenceRecord, 'type' | 'source' | 'measurement' | 'confidence' | 'limitations'>;
/** Operations for which {@link evidenceFromResult} can produce evidence. */
export const evidenceOperations = (): string[] => Object.keys(TYPE_BY_OPERATION);
/**
 * Quality of the observation, not a probability: a complete, successful result is 1, a successful one with incomplete coverage
 * is 0.8, a partial one is 0.4 (below the promotion minimum) and anything else is 0.
 */
export function evidenceConfidence(r: Pick<Result<unknown>, 'status' | 'coverage'>): number {
    if (r.status === 'completed')
        return r.coverage?.complete ? 1 : 0.8;
    return r.status === 'partial' ? 0.4 : 0;
}
function measurementOf(r: Result<any>): unknown {
    if (r.operation !== 'compare_benchmarks')
        return r.findings.length === 1 ? r.findings[0] : { findings: r.findings };
    // A suite comparison is "improved" only when every matching case is improved.
    const improved = r.findings.length > 0 && r.findings.every((row: any) => row?.comparison?.findings?.[0]?.improved === true);
    return { cases: r.findings, improved, verdict: improved ? 'improved' : 'not_improved' };
}
/**
 * Turns a Result produced by a Reverse analyzer into typed evidence (source, measurement, confidence, limitations all come
 * from the Result itself). Returns undefined for operations that are not evidence types, so nothing is invented for them.
 */
export function evidenceFromResult(r: Result<any>): CollectedEvidence | undefined {
    const type = TYPE_BY_OPERATION[r?.operation];
    if (!type)
        return undefined;
    const limitations = [...r.limitations, ...r.errors.map(e => `error: ${e}`)];
    if (!r.coverage.complete)
        limitations.push('Coverage of the originating result is incomplete.');
    return {
        type,
        source: `reverse:${r.operation}#${r.id}`,
        measurement: measurementOf(r),
        confidence: evidenceConfidence(r),
        limitations
    };
}
