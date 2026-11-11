/**
 * Behavior capture and replay (Patch M step 6 / G-04).
 * Deterministic scenarios: command, args, env, inputs, expected outputs.
 * Capture records normalized observations; replay compares them.
 * Nondeterminism that cannot be controlled is reported, not hidden.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { runInSandbox, type SandboxLimits } from './execution-sandbox.js';
import { operatingMode } from './benchmark-gate.js';
import { assertAuthorizationPresent, requireLegacyGate } from './legacy-gate.js';
import type { LegacyAuthorization } from './legacy-types.js';
type Obs = NormalizedObservation;
type Auth = LegacyAuthorization;
type Replay = ReplayComparison;
export interface ScenarioInputFile {
    relativePath: string;
    /** UTF-8 text or base64 for binary. */
    content: string;
    encoding?: 'utf8' | 'base64';
}
export interface BehaviorScenario {
    schemaVersion: '1.0';
    id: string;
    description?: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
    inputFiles?: ScenarioInputFile[];
    /** Wall timeout for capture/replay runs. */
    timeoutMs?: number;
    /**
     * Fields treated as nondeterministic: stripped or ignored on compare.
     * Known tokens: timestamps, pids, scratch-paths.
     */
    volatileFields?: string[];
}
export interface NormalizedObservation {
    exitCode: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
    /** Relative path → sha256 of file contents under scratch after run. */
    outputFiles: Record<string, string>;
    durationMs: number;
    limitations: string[];
}
export interface CaptureRecord {
    scenarioId: string;
    authorization: LegacyAuthorization;
    capturedAt: string;
    observation: NormalizedObservation;
    environmentDetail: string;
}
export interface ReplayComparison {
    scenarioId: string;
    captureAuthorization: LegacyAuthorization;
    replayAuthorization: LegacyAuthorization;
    equal: boolean;
    differences: string[];
    limitations: string[];
    expected: NormalizedObservation;
    actual: NormalizedObservation;
}
function requireControlled(confirm: boolean): void {
    if (operatingMode() !== 'CONTROLLED_EXECUTION' || !confirm) {
        throw new Error('Behavior capture/replay requires REVERSE_MODE=CONTROLLED_EXECUTION and confirm=true.');
    }
}
function normalizeText(text: string, volatile: string[]): string {
    let out = text.replace(/\r\n/g, '\n');
    if (volatile.includes('timestamps')) {
        out = out.replace(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/g, '<TIMESTAMP>');
    }
    if (volatile.includes('pids')) {
        out = out.replace(/\bpid[=: ]?\d+\b/gi, 'pid=<PID>');
        out = out.replace(/\b\d{3,7}\b/g, (m) => {
            // only rewrite bare numbers that look like pids when tagged — keep simple
            return m;
        });
    }
    if (volatile.includes('scratch-paths')) {
        out = out.replace(/\/tmp\/reverse-sandbox-[^/\s]+/g, '<SCRATCH>');
        out = out.replace(/reverse-sandbox-[a-z0-9]+/gi, '<SCRATCH>');
    }
    return out;
}
async function hashTree(root: string): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    async function walk(dir: string): Promise<void> {
        let entries: string[];
        try {
            entries = await readdir(dir);
        }
        catch {
            return;
        }
        for (const name of entries) {
            const full = join(dir, name);
            const st = await stat(full);
            if (st.isDirectory())
                await walk(full);
            else if (st.isFile()) {
                const rel = relative(root, full).replace(/\\/g, '/');
                const buf = await readFile(full);
                out[rel] = createHash('sha256').update(buf).digest('hex');
            }
        }
    }
    await walk(root);
    return out;
}
function seedFromScenario(scenario: BehaviorScenario): Array<{
    relativePath: string;
    content: Buffer | string;
}> {
    return (scenario.inputFiles ?? []).map(f => ({
        relativePath: f.relativePath,
        content: f.encoding === 'base64'
            ? Buffer.from(f.content, 'base64')
            : f.content
    }));
}
/**
 * Run the scenario once under the sandbox and return a normalized observation.
 * Does not persist; use `captureScenario` to write a record.
 */
export async function observeScenario(scenario: BehaviorScenario, opts: {
    confirm: boolean;
    limits?: SandboxLimits;
    keepScratch?: boolean;
    authorization?: LegacyAuthorization | null;
    sessionId?: string;
}): Promise<NormalizedObservation> {
    requireControlled(opts.confirm);
    await requireLegacyGate({
        authorization: opts.authorization,
        sessionId: opts.sessionId,
        operation: 'observe_legacy_scenario'
    });
    const volatile = scenario.volatileFields ?? ['timestamps', 'scratch-paths'];
    const prevKeep = process.env.REVERSE_KEEP_SCRATCH;
    if (opts.keepScratch)
        process.env.REVERSE_KEEP_SCRATCH = '1';
    try {
        const run = await runInSandbox({
            command: scenario.command,
            args: scenario.args ?? [],
            env: scenario.env,
            seedFiles: seedFromScenario(scenario),
            confirm: true,
            limits: {
                timeoutMs: scenario.timeoutMs ?? opts.limits?.timeoutMs ?? 15000,
                memoryMaxBytes: opts.limits?.memoryMaxBytes,
                cpuQuotaPercent: opts.limits?.cpuQuotaPercent
            }
        });
        let outputFiles: Record<string, string> = {};
        if (opts.keepScratch && run.scratchDir) {
            try {
                outputFiles = await hashTree(run.scratchDir);
            }
            catch {
                // scratch may already be gone
            }
        }
        return {
            exitCode: run.exitCode,
            signal: run.signal,
            stdout: normalizeText(run.stdout, volatile),
            stderr: normalizeText(run.stderr, volatile),
            outputFiles,
            durationMs: run.durationMs,
            limitations: [
                ...run.limitations,
                ...(run.mechanism.networkIsolated
                    ? []
                    : ['Capture host did not enforce network isolation.']),
                'Duration is informational and is not compared on replay.'
            ]
        };
    }
    finally {
        if (prevKeep === undefined)
            delete process.env.REVERSE_KEEP_SCRATCH;
        else
            process.env.REVERSE_KEEP_SCRATCH = prevKeep;
    }
}
export async function captureScenario(scenario: BehaviorScenario, opts: {
    confirm: boolean;
    outPath?: string;
    environmentDetail?: string;
    authorization?: LegacyAuthorization | null;
    sessionId?: string;
}): Promise<CaptureRecord> {
    requireControlled(opts.confirm);
    const authorization = await requireLegacyGate({
        authorization: opts.authorization,
        sessionId: opts.sessionId,
        operation: 'capture_legacy_scenario'
    });
    const observation = await observeScenario(scenario, {
        confirm: true,
        keepScratch: true,
        authorization
    });
    const record: CaptureRecord = {
        scenarioId: scenario.id,
        authorization,
        capturedAt: new Date().toISOString(),
        observation,
        environmentDetail: opts.environmentDetail ?? `platform=${process.platform}`
    };
    if (opts.outPath) {
        await mkdir(resolve(opts.outPath, '..'), { recursive: true }).catch(() => undefined);
        await writeFile(opts.outPath, JSON.stringify(record, null, 2));
    }
    return record;
}
export function compareObservations(e: Obs, a: Obs, id: string, captureAuth: Auth, replayAuth: Auth): Replay {
    const differences: string[] = [];
    if (e.exitCode !== a.exitCode)
        differences.push(`exitCode: expected ${e.exitCode}, got ${a.exitCode}`);
    if (e.signal !== a.signal)
        differences.push(`signal: expected ${e.signal}, got ${a.signal}`);
    if (e.stdout !== a.stdout)
        differences.push('stdout differs after normalization');
    if (e.stderr !== a.stderr)
        differences.push('stderr differs after normalization');
    const expKeys = Object.keys(e.outputFiles).sort();
    const actKeys = Object.keys(a.outputFiles).sort();
    if (expKeys.join('\0') !== actKeys.join('\0'))
        differences.push(`output file set differs: expected [${expKeys}] got [${actKeys}]`);
    else {
        for (const k of expKeys) {
            if (e.outputFiles[k] !== a.outputFiles[k])
                differences.push(`output file hash differs: ${k}`);
        }
    }
    const limitations = [
        ...new Set([...e.limitations, ...a.limitations])
    ];
    return {
        scenarioId: id,
        captureAuthorization: captureAuth,
        replayAuthorization: replayAuth,
        equal: differences.length === 0,
        differences,
        limitations,
        expected: e,
        actual: a
    };
}
/**
 * Replay: run the scenario again and compare to a prior capture record.
 */
export async function replayScenario(scenario: BehaviorScenario, prior: CaptureRecord, opts: {
    confirm: boolean;
    authorization?: LegacyAuthorization | null;
    sessionId?: string;
}): Promise<ReplayComparison> {
    requireControlled(opts.confirm);
    assertAuthorizationPresent(prior.authorization, 'replay_prior_capture');
    const authorization = await requireLegacyGate({
        authorization: opts.authorization,
        sessionId: opts.sessionId,
        operation: 'replay_legacy_scenario'
    });
    const actual = await observeScenario(scenario, {
        confirm: true,
        keepScratch: true,
        authorization
    });
    return compareObservations(prior.observation, actual, scenario.id, prior.authorization, authorization);
}
export async function loadCaptureRecord(path: string): Promise<CaptureRecord> {
    const raw = JSON.parse(await readFile(path, 'utf8')) as CaptureRecord;
    if (!raw?.scenarioId || !raw.observation)
        throw new Error(`invalid capture record: ${path}`);
    assertAuthorizationPresent(raw.authorization, 'load_capture_record');
    return raw;
}
