# Architecture

Sections marked **(0.1.0)** describe what exists in the current release. Sections marked **(planned)** describe the target design and the release in which it is scheduled; see [ROADMAP.md](ROADMAP.md). Nothing marked *planned* should be treated as implemented.

## Purpose and design principles

Reverse is a compact, standalone analysis core that serves an AI research agent for software optimization. It gives the agent verifiable facts about third-party programs, libraries and running processes, so the agent can find the causes of excessive resource use, propose optimizations, and prove — by measurement — that a change helped and did not break behavior. It works with programs whose source is available and with closed binaries; for closed programs, the changes that can be made are limited to those technically possible without source.

Responsibilities are split deliberately:

- **The AI agent** is the intelligence: research, analysis, hypotheses, planning, solution design, experiment control and interpretation of results.
- **The Reverse core** is the toolset: access to programs, deterministic analysis, measurement, safe execution, evidence and verification.
- **External analyzers** (Ghidra, Rizin, Frida, GDB, perf, eBPF, ETW, Instruments, Valgrind) do the heavy specialist work behind providers.

- **Analogy produces candidates, never facts.** The agent may use semantic intuition and cross-domain analogy (a dead binary compared with documented software of the same era and domain) to form hypotheses. Reverse keeps those hypotheses apart from measured and statically derived facts, in a hypothesis ledger with provenance. A hypothesis becomes a confirmed result only through a deterministic check run by Reverse (execution, differential testing, measurement). Analogy never raises a behavior-preservation level.

The model must not invent technical facts about a target. It receives facts from the core, forms hypotheses and requests further investigation. The model proposes an optimization; its effectiveness is confirmed by measurement and its correctness by independent checks.

Development rules:

- Do not reimplement what existing specialist tools or the connected model already do well: no custom disassembler (use Ghidra), debugger (GDB), dynamic instrumentation (Frida), large knowledge base or planning system.
- Own code concentrates on connecting tools, normalizing results, measurement, evidence and verification.
- Do not delegate factual measurement or execution safety to the model; instructions to the model are not a substitute for enforcement in code.
- The core is an independent tool, not a part of one specific agent, so it can be attached to different models and agents without rewriting the analysis infrastructure.
- Do not turn the core into another universal reverse-engineering framework: no workflow system of its own, no duplicated analyzers, no duplicated AI logic, no heavy embedded knowledge bases, no unnecessary universal adapters. Heavy components are connected lazily and optional capabilities are modular.

## Product goal and the legacy track (planned, patches M–P)

**Goal.** Reverse must let an agent fully analyze modern **and old** programs without source, find why they do not work or work badly on modern hardware and in a modern environment, and propose concrete improvements or a full rework with the highest verifiable preservation of functionality. Patches A–K build the general core; patches M–P (after 1.0) add the legacy and compatibility capabilities below. Nothing in this section is implemented.

**Authorized use only.** The legacy track exists to help developers and rights holders restore old programs that no longer work. Reverse therefore works only with (a) open-source software, under its license, or (b) software whose developers and rights holders have given full consent to the analysis and any resulting rework. The basis is declared by the operator and recorded in the research session; Reverse cannot verify legal status and does not claim to. See [SECURITY.md](SECURITY.md).

**Host versus target.** The *host* is the machine Reverse runs on; the *target* is the analyzed program and its era. Static analysis does not depend on the host. Running an old target uses an execution environment (emulator, compatibility layer or virtual machine) that may live on any host.

**Target platform priority.** Windows up to 2010 first, then old Linux, old Mac, old Android, and then the newer generations of the same four, each as a vertical slice through M, N, O and P (see the wave table in [ROADMAP.md](ROADMAP.md)).

### Components

- **Target Profile.** Required OS and era, CPU, bitness, ABI, runtime, installer and toolchain, each field with evidence (patch M). It may carry an **analogy tag** (for example `Accounting-Software-Late-90s`), always with a confidence value and the deterministic features it rests on (RTTI, import table, compiler strings), never as a bare label.
- **Compatibility Diagnosis.** Turns the profile and static facts into a list of probable causes of failure on a modern system: removed or changed APIs, missing libraries, privilege and virtualization assumptions, timing tied to CPU speed, graphics/audio/driver dependencies, DPI and locale assumptions, address-space and date limits. Causes that only running the program can confirm are marked as needing an execution environment (patch M). Version tables are data files with sources, not code.
- **Execution Environments.** An `ExecutionEnvironment` provider contract (detect, prepare, snapshot, restore, run with limits, trace, shut down) with adapters for Wine, DOSBox-class emulators, QEMU and other virtual machines, old-userland containers and old-API Android images. Reverse never ships operating-system images; the user supplies them and Reverse records their hashes in the environment fingerprint. The result is a works/fails matrix across environments (patch N).
- **Behavior Capture and Replay.** Records what a program does (inputs, outputs, files, registry/preferences, network, UI events), controls time and randomness, replays deterministically, measures code coverage of the original and compares old against new after normalization (patch O).
- **Equivalence Lab.** Runs an original function and its replacement on the same input sets in emulation or in the original environment, with differential, property and fuzz testing (patch P).
- **Migration Advisor.** Ranks the options from a configuration or compatibility-layer change to a full rewrite, with gain, risk, effort, permissions and supporting evidence. The agent chooses; Reverse supplies facts and enforces safety (patch P). **Generative reconstruction** (a modern equivalent of a function designed by the agent from behavioral analogies) is allowed only when an oracle exists: the original function runnable in emulation or its original environment, or recorded data files. Without an oracle the option is marked `unverifiable` and capped at L0.
- **Hypothesis Ledger.** Records the agent's and providers' hypotheses with provenance, confidence and status (patch D). Not a separate engine: a record type next to Evidence.
- **Similarity Providers.** Function and structure similarity (Ghidra BSim and Function ID, FLIRT, capa, YARA-X, Detect It Easy, optionally local ML similarity models) behind `AnalyzerProvider` (patches F and M). Reverse ships no corpus of third-party binaries (see Corpus policy).

### Behavior-preservation levels

Full preservation cannot be proven for real programs, so Reverse reports a level and never a guarantee:

| Level | Meaning |
|---|---|
| L0 | Not checked, or checks failed |
| L1 | Outputs and side effects match on the supplied scenarios |
| L2 | L1 and the scenarios cover a stated, measured share of the original's code, with uncovered regions listed |
| L3 | L2 and replaced functions were compared with the original on large generated and recorded input sets without differences |

L4 (formal proof of equivalence) is out of scope. The level depends only on checks Reverse ran. How a candidate was produced (analogy, agent synthesis, decompilation) does not change it, and a candidate without an oracle never exceeds L0. A report always states the level, the coverage, the number of scenarios and inputs, the environments used and the residual risk.

### Scope and legal limits

Analysis is limited to open-source software and to software whose developers and rights holders have given full consent (see *Authorized use only* above and [SECURITY.md](SECURITY.md)).

**Corpus policy.** Reverse bundles no third-party binaries and no proprietary code. Any similarity corpus consists of hashes and signatures derived from open-source software or from material the consent holder supplied, and each entry carries source and license. Similarity lookups run locally; nothing is uploaded. Code produced by generative reconstruction carries a provenance record and must be compatible with the license or consent under which the target was analyzed.

Copy protection, dongles and license checks are reported as facts but are not defeated by Reverse; operating-system images and commercial tools are supplied by the user. See [SECURITY.md](SECURITY.md).

## Layers (0.1.0)

- **Analysis Core:** bounded file/header inspection, source inventory, direct manifest dependency inventory.
- **Process Core:** point-in-time process inventory and selected-process inspection.
- **Measurement Core:** bounded OS process sampling and repeated command benchmarks (wall-clock, sampled CPU time and peak RAM, binary size).
- **Validation Core:** exact caller-supplied stdout/stderr/exit-code checks with optional normalization (whitespace, timestamps, sortLines) and JSON fixture runner. This is not semantic equivalence checking.
- **Evidence Core:** timestamped, source-linked evidence records, hash-chained research sessions, optional HMAC-SHA256 integrity (`REVERSE_EVIDENCE_KEY`), and local JSON artifacts.
- **AI Interface:** CLI and an independent MCP stdio server over the same TypeScript functions.
- **Provider boundary:** optional specialist engines can be registered behind `AnalyzerProvider`.

## Data flow (0.1.0)

`CLI or MCP -> domain function -> structured Result -> evidence/artifact persistence`

The Result envelope contains `schemaVersion`, `id`, `target`, `operation`, `status`, `generatedAt`, `host`, `findings`, `evidence`, `limitations`, `errors`, and `coverage`.

### Fact categories (implemented)

Every response must make clear which kind of statement it carries, and a model assumption must never be presented as a measured fact:

1. **Measured facts** — observations from sampling, benchmarks and process inspection.
2. **Static analysis results** — facts derived from files, headers, sections/symbols/imports, lockfiles, comment-aware source imports and APK/AAB inventory (patch E). Deeper disassembly/decompilation is provider-backed (Ghidra postScript function list, Rizin; patch F).
3. **Hypotheses and analogies** — proposed by the agent or a similarity provider. They are stored only in the **hypothesis ledger**, never as evidence and never inside a `measured` or `static` finding. Records carry `hypothesis_id`, `target_id`, statement, provenance, confidence, status and optional `promotionEvidenceId`. Promotion to `supported` requires same-session Validation evidence with `passed: true` or Benchmark evidence with the verdict `improved`, confidence of at least 0.5 and an intact hash; refuted hypotheses are retained. MCP records mark them `kind: "hypothesis"`.
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
│   ├── Similarity Providers (via Provider Registry)
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
│   ├── Hypothesis Ledger
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

### Android analysis extension (static inventory in E; deeper adapters planned F–J)

Android packages are treated as analysis targets without expanding the core with heavyweight reverse-engineering engines. The static layer will inventory APK/AAB archives, parse binary `AndroidManifest.xml` (permissions, components, exported components and debug flags), and list `classes*.dex`, `lib/<abi>/*.so`, assets and resources. Dependency analysis will read `build.gradle`, `build.gradle.kts`, `gradle.lockfile` and `libs.versions.toml`, plus available `META-INF` metadata in built APKs.

Static providers: JADX for DEX-to-Java decompilation and Apktool for Smali/resources; Ghidra remains the native `.so` analyzer. Device operations use an ADB provider. Frida supports Java/ART (`Java.perform`) and native hooks, including remote `frida-server` through ADB. Android profiling uses simpleperf for CPU hotspots, Perfetto for system traces, and `dumpsys` for memory/CPU/battery context.

`CONTROLLED_EXECUTION` on Android requires a dedicated AVD or test device. Each benchmark restores app state (for example `pm clear` or an AVD snapshot rollback). APK modifications require rebuild (`apktool b`), alignment (`zipalign`) and test-key signing (`apksigner`) before install and regression verification. These are planned provider workflows, not current built-in capabilities.

Specialist analysis beyond the built-in analyzers (native, JavaScript/Electron, .NET and WebAssembly analysis, hotspot detection, disk/network I/O) is reached through providers and extensions, not by reimplementing the underlying tools. Platform and domain extensions (Android, browser, GPU, network, database, firmware, container, cloud, compiler, algorithm, energy) are added through provider adapters with explicit contracts; the core must not know the internals of any extension. Android support is scheduled across patches E–J. Linux is the first fully supported profiling environment; interfaces for Windows and macOS are designed in from the start.

## Process Intelligence (partially implemented, 0.2)

**Implemented (Patch B).** The inspector collects OS-exposed PID/PPID, executable and arguments, uptime, thread count, RSS/VMS, CPU time where available, Linux disk I/O and open-FD count, plus visible child relationships. Linux reads `/proc`; Windows uses CIM (a filtered single-PID query for one process, the full table for the inventory; tree walks and kills use a lean table without command lines) and macOS uses `ps` (macOS does not report thread counts). Helper output is parsed by pure functions in `src/process-parse.ts`, which the capability suite verifies with fixtures on every platform. It records start-time identity tokens; Linux/macOS expose UID ownership checks. Metrics are not at parity across platforms.

**Advanced Process Inspector (implemented core; remaining platform work).** Beyond a point-in-time snapshot, the inspector collects: PID, PPID and the process tree; executable and launch arguments; process uptime; thread count; RSS and virtual memory; CPU utilization and accumulated CPU time; disk I/O; open file descriptors where available; child processes; and processes consuming disproportionate resources. Observation over a given interval — not only a snapshot — is a core requirement, so the agent sees the dynamics of consumption. An observation report states the target, PID, average and peak CPU, average and peak RSS, thread count, disk read/write totals, observation duration and sample count.

**Implemented (Patch B).** Bounded sampling persists structured JSON time series with available CPU, memory, thread, child and disk-I/O metrics; checks process identity between samples; supports AbortSignal and MCP request cancellation; and detects sustained CPU, CPU spikes and growing RSS.

**Time-Series Performance Profiler (implemented core; remaining advanced analysis).** Collects metrics at a configured frequency: interval CPU utilization, RSS and VMS, peak RAM and memory change, CPU time, read/write I/O and thread count. It detects sharp load spikes, prolonged high load, and processes with continuously growing memory. Modes:

| Mode | Purpose |
|---|---|
| Snapshot | Single measurement |
| Monitor | Continuous observation |
| Diagnostic | Monitor plus the deterministic anomaly findings (`anomalies`) of the same series |
| Compare | Monitor plus a comparison of the first and the second half of the series (`periods`; needs four samples) |

Results are stored in a structured format so the agent can answer: does RAM grow continuously? does CPU periodically reach 100%? does an idle process keep consuming resources? does load grow after a particular event? which child process creates the main load?

**Limitation.** This is process-level monitoring, not hot-function detection. Without Frida, perf, eBPF or another suitable profiler, Reverse can reliably identify resource-intensive processes, but not specific functions inside them. Function-level data is reported only when produced by a real external profiler through a provider.

## Benchmark methodology (implemented, 0.2.0-beta.6)

The Advanced Benchmark Engine runs repeated commands without a shell, enforces a byte-accurate 1 MiB output cap per stream, records warm-ups and cold/warm labels, and reports mean, median, min/max, P95, standard deviation, MAD, outliers and confidence intervals. Per-run CPU time and peak RAM are sampled on Linux, macOS and Windows (Windows PowerShell sampling has higher overhead); binary size and environment fingerprints are recorded. Benchmark suites execute cases in round-robin order to reduce temporal bias.

A comparison reports the per-metric change between baseline and optimized runs (execution time, CPU time, peak RAM, binary size), the number of repetitions and which robust statistics were available. A reduced mean alone must not be declared statistically significant: measurement spread and experimental conditions have to be taken into account.

A baseline lifecycle supports the full cycle: create the initial profile, record the starting parameters, run the program in a controlled environment, measure resource use, store the results, re-measure after a change, compare the indicators, and produce a report of changes. Indicators compared may include execution time, CPU time, peak and average RAM, disk operations, network traffic, startup time, executable size and program-specific metrics.

Measurement quality rules:

- Same input data, comparable hardware, same launch conditions.
- Record the target version and the analyzer version.
- Repeat measurements, store the results, record the error margin, detect regressions.
- Profiling itself adds load; profiled and unprofiled runs must not be mixed unconditionally.
- Target indicators are defined per experiment.
- An improvement must not be claimed because only the report size, line count or the volume of data sent to the model changed.

### Environment fingerprint (implemented, 0.2.0-beta.6)

To judge comparability, each experiment records OS/version, CPU architecture/model/core count, RAM, Node.js and Reverse versions, target command/arguments, allowlisted non-secret environment and benchmark parameters. Load average, CPU governor and a thermal sensor are included where exposed; high load is flagged, not normalized. Android-specific device/API/ABI/ART/thermal fields remain planned for the Android adapters.

## Evidence model (implemented, 0.2.0-beta.6)

Evidence records are stored locally as atomic JSON files indexed by evidence ID through one shared atomic JSON writer. Regular-file hashes are streamed. Typed session evidence includes source, timestamp, measurement, confidence, limitations and a record hash.

The Advanced Evidence Engine makes evidence the central store of technical facts. Every technical conclusion must be bound to its source — a file, function, address, offset, process, observed event or measurement result — so the agent receives structured facts and not prose. Evidence types: Process, Memory, CPU, I/O, Binary, Benchmark and Validation Evidence. Each record has:

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

Research sessions append hash-chained events, evidence and hypotheses. The chain is tamper-evident at the entry level but is not signed; Merkle roots, detached signatures and third-party verification remain in patch I.

## Research cycle supported by the core (session ledger implemented, orchestration remains agent-led)

1. **Investigation** — the agent determines the application type, technologies, architecture, dependencies, source availability and available analysis tools.
2. **Diagnosis** — the core collects technical data; the agent identifies causes of excessive resource use, outdated components, inefficient algorithms, bottlenecks and modernization options.
3. **Hypotheses** — the agent proposes optimization options and estimates expected gain, complexity, risk, compatibility and required changes. They are recorded as `kind: hypothesis`, separate from evidence, with provenance, confidence and status. Promotion to `supported` requires same-session Validation or Benchmark evidence; refuted records are retained. They are recorded as `kind: hypothesis`, separate from evidence, with provenance/confidence/status; only same-session Validation or Benchmark evidence can promote one to `supported`, and refuted records remain in the ledger.
4. **Experiment** — the agent applies a chosen change (algorithm or source change, library replacement, dependency update, compiler parameters, runtime or configuration tuning, removal of components that are truly unnecessary), limited to what is technically possible for closed programs.
5. **Verification** — the core re-measures and checks behavior.
6. **Decision** — accept if performance improved and correctness is preserved; roll back if results worsened; investigate further if data is insufficient; reject if functionality is broken.
7. **Report** — what was found and changed and why, the metrics before and after, the improvement, residual risks and what can be optimized next.

The orchestration of this cycle belongs to the agent. Reverse provides the deterministic steps and does not ship its own workflow engine.

## Safety and process control

0.1.0 safe defaults and known gaps are described in [SECURITY.md](SECURITY.md). The core works locally and does not send target binaries to external models automatically; the external model must not receive unrestricted access to the local system.

### Implemented hardening (0.2.0-beta.6)

- Single-PID inspection fast path on Linux; process start-time identity tokens and identity rechecks before process-tree termination.
- Bounded child-process timeouts, tree termination, and byte-capped stdout/stderr.
- MCP command execution gate, command/cwd allowlists and child environment allowlist.
- AbortSignal and MCP cancellation for process sampling; test children are cleaned up.
- Preserve the original state of the program and allow recovery after a failed change; operations that may change the target, its configuration or the environment require separate permission.

### Operating modes (implemented)

```text
READ_ONLY
OBSERVE
CONTROLLED_EXECUTION
```

The default is `READ_ONLY`; new programs are studied in a mode that makes no changes to the original.

| Mode | Contract |
|---|---|
| `READ_ONLY` (default) | Static analysis and observation. Sampling works on any visible process; unknown ownership is reported as a limitation. No command execution. |
| `OBSERVE` | Everything `READ_ONLY` does, but `monitor_process` and `profile_process` sample only processes whose ownership is verified (same UID on Linux/macOS); a foreign process, or any process on Windows where ownership is unknown, is refused. No command execution. |
| `CONTROLLED_EXECUTION` | Command-running tools (after the allowlist and `cwd` root checks) and the scoped cgroup limiter. |

**Evidence from measurements.** Measurement tools accept an optional `session_id`; the Result is then stored in that research session as typed evidence (`src/evidence-collect.ts`): operation to type, source `reverse:<operation>#<result id>`, measurement from the findings, confidence from the result status and coverage (complete 1, incomplete 0.8, partial 0.4, other 0) and limitations from the result. Confidence is a quality grade, not a probability; a partial result can never promote a hypothesis. A further mode for applying changes would require explicit permission.

CPU and RAM control must not be presented as full system isolation. Real hard limits need separate OS mechanisms such as cgroups on Linux.

## Interface

### MCP tools

The existing tools, the implemented 0.2 process tools and `get_environment_fingerprint` are listed in [MCP.md](MCP.md). Existing tools must be preserved and backward compatibility must not be broken. Before adding a command, the existing contracts are checked and compatible ones reused, instead of creating duplicate commands.

The 0.2 MCP surface includes benchmark-suite creation/execution/comparison and research-session creation, event/evidence attachment, hypothesis recording/promotion and retrieval. The live tool contract is listed in [MCP.md](MCP.md).

Provider-backed dynamic surface (patches G–H): `trace_execution` (Frida attach sample under CONTROLLED_EXECUTION), `get_hotspots` (perf/sample when present), `get_process_io` (Linux). Full continuous profiling and Windows ETW sessions remain limited.

## Implemented in 0.3–0.4 (patches E–I)

- **Static analysis (E):** ELF/PE/Mach-O structure (sections, symbols, imports/exports, fat slices); lockfile dependency resolution; comment-aware source imports; APK/AAB ZIP inventory.
- **Providers (F):** in-process `AnalyzerProvider` registry, executable discovery, Ghidra/Rizin/JADX/Apktool/ghidra-similarity adapters; `run_provider` MCP tool.
- **Dynamic (G):** Frida attach sample (modules/threads/backtraces); GDB/LLDB batch attach or file inspect; both gated by `CONTROLLED_EXECUTION`.
- **Hotspots (H):** `get_hotspots` via perf/sample when available; `get_process_io` on Linux; profiler presence adapters for eBPF/ETW/Instruments/Valgrind/simpleperf.
- **Validation & integrity (I):** normalization options, fixture runner, change reports, hash-chain verify, optional HMAC session signatures.
- **CLI (0.4.1):** `binary`, `source`, `dependencies`, `android`, `hotspots`, `fixtures`, `analyzers`, `doctor`, `mcp`, process/benchmark commands.

Live MCP tool names are listed only in [MCP.md](MCP.md).

## Extension contract

Implement `AnalyzerProvider` from `src/providers-registry.ts`, declare concrete capabilities, check availability without side effects, and return structured observations with explicit coverage and limitations. Never report `available: true` unless the executable and required runtime are actually detected. Provider registration is in-process via `registerProvider` / `bootstrapExternalProviders`; adapters probe PATH and `GHIDRA_INSTALL_DIR` without fabricating results.

Providers are independent so that connecting Ghidra, Rizin, Frida, GDB, eBPF, ETW or Instruments does not require rewriting the core. The core must not depend exclusively on any single engine; engines are connected through the common interface. Execution-environment providers (patch N) use the same independence rule. Provider integrations implemented: Ghidra (headless import + postScript functions), Rizin, JADX, Apktool (F); Frida and GDB batch/attach under CONTROLLED_EXECUTION (G); perf/eBPF/ETW/Instruments/Valgrind/simpleperf detect adapters and Linux/macOS hotspots (H). GPU, network and execution-environment providers remain later (N/K). Android static inventory is in E; device-side profiling remains partial.

## Size guidance

The compact core is sized for planning, not as a measure of quality: roughly 20,000–30,000 lines of own TypeScript is the preferred target, up to about 50,000 where there is a justified technical need, compared with about 606,000 lines of production code in the original REA. Third-party engines are excluded from this count. Line count must never be a reason to remove necessary verification, security or evidence. The sensible approach is to build the minimum working core first, then measure its size and operating cost.

## Product direction

Reverse is intended to become a software performance research system, not merely an MCP wrapper over system commands, built on three strengths:

- **Deep Observation:** Reverse knows what happens inside the studied system at the level of the available system metrics.
- **Scientific Benchmarking:** Reverse objectively measures the effect of changes.
- **Verifiable Evidence:** Reverse can show where data came from and what conclusions rest on it.
