# Roadmap

The design behind each item is described in [ARCHITECTURE.md](ARCHITECTURE.md).

## Delivery plan: eleven large patches to 1.0

This plan closes **every** item listed in the release sections below (0.2, 0.3, 0.4 and Later), so that Reverse can analyze a program, reverse-engineer it, find the cause of excessive resource use, apply an optimization and prove the result. Each patch is a large, independently releasable unit: it ends in a merged, tested change set, not in a partially working branch. The patches are ordered by dependency; the release sections further down describe the same work item by item.

### How progress is measured

The capability verification workflow (`.github/workflows/capabilities.yml`, locally `npm run verify`) is the burn-down chart. Today it reports ✅ verified, 🚧 confirmed limitation, ⚠️ drift and ❌ failed for every check on Linux, macOS and Windows. A patch is **done** only when all of the following hold:

1. Every roadmap item it claims is implemented and has an automated test.
2. Every 🚧 check the patch targets is rewritten so it asserts the new behavior and shows ✅ on all three operating systems; new capabilities get new checks.
3. No ⚠️ drift remains for the area it touches, and no ❌ appears anywhere.
4. Existing MCP tools and CLI commands keep working (backward compatible); new tools are listed in [MCP.md](MCP.md) and the tool table matches `tools/list`.
5. [ARCHITECTURE.md](ARCHITECTURE.md) marks the section as implemented instead of planned.

Version 1.0 is reached when all eleven patches are done and the capability matrix contains no 🚧 for an in-scope capability.

### Order and dependencies

| Patch | Name | Milestone | Depends on |
|---|---|---|---|
| A | Defect closure and verification gate | 0.1.x | none |
| B | Process intelligence and safety | 0.2 | A |
| C | Measurement engine and baselines | 0.2 | A |
| D | Evidence engine, research sessions and MCP surface | 0.2 | B, C |
| E | Static analysis core | 0.3 | A |
| F | Provider framework, Ghidra and Rizin | 0.3 | E |
| G | Dynamic analysis: Frida and GDB | 0.4 | F, B |
| H | Native profilers and hotspots | 0.4 | B, F |
| I | Validation, integrity and reports | 0.4 | C, D |
| J | Controlled optimization loop | 1.0 | G, H, I |
| K | Runtime analyzers and on-demand extensions | 1.0 | F, J |

B and C can proceed in parallel after A; E can start at the same time. G and H can proceed in parallel once F is done.

### Patch A — Defect closure and verification gate (0.1.x) — done, released as 0.1.1

Goal: make the existing 0.1.0 trustworthy before building on it. Every ⚠️ drift found by the capability suite is fixed, and the suite now asserts the corrected behavior.

- [x] Header analyzer never throws on files shorter than 4 bytes (returns `partial`); universal Mach-O binaries report no bitness; Java `.class` files are told apart from universal Mach-O (the `0xCAFEBABE` magic is shared; the next field decides).
- [x] Benchmark runner enforces the 1 MiB output cap after every chunk, so one large chunk cannot bypass it, and flags truncation (`stdoutTruncated`, `stderrTruncated`). On timeout the whole process tree is terminated (`src/process-tree.ts`: snapshot first, then kill; `taskkill /T /F` on Windows) and the runner no longer waits for stdio that a survivor holds open.
- [x] `inspect_process` searches the full process inventory instead of the first 500 rows; helper-executable timeouts are configurable through `REVERSE_EXEC_TIMEOUT_MS` (PowerShell default raised to 10 s).
- [x] CLI: `validate` accepts `--arg`; missing positional arguments print a usage line; `--json` is documented as accepted with no effect (output is always JSON).
- [x] MCP: `tools/call` returns `structuredContent` next to `content[0].text` (arrays are wrapped as `{ "items": [...] }`); `initialize` negotiates the protocol version; one `VERSION` constant feeds the CLI banner and `serverInfo`.
- [x] The capability workflow is green on all nine environments (three operating systems times Node 20, 22 and 24) and stays a required check for every later patch.

Remaining ⚠️ drift after this patch: none. The 🚧 limitations that are left each belong to patches B–K.

### Patch B — Process intelligence and safety (0.2)

Closes the roadmap items **Advanced Process Inspector**, **Time-Series Performance Profiler** and **Process Safety & Resource Control**.

- Process inspector: PID, PPID and process tree, executable and arguments, uptime, threads, RSS and virtual memory, CPU utilization and CPU time, disk I/O, open file descriptors and child processes, using Linux `/proc`, Windows performance counters and macOS sampling.
- Interval observation instead of single snapshots; detection of disproportionate consumers.
- Time-series profiler with modes Snapshot, Monitor, Diagnostic and Compare; detection of spikes, sustained load and continuously growing memory; persisted structured results.
- Anomaly detector (`detect_resource_anomalies`) over stored series.
- Safety: PID existence and identity checks with PID-reuse protection, ownership verification, timeouts, capped output, child-process control, cancellation, cleanup of temporary files, and the operating modes `READ_ONLY` (default), `OBSERVE` and `CONTROLLED_EXECUTION`, with resource limits through cgroups where the OS supports them (not presented as isolation elsewhere).

Capability checks that flip: *Processes — no memory maps, threads, per-process I/O or process tree* and *Profiling — process-level only* change from 🚧 to ✅ for the metrics above, on all three operating systems. The function-level part stays with patches G and H.

### Patch C — Measurement engine and baselines (0.2)

Closes **Advanced Benchmark Engine** (all items) and the baseline lifecycle.

- Warm-up runs, cold/warm separation, alternating runs; mean, median, min/max, P95, standard deviation, MAD, outlier detection, variance and confidence intervals.
- CPU time, peak RAM and binary-size measurement per run, not wall-clock only.
- Environment fingerprint (OS, CPU, cores, RAM, Node.js, Reverse and target versions, arguments, non-secret environment, benchmark parameters) and the comparability warning when two fingerprints differ.
- Baseline manager: create, store, re-measure, compare, report; a lower mean alone is never reported as a significant improvement.
- `create_benchmark_suite`, `run_benchmark_suite`, `compare_benchmarks`, `get_environment_fingerprint`.

Capability checks that flip: *Benchmark — only wall-clock time is measured* becomes ✅.

### Patch D — Evidence engine, research sessions and MCP surface (0.2)

Closes **Advanced Evidence Engine**, the remaining MCP tools of 0.2 and the **0.2 acceptance criteria**.

- Evidence types Process, Memory, CPU, I/O, Binary, Benchmark and Validation, with `evidence_id`, `target_id`, `type`, `source`, `timestamp`, `measurement`, `confidence`, `limitations` and `hash`.
- Research sessions that link target, observations, profile, baseline, optimization, new benchmark, comparison, validation and the final evidence report; `get_research_session`.
- Remaining MCP tools: `list_processes`, `monitor_process`, `get_process_metrics`, `get_process_tree`, `analyze_memory`, `analyze_cpu`, `analyze_io`.
- Trials on the three reference applications (small, large with dependencies, closed binary) and verification of all twelve 0.2 acceptance criteria.

Capability checks that flip: the *Evidence* limitation (no session link, confidence or limitations fields) becomes ✅ except for signing, which belongs to patch I.

**Milestone 0.2 is released when B, C and D are done.**

### Patch E — Static analysis core (0.3)

Closes the first half of the 0.3 section: structural binary analysis and dependency analysis.

- ELF program/section headers and symbol tables; PE sections, imports and exports; Mach-O load commands and the fat-binary slice list.
- Function discovery and call graph where the format allows it without a disassembler engine; duplicated code and embedded libraries; unused components, only when it can be proven.
- Dependency analysis: lockfile parsers (npm, pip, Cargo, Go modules and similar), resolved versions, transitive graph, duplicate and outdated libraries, size and resource impact, compatibility and risk notes for suggested replacements.
- Source analysis moves from regular expressions to real parsing (an AST for the supported languages), so commented-out imports are no longer counted.

Capability checks that flip: *Binary — no sections, imports or symbols*, *Source — textual import counting* and *Dependencies — declared ranges only* become ✅.

### Patch F — Provider framework, Ghidra and Rizin (0.3)

Closes the second half of the 0.3 section and the **Plugin loading and provider lifecycle** item.

- Provider contract tests, executable discovery, availability checks without side effects, timeouts and clean shutdown, plugin loading and provider lifecycle.
- Opt-in Ghidra adapter (main deep-analysis engine) and Rizin adapter (alternative) with integration tests against real installations; results are normalized into the common `Result` envelope with explicit coverage and limitations.
- Disassembly, decompilation and cross-reference data are available through the adapters, never faked when the tool is absent.

Capability checks that flip: *Providers — Ghidra and Rizin are labels only* becomes ✅ for these two; the remaining extension points keep their 🚧 until their own patch.

**Milestone 0.3 is released when E and F are done.**

### Patch G — Dynamic analysis: Frida and GDB (0.4)

Closes the dynamic-analysis part of the 0.4 section.

- Opt-in Frida and GDB adapters with integration tests: execution tracing, frequently called functions, repeated computation, component interaction and behavior under different loads.
- Tracing runs only under the `CONTROLLED_EXECUTION` mode from patch B, with limits and cancellation; the target's original state is preserved.
- `trace_execution` exposed through MCP.

Capability checks that flip: the Frida and GDB rows of *Providers* and the *Profiling — no function-level data* limitation (partly; completed by H).

### Patch H — Native profilers and hotspots (0.4, from "Later")

Closes **Function hotspots via real external profilers** and the **Disk/network I/O providers** items.

- Providers for `perf` and eBPF (Linux), ETW (Windows), Instruments (macOS) and Valgrind, each used only when really detected.
- `get_hotspots` returns confirmed hot functions with their source (profiler, sample count, time range) as evidence; disk and network I/O per process.
- Hotspots are reported only when a real profiler produced them; without one Reverse still says "process-level only".

Capability checks that flip: *Profiling — no hot functions, disk or network I/O* becomes ✅ where a profiler exists on the runner; the check records "not available" instead of failing where it does not.

### Patch I — Validation, integrity and reports (0.4)

Closes the validation, integrity and reporting part of the 0.4 section.

- Test-suite adapters and build verification; regression-test execution.
- Structured behavior fixtures and normalization rules (whitespace, timestamps, ordering); comparison before and after a change on predefined inputs, including programs without source.
- Explicit reporting when equivalence cannot be proven.
- Evidence manifest integrity: hash chain and optional signing.
- Before/after report generation: what was found, what changed and why, metrics before and after with uncertainty, residual risks and next steps.

Capability checks that flip: *Validation — exact match only* and the *Evidence — unsigned* limitation become ✅.

**Milestone 0.4 is released when G, H and I are done.**

### Patch J — Controlled optimization loop (1.0)

Closes the research cycle (investigation, diagnosis, hypotheses, experiment, verification, decision, report) described in [ARCHITECTURE.md](ARCHITECTURE.md). The orchestration stays with the AI agent; Reverse provides the deterministic steps and enforces the safety rules.

- A change-application mode that needs separate explicit permission: work happens on a copy or a version-control branch, never on the original; the original state is preserved and a failed change can be rolled back.
- Decision rules computed from evidence: accept when performance improved with statistical support and validation passed; roll back when results worsened; request more data when the evidence is insufficient; reject when behavior broke.
- Support for the change types that are technically possible: source and algorithm changes, library replacement and dependency updates, compiler parameters, runtime and configuration tuning, removal of provably unused components; for closed programs only the options that do not need source.
- End-to-end trials: one scenario that finds a real performance problem and one that verifies an optimization with a measurable result, on each of the three reference applications.

### Patch K — Runtime analyzers and on-demand extensions (1.0)

Closes the remaining **Later** items.

- JavaScript/Electron, .NET and WebAssembly analyzers, delivered as providers on the framework from patch F.
- Optional HTTP MCP transport, only with a concrete deployment need and with authentication.
- Extensions are added only when a real need appears, each with its own adapter, contracts, requirements and tests: Android, Browser, GPU, Network, Database, Firmware, Container, Cloud, Compiler, Algorithm, Energy. They are not required for 1.0 unless a user asks for one; the framework and a worked example of an extension are.

**Version 1.0 is released when J and K are done.**

### Coverage of the roadmap

| Roadmap section | Closed by |
|---|---|
| 0.2 Advanced Process Inspector | B |
| 0.2 Time-Series Performance Profiler | B |
| 0.2 Process Safety & Resource Control | B |
| 0.2 Advanced Benchmark Engine | C |
| 0.2 Advanced Evidence Engine | D |
| 0.2 MCP interface | D (tools for process data in B and benchmarks in C) |
| 0.2 acceptance criteria | D |
| 0.3 static analysis, dependency analysis | E |
| 0.3 provider contracts, Ghidra, Rizin | F |
| 0.4 Frida and GDB | G |
| 0.4 test-suite adapters, fixtures, equivalence reporting, integrity, reports | I |
| Later: function hotspots, disk/network I/O | H |
| Later: JS/Electron, .NET, WASM, plugin loading, HTTP MCP, extensions | F (plugin loading), K (the rest) |
| Core readiness criteria and the two trial scenarios | J |

---

## Release sections

Sequencing principle: do not start with Ghidra and do not try to implement every external analyzer at once. First strengthen Reverse's ability to investigate running programs, detect real performance problems and collect evidence, because the main job of Reverse is to help an AI agent find the causes of excessive resource use and objectively verify optimization results. Linux is the first fully supported profiling environment, with interfaces for Windows and macOS designed in from the start.

## 0.1.0 — compact MVP

- [x] Standalone TypeScript project, CLI, MCP stdio server
- [x] ELF/PE/Mach-O header recognition
- [x] Source and npm manifest inventory
- [x] Basic process inventory and CPU/RSS sampling
- [x] Repeated wall-clock benchmark and comparison
- [x] Exact output/exit-code validation
- [x] Local JSON evidence/artifacts
- [x] Explicit extension-point registry and capability matrix

## 0.1.1 — defect closure (patch A)

- [x] Everything listed under Patch A above

## 0.2 — Deep Process & Performance Intelligence

Priorities: Process Manager, Performance Profiler, Evidence Engine and Benchmark Engine. This release is not about adding more analyzers.

**Advanced Process Inspector**
- [ ] PID, PPID and process tree; executable, launch arguments, uptime, thread count
- [ ] RSS, virtual memory, CPU utilization and accumulated CPU time, disk I/O
- [ ] Open file descriptors where available; child-process detection
- [ ] Detection of processes consuming disproportionate resources
- [ ] Observation over a given interval, not only a point-in-time snapshot
- [ ] Linux `/proc` metrics with clear units and per-process CPU deltas
- [ ] Windows performance counters and macOS sampling adapter

**Time-Series Performance Profiler**
- [ ] Sampling at a configured frequency: interval CPU, RSS/VMS, peak RAM and memory change, CPU time, read/write I/O, thread count
- [ ] Modes: Snapshot, Monitor, Diagnostic, Compare
- [ ] Detection of sharp load spikes, prolonged high load and continuously growing memory
- [ ] Structured, persisted results
- [ ] Reported as process-level monitoring, not as hot-function detection

**Advanced Benchmark Engine**
- [ ] Warm-up, cold/warm separation, alternating runs
- [ ] Mean, median, min/max, P95, standard deviation, MAD, outlier detection, variance and confidence intervals
- [ ] CPU time, peak RAM and binary-size comparison
- [ ] Baseline metadata and hardware/environment fingerprints (OS, CPU, cores, RAM, Node.js/Reverse/target versions, arguments, non-secret environment, benchmark parameters)
- [ ] Warning about limited comparability when environments differ
- [ ] No statistical-significance claim from a lower mean alone

**Advanced Evidence Engine**
- [ ] Evidence types: Process, Memory, CPU, I/O, Binary, Benchmark, Validation
- [ ] Record fields: `evidence_id`, `target_id`, `type`, `source`, `timestamp`, `measurement`, `confidence`, `limitations`, `hash`
- [ ] Research sessions linking target, observations, profile, baseline, optimization, new benchmark, comparison, validation and final evidence report

**Process Safety & Resource Control**
- [ ] PID existence and identity checks, protection against PID reuse; process ownership verification
- [ ] Timeouts, capped stdout/stderr, child-process control, process-tree observation
- [ ] Cancellation and cleanup, including safe removal of temporary files
- [ ] Modes `READ_ONLY` (default), `OBSERVE`, `CONTROLLED_EXECUTION`
- [ ] Resource limits and OS sandbox integration (CPU/RAM control is not presented as isolation; hard limits need OS mechanisms such as cgroups)

**MCP interface**
- [ ] `list_processes`, `monitor_process`, `get_process_metrics`, `get_process_tree`
- [ ] `analyze_memory`, `analyze_cpu`, `analyze_io`, `detect_resource_anomalies`
- [ ] `create_benchmark_suite`, `run_benchmark_suite`, `compare_benchmarks`
- [ ] `get_environment_fingerprint`, `get_research_session`
- [ ] Existing MCP commands are preserved; backward compatibility is not broken

**Explicitly deferred from 0.2:** Ghidra and Rizin (0.3); Frida and GDB (0.4); eBPF, Windows ETW and macOS Instruments as separate platform providers later; Android, GPU and Network analyzers later. The independent-provider architecture is laid down now so these can be added without rewriting the core.

### Acceptance criteria for 0.2

1. Reverse can observe any accessible process.
2. It can collect CPU, RAM and I/O over a given time.
3. It can identify processes with anomalous resource consumption.
4. It can store the measurement history.
5. It can run a series of repeated benchmarks.
6. It can compare two versions of a program.
7. It accounts for statistical error.
8. It can determine the comparability of experiment conditions.
9. It stores evidence for every measurement.
10. It exposes the results through MCP.
11. It can safely cancel investigations.
12. All new functions have automated tests.

Trials are required on three kinds of application defined by the original specification: a small application, a large application with several dependencies, and a closed binary application without source.

## 0.3 — static analysis and providers

- [ ] Parse ELF program/section headers and symbol tables
- [ ] PE sections/imports/exports and Mach-O load commands
- [ ] Function discovery, call graph, duplicated code, embedded libraries, unused components where this can be proven
- [ ] Dependency lockfile parsers and transitive graphs; duplicate and outdated libraries, version detection, size/resource impact of a dependency, compatibility and risk information for suggested replacements
- [ ] Provider contract tests and executable discovery
- [ ] Real, opt-in Ghidra and Rizin adapters with integration tests (Ghidra as the main deep-analysis engine, Rizin as the alternative)

## 0.4 — dynamic analysis, validation and evidence

- [ ] Real, opt-in Frida and GDB adapters with integration tests: execution tracing, frequently called functions, repeated computation, component interaction, behavior under different loads
- [ ] Test suite adapters and build verification; regression-test execution
- [ ] Structured behavior fixtures and normalization rules; comparison of behavior before and after a change on predefined inputs (for programs without source)
- [ ] Explicit reporting when full equivalence cannot be proven
- [ ] Evidence manifest integrity and optional signing
- [ ] Before/after report generation with uncertainty and limitations (what was found, what changed and why, metrics before and after, residual risks, what to optimize next)

## Later

- [ ] Function hotspots via real external profilers (perf, eBPF, ETW, Instruments, Valgrind as additional providers)
- [ ] Disk/network I/O providers
- [ ] JS/Electron, .NET and WASM analyzers
- [ ] Plugin loading and provider lifecycle
- [ ] Extensions added only when a real need appears, each with its own adapter, contracts, requirements and tests: Android, Browser, GPU, Network, Database, Firmware, Container, Cloud, Compiler, Algorithm, Energy
- [ ] HTTP MCP transport only if a concrete deployment need exists

## Core development order and completion criteria

Overall order: assemble a standalone version with MCP; implement profiling; implement Benchmark and Validation; integrate with the external AI agent (MCP connection, instructions and skills, context passing, control of experiment sequence and re-checks); verify on real applications. Do not try to build everything at once; build a working compact core first and extend it gradually.

The core is considered ready for first production use when it:

1. investigates supported binary formats;
2. determines source structure and potential problems;
3. obtains data about running programs;
4. measures CPU and RAM;
5. finds confirmed hot spots;
6. determines components and versions of dependencies;
7. compares before and after through benchmarks;
8. verifies that behavior is preserved;
9. ties conclusions to real data through evidence;
10. exposes its tools to the external agent through MCP;
11. limits execution and resources;
12. allows new analyzers to be connected.

Trials cover at least two scenarios: detecting a real performance problem, and verifying an optimization with a measurable result. Three things are never traded for size: Evidence (otherwise the agent decides on unreliable assumptions), Profiler plus Benchmark (otherwise optimization effectiveness cannot be established objectively), and Validation (otherwise a faster but broken program can result).
