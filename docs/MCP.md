# MCP interface

Transport: newline-delimited JSON-RPC 2.0 over stdin/stdout (MCP stdio). Supported methods: `initialize`, `notifications/initialized`, `ping`, `tools/list`, and `tools/call`.

Each tool returns its result as JSON text in `content[0].text` and as the same data in `structuredContent` (an array result is wrapped as `{ "items": [...] }`, because `structuredContent` must be an object). `initialize` answers with the client's `protocolVersion` when it is `2024-11-05`, `2025-03-26`, `2025-06-18` or `2025-11-25`, and with `2025-11-25` otherwise. The stateless 2026-07-28 protocol era is not implemented. Protocol problems are JSON-RPC errors: `-32700` for a line that is not JSON (`id: null`), `-32600` invalid request, `-32601` unknown method, `-32602` unknown tool or missing tool name. A tool that fails while running (missing file, invalid PID, rejected argument) returns a normal result with `isError: true` and the message in `content[0].text`. Every result also carries an `untrustedContent` field `{ notice, maxStringLength, truncatedStrings }` (inside `structuredContent`; for object results also in the text): strings from analyzed targets are untrusted data, and strings longer than 4096 characters are truncated with a `…[truncated N chars]` suffix. Total tool responses are capped at 1 MiB; oversized `findings` arrays are truncated, marked `partial`, and include `responseBudget` metadata.

## Tools

Tool definitions include `title`, `annotations` and an `outputSchema`; command-execution tools are explicitly marked non-read-only. The default schema profile is compact. Tool execution failures are returned as `isError: true` results with machine-readable `structuredContent.error.code`. Set `REVERSE_MCP_SCHEMA_PROFILE=full` for strict input schemas (`additionalProperties: false`); the default `compact` profile remains permissive for forward-compatible callers.

| Tool | Required arguments | Purpose |
|---|---|---|
| `inspect_target` | `target` | Directory -> source inventory; file -> binary header inspection |
| `analyze_binary` | `file` | ELF/PE/Mach-O structure: sections, symbols, imports/exports, functions |
| `analyze_source` | `directory` | Source inventory with comment-aware imports |
| `analyze_dependencies` | `directory` | Dependencies from manifests and lockfiles |
| `analyze_android` | `file` | APK/AAB static inventory (dex, ABI, native libs, R8/ProGuard indicators) |
| `get_inventory` | none | Visible process list; optional `limit`, `offset` (response includes `pagination`) |
| `list_processes` | none | Detailed visible process inventory; optional `limit`, `offset` (response includes `pagination`) |
| `inspect_process` | `pid` | Point-in-time process metadata |
| `profile_process` | `pid` | Persisted process time-series sampling; optional `durationMs`, `intervalMs` |
| `monitor_process` | `pid` | Time-series monitoring; optional duration, interval and mode |
| `get_process_metrics` | `pid` | Current process resource metrics |
| `get_process_tree` | `pid` | Visible descendant process tree |
| `analyze_memory` | `pid` | Process memory metrics |
| `analyze_cpu` | `pid` | Process CPU metrics |
| `analyze_io` | `pid` | Per-process disk I/O counters where available |
| `detect_resource_anomalies` | `series` | Detect sustained CPU, CPU spikes and growing RSS in supplied profiles |
| `get_resource_control_status` | none | Report OS resource-control availability without changing a process |
| `capture_baseline` | `command` | Persist a named baseline benchmark artifact |
| `run_benchmark` | `command` | Run command, measure time, CPU time, peak RAM, binary size (0.2.0-beta.4); optional `args`, `cwd`, `timeoutMs`, `repetitions` (1–20), `warmupRuns` (0–5), `label` |
| `compare_results` | `before`, `after` | Compare Reverse benchmark envelopes |
| `validate_changes` | `command`, `expected` | Compare exact expected outputs; optional `args`, `cwd`, `timeoutMs`, `repetitions` |
| `get_environment_fingerprint` | none | Non-secret environment fingerprint (OS, CPU, memory, Node.js, Reverse version) |
| `get_evidence` | `id` | Retrieve a persisted evidence record by ID |
| `list_analyzers` | none | Built-ins, registered adapters and extension points |
| `run_provider` | `name`, `target` | Run a registered external provider; unsupported if absent |
| `trace_execution` | `target`, optional `pid` | Frida dynamic trace under CONTROLLED_EXECUTION |
| `get_hotspots` | `pid` | Function hotspots from perf/sample when available |
| `get_process_io` | `pid` | Per-process disk I/O (Linux `/proc/pid/io`) |
| `generate_change_report` | `target`, optional before/after/validation | Before/after report with residual risks |
| `verify_evidence_integrity` | `session` or `session_id` | Hash-chain + optional HMAC verify |
| `create_benchmark_suite` | `cases` | Create a named, interleaved benchmark suite (2–10 cases) |
| `run_benchmark_suite` | `id` | Run suite cases round-robin with warm-ups and repeated samples |
| `compare_benchmarks` | `before`, `after` | Compare matching cases in two suite results |
| `compare_baselines` | `before_id`, `after_id` | Compare two persisted baseline IDs and return a statistical report |
| `create_research_session` | `target_id` | Create a persistent research session and hash-chained event ledger |
| `get_research_session` | `id` | Retrieve the session, linked evidence and hypothesis ledger |
| `add_research_hypothesis` | `session_id`, `statement`, `provenance`, `confidence` | Store an AI hypothesis separately from facts |
| `promote_research_hypothesis` | `session_id`, `hypothesis_id`, `status` | Support only by same-session Validation (`passed: true`) or Benchmark (`improved`) evidence of sufficient confidence; retain refuted hypotheses |
| `add_research_event` | `session_id`, `event` | Append investigation, diagnosis, optimization, comparison or validation events |
| `add_research_evidence` | `session_id`, `type`, `source`, `measurement`, `confidence`, `limitations` | Attach typed evidence to the research session |
| `link_research_artifacts` | `session_id`, `relation`, `ids` | Link observations, profiles, baselines, optimizations, benchmarks, comparisons, validations and final reports |

**Command execution gate (0.2.0-beta.3, breaking default).** `capture_baseline`, `run_benchmark` and `validate_changes` run commands and are refused unless the operator starts the server with `REVERSE_MODE=CONTROLLED_EXECUTION` and `REVERSE_COMMAND_ALLOWLIST` (comma-separated command names or absolute paths; `*` allows any command and must be chosen on purpose). `REVERSE_CWD_ROOT`, when set, confines `cwd`. Children inherit only an allowlisted environment (`PATH`, temp and locale variables plus names listed in `REVERSE_CHILD_ENV`). Every tool carries `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`); the three command tools are marked not read-only. The CLI is operated by the user and is not gated.

Tool argument schemas are intentionally compact. Validate all paths, PIDs, and commands at the client boundary too.

**Evidence from measurements.** `inspect_process`, `get_process_metrics`, `get_process_tree`, `analyze_memory`, `analyze_cpu`, `analyze_io`, `monitor_process`, `profile_process`, `analyze_binary`, `run_benchmark`, `capture_baseline`, `compare_results`, `compare_benchmarks`, `compare_baselines` and `validate_changes` accept an optional `session_id`. The tool runs as usual and its result is attached to that session as typed evidence; the response gains `researchEvidence` (`recorded`, `evidence_id`, `type`, `confidence`, `hash`). An unknown session is refused before the tool runs. Without `session_id` nothing is recorded.

**Modes.** With `REVERSE_MODE=OBSERVE`, `monitor_process` and `profile_process` refuse processes whose ownership cannot be verified; `monitor_process` accepts `mode`: `Snapshot`, `Monitor`, `Diagnostic` (adds `anomalies`) or `Compare` (adds `periods`).

`capture_baseline` stores a named local baseline artifact. Benchmark suites use round-robin case order to reduce time-dependent bias; this does not isolate CPU or host load. Research sessions store an append-only hash-linked ledger. Hypotheses carry `kind: "hypothesis"`, provenance, confidence and status; promotion to `supported` requires a reference to Validation or Benchmark evidence in the same session. Refuted hypotheses are retained.

Long-running `profile_process` and `monitor_process` calls accept MCP `notifications/cancelled` for their request ID. Cancellation returns a `partial` result and persists the samples collected so far. The library API also accepts an `AbortSignal`.
