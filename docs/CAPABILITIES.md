# Capability matrix

| Area | Implemented in 0.1.x | Explicit limitations |
|---|---|---|
| ELF / PE / Mach-O / Java class | Header magic (Java `.class` is told apart from universal Mach-O), basic architecture/bitness where parsed, file size, hash evidence | No full section/segment parsing, symbols, imports, disassembly, decompilation, call graph, or malware verdict |
| Source | Bounded file inventory, extension counts, approximate lines, textual external-import counts, package manifest | No AST, call graph, dead-code proof, language semantic analysis, or complete project graph |
| Dependencies | Direct `dependencies`, `devDependencies`, `optionalDependencies` from package.json | No lockfile resolution, transitive graph, CVE audit, license audit, or upgrade recommendations |
| Processes | Visible inventory (cap 500), PID/PPID, executable/arguments, uptime, threads, RSS/VMS, CPU time where exposed, disk I/O and open-FD count on Linux; visible child tree; start-time identity tokens; UID ownership checks on Linux/macOS | No memory maps or thread stacks; Windows ownership is not verified; macOS does not report thread counts (BSD `ps` has no such column); cross-platform metrics are not at parity |
| Profiling | Bounded persisted time series for CPU, RSS/VMS, CPU time, disk I/O, threads and children where exposed; process identity is rechecked between samples; AbortSignal and MCP cancellation; deterministic CPU/RSS anomaly thresholds | No function hotspots or network metrics; profile sampling is observational, not an isolation boundary |
| Benchmark | Repeated command execution, wall-clock duration, median/mean/min/max, stdout/stderr hard-capped at 1 MiB per stream with truncation flags, whole-process-tree kill on timeout | No integrated CPU/RAM, cold/warm classification, I/O metrics, machine normalization, or statistical confidence interval |
| Validation | Exact expected exit code/stdout/stderr checks | Not semantic equivalence, test discovery, or proof of correctness |
| Evidence | Local timestamped records, SHA-256 for regular files, JSON artifacts | Evidence authenticity/signing, tamper-evident chain, remote artifact store not implemented |
| Safety | `READ_ONLY`/`OBSERVE` by default; explicit `CONTROLLED_EXECUTION` scoped cgroup-v2 resource-limit API on delegated Linux hierarchies; ownership and identity checks before moving a process | No OS sandbox or filesystem/network isolation; Windows/macOS hard process quotas are not implemented; cgroup availability depends on delegation and permissions |
| MCP | stdio JSON-RPC initialize, ping, tools/list, tools/call; request cancellation for process sampling | No HTTP transport, roots, resources, prompts, or OAuth |

## Provider status

`ghidra`, `rizin`, `frida`, `gdb`, `perf`, `ebpf`, `etw`, and `instruments` are **extension-point labels only**. No invocation adapter, parser, setup detection, or end-to-end integration is included. The `list_analyzers` output marks them `extension-point`; this is intentional.

## Status semantics

- `completed`: the implemented operation completed within its stated scope.
- `partial`: useful data was obtained, but coverage is incomplete or an error occurred.
- `unsupported`: reserved for a recognized operation that cannot be performed on this host/target.
- `failed`: reserved for a future normalized failure path; thrown CLI/MCP errors may currently surface directly.

Do not interpret `coverage.complete: true` as proof of correctness. It only describes the scope implemented by that operation.

## Process safety contract

Process sampling remains read-only. It captures an OS start-time identity token and stops if the token changes between samples, reducing PID-reuse contamination. Ownership can be verified against the current UID on Linux/macOS; Windows ownership is reported as unknown. `withProcessResourceLimits` is an opt-in library API: it requires `CONTROLLED_EXECUTION`, `confirm: true`, verified ownership, a stable identity token, and a delegated Linux cgroup v2 hierarchy. It moves the target into a temporary cgroup for the duration of the supplied callback, then attempts to restore it and remove the cgroup. It does not provide a general sandbox.
