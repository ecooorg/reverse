The server exposes **63 tools**. The tool table below is generated from the same TypeScript definitions used by `tools/list`; `npm run docs:mcp:check` fails on drift and `npm run docs:mcp:write` regenerates it. The server also exposes prompts and resources methods and an optional HTTP gateway. Sections: the core tool table, optimization-loop tools (patch J), runtime-analyzer tools (patch K), optional HTTP transport (patch K), prompts and resources (patch L), legacy Windows tools (patch M, delivered), legacy Linux analysis (patch N, delivered), classic Mac / early macOS analysis (patch O step 1) and the future plan.


Transport: newline-delimited JSON-RPC 2.0 over stdin/stdout (MCP stdio). Supported methods: `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`, `prompts/list`, `prompts/get`, `resources/list`, `resources/read`.

Each tool returns its result as JSON text in `content[0].text` and as the same data in `structuredContent` (an array result is wrapped as `{ "items": [...] }`, because `structuredContent` must be an object). `initialize` answers with the client's `protocolVersion` when it is `2024-11-05`, `2025-03-26`, `2025-06-18` or `2025-11-25`, and with `2025-11-25` otherwise. The stateless 2026-07-28 protocol era is not implemented. Protocol problems are JSON-RPC errors: `-32700` for a line that is not JSON (`id: null`), `-32600` invalid request, `-32601` unknown method, `-32602` unknown tool or missing tool name. A tool that fails while running (missing file, invalid PID, rejected argument) returns a normal result with `isError: true` and the message in `content[0].text`. Every result also carries an `untrustedContent` field `{ notice, maxStringLength, truncatedStrings }` (inside `structuredContent`; for object results also in the text): strings from analyzed targets are untrusted data, and strings longer than 4096 characters are truncated with a `…[truncated N chars]` suffix. Total tool responses are capped at 1 MiB; oversized `findings` arrays are truncated, marked `partial`, and include `responseBudget` metadata.

## Tools

Tool definitions include `title`, `annotations` and an `outputSchema`; command-execution tools are explicitly marked non-read-only. The default schema profile is compact. Tool execution failures are returned as `isError: true` results with machine-readable `structuredContent.error.code`. Set `REVERSE_MCP_SCHEMA_PROFILE=full` for strict input schemas (`additionalProperties: false`); the default `compact` profile remains permissive for forward-compatible callers.

| Tool | Required arguments | Purpose |
|---|---|---|
| `inspect_target` | `target` | Inspect a file or source directory and return its basic classification and metadata. |
| `analyze_binary` | `file` | Inspect ELF/PE/Mach-O structure (sections, symbols, imports/exports). Not disassembly. |
| `analyze_source` | `directory` | Inventory source files and external imports (comment- and string-aware) in a directory. |
| `analyze_dependencies` | `directory` | Resolve dependencies from package.json plus lockfiles (npm, yarn, Cargo, Go, pip/poetry) when present. |
| `analyze_android` | `file` | Static inventory of an APK/AAB: dex, native libs, ABIs, manifest presence, R8/ProGuard indicators. |
| `get_inventory` | none | List visible local processes. |
| `inspect_process` | `pid` | Inspect one process visible to the current user. |
| `profile_process` | `pid` | Sample process CPU/RSS over a bounded interval. |
| `list_processes` | none | List visible processes with OS-provided resource metadata. |
| `monitor_process` | `pid` | Observe process metrics over a bounded interval and persist a time series. |
| `get_process_metrics` | `pid` | Get current process resource metrics. |
| `get_process_tree` | `pid` | Get the visible descendant process tree. |
| `analyze_memory` | `pid` | Return current process memory metrics. |
| `analyze_cpu` | `pid` | Return current process CPU metrics. |
| `analyze_io` | `pid` | Return current process disk I/O counters where available. |
| `detect_resource_anomalies` | `series` | Detect high CPU and growing memory in supplied profile series. |
| `get_resource_control_status` | none | Report whether enforceable OS resource controls are available; does not change a process. |
| `trace_execution` | `target` | Dynamic trace via Frida under CONTROLLED_EXECUTION. Unsupported if Frida or mode missing. |
| `get_hotspots` | `pid` | Function hotspots from a real profiler (perf/sample) when available; else process-level only. |
| `get_process_io` | `pid` | Per-process disk I/O counters where the OS exposes them (Linux /proc/pid/io). |
| `capture_baseline` | `command` | Capture a named baseline by running a command repeatedly and persisting the benchmark artifact. |
| `run_benchmark` | `command` | Run a command repeatedly without a shell and measure wall-clock duration, CPU time, peak RAM (direct child; sampled) and binary size. |
| `compare_results` | `before`, `after` | Compare two Reverse benchmark result objects. |
| `validate_changes` | `command`, `expected` | Check caller-provided expected stdout/stderr and exit code for a command. |
| `get_environment_fingerprint` | none | Report the non-secret environment fingerprint (OS, CPU, memory, Node.js, Reverse version) used to judge benchmark comparability. |
| `get_evidence` | `id` | Find a persisted evidence record by ID. |
| `list_analyzers` | none | List built-in analyzers, registered external adapters and extension points. |
| `run_provider` | `name`, `target` | Run a registered external provider (ghidra, rizin, jadx, apktool). Returns unsupported if the tool is not installed. |
| `create_benchmark_suite` | `cases` | Create an interleaved benchmark suite with two or more named cases. |
| `run_benchmark_suite` | `id` | Run a previously created benchmark suite in round-robin order. |
| `compare_benchmarks` | `before`, `after` | Compare two interleaved benchmark suite results by matching case name. |
| `compare_baselines` | `before_id`, `after_id` | Compare two stored baseline IDs and return the statistical benchmark report. |
| `get_research_session` | `id` | Retrieve a complete research session, hash-chained event ledger, evidence and hypotheses. |
| `create_research_session` | `target_id` | Create a local research session for a target. |
| `add_research_hypothesis` | `session_id`, `statement`, `provenance`, `confidence` | Record an AI hypothesis separately from measured and static evidence. |
| `promote_research_hypothesis` | `session_id`, `hypothesis_id`, `status` | Promote a hypothesis only by referencing Validation or Benchmark evidence in the same session, or mark it refuted/retired. |
| `add_research_event` | `session_id`, `event` | Append a typed research-cycle event and artifact links to a session. |
| `add_research_evidence` | `session_id`, `type`, `source`, `measurement`, `confidence`, `limitations` | Attach typed measured evidence with source, confidence and limitations to a research session. |
| `link_research_artifacts` | `session_id`, `relation`, `ids` | Link target, observations, profile, baseline, optimization, benchmark, comparison, validation or final report artifacts in a research session. |
| `generate_change_report` | `target` | Before/after change report with validation, metrics, residual risks and next steps. |
| `verify_evidence_integrity` | none | Verify research session hash chain and optional HMAC signature (REVERSE_EVIDENCE_KEY). |
| `run_validation_fixtures` | `directory` | Run JSON validation fixtures from a directory (command/expected/normalize). |
| `declare_legacy_authorization` | `session_id`, `basis`, `license_or_consent_reference`, `declared_by` | Declare the operator-reported legal basis for legacy analysis; this is not legal verification. |
| `analyze_legacy_windows` | `file`, `session_id` | Statically inspect DOS/Windows headers, PE imports and framework signatures. Includes session authorization; never executes the target. |
| `analyze_legacy_linux` | `file`, `session_id` | Statically inspect a.out/ELF headers, DT_NEEDED, interpreter, libc/GCC markers and sourced Linux diagnosis. Needs research-session authorization; does not execute the target. |
| `analyze_legacy_mac` | `file`, `session_id` | Statically inspect classic Mac / early macOS formats (Mach-O, fat, PEF, AppleDouble) and fill Mac Target Profile fields. Needs research-session authorization; static only, no execution. |
| `analyze_legacy_android` | `file`, `session_id` | Statically inventory APK/AAB/DEX for legacy Android Target Profile fields (ABI, dex, signing hints). Needs research-session authorization; does not decode AXML or execute the app. |
| `create_change_workspace` | `path`, `confirm` | Copy target into isolated workspace (CONTROLLED_EXECUTION + confirm:true). |
| `apply_change` | `workspace_id`, `changeType`, `relativePath`, `confirm` | Apply change only inside workspace workPath. |
| `rollback_change` | `workspace_id`, `confirm` | Restore workspace workPath from the original copy. |
| `accept_change` | `workspace_id`, `confirm` | Mark workspace accepted without writing originalPath. |
| `decide_optimization` | none | Deterministic accept/roll_back/need_more_data/reject from evidence. |
| `run_apk_pipeline` | `apkPath`, `workDir`, `confirm` | Controlled APK decode/build/align/sign on a workDir copy. |
| `create_git_worktree` | `path`, `confirm` | Create a git worktree workspace for changes. |
| `remove_git_worktree` | `workspace_id`, `confirm` | Remove a git worktree workspace. |
| `adb_install` | `apkPath`, `confirm` | Install APK via adb on a test device/AVD. |
| `adb_pm_clear` | `packageName`, `confirm` | pm clear package on device before benchmark. |
| `adb_emu_snapshot_load` | `snapshotName`, `confirm` | Load AVD snapshot via adb emu (emulator only). |
| `run_optimization_trial` | `shape`, `confirm` | E2E trial for shape small_source\|deps_source\|closed_binary. |
| `run_all_reference_trials` | `confirm` | Run optimization trials for all three reference shapes. |
| `analyze_javascript` | `path` | Static JS/TS/Electron inventory for a directory or entry file. |
| `analyze_dotnet` | `file` | Detect .NET CLI header in a PE image. |
| `analyze_wasm` | `file` | WebAssembly binary section inventory. |

**Command execution gate (0.2.0-beta.3, breaking default).** `capture_baseline`, `run_benchmark` and `validate_changes` run commands and are refused unless the operator starts the server with `REVERSE_MODE=CONTROLLED_EXECUTION` and `REVERSE_COMMAND_ALLOWLIST` (comma-separated command names or absolute paths; `*` allows any command and must be chosen on purpose). `REVERSE_CWD_ROOT`, when set, confines `cwd`. Children inherit only an allowlisted environment (`PATH`, temp and locale variables plus names listed in `REVERSE_CHILD_ENV`). Every tool carries `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`); the three command tools are marked not read-only. The CLI is operated by the user and is not gated.

Tool argument schemas are intentionally compact. Validate all paths, PIDs, and commands at the client boundary too.

**Evidence from measurements.** `inspect_process`, `get_process_metrics`, `get_process_tree`, `analyze_memory`, `analyze_cpu`, `analyze_io`, `monitor_process`, `profile_process`, `analyze_binary`, `run_benchmark`, `capture_baseline`, `compare_results`, `compare_benchmarks`, `compare_baselines` and `validate_changes` accept an optional `session_id`. The tool runs as usual and its result is attached to that session as typed evidence; the response gains `researchEvidence` (`recorded`, `evidence_id`, `type`, `confidence`, `hash`). An unknown session is refused before the tool runs. Without `session_id` nothing is recorded.

**Modes.** With `REVERSE_MODE=OBSERVE`, `monitor_process` and `profile_process` refuse processes whose ownership cannot be verified; `monitor_process` accepts `mode`: `Snapshot`, `Monitor`, `Diagnostic` (adds `anomalies`) or `Compare` (adds `periods`).

`capture_baseline` stores a named local baseline artifact. Benchmark suites use round-robin case order to reduce time-dependent bias; this does not isolate CPU or host load. Research sessions store an append-only hash-linked ledger. Hypotheses carry `kind: "hypothesis"`, provenance, confidence and status; promotion to `supported` requires a reference to Validation or Benchmark evidence in the same session. Refuted hypotheses are retained.

Long-running `profile_process` and `monitor_process` calls accept MCP `notifications/cancelled` for their request ID. Cancellation returns a `partial` result and persists the samples collected so far. The library API also accepts an `AbortSignal`.


## Optimization loop tools (patch J, completed in 0.5.0-beta.2)

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

Device-preparation tools (`adb_install`, `adb_pm_clear`, `adb_emu_snapshot_load`) require `confirm` and `CONTROLLED_EXECUTION` and target a test device only (0.5.0-beta.2). `create_git_worktree` and `remove_git_worktree` provide the git worktree alternative to the directory-copy workspace. `run_optimization_trial` and `run_all_reference_trials` run the fixture-based end-to-end loop for the three reference shapes.

## Runtime analyzer tools (patch K)

| Tool | Purpose |
|---|---|
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


## Legacy Windows tools (patch M, closed at 1.2.0)

1. Call `create_research_session` with the target identifier.
2. Call `declare_legacy_authorization` with `basis` (`open_source` or `written_consent`), a human-readable `license_or_consent_reference`, and `declared_by`. This records the operator's declaration; Reverse does not validate the legal basis.
3. Call `analyze_legacy_windows` with the file path and that `session_id`. Calls without the declaration are refused.

The analyzer recognizes DOS MZ, Windows NE/LE/LX and PE headers, and scans at most 8 MiB for selected legacy toolchain/graphics strings. It does not execute the file, perform structural VB6/Delphi/MFC analysis, or provide a complete compatibility diagnosis.


## Future product delivery

The next MCP surface changes follow the single product-patch sequence in [ROADMAP.md](ROADMAP.md): M completes Windows through 2010; N adds old Linux; O adds Classic Mac/early macOS; P adds legacy Android; Q extends newer generations and unifies compatibility intelligence. Each patch documents its complete tool contract here; do not create separate MCP roadmaps for platform waves or cross-cutting subsystems.

## Legacy Mac tools (patch O, closed at 1.4.0; matrix green on 1.4.2)

1. Open a research session and call `declare_legacy_authorization` with an open-source or written-consent basis.
2. Call `analyze_legacy_mac` with the file path and that `session_id`. Without a prior declaration the tool refuses the call.
3. Results carry Mac Target Profile fields (`codeModel`, `endianness`, `resourceInventory`, `creatorType`, `bundleLayout`, `rosettaOr32BitDependence`) and format recognition for Mach-O, fat, PEF/CFM and AppleDouble. Deep 68k/PEF/resource-fork/bundle parsers remain later O steps.


## Legacy Android tools (patch P steps 0–1, 1.5.0)

1. `declare_legacy_authorization` on a research session.
2. Call `analyze_legacy_android` with the file path and that `session_id`.
3. Binary AXML is not decoded in this step; minSdk/targetSdk stay unknown until a later P step.
