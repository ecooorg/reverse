# Roadmap

The design behind each item is described in [ARCHITECTURE.md](ARCHITECTURE.md). Sequencing principle: do not start with Ghidra and do not try to implement every external analyzer at once. First strengthen CREA's ability to investigate running programs, detect real performance problems and collect evidence, because the main job of CREA is to help an AI agent find the causes of excessive resource use and objectively verify optimization results. Linux is the first fully supported profiling environment, with interfaces for Windows and macOS designed in from the start.

## 0.1.0 — compact MVP

- [x] Standalone TypeScript project, CLI, MCP stdio server
- [x] ELF/PE/Mach-O header recognition
- [x] Source and npm manifest inventory
- [x] Basic process inventory and CPU/RSS sampling
- [x] Repeated wall-clock benchmark and comparison
- [x] Exact output/exit-code validation
- [x] Local JSON evidence/artifacts
- [x] Explicit extension-point registry and capability matrix

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
- [ ] Baseline metadata and hardware/environment fingerprints (OS, CPU, cores, RAM, Node.js/CREA/target versions, arguments, non-secret environment, benchmark parameters)
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

1. CREA can observe any accessible process.
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

Overall order: audit the source REA and build a dependency graph; extract a minimal portable core; assemble a standalone version with MCP; implement profiling; implement Benchmark and Validation; integrate with the external AI agent (MCP connection, instructions and skills, context passing, control of experiment sequence and re-checks); verify on real applications. Do not try to build everything at once; build a working compact core first and extend it gradually.

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
