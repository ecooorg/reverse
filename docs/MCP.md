# MCP interface

Transport: newline-delimited JSON-RPC 2.0 over stdin/stdout (MCP stdio). Supported methods: `initialize`, `notifications/initialized`, `ping`, `tools/list`, and `tools/call`.

Each tool returns its result as JSON text in `content[0].text` and as the same data in `structuredContent` (an array result is wrapped as `{ "items": [...] }`, because `structuredContent` must be an object). `initialize` answers with the client's `protocolVersion` when it is `2024-11-05`, `2025-03-26` or `2025-06-18`, and with `2025-06-18` otherwise. Protocol problems are JSON-RPC errors: `-32700` for a line that is not JSON (`id: null`), `-32600` invalid request, `-32601` unknown method, `-32602` unknown tool or missing tool name. A tool that fails while running (missing file, invalid PID, rejected argument) returns a normal result with `isError: true` and the message in `content[0].text`. Never write banners or debug output to stdout.

## Tools

| Tool | Required arguments | Purpose |
|---|---|---|
| `inspect_target` | `target` | Directory -> source inventory; file -> binary header inspection |
| `analyze_binary` | `file` | ELF/PE/Mach-O header inspection |
| `analyze_source` | `directory` | Source inventory |
| `analyze_dependencies` | `directory` | npm direct dependency inventory |
| `get_inventory` | none | Visible process list; optional `limit` |
| `list_processes` | none | Detailed visible process inventory; optional `limit` |
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
| `run_benchmark` | `command` | Run command; optional `args`, `cwd`, `timeoutMs`, `repetitions` (1–20), `warmupRuns` (0–5), `label` |
| `compare_results` | `before`, `after` | Compare Reverse benchmark envelopes |
| `validate_changes` | `command`, `expected` | Compare exact expected outputs; optional `args`, `cwd`, `timeoutMs`, `repetitions` |
| `get_environment_fingerprint` | none | Non-secret environment fingerprint (OS, CPU, memory, Node.js, Reverse version) |
| `get_evidence` | `id` | Retrieve a persisted evidence record by ID |
| `list_analyzers` | none | Distinguish built-ins from extension points |

**Command execution gate (0.2.0-beta.3, breaking default).** `capture_baseline`, `run_benchmark` and `validate_changes` run commands and are refused unless the operator starts the server with `REVERSE_MODE=CONTROLLED_EXECUTION` and `REVERSE_COMMAND_ALLOWLIST` (comma-separated command names or absolute paths; `*` allows any command and must be chosen on purpose). `REVERSE_CWD_ROOT`, when set, confines `cwd`. Children inherit only an allowlisted environment (`PATH`, temp and locale variables plus names listed in `REVERSE_CHILD_ENV`). Every tool carries `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`); the three command tools are marked not read-only. The CLI is operated by the user and is not gated.

Tool argument schemas are intentionally compact. Validate all paths, PIDs, and commands at the client boundary too.

Long-running `profile_process` and `monitor_process` calls accept MCP `notifications/cancelled` for their request ID. Cancellation returns a `partial` result and persists the samples collected so far. The library API also accepts an `AbortSignal`.
