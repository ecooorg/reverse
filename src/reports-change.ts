import { result } from './core-types.js';
import { saveJson } from './core-util.js';
export interface ChangeReportInput {
    target: string;
    before?: unknown;
    after?: unknown;
    validation?: {
        passed?: boolean;
        checks?: unknown[];
        equivalenceProven?: boolean;
    };
    metrics?: {
        before?: Record<string, number | null>;
        after?: Record<string, number | null>;
    };
    findings?: string[];
    residualRisks?: string[];
    nextSteps?: string[];
}
/** Before/after change report with uncertainty and explicit non-claims. */
export async function generateChangeReport(input: ChangeReportInput) {
    const findings = {
        target: input.target,
        summary: {
            validationPassed: input.validation?.passed ?? null,
            equivalenceProven: input.validation?.equivalenceProven ?? false,
            metrics: input.metrics ?? null
        },
        whatWasFound: input.findings ?? [],
        whatChanged: {
            before: input.before ?? null,
            after: input.after ?? null
        },
        validation: input.validation ?? null,
        residualRisks: input.residualRisks ?? [
            'Semantic equivalence is not proven unless an oracle and full test suite say so.'
        ],
        nextSteps: input.nextSteps ?? [],
        generatedBy: 'reverse generate_change_report'
    };
    const limitations = [
        'Report aggregates caller-supplied evidence; it does not invent measurements.',
        findings.summary.equivalenceProven
            ? 'Equivalence was claimed by the caller/validation pipeline.'
            : 'Equivalence cannot be proven from this report alone.'
    ];
    const out = result(input.target, 'change_report', [findings], {
        status: 'completed',
        limitations,
        coverage: {
            examined: true,
            complete: !!input.validation,
            notes: ['Before/after report with residual risks and next steps.']
        }
    });
    const file = await saveJson('reports', out);
    return { ...out, findings: [{ ...out.findings[0], artifactPath: file }] };
}
