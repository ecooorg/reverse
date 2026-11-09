# Architecture

Sections marked **(0.1.0)** describe what exists in the current release. Sections marked **(planned)** describe the target design and the release in which it is scheduled; see [ROADMAP.md](ROADMAP.md). Nothing marked *planned* should be treated as implemented.

## Purpose and design principles

Reverse is a compact, standalone analysis core that serves an AI research agent for software optimization. It gives the agent verifiable facts about third-party programs, libraries and running processes, so the agent can find the causes of excessive resource use, propose optimizations, and prove — by measurement — that a change helped and did not break behavior. It works with programs whose source is available and with closed binaries; for closed programs, the changes that can be made are limited to those technically possible without source.

Responsibilities are split deliberately:

- **The AI agent** is the intelligence: research, analysis, hypotheses, planning, solution design, experiment control and interpretation of results.
- **The Reverse core** is the toolset: access to programs, deterministic analysis, measurement, safe execution, evidence and verification.
- **External analyzers** (Ghidra, Rizin, Frida, GDB, perf, eBPF, ETW, Instruments, Valgrind) do the heavy specialist work behind providers.

The model must not invent technical facts about a target. It receives facts from the core, forms hypotheses and requests further investigation. The model proposes an optimization; its effectiveness is confirmed by measurement and its correctness by independent checks.

Development rules:

- Do not reimplement what existing specialist tools or the connected model already do well: no custom disassembler (use Ghidra), debugger (GDB), dynamic instrumentation (Frida), large knowledge base or planning system.
- Own code concentrates on connecting tools, normalizing results, measurement, evidence and verification.
- Do not delegate factual measurement or execution safety to the model; instructions to the model are not a substitute for enforcement in code.
- The core is an independent tool, not a part of one specific agent, so it can be attached to different models and agents without rewriting the analysis infrastructure.
- Do not turn the core into another universal reverse-engineering framework: no workflow system of its own, no duplicated analyzers, no duplicated AI logic, no heavy embedded knowledge bases, no unnecessary universal adapters. Heavy components are connected lazily and optional capabilities are modular.

## Layers (0.1.0)

- **Analysis Core:** bounded file/header inspection, source inventory, direct manifest dependency inventory.
- **Process Core:** point-in-time process inventory and selected-process inspection.
- **Measurement Core:** bounded OS process sampling and repeated wall-clock command benchmarks.
- **Validation Core:** exact caller-supplied stdout/stderr/exit-code checks. This is not semantic equivalence checking.
- **Evidence Core:** timestamped, source-linked evidence records and local JSON artifacts.
- **AI Interface:** CLI and an independent MCP stdio server over the same TypeScript functions.
- **Provider boundary:** optional specialist engines can be registered behind `AnalyzerProvider`.

## Data flow (0.1.0)

`CLI or MCP -> domain function -> structured Result -> evidence/artifact persistence`

The Result envelope contains `schemaVersion`, `id`, `target`, `operation`, `status`, `generatedAt`, `host`, `findings`, `evidence`, `limitations`, `errors`, and `coverage`.

### Fact categories (planned)

Every response must make clear which kind of statement it carries, and a model assumption must never be presented as a measured fact:

1. **Measured facts** — observations from sampling, benchmarks and process inspection.
2. **Static analysis results** — facts derived from files, headers, manifests and, later, disassembly.
3. **Assumptions and hypotheses of the AI** — held by the agent, not stored as evidence.
4. **Confirmed optimization results** — a before/after comparison backed by measurements and validation.

Every finding should carry its source, the target identifier, the time of observation, status, coverage, limitations, errors, supporting evidence, and a way to request more detail on demand. MCP responses stay compact; detailed evidence is returned on request.

## Target architecture (planned)

```text
Reverse
│
├── CORE
│   ├── Contracts
│   ├── Process Manager
│   ├── Security
│   └── Configuration
│
├── ANALYSIS
│   ├── Binary Analyzer
│   ├── Source Analyzer
│   ├── Dependency Analyzer
│   └── Provider Registry
│
├── PROCESS INTELLIGENCE
│   ├── Process Inspector
│   ├── Process Tree
│   ├── Process Monitor
│   └── Resource Collector
│
├── PERFORMANCE
│   ├── CPU Profiler
│   ├── Memory Profiler
│   ├── I/O Profiler
│   ├── Time-Series Engine
│   └── Anomaly Detector
│
├── BENCHMARK
│   ├── Benchmark Engine
│   ├── Baseline Manager
│   ├── Statistical Analyzer
│   └── Environment Fingerprint
│
├── VALIDATION
│   ├── Behavior Comparison
│   ├── Regression Testing
│   └── Result Verification
│
├── EVIDENCE
│   ├── Evidence Engine
│   ├── Evidence Storage
│   ├── Evidence Integrity
│   └── Research Sessions
│
├── INTERFACE
│   ├── MCP Server
│   └── CLI
│
└── EXTENSIONS
    ├── Ghidra
    ├── Rizin
    ├── Frida
    ├── GDB
    ├── eBPF
    ├── ETW
    ├── Instruments
    ├── JADX / Apktool
    ├── ADB / Android Device Bridge
    └── simpleperf / Perfetto / dumpsys
```

### Android analysis extension (planned across patches E–J)

Android packages are treated as analysis targets without expanding the core with heavyweight reverse-engineering engines. The static layer will inventory APK/AAB archives, parse binary `AndroidManifest.xml` (permissions, components, exported components and debug flags), and list `classes*.dex`, `lib/<abi>/*.so`, assets and resources. Dependency analysis will read `build.gradle`, `build.gradle.kts`, `gradle.lockfile` and `libs.versions.toml`, plus available `META-INF` metadata in built APKs.

Static providers: JADX for DEX-to-Java decompilation and Apktool for Smali/resources; Ghidra remains the native `.so` analyzer. Device operations use an ADB provider. Frida supports Java/ART (`Java.perform`) and native hooks, including remote `frida-server` through ADB. Android profiling uses simpleperf for CPU hotspots, Perfetto for system traces, and `dumpsys` for memory/CPU/battery context.

`CONTROLLED_EXECUTION` on Android requires a dedicated AVD or test device. Each benchmark restores app state (for example `pm clear` or an AVD snapshot rollback). APK modifications require rebuild (`apktool b`), alignment (`zipalign`) and test-key signing (`apksigner`) before install and regression verification. These are planned provider workflows, not current built-in capabilities.

Specialist analysis beyond the built-in analyzers (native, JavaScript/Electron, .NET and WebAssembly analysis, hotspot detection, disk/network I/O) is reached through providers and extensions, not by reimplementing the underlying tools. Platform and domain extensions (Android, browser, GPU, network, database, firmware, container, cloud, compiler, algorithm, energy) are added through provider adapters with explicit contracts; the core must not know the internals of any extension. Android support is scheduled across patches E–J. Linux is the first fully supported profiling environment; interfaces for Windows and macOS are designed in from the start.

## Process Intelligence (partially implemented, 0.2)

**Implemented (Patch B).** The inspector collects OS-exposed PID/PPID, executable and arguments, uptime, thread count, RSS/VMS, CPU time where available, Linux disk I/O and open-FD count, plus visible child relationships. Linux reads `/proc`; Windows uses CIM and macOS uses `ps`. It records start-time identity tokens; Linux/macOS expose UID ownership checks. Metrics are not at parity across platforms.

**Advanced Process Inspector (implemented core; remaining platform work).** Beyond a point-in-time snapshot, the inspector collects: PID, PPID and the process tree; executable and launch arguments; process uptime; thread count; RSS and virtual memory; CPU utilization and accumulated CPU time; disk I/O; open file descriptors where available; child processes; and processes consuming disproportionate resources. Observation over a given interval — not only a snapshot — is a core requirement, so the agent sees the dynamics of consumption. An observation report states the target, PID, average and peak CPU, average and peak RSS, thread count, disk read/write totals, observation duration and sample count.

**Implemented (Patch B).** Bounded sampling persists structured JSON time series with available CPU, memory, thread, child and disk-I/O metrics; checks process identity between samples; supports AbortSignal and MCP request cancellation; and detects sustained CPU, CPU spikes and growing RSS.

**Time-Series Performance Profiler (implemented core; remaining advanced analysis).** Collects metrics at a configured frequency: interval CPU utilization, RSS and VMS, peak RAM and memory change, CPU time, read/write I/O and thread count. It detects sharp load spikes, prolonged high load, and processes with continuously growing memory. Modes:

| Mode | Purpose |
|---|---|
| Snapshot | Single measurement |
| Monitor | Continuous observation |
| Diagnostic | Extended metric collection |
| Compare | Comparison of two periods |

Results are stored in a structured format so the agent can answer: does RAM grow continuously? does CPU periodically reach 100%? does an idle process keep consuming resources? does load grow after a particular event? which child process creates the main load?

**Limitation.** This is process-level monitoring, not hot-function detection. Without Frida, perf, eBPF or another suitable profiler, Reverse can reliably identify resource-intensive processes, but not specific functions inside them. Function-level data is reported only when produced by a real external profiler through a provider.

## Benchmark methodology (0.1.0 and planned, 0.2)

0.1.0 runs repeated wall-clock command executions and reports median, mean, min and max with bounded stdout/stderr. The planned Advanced Benchmark Engine adds: repeated runs, warm-up before measurement, separate cold and warm runs, mean, median, min/max, P95, standard deviation, MAD (median absolute deviation), outlier detection, and comparison of CPU time, peak RAM and binary size, together with a recorded system configuration.

A comparison reports the per-metric change between baseline and optimized runs (execution time, CPU time, peak RAM, binary size), the number of repetitions and which robust statistics were available. A reduced mean alone must not be declared statistically significant: measurement spread and experimental conditions have to be taken into account.

A baseline lifecycle supports the full cycle: create the initial profile, record the starting parameters, run the program in a controlled environment, measure resource use, store the results, re-measure after a change, compare the indicators, and produce a report of changes. Indicators compared may include execution time, CPU time, peak and average RAM, disk operations, network traffic, startup time, executable size and program-specific metrics.

Measurement quality rules:

- Same input data, comparable hardware, same launch conditions.
- Record the target version and the analyzer version.
- Repeat measurements, store the results, record the error margin, detect regressions.
- Profiling itself adds load; profiled and unprofiled runs must not be mixed unconditionally.
- Target indicators are defined per experiment.
- An improvement must not be claimed because only the report size, line count or the volume of data sent to the model changed.

### Environment fingerprint (planned, 0.2)

To judge whether two measurements are comparable, each experiment records: OS and version, CPU architecture, CPU core count, total RAM, Node.js version, Reverse version, target application version, launch arguments, environment variables (excluding secrets), time of the study, and benchmark parameters. Android-specific fields to be recorded by the Android adapters are device model / AVD configuration, Android SDK/API level, target ABI, ART/Dalvik version, and thermal-throttling / battery state. If hardware or configuration differs materially, Reverse warns that comparability of the results is limited.

## Evidence model (0.1.0 and planned, 0.2)

0.1.0 stores timestamped, source-linked evidence records (`EvidenceRef`) with a SHA-256 for regular files and local JSON artifacts.

The planned Advanced Evidence Engine makes evidence the central store of technical facts. Every technical conclusion must be bound to its source — a file, function, address, offset, process, observed event or measurement result — so the agent receives structured facts and not prose. Evidence types: Process, Memory, CPU, I/O, Binary, Benchmark and Validation Evidence. Each record has:

| Field | Purpose |
|---|---|
| `evidence_id` | Unique identifier |
| `target_id` | Program under study |
| `type` | Evidence type |
| `source` | Source of the information |
| `timestamp` | Time of acquisition |
| `measurement` | Measured data |
| `confidence` | Level of reliability |
| `limitations` | Limitations |
| `hash` | Checksum |

Records are linked into a **research session**, so the agent gets the full history of an investigation rather than isolated JSON answers:

```text
Research Session
    |
    +-- Target
    +-- Process Observations
    +-- Performance Profile
    +-- Baseline
    +-- Optimization
    +-- New Benchmark
    +-- Comparison
    +-- Validation
    +-- Final Evidence Report
```

Tamper-evident integrity (a manifest and optional signing) is a later step; see the roadmap.

## Research cycle supported by the core (planned)

1. **Investigation** — the agent determines the application type, technologies, architecture, dependencies, source availability and available analysis tools.
2. **Diagnosis** — the core collects technical data; the agent identifies causes of excessive resource use, outdated components, inefficient algorithms, bottlenecks and modernization options.
3. **Hypotheses** — the agent proposes optimization options and estimates expected gain, complexity, risk, compatibility and required changes.
4. **Experiment** — the agent applies a chosen change (algorithm or source change, library replacement, dependency update, compiler parameters, runtime or configuration tuning, removal of components that are truly unnecessary), limited to what is technically possible for closed programs.
5. **Verification** — the core re-measures and checks behavior.
6. **Decision** — accept if performance improved and correctness is preserved; roll back if results worsened; investigate further if data is insufficient; reject if functionality is broken.
7. **Report** — what was found and changed and why, the metrics before and after, the improvement, residual risks and what can be optimized next.

The orchestration of this cycle belongs to the agent. Reverse provides the deterministic steps and does not ship its own workflow engine.

## Safety and process control

0.1.0 safe defaults and known gaps are described in [SECURITY.md](SECURITY.md). The core works locally and does not send target binaries to external models automatically; the external model must not receive unrestricted access to the local system.

### Planned hardening (0.2)

- Check that a PID exists; verify process identity before any operation; guard against PID reuse.
- Timeouts for launched target processes; capped stdout/stderr size.
- Control of child-process launches; clean termination of Reverse's own test processes.
- Cancellation of investigations; safe removal of temporary files.
- Preserve the original state of the program and allow recovery after a failed change; operations that may change the target, its configuration or the environment require separate permission.

### Operating modes (planned)

```text
READ_ONLY
OBSERVE
CONTROLLED_EXECUTION
```

The default is `READ_ONLY`; new programs are studied in a mode that makes no changes to the original. A further mode for applying changes would require explicit permission.

CPU and RAM control must not be presented as full system isolation. Real hard limits need separate OS mechanisms such as cgroups on Linux.

## Interface

### MCP tools

The existing tools and the implemented 0.2 process tools are listed in [MCP.md](MCP.md). Existing tools must be preserved and backward compatibility must not be broken. Before adding a command, the existing contracts are checked and compatible ones reused, instead of creating duplicate commands.

Remaining planned additions for 0.2 (not yet implemented):

| Tool | Purpose |
|---|---|
| `list_processes` | List of processes |
| `inspect_process` | Detailed information (exists today as a point-in-time inspection) |
| `monitor_process` | Observation of a process |
| `get_process_metrics` | Retrieval of metrics |
| `get_process_tree` | Process tree |
| `analyze_memory` | Memory analysis |
| `analyze_cpu` | CPU analysis |
| `analyze_io` | I/O analysis |
| `detect_resource_anomalies` | Anomaly detection |
| `create_benchmark_suite` | Create a set of measurements |
| `run_benchmark_suite` | Run the measurements |
| `compare_benchmarks` | Compare results |
| `get_environment_fingerprint` | Environment information |
| `get_research_session` | History of an investigation |

Candidates for later releases, depending on providers: `get_hotspots` and `trace_execution` (require a real profiler or Frida/GDB provider).

## Extension contract

Implement `AnalyzerProvider` from `src/providers-registry.ts`, declare concrete capabilities, check availability without side effects, and return structured observations with explicit coverage and limitations. Never report `available: true` unless the executable and required runtime are actually detected. Provider registration is in-process; dynamic plugin loading is a future task.

Providers are independent so that connecting Ghidra, Rizin, Frida, GDB, eBPF, ETW or Instruments does not require rewriting the core. The core must not depend exclusively on any single engine; engines are connected through the common interface. Provider integrations, in planned order: Ghidra and Rizin (0.3), Frida and GDB (0.4), then separate Linux (eBPF), Windows (ETW) and macOS (Instruments) providers. Android adapters are scheduled across patches E–J; GPU and network analyzers remain later extensions.

## Size guidance

The compact core is sized for planning, not as a measure of quality: roughly 20,000–30,000 lines of own TypeScript is the preferred target, up to about 50,000 where there is a justified technical need, compared with about 606,000 lines of production code in the original REA. Third-party engines are excluded from this count. Line count must never be a reason to remove necessary verification, security or evidence. The sensible approach is to build the minimum working core first, then measure its size and operating cost.

## Product direction

Reverse is intended to become a software performance research system, not merely an MCP wrapper over system commands, built on three strengths:

- **Deep Observation:** Reverse knows what happens inside the studied system at the level of the available system metrics.
- **Scientific Benchmarking:** Reverse objectively measures the effect of changes.
- **Verifiable Evidence:** Reverse can show where data came from and what conclusions rest on it.
