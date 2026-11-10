import { result } from './core-types.js';
import type { Verdict } from './benchmark-stats.js';
export type Decision = 'accept' | 'roll_back' | 'need_more_data' | 'reject';
export interface DecisionInput {
    /** From compareBenchmarks / compareSamples. */
    performanceVerdict?: Verdict | string;
    /** Behavior validation passed? */
    validationPassed?: boolean | null;
    /** Explicit behavior break observed. */
    behaviorBroken?: boolean;
    /** Optional human notes. */
    notes?: string[];
}
/**
 * Deterministic decision rules from evidence only.
 * Never claims accept without statistical support + validation.
 */
export function decideOptimization(input: DecisionInput) {
    const notes: string[] = [...(input.notes ?? [])];
    let decision: Decision;
    let reason: string;
    if (input.behaviorBroken === true || input.validationPassed === false) {
        decision = 'reject';
        reason =
            'Behavior validation failed or behaviorBroken=true; reject the change.';
    }
    else if (input.performanceVerdict === 'insufficient_evidence'
        || input.performanceVerdict === undefined
        || input.validationPassed === null
        || input.validationPassed === undefined) {
        decision = 'need_more_data';
        reason =
            'Insufficient evidence: need enough benchmark runs and a validation result.';
    }
    else if (input.performanceVerdict === 'regressed') {
        decision = 'roll_back';
        reason =
            'Performance regressed with statistical support; roll back the change.';
    }
    else if (input.performanceVerdict === 'improved'
        && input.validationPassed === true) {
        decision = 'accept';
        reason =
            'Performance improved with statistical support and validation passed.';
    }
    else if (input.performanceVerdict === 'no_significant_change') {
        decision = 'need_more_data';
        reason =
            'No statistically significant performance change; gather more data or reject by policy.';
    }
    else {
        decision = 'need_more_data';
        reason = `Unhandled combination: verdict=${input.performanceVerdict}, validation=${input.validationPassed}`;
    }
    notes.push(reason);
    return result('optimization_decision', 'decide_optimization', [{
            decision,
            reason,
            input: {
                performanceVerdict: input.performanceVerdict ?? null,
                validationPassed: input.validationPassed ?? null,
                behaviorBroken: input.behaviorBroken ?? false
            }
        }], {
        status: 'completed',
        limitations: [
            'Decision rules use only supplied evidence fields; they do not re-run benchmarks.',
            'Agent orchestration still chooses when to measure and what to change.'
        ],
        coverage: {
            examined: true,
            complete: true,
            notes
        }
    });
}
