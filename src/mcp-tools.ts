import { processTools } from './mcp-tools-process.js';
import { researchTools } from './mcp-tools-research.js';
import { optimizationTools } from './mcp-tools-optimization.js';
export const tools: any[] = [...processTools, ...researchTools, ...optimizationTools];
/**
 * Measurement tools that accept an optional `session_id`: the result is then attached to that research session as typed
 * evidence (source, measurement, confidence and limitations come from the result itself, not from the caller).
 */
export const EVIDENCE_TOOLS = new Set([
    'inspect_process', 'get_process_metrics', 'get_process_tree', 'analyze_memory', 'analyze_cpu', 'analyze_io',
    'monitor_process', 'profile_process', 'analyze_binary', 'run_benchmark', 'capture_baseline', 'compare_results',
    'compare_benchmarks', 'compare_baselines', 'validate_changes'
]);
for (const t of tools) {
    if (EVIDENCE_TOOLS.has(t.name))
        t.inputSchema.properties.session_id = {
            type: 'string', description: 'Optional research session: the result is attached to it as typed evidence.'
        };
}
export const EXEC_TOOLS = new Set(['capture_baseline', 'run_benchmark', 'validate_changes', 'run_benchmark_suite']);
/** Tools that mutate device or workspace state even when not in EXEC_TOOLS. */
export const MUTATING_TOOLS = new Set([
    'apply_change',
    'adb_install',
    'adb_pm_clear',
    'adb_emu_snapshot_load',
    'replay_android_seeded_input',
]);
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
for (const t of tools) {
    const exec = EXEC_TOOLS.has(t.name);
    const mutating = exec || MUTATING_TOOLS.has(t.name);
    t.title = t.name.replaceAll('_', ' ');
    t.annotations = {
        title: t.title,
        readOnlyHint: !mutating,
        destructiveHint: mutating,
        idempotentHint: !mutating,
        openWorldHint: false,
    };
    t.outputSchema = {
        type: 'object', properties: {
            schemaVersion: {
                type: 'string'
            }, status: {
                type: 'string'
            }, findings: {
                type: 'array'
            }, limitations: {
                type: 'array', items: {
                    type: 'string'
                }
            }, pagination: {
                type: 'object', properties: {
                    offset: {
                        type: 'number'
                    }, limit: {
                        type: 'number'
                    }, total: {
                        type: 'number'
                    }, nextOffset: {
                        type: [
                            'number', 'null'
                        ]
                    }
                }
            }
        }, additionalProperties: true
    };
    if (FULL_SCHEMA)
        makeStrict(t.inputSchema);
}
