/**
 * Behavior preservation and migration advisor (Patch M step 7 / G-05, G-06, G-10, H-07).
 *
 * Preservation levels:
 *   L0 — no oracle; cannot raise the level
 *   L1 — static/scenario evidence only (capture/replay equal on listed scenarios)
 *   L2 — differential validation against a stated oracle with coverage < full
 *   L3 — oracle-backed full scenario set for the declared scope
 *
 * Without an oracle the level is always L0 and cannot be raised.
 * Generated-code provenance (H-07) is recorded when the advisor proposes code.
 */
import type { ReplayComparison } from './behavior-capture.js';
export type PreservationLevel = 'L0' | 'L1' | 'L2' | 'L3';
export interface OracleSpec {
    /** Human-readable description of the oracle. */
    description: string;
    /** Provenance: how the oracle was obtained (fixture, licensed image, operator). */
    provenance: string;
    /** True when the oracle is lawful and available on this host. */
    available: boolean;
}
export interface GeneratedCodeProvenance {
    source: 'operator' | 'model' | 'tool';
    /** Free-text citation: prompt id, tool name, commit, etc. */
    reference: string;
    /** Hash of the generated artifact when available. */
    contentSha256?: string;
}
export interface MigrationOption {
    id: string;
    rank: number;
    title: string;
    summary: string;
    /** Evidence strings that justify this option (must be non-empty). */
    evidence: string[];
    residualRisk: string[];
    generatedCode?: GeneratedCodeProvenance;
}
export interface PreservationReport {
    level: PreservationLevel;
    coverage: {
        scenarioCount: number;
        scenariosEqual: number;
        environments: string[];
        notes: string[];
    };
    residualRisk: string[];
    oracle: OracleSpec | null;
    comparisons: Array<{
        scenarioId: string;
        equal: boolean;
        differences: string[];
    }>;
    limitations: string[];
}
export interface MigrationAdvice {
    targetSummary: string;
    options: MigrationOption[];
    limitations: string[];
}
/**
 * Compute the preservation level from oracle presence and replay comparisons.
 * Rule: without an available oracle the level is L0 and cannot be raised.
 */
export function computePreservationLevel(input: {
    oracle: OracleSpec | null;
    comparisons: ReplayComparison[];
    environments?: string[];
}): PreservationReport {
    const comparisons = input.comparisons.map(c => ({
        scenarioId: c.scenarioId,
        equal: c.equal,
        differences: c.differences
    }));
    const scenarioCount = comparisons.length;
    const scenariosEqual = comparisons.filter(c => c.equal).length;
    const environments = input.environments ?? [];
    const limitations: string[] = [];
    for (const c of input.comparisons)
        limitations.push(...c.limitations);
    if (!input.oracle || !input.oracle.available) {
        limitations.push('No available oracle: preservation level is L0 and cannot be raised (H-07 / G-05).');
        return {
            level: 'L0',
            coverage: {
                scenarioCount,
                scenariosEqual,
                environments,
                notes: [
                    'L0 means no oracle-backed claim of behavior preservation.',
                    'Replay equality alone does not raise the level without an oracle.'
                ]
            },
            residualRisk: [
                'Any migration or rewrite is unverified against an independent oracle.',
                ...limitations.slice(0, 5)
            ],
            oracle: input.oracle,
            comparisons,
            limitations: [...new Set(limitations)]
        };
    }
    // Oracle available
    let level: PreservationLevel = 'L1';
    if (scenarioCount > 0 && scenariosEqual === scenarioCount)
        level = 'L2';
    if (scenarioCount >= 2 && scenariosEqual === scenarioCount)
        level = 'L3';
    const residual: string[] = [];
    if (level !== 'L3')
        residual.push('Scenario set may not cover the full declared scope.');
    if (scenariosEqual < scenarioCount)
        residual.push(`${scenarioCount - scenariosEqual} scenario(s) differed on replay.`);
    return {
        level,
        coverage: {
            scenarioCount,
            scenariosEqual,
            environments,
            notes: [
                `Oracle: ${input.oracle.description}`,
                `Provenance: ${input.oracle.provenance}`
            ]
        },
        residualRisk: residual,
        oracle: input.oracle,
        comparisons,
        limitations: [...new Set(limitations)]
    };
}
/**
 * Ranked migration options. Every option must cite evidence; generated code
 * carries provenance (H-07). Without evidence an option is omitted.
 */
export function adviseMigration(input: {
    targetSummary: string;
    findings: Array<{
        cause: string;
        evidence: string;
        needsExecutionEnvironment?: boolean;
    }>;
    preservation?: PreservationReport;
}): MigrationAdvice {
    const options: MigrationOption[] = [];
    const limitations: string[] = [];
    let rank = 1;
    const needsEnv = input.findings.filter(f => f.needsExecutionEnvironment);
    if (needsEnv.length) {
        options.push({
            id: 'run-in-compatible-environment',
            rank: rank++,
            title: 'Run under a compatible environment',
            summary: 'Use Wine, DOSBox or a VM image that provides the missing runtime surface.',
            evidence: needsEnv.map(f => `${f.cause} (${f.evidence})`).slice(0, 8),
            residualRisk: [
                'Environment may still lack a specific API or codec.',
                'Licensed images remain the operator\'s responsibility.'
            ]
        });
    }
    const runtime = input.findings.filter(f => /runtime|MFC|Visual Basic|DirectX|Glide|DLL/i.test(f.cause + f.evidence));
    if (runtime.length) {
        options.push({
            id: 'restore-runtime-dependencies',
            rank: rank++,
            title: 'Restore missing runtime dependencies',
            summary: 'Install or ship the redistributable runtimes named by the diagnosis.',
            evidence: runtime.map(f => `${f.cause} [${f.evidence}]`).slice(0, 8),
            residualRisk: ['Wrong redistributable version can still fail at load time.']
        });
    }
    const hardening = input.findings.filter(f => /ASLR|DEP|hardening/i.test(f.cause + f.evidence));
    if (hardening.length) {
        options.push({
            id: 'adjust-host-mitigations',
            rank: rank++,
            title: 'Adjust host mitigations or rebuild with modern flags',
            summary: 'Legacy images without ASLR/DEP may need a policy exception or a rebuild.',
            evidence: hardening.map(f => f.evidence).slice(0, 4),
            residualRisk: ['Policy exceptions reduce host security.']
        });
    }
    if (input.preservation && input.preservation.level === 'L0') {
        limitations.push('Preservation is L0: no migration option is claimed to preserve behavior.');
    }
    if (!options.length) {
        limitations.push('No ranked option could be built: diagnosis produced no actionable evidence rows.');
    }
    return {
        targetSummary: input.targetSummary,
        options,
        limitations
    };
}
/** Guard: refuse to label a report above L0 when oracle is missing/unavailable. */
export function assertLevelRespectsOracle(report: PreservationReport): string[] {
    const errors: string[] = [];
    if ((!report.oracle || !report.oracle.available) && report.level !== 'L0') {
        errors.push(`Invalid level ${report.level}: without an available oracle the level must be L0.`);
    }
    return errors;
}
