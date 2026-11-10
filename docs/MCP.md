# MCP interface

Transport: newline-delimited JSON-RPC 2.0 over stdin/stdout (MCP stdio). Supported methods: `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`, `prompts/list`, `prompts/get`, `resources/list`, `resources/read`.

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
| `run_validation_fixtures` | `directory` | Run JSON validation fixtures from a directory |
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
| `declare_legacy_authorization` | `session_id`, `basis`, `license_or_consent_reference`, `declared_by` | Record operator-declared open-source or written-consent basis for legacy analysis |
| `analyze_legacy_windows` | `file`, `session_id` | DOS/Windows headers, bounded PE imports and static Delphi/VB6/MFC signatures; result embeds the declared authorization; never executes the target |

**Command execution gate (0.2.0-beta.3, breaking default).** `capture_baseline`, `run_benchmark` and `validate_changes` run commands and are refused unless the operator starts the server with `REVERSE_MODE=CONTROLLED_EXECUTION` and `REVERSE_COMMAND_ALLOWLIST` (comma-separated command names or absolute paths; `*` allows any command and must be chosen on purpose). `REVERSE_CWD_ROOT`, when set, confines `cwd`. Children inherit only an allowlisted environment (`PATH`, temp and locale variables plus names listed in `REVERSE_CHILD_ENV`). Every tool carries `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`); the three command tools are marked not read-only. The CLI is operated by the user and is not gated.

Tool argument schemas are intentionally compact. Validate all paths, PIDs, and commands at the client boundary too.

**Evidence from measurements.** `inspect_process`, `get_process_metrics`, `get_process_tree`, `analyze_memory`, `analyze_cpu`, `analyze_io`, `monitor_process`, `profile_process`, `analyze_binary`, `run_benchmark`, `capture_baseline`, `compare_results`, `compare_benchmarks`, `compare_baselines` and `validate_changes` accept an optional `session_id`. The tool runs as usual and its result is attached to that session as typed evidence; the response gains `researchEvidence` (`recorded`, `evidence_id`, `type`, `confidence`, `hash`). An unknown session is refused before the tool runs. Without `session_id` nothing is recorded.

**Modes.** With `REVERSE_MODE=OBSERVE`, `monitor_process` and `profile_process` refuse processes whose ownership cannot be verified; `monitor_process` accepts `mode`: `Snapshot`, `Monitor`, `Diagnostic` (adds `anomalies`) or `Compare` (adds `periods`).

`capture_baseline` stores a named local baseline artifact. Benchmark suites use round-robin case order to reduce time-dependent bias; this does not isolate CPU or host load. Research sessions store an append-only hash-linked ledger. Hypotheses carry `kind: "hypothesis"`, provenance, confidence and status; promotion to `supported` requires a reference to Validation or Benchmark evidence in the same session. Refuted hypotheses are retained.

Long-running `profile_process` and `monitor_process` calls accept MCP `notifications/cancelled` for their request ID. Cancellation returns a `partial` result and persists the samples collected so far. The library API also accepts an `AbortSignal`.


## Optimization loop tools (patch J)

| Tool | Role |
|---|---|
| `create_change_workspace` | Copy target to isolated workspace (`confirm:true` + CONTROLLED_EXECUTION) |
| `apply_change` | Edit only under workspace workPath |
| `rollback_change` | Restore workPath from original |
| `accept_change` | Mark accepted; does not overwrite original |
| `decide_optimization` | Deterministic decision from verdict + validation |
| `run_apk_pipeline` | apktool/zipalign/apksigner on a workDir copy |
| `run_all_reference_trials` | E2E trials for all three shapes |
| `run_optimization_trial` | E2E trial for one reference shape |
| `adb_emu_snapshot_load` | Load AVD snapshot via adb emu |
| `adb_pm_clear` | pm clear package on device |
| `adb_install` | Install APK via adb (test device) |
| `remove_git_worktree` | Remove git worktree |
| `create_git_worktree` | Git worktree workspace |

## Patch J completion (0.5.0-beta.2)

| Tool | Role |
|---|---|
| `create_git_worktree` / `remove_git_worktree` | Git worktree workspace |
| `adb_install` / `adb_pm_clear` / `adb_emu_snapshot_load` | Device prep (confirm + CONTROLLED_EXECUTION) |
| `run_optimization_trial` / `run_all_reference_trials` | Fixture E2E loop for three shapes |

| `analyze_javascript` | JS/TS/Electron static inventory |

| `analyze_dotnet` | .NET CLI header detection on PE |

| `analyze_wasm` | WebAssembly section inventory |

## Optional HTTP transport (patch K)

Enabled only when `REVERSE_MCP_HTTP=1` and `REVERSE_MCP_TOKEN` (min 8 chars) are set.
POST `/rpc` with `Authorization: Bearer <token>` and JSON `{ "method": "<tool>", "params": {...} }`.
Default bind `127.0.0.1:7331`. Not full MCP Streamable HTTP.


## Prompts and resources (patch L)

| Method | Role |
|---|---|
| `prompts/list` | research_cycle, hypothesis_discipline, optimization_decision |
| `prompts/get` | Materialize prompt messages with arguments |
| `resources/list` | List `reverse://evidence|sessions|…/<id>` |
| `resources/read` | Read local JSON artifact by URI |


### Legacy Windows tools (Patch M, initial slice)

1. Call `create_research_session` with the target identifier.
2. Call `declare_legacy_authorization` with `basis` (`open_source` or `written_consent`), a human-readable `license_or_consent_reference`, and `declared_by`. This records the operator's declaration; Reverse does not validate the legal basis.
3. Call `analyze_legacy_windows` with the file path and that `session_id`. Calls without the declaration are refused.

The analyzer recognizes DOS MZ, Windows NE/LE/LX and PE headers, and scans at most 8 MiB for selected legacy toolchain/graphics strings. It does not execute the file, perform structural VB6/Delphi/MFC analysis, or provide a complete compatibility diagnosis.
