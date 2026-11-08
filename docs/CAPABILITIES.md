# Capability matrix

| Area | Implemented in 0.1.0 | Explicit limitations |
|---|---|---|
| ELF / PE / Mach-O | Header magic, basic architecture/bitness where parsed, file size, hash evidence | No full section/segment parsing, symbols, imports, disassembly, decompilation, call graph, or malware verdict |
| Source | Bounded file inventory, extension counts, approximate lines, textual external-import counts, package manifest | No AST, call graph, dead-code proof, language semantic analysis, or complete project graph |
| Dependencies | Direct `dependencies`, `devDependencies`, `optionalDependencies` from package.json | No lockfile resolution, transitive graph, CVE audit, license audit, or upgrade recommendations |
| Processes | Point-in-time visible process list and selected PID metadata | No process ownership verification, maps, handles, thread stacks, child-tree control, or sandbox |
| Profiling | Bounded periodic process CPU/RSS sampling where supported | No function hotspots, call counts, I/O, network, or child aggregation. Windows CPU is omitted in this MVP |
| Benchmark | Repeated command execution, wall-clock duration, median/mean/min/max, bounded stdout/stderr | No integrated CPU/RAM, cold/warm classification, I/O metrics, machine normalization, or statistical confidence interval |
| Validation | Exact expected exit code/stdout/stderr checks | Not semantic equivalence, test discovery, or proof of correctness |
| Evidence | Local timestamped records, SHA-256 for regular files, JSON artifacts | Evidence authenticity/signing, tamper-evident chain, remote artifact store not implemented |
| MCP | stdio JSON-RPC initialize, ping, tools/list, tools/call | No HTTP transport, sampling, roots, resources, prompts, OAuth, or advanced cancellation |

## Provider status

`ghidra`, `rizin`, `frida`, `gdb`, `perf`, `ebpf`, `etw`, and `instruments` are **extension-point labels only**. No invocation adapter, parser, setup detection, or end-to-end integration is included. The `list_analyzers` output marks them `extension-point`; this is intentional.

## Status semantics

- `completed`: the implemented operation completed within its stated scope.
- `partial`: useful data was obtained, but coverage is incomplete or an error occurred.
- `unsupported`: reserved for a recognized operation that cannot be performed on this host/target.
- `failed`: reserved for a future normalized failure path; thrown CLI/MCP errors may currently surface directly.

Do not interpret `coverage.complete: true` as proof of correctness. It only describes the scope implemented by that operation.
