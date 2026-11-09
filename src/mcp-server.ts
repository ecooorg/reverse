#!/usr/bin/env node
import readline from 'node:readline';
import { VERSION } from './core-version.js';
import { createBenchmarkSuite, runBenchmarkSuite, compareBenchmarkSuites, captureBaseline, compareBaselines, getBenchmarkSuite } from './benchmark-suite.js';
import { EvidenceEngine } from './evidence-engine.js';
import { wrapUntrusted } from './core-untrusted.js';
import { analyzeBinary } from './analysis-binary.js';
import { analyzeSource } from './analysis-source.js';
import { analyzeDependencies } from './analysis-dependencies.js';
import { listProcesses, inspectProcess, getProcessMetrics, getProcessTree, analyzeMemory, analyzeCpu, analyzeIo } from './process-inspector.js';
import { profileProcess, monitorProcess, detectResourceAnomalies } from './profiling-profiler.js';
import { runBenchmark, compareBenchmarks } from './benchmark-engine.js';
import { validateBehavior } from './benchmark-validation.js';
import { listProviders } from './providers-registry.js';
import { getResourceControlStatus } from './process-safety.js';
import { checkCommandGate } from './benchmark-gate.js';
import { environmentFingerprintResult } from './benchmark-environment.js';
/** A failure that must be reported as a JSON-RPC protocol error (not as a tool execution error). */
class ProtocolError extends Error {
    constructor(readonly code: number, message: string) { super(message); }
}
const tools = [
    { name: 'inspect_target', description: 'Inspect a file or source directory and return its basic classification and metadata.', inputSchema: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] } },
    { name: 'analyze_binary', description: 'Inspect ELF, PE or Mach-O headers. This is not disassembly or decompilation.', inputSchema: { type: 'object', properties: { file: { type: 'string' } }, required: ['file'] } },
    { name: 'analyze_source', description: 'Inventory source files and textual external imports in a directory.', inputSchema: { type: 'object', properties: { directory: { type: 'string' } }, required: ['directory'] } },
    { name: 'analyze_dependencies', description: 'Read direct dependencies from a package.json manifest.', inputSchema: { type: 'object', properties: { directory: { type: 'string' } }, required: ['directory'] } },
    { name: 'get_inventory', description: 'List visible local processes.', inputSchema: { type: 'object', properties: { limit: { type: 'number' }, offset: { type: 'number' } } } },
    { name: 'inspect_process', description: 'Inspect one process visible to the current user.', inputSchema: { type: 'object', properties: { pid: { type: 'number' } }, required: ['pid'] } },
    { name: 'profile_process', description: 'Sample process CPU/RSS over a bounded interval.', inputSchema: { type: 'object', properties: { pid: { type: 'number' }, durationMs: { type: 'number' }, intervalMs: { type: 'number' } }, required: ['pid'] } },
    { name: 'list_processes', description: 'List visible processes with OS-provided resource metadata.', inputSchema: { type: 'object', properties: { limit: { type: 'number' }, offset: { type: 'number' } } } },
    { name: 'monitor_process', description: 'Observe process metrics over a bounded interval and persist a time series.', inputSchema: { type: 'object', properties: { pid: { type: 'number' }, durationMs: { type: 'number' }, intervalMs: { type: 'number' }, mode: { type: 'string', enum: ['Snapshot', 'Monitor', 'Diagnostic', 'Compare'] } }, required: ['pid'] } },
    { name: 'get_process_metrics', description: 'Get current process resource metrics.', inputSchema: { type: 'object', properties: { pid: { type: 'number' } }, required: ['pid'] } },
    { name: 'get_process_tree', description: 'Get the visible descendant process tree.', inputSchema: { type: 'object', properties: { pid: { type: 'number' } }, required: ['pid'] } },
    { name: 'analyze_memory', description: 'Return current process memory metrics.', inputSchema: { type: 'object', properties: { pid: { type: 'number' } }, required: ['pid'] } },
    { name: 'analyze_cpu', description: 'Return current process CPU metrics.', inputSchema: { type: 'object', properties: { pid: { type: 'number' } }, required: ['pid'] } },
    { name: 'analyze_io', description: 'Return current process disk I/O counters where available.', inputSchema: { type: 'object', properties: { pid: { type: 'number' } }, required: ['pid'] } },
    { name: 'detect_resource_anomalies', description: 'Detect high CPU and growing memory in supplied profile series.', inputSchema: { type: 'object', properties: { series: { type: 'array', items: { type: 'object' } } }, required: ['series'] } },
    { name: 'get_resource_control_status', description: 'Report whether enforceable OS resource controls are available; does not change a process.', inputSchema: { type: 'object', properties: {} } },
    { name: 'capture_baseline', description: 'Capture a named baseline by running a command repeatedly and persisting the benchmark artifact.', inputSchema: { type: 'object', properties: { command: { type: 'string' }, args: { type: 'array', items: { type: 'string' } }, cwd: { type: 'string' }, timeoutMs: { type: 'number' }, repetitions: { type: 'number' }, warmupRuns: { type: 'number' }, label: { type: 'string' } }, required: ['command'] } },
    { name: 'run_benchmark', description: 'Run a command repeatedly without a shell and measure wall-clock duration, CPU time, peak RAM (direct child; sampled) and binary size.', inputSchema: { type: 'object', properties: { command: { type: 'string' }, args: { type: 'array', items: { type: 'string' } }, cwd: { type: 'string' }, timeoutMs: { type: 'number' }, repetitions: { type: 'number' }, warmupRuns: { type: 'number' }, label: { type: 'string' } }, required: ['command'] } },
    { name: 'compare_results', description: 'Compare two Reverse benchmark result objects.', inputSchema: { type: 'object', properties: { before: { type: 'object' }, after: { type: 'object' } }, required: ['before', 'after'] } },
    { name: 'validate_changes', description: 'Check caller-provided expected stdout/stderr and exit code for a command.', inputSchema: { type: 'object', properties: { command: { type: 'string' }, args: { type: 'array', items: { type: 'string' } }, cwd: { type: 'string' }, timeoutMs: { type: 'number' }, expected: { type: 'object' }, repetitions: { type: 'number' } }, required: ['command', 'expected'] } },
    { name: 'get_environment_fingerprint', description: 'Report the non-secret environment fingerprint (OS, CPU, memory, Node.js, Reverse version) used to judge benchmark comparability.', inputSchema: { type: 'object', properties: {} } },
    { name: 'get_evidence', description: 'Find a persisted evidence record by ID.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'list_analyzers', description: 'List implemented capabilities and external analyzer extension points.', inputSchema: { type: 'object', properties: {} } },
    { name: 'create_benchmark_suite', description: 'Create an interleaved benchmark suite with two or more named cases.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, cases: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, command: { type: 'string' }, args: { type: 'array', items: { type: 'string' } }, cwd: { type: 'string' }, timeoutMs: { type: 'number' } }, required: ['name', 'command'] } }, repetitions: { type: 'number' }, warmupRuns: { type: 'number' } }, required: ['cases'] } },
    { name: 'run_benchmark_suite', description: 'Run a previously created benchmark suite in round-robin order.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'compare_benchmarks', description: 'Compare two interleaved benchmark suite results by matching case name.', inputSchema: { type: 'object', properties: { before: { type: 'object' }, after: { type: 'object' } }, required: ['before', 'after'] } },
    { name: 'compare_baselines', description: 'Compare two stored baseline IDs and return the statistical benchmark report.', inputSchema: { type: 'object', properties: { before_id: { type: 'string' }, after_id: { type: 'string' } }, required: ['before_id', 'after_id'] } },
    { name: 'get_research_session', description: 'Retrieve a complete research session, hash-chained event ledger, evidence and hypotheses.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'create_research_session', description: 'Create a local research session for a target.', inputSchema: { type: 'object', properties: { target_id: { type: 'string' } }, required: ['target_id'] } },
    { name: 'add_research_hypothesis', description: 'Record an AI hypothesis separately from measured and static evidence.', inputSchema: { type: 'object', properties: { session_id: { type: 'string' }, statement: { type: 'string' }, provenance: { type: 'array', items: { type: 'string' } }, confidence: { type: 'number' } }, required: ['session_id', 'statement', 'provenance', 'confidence'] } },
    { name: 'promote_research_hypothesis', description: 'Promote a hypothesis only by referencing Validation or Benchmark evidence in the same session, or mark it refuted/retired.', inputSchema: { type: 'object', properties: { session_id: { type: 'string' }, hypothesis_id: { type: 'string' }, status: { type: 'string', enum: ['supported', 'refuted', 'retired'] }, evidence_id: { type: 'string' } }, required: ['session_id', 'hypothesis_id', 'status'] } },
    { name: 'add_research_event', description: 'Append a typed research-cycle event and artifact links to a session.', inputSchema: { type: 'object', properties: { session_id: { type: 'string' }, event: { type: 'string' }, payload: { type: 'object' } }, required: ['session_id', 'event'] } },
    { name: 'add_research_evidence', description: 'Attach typed measured evidence with source, confidence and limitations to a research session.', inputSchema: { type: 'object', properties: { session_id: { type: 'string' }, type: { type: 'string', enum: ['Process', 'Memory', 'CPU', 'I/O', 'Binary', 'Benchmark', 'Validation'] }, source: { type: 'string' }, measurement: {}, confidence: { type: 'number' }, limitations: { type: 'array', items: { type: 'string' } } }, required: ['session_id', 'type', 'source', 'measurement', 'confidence', 'limitations'] } },
    { name: 'link_research_artifacts', description: 'Link target, observations, profile, baseline, optimization, benchmark, comparison, validation or final report artifacts in a research session.', inputSchema: { type: 'object', properties: { session_id: { type: 'string' }, relation: { type: 'string' }, ids: { type: 'array', items: { type: 'string' } } }, required: ['session_id', 'relation', 'ids'] } }
];
const EXEC_TOOLS = new Set(['capture_baseline', 'run_benchmark', 'validate_changes', 'run_benchmark_suite']);
const FULL_SCHEMA = process.env.REVERSE_MCP_SCHEMA_PROFILE === 'full';
function makeStrict(schema: any): void {
    if (!schema || typeof schema !== 'object')
        return;
    if (schema.type === 'object')
        schema.additionalProperties = false;
    for (const child of Object.values(schema.properties ?? {}))
        makeStrict(child);
    if (schema.items)
        makeStrict(schema.items);
}
for (const t of tools as any[]) {
    const exec = EXEC_TOOLS.has(t.name);
    t.title = t.name.replaceAll('_', ' ');
    t.annotations = { title: t.title, readOnlyHint: !exec, destructiveHint: exec, idempotentHint: !exec, openWorldHint: false };
    t.outputSchema = { type: 'object', properties: { schemaVersion: { type: 'string' }, status: { type: 'string' }, findings: { type: 'array' }, limitations: { type: 'array', items: { type: 'string' } }, pagination: { type: 'object', properties: { offset: { type: 'number' }, limit: { type: 'number' }, total: { type: 'number' }, nextOffset: { type: ['number', 'null'] } } } }, additionalProperties: true };
    if (FULL_SCHEMA)
        makeStrict(t.inputSchema);
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
        case 'get_inventory':
        case 'list_processes': return listProcesses(a.limit, a.offset);
        case 'monitor_process': return monitorProcess(a.pid, { ...a, signal });
        case 'get_process_metrics': return getProcessMetrics(a.pid);
        case 'get_process_tree': return getProcessTree(a.pid);
        case 'analyze_memory': return analyzeMemory(a.pid);
        case 'analyze_cpu': return analyzeCpu(a.pid);
        case 'analyze_io': return analyzeIo(a.pid);
        case 'detect_resource_anomalies': return detectResourceAnomalies(a.series);
        case 'get_resource_control_status': return getResourceControlStatus();
        case 'inspect_process': return inspectProcess(a.pid);
        case 'profile_process': return profileProcess(a.pid, a.durationMs, a.intervalMs, undefined, { signal });
        case 'get_environment_fingerprint': return environmentFingerprintResult();
        case 'capture_baseline': return captureBaseline({ ...a, name: a.label ?? 'baseline' });
        case 'run_benchmark': return runBenchmark(a);
        case 'compare_results': return compareBenchmarks(a.before, a.after);
        case 'validate_changes': return validateBehavior(a, a.expected, a.repetitions);
        case 'get_evidence': {
            const p = await new EvidenceEngine().get(a.id);
            if (!p)
                return { found: false, id: a.id };
            return { found: true, path: p, record: JSON.parse(await (await import('node:fs/promises')).readFile(p, 'utf8')) };
        }
        case 'list_analyzers': return listProviders();
        case 'create_benchmark_suite': return createBenchmarkSuite(a);
        case 'run_benchmark_suite': return runBenchmarkSuite(a.id);
        case 'compare_benchmarks': return compareBenchmarkSuites(a.before, a.after);
        case 'compare_baselines': return compareBaselines(a.before_id, a.after_id);
        case 'get_research_session': return { found: !!(await new EvidenceEngine().getResearchSession(a.id)), session: await new EvidenceEngine().getResearchSession(a.id) };
        case 'create_research_session': return new EvidenceEngine().createResearchSession(a.target_id);
        case 'add_research_hypothesis': return new EvidenceEngine().addHypothesis(a.session_id, { statement: a.statement, provenance: a.provenance, confidence: a.confidence });
        case 'promote_research_hypothesis': return new EvidenceEngine().updateHypothesis(a.session_id, a.hypothesis_id, a.status, a.evidence_id);
        case 'add_research_event': return new EvidenceEngine().addSessionEvent(a.session_id, a.event, a.payload ?? {});
        case 'add_research_evidence': return new EvidenceEngine().addEvidence(a.session_id, { type: a.type, source: a.source, measurement: a.measurement, confidence: a.confidence, limitations: a.limitations });
        case 'link_research_artifacts': return new EvidenceEngine().link(a.session_id, a.relation, a.ids);
        default: throw new ProtocolError(-32602, `Unknown tool: ${name}`);
    }
}
// Versions whose tools/call result shape this server satisfies. A client asking for one of them gets it back; otherwise the newest is offered.
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
        const value = await call(name, req.params.arguments ?? {}, controller.signal);
        const w = wrapUntrusted(value);
        send({ jsonrpc: '2.0', id: req.id, result: { content: [{ type: 'text', text: JSON.stringify(w.text) }], structuredContent: w.structured, isError: false } });
    }
    catch (e) {
        // Protocol problems are JSON-RPC errors; a failing tool is a normal result with isError, so the model can read it and react.
        if (e instanceof ProtocolError)
            sendError(req.id, e.code, e.message);
        else {
            const message = messageOf(e);
            send({ jsonrpc: '2.0', id: req.id, result: { content: [{ type: 'text', text: JSON.stringify({ error: { code: 'TOOL_EXECUTION_ERROR', message } }) }], structuredContent: { error: { code: 'TOOL_EXECUTION_ERROR', message } }, isError: true } });
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
            send({ jsonrpc: '2.0', id: req.id, result: { protocolVersion: SUPPORTED_PROTOCOLS.includes(req.params?.protocolVersion) ? req.params.protocolVersion : SUPPORTED_PROTOCOLS[SUPPORTED_PROTOCOLS.length - 1], capabilities: { tools: {} }, serverInfo: { name: 'reverse', version: VERSION } } });
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
        default: if (req.id !== undefined)
            sendError(req.id, -32601, `Method not found: ${req.method}`);
    }
}
rl.on('line', line => { handleLine(line).catch(e => sendError(null, -32603, `Internal error: ${messageOf(e)}`)); });
