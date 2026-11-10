import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { result } from './core-types.js';
import { storeDir, now } from './core-util.js';
import { runBenchmark, compareBenchmarks } from './benchmark-engine.js';
import { validateBehavior } from './benchmark-validation.js';
import { decideOptimization } from './optimization-decision.js';
import { createChangeWorkspace, rollbackChangeWorkspace, loadWorkspace } from './optimization-workspace.js';
import { applyChange } from './optimization-apply.js';
import { operatingMode } from './benchmark-gate.js';
export type ReferenceShape = 'small_source' | 'deps_source' | 'closed_binary';
const SLOW_MAIN = 'const n=+process.argv[2]||20;let x=0;'
    + 'for(let i=0;i<n*1e4;i++)x+=i;'
    + 'process.stdout.write(String(x));\n';
const FAST_MAIN = 'const n=+process.argv[2]||20;let x=0;'
    + 'for(let i=0;i<n*1e2;i++)x+=i;'
    + 'process.stdout.write(String(x));\n';
/**
 * E2E optimization trial on synthetic reference shapes.
 * Fixture stand-ins for the three shapes; external apps not bundled.
 */
export async function runOptimizationTrial(shape: ReferenceShape, opts?: {
    confirm?: boolean;
}) {
    if (operatingMode() !== 'CONTROLLED_EXECUTION' || !opts?.confirm) {
        return result(shape, 'optimization_trial', [], {
            status: 'unsupported',
            limitations: [
                'Trials require REVERSE_MODE=CONTROLLED_EXECUTION and confirm:true.'
            ],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    const root = path.join(storeDir(), 'trials', `${shape}-${Date.now()}`);
    await mkdir(root, { recursive: true });
    const steps: {
        step: string;
        ok: boolean;
        detail?: string;
    }[] = [];
    try {
        const appDir = path.join(root, 'app');
        await mkdir(appDir, { recursive: true });
        const node = process.execPath;
        if (shape === 'small_source') {
            await writeFile(path.join(appDir, 'main.js'), SLOW_MAIN, 'utf8');
        }
        else if (shape === 'deps_source') {
            await writeFile(path.join(appDir, 'package.json'), JSON.stringify({
                name: 'trial-deps',
                dependencies: { leftpad: '0.0.0' }
            }, null, 2), 'utf8');
            await writeFile(path.join(appDir, 'main.js'), SLOW_MAIN, 'utf8');
        }
        else {
            await writeFile(path.join(appDir, 'README.txt'), 'closed binary trial uses host node as opaque command\n', 'utf8');
        }
        const argsBefore = shape === 'closed_binary'
            ? ['-e', 'let x=0;for(let i=0;i<2e5;i++)x+=i;process.stdout.write("ok")']
            : [path.join(appDir, 'main.js'), '30'];
        const before = await runBenchmark({
            command: node,
            args: argsBefore,
            repetitions: 5,
            timeoutMs: 30000
        });
        steps.push({ step: 'baseline', ok: before.status !== 'failed' });
        let workspaceId: string | undefined;
        if (shape !== 'closed_binary') {
            const ws: any = await createChangeWorkspace(appDir, { confirm: true });
            workspaceId = ws.findings?.[0]?.workspace_id;
            steps.push({
                step: 'workspace',
                ok: ws.status === 'completed',
                detail: workspaceId
            });
            if (workspaceId) {
                await applyChange({
                    workspace_id: workspaceId,
                    changeType: 'source_edit',
                    relativePath: 'main.js',
                    contents: FAST_MAIN,
                    permission: { confirm: true }
                });
                steps.push({ step: 'apply_change', ok: true });
            }
        }
        else {
            steps.push({
                step: 'workspace',
                ok: true,
                detail: 'skipped_closed_binary'
            });
        }
        let mainPath = path.join(appDir, 'main.js');
        if (workspaceId) {
            const ws = await loadWorkspace(workspaceId);
            if (ws)
                mainPath = path.join(ws.workPath, 'main.js');
        }
        const argsAfter = shape === 'closed_binary'
            ? ['-e', 'let x=0;for(let i=0;i<1e4;i++)x+=i;process.stdout.write("ok")']
            : [mainPath, '30'];
        const after = await runBenchmark({
            command: node,
            args: argsAfter,
            repetitions: 5,
            timeoutMs: 30000
        });
        steps.push({ step: 'after_benchmark', ok: after.status !== 'failed' });
        const cmp: any = await compareBenchmarks(before as any, after as any);
        const verdict = cmp.findings?.[0]?.verdict;
        steps.push({ step: 'compare', ok: true, detail: String(verdict) });
        const v: any = await validateBehavior({ command: node, args: argsAfter, timeoutMs: 15000 }, shape === 'closed_binary'
            ? { stdout: 'ok', exitCode: 0 }
            : { exitCode: 0 }, 1);
        const validationPassed = !!v.findings?.[0]?.passed;
        steps.push({ step: 'validate', ok: validationPassed });
        const decision: any = decideOptimization({
            performanceVerdict: verdict,
            validationPassed
        });
        const dec = decision.findings?.[0]?.decision;
        steps.push({ step: 'decide', ok: true, detail: dec });
        if (workspaceId && (dec === 'roll_back' || dec === 'reject')) {
            await rollbackChangeWorkspace(workspaceId, { confirm: true });
            steps.push({ step: 'rollback', ok: true });
        }
        return result(shape, 'optimization_trial', [{
                shape,
                steps,
                decision: dec,
                verdict,
                validationPassed,
                at: now()
            }], {
            status: 'completed',
            limitations: [
                'Synthetic fixtures represent the three reference shapes.',
                'External licensed apps are operator-supplied, not bundled.'
            ],
            coverage: {
                examined: true,
                complete: steps.every(s => s.ok),
                notes: steps.map(s => `${s.step}:${s.ok}${s.detail ? '=' + s.detail : ''}`)
            }
        });
    }
    catch (e: any) {
        return result(shape, 'optimization_trial', [{ steps }], {
            status: 'failed',
            limitations: [e?.message ?? String(e)],
            errors: [String(e?.message ?? e)],
            coverage: {
                examined: true,
                complete: false,
                notes: steps.map(s => s.step)
            }
        });
    }
}
export async function runAllReferenceTrials(opts?: {
    confirm?: boolean;
}) {
    const shapes: ReferenceShape[] = [
        'small_source',
        'deps_source',
        'closed_binary'
    ];
    const findings = [];
    for (const s of shapes) {
        findings.push(await runOptimizationTrial(s, opts));
    }
    const allOk = findings.every((f: any) => f.status !== 'failed');
    return result('reference_trials', 'optimization_trials', findings, {
        status: allOk ? 'completed' : 'partial',
        limitations: [
            'Fixture-based trials; external reference apps optional.'
        ],
        coverage: {
            examined: true,
            complete: allOk,
            notes: findings.map((f: any) => `${f.target}:${f.status}`)
        }
    });
}
