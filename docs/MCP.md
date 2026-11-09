# MCP interface

Transport: newline-delimited JSON-RPC 2.0 over stdin/stdout (MCP stdio). Supported methods: `initialize`, `notifications/initialized`, `ping`, `tools/list`, and `tools/call`.

Each tool returns its result as JSON text in `content[0].text` and as the same data in `structuredContent` (an array result is wrapped as `{ "items": [...] }`, because `structuredContent` must be an object). `initialize` answers with the client's `protocolVersion` when it is `2024-11-05`, `2025-03-26` or `2025-06-18`, and with `2025-06-18` otherwise. Errors are returned as JSON-RPC errors. Never write banners or debug output to stdout.

## Tools

| Tool | Required arguments | Purpose |
|---|---|---|
| `inspect_target` | `target` | Directory -> source inventory; file -> binary header inspection |
| `analyze_binary` | `file` | ELF/PE/Mach-O header inspection |
| `analyze_source` | `directory` | Source inventory |
| `analyze_dependencies` | `directory` | npm direct dependency inventory |
| `get_inventory` | none | Visible process list; optional `limit` |
| `inspect_process` | `pid` | Point-in-time process metadata |
| `profile_process` | `pid` | CPU/RSS sampling; optional `durationMs`, `intervalMs` |
| `capture_baseline` | `command` | Persist a named baseline benchmark artifact |
| `run_benchmark` | `command` | Run command; optional `args`, `cwd`, `timeoutMs`, `repetitions`, `label` |
| `compare_results` | `before`, `after` | Compare Reverse benchmark envelopes |
| `validate_changes` | `command`, `expected` | Compare exact expected outputs; optional `args`, `cwd`, `timeoutMs`, `repetitions` |
| `get_evidence` | `id` | Retrieve a persisted evidence record by ID |
| `list_analyzers` | none | Distinguish built-ins from extension points |

Tool argument schemas are intentionally compact. Validate all paths, PIDs, and commands at the client boundary too.
