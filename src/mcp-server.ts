#!/usr/bin/env node
import readline from 'node:readline';
import { VERSION } from './core-version.js';
import { listPrompts, getPrompt } from './mcp-prompts.js';
import { listResources, readResource } from './mcp-resources.js';
import { createBenchmarkSuite, runBenchmarkSuite, compareBenchmarkSuites } from './benchmark-suite.js';
import { captureBaseline, compareBaselines, getBenchmarkSuite } from './benchmark-suite.js';
import { EvidenceEngine } from './evidence-engine.js';
import { wrapUntrusted } from './core-untrusted.js';
import { analyzeBinary } from './analysis-binary.js';
import { analyzeSource } from './analysis-source.js';
import { analyzeDependencies } from './analysis-dependencies.js';
import { analyzeAndroid } from './analysis-android.js';
import { analyzeJavascript } from './analysis-javascript.js';
import { analyzeDotnet } from './analysis-dotnet.js';
import { analyzeWasm } from './analysis-wasm.js';
import { listProcesses, inspectProcess, getProcessMetrics, getProcessTree } from './process-inspector.js';
import { analyzeMemory, analyzeCpu, analyzeIo } from './process-inspector.js';
import { profileProcess, monitorProcess, detectResourceAnomalies } from './profiling-profiler.js';
import { runBenchmark, compareBenchmarks } from './benchmark-engine.js';
import { validateBehavior, runValidationFixtures } from './benchmark-validation.js';
import { listProviders, runProvider } from './providers-registry.js';
import { getHotspots, getProcessIo } from './profiling-hotspots.js';
import { generateChangeReport } from './reports-change.js';
import { createChangeWorkspace, rollbackChangeWorkspace, acceptChangeWorkspace } from './optimization-workspace.js';
import { applyChange } from './optimization-apply.js';
import { decideOptimization } from './optimization-decision.js';
import { runApkPipeline } from './optimization-apk.js';
import { createGitWorktreeWorkspace, removeGitWorktree } from './optimization-git.js';
import { adbInstall, adbPmClear, adbEmuSnapshotLoad } from './optimization-adb.js';
import { runOptimizationTrial, runAllReferenceTrials } from './optimization-trial.js';
import { verifySessionSignature, signSession } from './evidence-integrity.js';
import { traceWithFrida } from './providers-frida.js';
import { getResourceControlStatus } from './process-safety.js';
import { checkCommandGate, operatingMode } from './benchmark-gate.js';
import { evidenceFromResult } from './evidence-collect.js';
import { environmentFingerprintResult } from './benchmark-environment.js';
import { tools, EVIDENCE_TOOLS, EXEC_TOOLS } from './mcp-tools.js';
import './providers-bootstrap.js';
/** A failure that must be reported as a JSON-RPC protocol error (not as a tool execution error). */
class ProtocolError extends Error {
    constructor(readonly code: number, message: string) { super(message); }
}
/** OBSERVE mode samples only processes whose ownership is verified; READ_ONLY keeps the unchanged default behavior. */
const observeOwnership = () => operatingMode() === 'OBSERVE' ? 'verified' as const : undefined;
async function callWithEvidence(name: string, args: any, signal?: AbortSignal) {
    const sessionId = EVIDENCE_TOOLS.has(name) ? args?.session_id : undefined;
    if (sessionId === undefined)
        return call(name, args, signal);
    const engine = new EvidenceEngine();
    if (!(await engine.getResearchSession(String(sessionId))))
        throw new Error(`Research session not found: ${sessionId}`);
    const { session_id: _ignored, ...rest } = args;
    const value: any = await call(name, rest, signal);
    const collected = evidenceFromResult(value);
    if (!collected)
        return { ...value, researchEvidence: { recorded: false, reason: `Operation ${value?.operation} is not an evidence type.` } };
    const record = await engine.addEvidence(String(sessionId), collected);
    const { evidence_id, type, confidence, hash } = record;
    return { ...value, researchEvidence: { recorded: true, evidence_id, type, confidence, hash } };
}
async function call(name: string, a: any, signal?: AbortSignal) {
    if (name === 'run_benchmark_suite') {
        const suite = await getBenchmarkSuite(a.id);
        if (!suite)
            throw new Error(`Benchmark suite not found: ${a.id}`);
        for (const c of suite.cases) {
            const refusal = checkCommandGate(c);
            if (refusal)
                throw new Error(`${c.name}: ${refusal}`);
        }
    }
    else if (EXEC_TOOLS.has(name)) {
        const refusal = checkCommandGate(a);
        if (refusal)
            throw new Error(refusal);
    }
    switch (name) {
        case 'inspect_target': {
            const fs = await import('node:fs/promises');
            const s = await fs.stat(a.target);
            return s.isDirectory() ? await analyzeSource(a.target) : await analyzeBinary(a.target);
        }
        case 'analyze_binary': return analyzeBinary(a.file);
        case 'analyze_source': return analyzeSource(a.directory);
        case 'analyze_dependencies': return analyzeDependencies(a.directory);
        case 'analyze_android': return analyzeAndroid(a.file);
        case 'get_inventory':
        case 'list_processes': return listProcesses(a.limit, a.offset);
        case 'monitor_process': return monitorProcess(a.pid, { ...a, signal, requireOwnership: observeOwnership() });
        case 'get_process_metrics': return getProcessMetrics(a.pid);
        case 'get_process_tree': return getProcessTree(a.pid);
        case 'analyze_memory': return analyzeMemory(a.pid);
        case 'analyze_cpu': return analyzeCpu(a.pid);
        case 'analyze_io': return analyzeIo(a.pid);
        case 'detect_resource_anomalies': return detectResourceAnomalies(a.series);
        case 'get_resource_control_status': return getResourceControlStatus();
        case 'inspect_process': return inspectProcess(a.pid);
        case 'profile_process':
            return profileProcess(a.pid, a.durationMs, a.intervalMs, undefined, { signal, requireOwnership: observeOwnership() });
        case 'get_environment_fingerprint': return environmentFingerprintResult();
        case 'capture_baseline': return captureBaseline({ ...a, name: a.label ?? 'baseline' });
        case 'run_benchmark': return runBenchmark(a);
        case 'compare_results': return compareBenchmarks(a.before, a.after);
        case 'validate_changes': return validateBehavior(a, a.expected, a.repetitions, { normalize: a.normalize });
        case 'run_validation_fixtures': return runValidationFixtures(a.directory);
        case 'create_change_workspace': return createChangeWorkspace(a.path, { confirm: !!a.confirm });
        case 'apply_change': return applyChange({
            workspace_id: a.workspace_id,
            changeType: a.changeType,
            relativePath: a.relativePath,
            contents: a.contents,
            dependency: a.dependency,
            runtimeFlag: a.runtimeFlag,
            permission: { confirm: !!a.confirm }
        });
        case 'rollback_change': return rollbackChangeWorkspace(a.workspace_id, { confirm: !!a.confirm });
        case 'accept_change': return acceptChangeWorkspace(a.workspace_id, { confirm: !!a.confirm });
        case 'decide_optimization': return decideOptimization(a);
        case 'run_apk_pipeline': return runApkPipeline({
            apkPath: a.apkPath,
            workDir: a.workDir,
            permission: { confirm: !!a.confirm },
            skipDecode: a.skipDecode,
            timeoutMs: a.timeoutMs
        });
        case 'create_git_worktree': return createGitWorktreeWorkspace(a.path, { confirm: !!a.confirm }, { branchName: a.branchName });
        case 'remove_git_worktree': return removeGitWorktree(a.workspace_id, { confirm: !!a.confirm });
        case 'adb_install': return adbInstall(a.apkPath, { confirm: !!a.confirm }, { serial: a.serial, replace: a.replace });
        case 'adb_pm_clear': return adbPmClear(a.packageName, { confirm: !!a.confirm }, { serial: a.serial });
        case 'adb_emu_snapshot_load': return adbEmuSnapshotLoad(a.snapshotName, { confirm: !!a.confirm }, { serial: a.serial });
        case 'run_optimization_trial': return runOptimizationTrial(a.shape, { confirm: !!a.confirm });
        case 'run_all_reference_trials': return runAllReferenceTrials({ confirm: !!a.confirm });
        case 'analyze_javascript': return analyzeJavascript(a.path);
        case 'analyze_dotnet': return analyzeDotnet(a.file);
        case 'analyze_wasm': return analyzeWasm(a.file);
        case 'get_evidence': {
            const p = await new EvidenceEngine().get(a.id);
            if (!p)
                return { found: false, id: a.id };
            return { found: true, path: p, record: JSON.parse(await (await import('node:fs/promises')).readFile(p, 'utf8')) };
        }
        case 'list_analyzers': return listProviders();
        case 'run_provider': return runProvider(a.name, a.target, { timeoutMs: a.timeoutMs, signal });
        case 'trace_execution': return traceWithFrida(a.target, { pid: a.pid, durationMs: a.durationMs, signal });
        case 'get_hotspots': return getHotspots(a.pid, { durationMs: a.durationMs, signal });
        case 'get_process_io': return getProcessIo(a.pid);
        case 'generate_change_report': return generateChangeReport(a);
        case 'verify_evidence_integrity': {
            let session = a.session;
            if (!session && a.session_id) {
                session = await new EvidenceEngine().getResearchSession(a.session_id);
            }
            if (!session)
                throw new Error('session or session_id required');
            return verifySessionSignature(signSession(session));
        }
        case 'create_benchmark_suite': return createBenchmarkSuite(a);
        case 'run_benchmark_suite': return runBenchmarkSuite(a.id);
        case 'compare_benchmarks': return compareBenchmarkSuites(a.before, a.after);
        case 'compare_baselines': return compareBaselines(a.before_id, a.after_id);
        case 'get_research_session': return {
            found: !!(await new EvidenceEngine().getResearchSession(a.id)), session: await new EvidenceEngine().getResearchSession(a.id)
        };
        case 'create_research_session': return new EvidenceEngine().createResearchSession(a.target_id);
        case 'add_research_hypothesis': return new EvidenceEngine().addHypothesis(a.session_id, {
            statement: a.statement, provenance: a.provenance, confidence: a.confidence
        });
        case 'promote_research_hypothesis':
            return new EvidenceEngine().updateHypothesis(a.session_id, a.hypothesis_id, a.status, a.evidence_id);
        case 'add_research_event': return new EvidenceEngine().addSessionEvent(a.session_id, a.event, a.payload ?? {});
        case 'add_research_evidence': return new EvidenceEngine().addEvidence(a.session_id, {
            type: a.type, source: a.source, measurement: a.measurement, confidence: a.confidence, limitations: a.limitations
        });
        case 'link_research_artifacts': return new EvidenceEngine().link(a.session_id, a.relation, a.ids);
        default: throw new ProtocolError(-32602, `Unknown tool: ${name}`);
    }
}
// Versions whose tools/call result shape this server satisfies. A client asking for one of them gets it back; otherwise the newest is
// offered.
const SUPPORTED_PROTOCOLS = ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25'];
function send(message: any) { process.stdout.write(JSON.stringify(message) + '\n'); }
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
const activeCalls = new Map<string | number, AbortController>();
const sendError = (id: unknown, code: number, message: string) => send({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const messageOf = (e: unknown) => e instanceof Error ? e.message : String(e);
async function handleToolCall(req: any) {
    const name = req.params?.name;
    if (typeof name !== 'string' || !name) {
        sendError(req.id, -32602, 'tools/call requires params.name (string).');
        return;
    }
    const controller = new AbortController();
    if (req.id !== undefined)
        activeCalls.set(req.id, controller);
    try {
        const value = await callWithEvidence(name, req.params.arguments ?? {}, controller.signal);
        const w = wrapUntrusted(value);
        send({
            jsonrpc: '2.0', id: req.id, result: {
                content: [{
                        type: 'text', text: JSON.stringify(w.text)
                    }], structuredContent: w.structured, isError: false
            }
        });
    }
    catch (e) {
        // Protocol problems are JSON-RPC errors; a failing tool is a normal result with isError, so the model can read it and react.
        if (e instanceof ProtocolError)
            sendError(req.id, e.code, e.message);
        else {
            const message = messageOf(e);
            send({
                jsonrpc: '2.0', id: req.id, result: {
                    content: [{
                            type: 'text', text: JSON.stringify({
                                error: {
                                    code: 'TOOL_EXECUTION_ERROR', message
                                }
                            })
                        }], structuredContent: {
                        error: {
                            code: 'TOOL_EXECUTION_ERROR', message
                        }
                    }, isError: true
                }
            });
        }
    }
    finally {
        if (req.id !== undefined)
            activeCalls.delete(req.id);
    }
}
async function handleLine(line: string) {
    if (!line.trim())
        return;
    let req: any;
    try {
        req = JSON.parse(line);
    }
    catch {
        sendError(null, -32700, 'Parse error: the line is not valid JSON.');
        return;
    }
    if (!req || typeof req !== 'object' || Array.isArray(req) || typeof req.method !== 'string') {
        sendError(req && typeof req === 'object' ? req.id : null, -32600, 'Invalid request.');
        return;
    }
    switch (req.method) {
        case 'initialize':
            send({
                jsonrpc: '2.0', id: req.id, result: {
                    protocolVersion: SUPPORTED_PROTOCOLS.includes(req.params?.protocolVersion)
                        ? req.params.protocolVersion
                        : SUPPORTED_PROTOCOLS[SUPPORTED_PROTOCOLS.length - 1], capabilities: {
                        tools: {}
                    }, serverInfo: {
                        name: 'reverse', version: VERSION
                    }
                }
            });
            return;
        case 'notifications/initialized': return;
        case 'notifications/cancelled':
            activeCalls.get(req.params?.requestId)?.abort();
            return;
        case 'ping':
            send({ jsonrpc: '2.0', id: req.id, result: {} });
            return;
        case 'tools/list':
            send({ jsonrpc: '2.0', id: req.id, result: { tools } });
            return;
        case 'tools/call':
            await handleToolCall(req);
            return;
        case 'prompts/list':
            send({ jsonrpc: '2.0', id: req.id, result: listPrompts() });
            return;
        case 'prompts/get': {
            try {
                const name = req.params?.name;
                if (typeof name !== 'string') {
                    sendError(req.id, -32602, 'prompts/get requires params.name');
                    return;
                }
                const args = req.params?.arguments ?? {};
                send({ jsonrpc: '2.0', id: req.id, result: getPrompt(name, args) });
            }
            catch (e: any) {
                sendError(req.id, -32602, e?.message ?? String(e));
            }
            return;
        }
        case 'resources/list': {
            const r = await listResources();
            send({ jsonrpc: '2.0', id: req.id, result: r });
            return;
        }
        case 'resources/read': {
            try {
                const uri = req.params?.uri;
                if (typeof uri !== 'string') {
                    sendError(req.id, -32602, 'resources/read requires params.uri');
                    return;
                }
                const r = await readResource(uri);
                send({ jsonrpc: '2.0', id: req.id, result: r });
            }
            catch (e: any) {
                sendError(req.id, -32602, e?.message ?? String(e));
            }
            return;
        }
        default: if (req.id !== undefined)
            sendError(req.id, -32601, `Method not found: ${req.method}`);
    }
}
rl.on('line', line => { handleLine(line).catch(e => sendError(null, -32603, `Internal error: ${messageOf(e)}`)); });
