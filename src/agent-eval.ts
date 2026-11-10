import { result } from './core-types.js';
import { getPrompt } from './mcp-prompts.js';
export interface EvalCase {
    id: string;
    prompt: string;
    args?: Record<string, string>;
    mustInclude: string[];
}
const DEFAULT_CASES: EvalCase[] = [
    {
        id: 'research_cycle_mentions_workspace',
        prompt: 'research_cycle',
        args: { target: '/tmp/app' },
        mustInclude: ['create_change_workspace', 'decide_optimization', 'untrustedContent']
    },
    {
        id: 'hypothesis_wraps_untrusted',
        prompt: 'hypothesis_discipline',
        args: { target_facts: 'secret-string-xyz', statement: 'x is hot' },
        mustInclude: ['UNTRUSTED', 'secret-string-xyz', 'Promote']
    },
    {
        id: 'decision_prompt_no_invention',
        prompt: 'optimization_decision',
        args: { verdict: 'improved', validation_passed: 'true' },
        mustInclude: ['decide_optimization', 'improved']
    }
];
/**
 * Lightweight H-09 evaluation: score prompt materialization against required phrases.
 * Not a full agent corpus harness — fixture-level discipline check.
 */
export function evaluateAgentPrompts(cases: EvalCase[] = DEFAULT_CASES) {
    const findings = [];
    let passed = 0;
    for (const c of cases) {
        const got = getPrompt(c.prompt, c.args ?? {});
        const text = JSON.stringify(got);
        const missing = c.mustInclude.filter(s => !text.includes(s));
        const ok = missing.length === 0;
        if (ok)
            passed++;
        findings.push({
            id: c.id,
            passed: ok,
            missing,
            prompt: c.prompt
        });
    }
    return result('agent_eval', 'evaluate_agent_prompts', findings, {
        status: passed === cases.length ? 'completed' : 'partial',
        limitations: [
            'Scores prompt templates only; does not run a live agent on a corpus (full H-09 later).'
        ],
        coverage: {
            examined: true,
            complete: passed === cases.length,
            notes: [`${passed}/${cases.length} cases passed`]
        }
    });
}
