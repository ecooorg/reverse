# Roadmap

The design behind each item is described in [ARCHITECTURE.md](ARCHITECTURE.md).

## Delivery plan: eleven large patches to 1.0, plus patch L and the legacy track M–P after it

This plan closes **every** item listed in the release sections below (0.2, 0.3, 0.4 and Later), so that Reverse can analyze a program, reverse-engineer it, find the cause of excessive resource use, apply an optimization and prove the result. Each patch is a large, independently releasable unit: it ends in a merged, tested change set, not in a partially working branch. The patches are ordered by dependency; the release sections further down describe the same work item by item.

### How progress is measured

The capability verification workflow (`.github/workflows/capabilities.yml`, locally `npm run verify`) is the burn-down chart. Today it reports ✅ verified, 🚧 confirmed limitation, ⚠️ drift and ❌ failed for every check on Linux, macOS and Windows. A patch is **done** only when all of the following hold:

1. Every roadmap item it claims is implemented and has an automated test.
2. Every 🚧 check the patch targets is rewritten so it asserts the new behavior and shows ✅ on all three operating systems; new capabilities get new checks.
3. No ⚠️ drift remains for the area it touches, and no ❌ appears anywhere.
4. Existing MCP tools and CLI commands keep working (backward compatible); new tools are listed in [MCP.md](MCP.md) and the tool table matches `tools/list`.
5. [ARCHITECTURE.md](ARCHITECTURE.md) marks the section as implemented instead of planned.
6. Every row of the [approved audit backlog](#approved-audit-backlog-audit-1-approved-2026-11-09) assigned to the patch is closed, and the matching findings in [AUDIT.md](AUDIT.md) say `Status: closed in <version>`.

Version 1.0 is reached when patches A–K are done and the capability matrix contains no 🚧 for an in-scope capability.

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
| L | Agent integration and distribution | 1.x (after 1.0) | D, J |
| M | Compatibility diagnosis and legacy formats | 1.1–1.5 (waves) | E, F, G, J |
| N | Execution environments | 1.1–1.5 (waves) | G, M |
| O | Behavior capture and replay | 1.1–1.5 (waves) | I, N |
| P | Function equivalence lab and migration advisor | 1.1–1.5 (waves) | O, J |

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

### Patch B — Process intelligence and safety (0.2) — done

**Implementation status: done locally; cross-platform CI remains the release gate.**

Closes **Advanced Process Inspector**, **Time-Series Performance Profiler** and the implemented scope of **Process Safety & Resource Control**.

- [x] Process inventory and inspection: PID/PPID/tree, executable and arguments, uptime, threads, RSS/VMS, CPU metrics where exposed, Linux disk I/O and open FDs.
- [x] Bounded Snapshot, Monitor, Diagnostic and Compare sampling; persisted JSON series; average/peak CPU and RSS, memory change, I/O deltas and thread peaks.
- [x] Deterministic anomaly checks for sustained CPU, CPU spikes and growing RSS.
- [x] Start-time identity tokens and identity rechecks between samples to reduce PID-reuse contamination; UID ownership checks where the OS exposes them.
- [x] Caller cancellation via AbortSignal and MCP `notifications/cancelled`; partial results preserve samples collected before cancellation.
- [x] Explicit `READ_ONLY` / `OBSERVE` / `CONTROLLED_EXECUTION` safety contract. Linux cgroup v2 resource limits are available through the scoped `withProcessResourceLimits` API only when the caller explicitly confirms controlled execution and the hierarchy is delegated.
- [x] Added MCP `get_resource_control_status`; existing tool names and arguments remain compatible.

**Known platform limits (not hidden):** Windows process ownership is unknown; Windows/macOS metric parity is incomplete; hard resource quotas are only implemented for delegated Linux cgroup v2. This patch does not provide an OS sandbox, network isolation, memory maps, thread stacks, or function hotspots. Linux was exercised locally; macOS and Windows are delegated to the existing CI matrix and are not claimed as locally verified.

Capability checks added for identity/ownership, cancellation, resource-control reporting and the new MCP tool.

### Patch C — Measurement engine and baselines (0.2) — in progress, first part released as 0.2.0-beta.3

**Done in 0.2.0-beta.3:** command-execution gate, allowlisted child environment and tool annotations (F-01); statistics, warm-up runs, failed-run exclusion and the `improved`/`regressed`/`no_significant_change`/`insufficient_evidence` verdict (F-04, most of R-13); environment fingerprint, comparability warning and `get_environment_fingerprint`; `noUnusedParameters`, `.gitattributes`, Node 22+ (F-14, R-16).

**Still open in patch C (not claimed):** per-run CPU time and peak RAM, binary size, cold/warm classification, interleaved A/B runs, environment-noise detection, baseline manager and `create_benchmark_suite` / `run_benchmark_suite` / `compare_benchmarks`, F-12 (identity-checked group kill), F-16 (test split, partly started with `tests/benchmark-stats.test.ts`), F-17 and R-02 (`untrustedContent` wrapper, adversarial fixtures), R-03, R-05, R-06, R-17 and the hyperfine-compatible export of R-12. The checks *Benchmark — reports P95…* stays 🚧 until CPU time and peak RAM exist. Patch C is not done and the roadmap does not mark it so.

Closes **Advanced Benchmark Engine** (all items) and the baseline lifecycle.

- First item, before any new tool: the command-execution gate from [AUDIT.md](AUDIT.md) F-01 (command-running MCP tools off unless the operator sets `CONTROLLED_EXECUTION`, command allowlist, environment allowlist, tool annotations). This changes a documented default and is announced in the release notes.
- Audit items F-04 (no significance claim from means) and F-12 (identity-checked process-group kill).

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
- Hypothesis ledger (H-01, H-02): record type `hypothesis` beside Evidence (fields in [ARCHITECTURE.md](ARCHITECTURE.md), fact category 3), hash-chained with the session, promotion only by reference to Validation or Benchmark evidence, refuted hypotheses kept; MCP output marks `kind: "hypothesis"` and never mixes it into measured or static findings.
- Remaining MCP tool: `get_research_session` (the process-data tools shipped with patch B).
- Trials on the three reference applications (small, large with dependencies, closed binary) and verification of all twelve 0.2 acceptance criteria.

Capability checks that flip: the *Evidence* limitation (no session link, confidence or limitations fields) becomes ✅ except for signing, which belongs to patch I.

**Milestone 0.2 is released when B, C and D are done.**

### Patch E — Static analysis core (0.3)

Closes the first half of the 0.3 section: structural binary analysis and dependency analysis.

- ELF program/section headers and symbol tables; PE sections, imports and exports; Mach-O load commands and the fat-binary slice list.
- Function discovery and call graph where the format allows it without a disassembler engine; duplicated code and embedded libraries; unused components, only when it can be proven.
- Dependency analysis: lockfile parsers (npm, pip, Cargo, Go modules and similar), resolved versions, transitive graph, duplicate and outdated libraries, size and resource impact, compatibility and risk notes for suggested replacements.
- Source analysis moves from regular expressions to real parsing (an AST for the supported languages), so commented-out imports are no longer counted.
- Android static inventory: APK/AAB archive structure, ABI list, `classes*.dex`, native `.so` files, R8/ProGuard obfuscation indicators, binary manifest metadata, and Gradle dependency/lockfile parsing. Add a closed reference APK to Trials.

Capability checks that flip: *Binary — no sections, imports or symbols*, *Source — textual import counting* and *Dependencies — declared ranges only* become ✅.

### Patch F — Provider framework, Ghidra and Rizin (0.3)

Closes the second half of the 0.3 section and the **Plugin loading and provider lifecycle** item.

- Provider contract tests, executable discovery, availability checks without side effects, timeouts and clean shutdown, plugin loading and provider lifecycle.
- Opt-in Ghidra adapter (main deep-analysis engine) and Rizin adapter (alternative) with integration tests against real installations; results are normalized into the common `Result` envelope with explicit coverage and limitations.
- Opt-in JADX and Apktool static providers behind `AnalyzerProvider` for DEX/Smali/resources; Ghidra remains responsible for native `.so` libraries.
- Disassembly, decompilation and cross-reference data are available through the adapters, never faked when the tool is absent.
- `SimilarityProvider` contract on top of `AnalyzerProvider` (H-03): function and structure similarity with explicit confidence, coverage and limitations; first adapters Ghidra Function ID and BSim where installed. No corpus is bundled (H-06).

Capability checks that flip: *Providers — Ghidra and Rizin are labels only* becomes ✅ for these two; the remaining extension points keep their 🚧 until their own patch.

**Milestone 0.3 is released when E and F are done.**

### Patch G — Dynamic analysis: Frida and GDB (0.4)

Closes the dynamic-analysis part of the 0.4 section.

- Opt-in Frida and GDB adapters with integration tests: execution tracing, frequently called functions, repeated computation, component interaction and behavior under different loads.
- Tracing runs only under the `CONTROLLED_EXECUTION` mode from patch B, with limits and cancellation; the target's original state is preserved.
- `trace_execution` exposed through MCP.
- ADB transport for local USB/TCP devices and remote `frida-server`; Frida Java/ART method tracing (`Java.perform`) alongside native hooks.

Capability checks that flip: the Frida and GDB rows of *Providers* and the *Profiling — no function-level data* limitation (partly; completed by H).

### Patch H — Native profilers and hotspots (0.4, from "Later")

Closes **Function hotspots via real external profilers** and the **Disk/network I/O providers** items.

- Providers for `perf` and eBPF (Linux), ETW (Windows), Instruments (macOS) and Valgrind, each used only when really detected.
- Android profiling adapters for simpleperf, Perfetto and `dumpsys` CPU/RAM/battery metrics; include device/API/ABI/ART/thermal state in environment fingerprints.
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
- Controlled APK modification pipeline: Smali/resource/native-library edit on a copy → `apktool b` → `zipalign` → test-key `apksigner` → install via ADB → regression tests on a dedicated AVD/test device. Reset app state (`pm clear`) or restore an emulator snapshot before each benchmark.
- End-to-end trials: one scenario that finds a real performance problem and one that verifies an optimization with a measurable result, on each of the three reference applications.

### Patch K — Runtime analyzers and on-demand extensions (1.0)

Closes the remaining **Later** items.

- JavaScript/Electron, .NET and WebAssembly analyzers, delivered as providers on the framework from patch F.
- Optional HTTP MCP transport, only with a concrete deployment need and with authentication.
- Remaining extensions are added only when a real need appears, each with its own adapter, contracts, requirements and tests: Browser, GPU, Network, Database, Firmware, Container, Cloud, Compiler, Algorithm, Energy. Android is delivered through patches E–J.

**Version 1.0 is released when J and K are done.**

### Patch L — Agent integration and distribution (post-1.0, 1.x)

Closes audit tasks R-08 and R-18. It does not block 1.0.

- MCP prompts for the research cycle and MCP resources for evidence records and research sessions (`reverse://evidence/<id>`).
- Hypothesis discipline for agents (H-09): a prompt that packages target facts, era and similarity results with the `untrustedContent` wrapper (R-02), a skill-file section on proposing, testing and retiring hypotheses, and an evaluation harness that scores an agent on the reference corpus of H-08.
- `reverse setup`: registers the server in the supported agents after showing the diff, with a dry run and backups; installs the investigation skill file.
- Distribution: `npx` entry point, install scripts that check Node and print the MCP configuration, an optional single-file binary, `server.json` for MCP registries.

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
| Hypothesis ledger, similarity providers, authorization, oracles (Audit 3) | D, F, L, M, N, P (see the Audit 3 table) |
| Product goal for old and modern programs: compatibility diagnosis, environments, behavior preservation, migration | M–P by platform wave (see the legacy track) |

## Approved audit backlog (Audit 1, approved 2026-11-09)

Every finding (F-xx) and recommendation (R-xx) of [Audit 1](AUDIT.md) is an **approved project task**. Each belongs to exactly one patch (or is already closed). A patch is not done until its rows here are closed and the matching findings in [AUDIT.md](AUDIT.md) carry `Status: closed in <version>`. The capability suite checks that every ID of the audit appears in this table. New audits append their IDs here in the same way.

### Findings

| ID | Task | Patch / status |
|---|---|---|
| F-01 | Command-execution gate: command-running MCP tools refuse unless the operator selects `CONTROLLED_EXECUTION`; command allowlist and `cwd` root; environment allowlist for children; MCP tool annotations | closed in 0.2.0-beta.3 |
| F-02 | Correct median for even counts | closed in 0.2.0-beta.2 |
| F-03 | Output cap counted in bytes | closed in 0.2.0-beta.2 |
| F-04 | No `improved`/significance claim from means; exclude failed runs; minimum runs and confidence interval, else `insufficient_evidence` | closed in 0.2.0-beta.3 |
| F-05 | Validation never matches truncated output | closed in 0.2.0-beta.2; normalization rules in **I** |
| F-06 | (a)–(c) protocol errors | closed in 0.2.0-beta.2; (d) newer protocol revisions, `title`, `outputSchema`, annotations, SDK contract tests in **D** |
| F-07 | Page size and `CLK_TCK` read from the OS; one documented CPU-percent convention | **D** |
| F-08 | Single-PID fast path for inspection and sampling; cached `btime`, page size, tick rate | **D** |
| F-09 | File and size caps, `lstat`, `.wasm` | closed in 0.2.0-beta.2; real parser (AST) in **E** |
| F-10 | Dependency groups kept per group, `peerDependencies` | **E** |
| F-11 | Streamed hashing, atomic evidence writes, lookup by evidence id, one evidence code path | **D** |
| F-12 | Process-group kill with identity-checked sweep; real counts on Windows | **C** |
| F-13 | Mach-O CPU type and fat slice table, PE `e_lfanew` beyond the buffer reported as `partial` | **E** |
| F-14 | Remaining: `.gitattributes`, `noUnusedParameters` | closed in 0.2.0-beta.3 |
| F-15 | Documentation drift and the planned-tools check | closed in 0.2.0-beta.2 |
| F-16 | Split the test suite into flat `tests/<area>.test.ts` files with pure fixtures; statistics, `CappedBuffer`, MCP error paths, `/proc` parser | **C** (statistics, capture) and **D** (the rest) |
| F-17 | Threat model: agent as untrusted caller, prompt injection through target data | **C** |

### Recommendations

| ID | Task | Patch |
|---|---|---|
| R-01 | Mutation testing (Stryker) on pure modules | **D**, extended to each later patch's pure modules |
| R-02 | Threat model and prompt-injection hardening (`untrustedContent` wrapper, length caps, adversarial fixtures) | **C** |
| R-03 | Supply chain: npm provenance, pinned action SHAs, Dependabot, OpenSSF Scorecard, CycloneDX SBOM, `npm audit signatures`, `release-please` | **C** |
| R-04 | Fuzz and property tests (`fast-check`, devDependency) for parsers | **D** (process parsers), **E** (binary parsers) |
| R-05 | Static gates: linter and formatter, `knip`, `jscpd`, own-line size gate | **C** |
| R-06 | Reformat dense files, formatter check in the structure workflow | **C** start; every dense file reformatted before **J** |
| R-07 | Contract-first MCP: one definition generates `tools/list`, [MCP.md](MCP.md) and schemas; compact/full schema profile; structured error codes; pagination; size budgets | **D** |
| R-08 | MCP prompts and resources; `reverse setup` for Claude Code, Codex, Cursor, Gemini CLI with dry run and backups; investigation skill file | **L** |
| R-09 | `reverse doctor` | **D** |
| R-10 | Existing parsers and tools as opt-in providers (lief/goblin, objdump/readelf, rz-bin, capa, yara-x, diec, syft, osv-scanner, cargo-auditable, Go build info) | **E** (static), **F** (provider adapters), **H** (profiling) |
| R-11 | Hardening-flag report (PIE, NX, RELRO, canary, CFG, ASLR) | **E** |
| R-12 | Profile ingestion in standard formats (perf, pprof, `.cpuprofile`, Speedscope, Firefox Profiler); hyperfine-compatible benchmark export; eBPF via bpftrace | **H** (ingestion), **C** (export shape) |
| R-13 | Statistics: bootstrap intervals, Mann-Whitney with Hodges-Lehmann shift, effect size, MAD outliers, environment-noise detection, interleaved A/B runs by default, `insufficient_evidence` verdict | **C**: done in 0.2.0-beta.3 except environment-noise detection and interleaved A/B runs (open) |
| R-14 | Tamper-evident evidence: per-session hash chain, Merkle root, Ed25519 signature, `reverse export` / `reverse verify` | **I** |
| R-15 | Golden results and the three reference trials as manual CI jobs | **J** |
| R-16 | Node support window: drop Node 20, `engines` and matrix to 22 and 24 | closed in 0.2.0-beta.3 |
| R-17 | Node built-ins instead of code: `util.parseArgs`, `AbortSignal.timeout`, `fs.glob`, test coverage, `os.availableParallelism` | **C** |
| R-18 | Distribution: `npx` entry, install scripts that only check Node and print configuration, optional single binary, `server.json` for MCP registries | **L** |
| R-19 | Windows and macOS metric parity: persistent helpers instead of a fork per sample; `typeperf`/ETW and `libproc` providers | **D** (helpers), **H** (providers) |
| R-20 | Sandbox for executed targets under `CONTROLLED_EXECUTION` (bwrap/unshare, sandbox-exec, Job Objects/AppContainer or a container provider; no network by default; scratch directory; rlimits) | **G** |

### Goal gaps (Audit 2, approved 2026-11-09)

| ID | Task | Patch |
|---|---|---|
| G-01 | Compatibility diagnosis with evidence per cause | **M** |
| G-02 | Legacy formats and toolchains, by platform wave | **M** |
| G-03 | Execution-environment providers, snapshots, works/fails matrix | **N** |
| G-04 | Behavior capture and replay, coverage, normalization, old-versus-new comparison | **O** |
| G-05 | Function equivalence lab (emulation, differential and property tests) | **P** |
| G-06 | Migration strategy advisor | **P** |
| G-07 | Authorized-use and legal scope policy (first item of M) | **M** |
| G-08 | Platform-wave priority rule | **M–P** |
| G-09 | Target-platform and era support matrix in `CAPABILITIES.md` | **M** |
| G-10 | Behavior-preservation report with levels L0–L3 | **O**, **P** |

### Hypotheses, analogy and authorization (Audit 3, approved 2026-11-09)

| ID | Task | Patch |
|---|---|---|
| H-01 | Hypothesis ledger record type with provenance, confidence, status and the promotion rule | **D** |
| H-02 | Fact category 3 redefined; MCP marks `kind: "hypothesis"`; hypotheses never stored as evidence or mixed into measured or static findings | **D** |
| H-03 | `SimilarityProvider` contract; Ghidra Function ID and BSim adapters; no embedded corpus | **F** (contract), **M** (further adapters) |
| H-04 | Deterministic legacy detectors first; analogy tag only with confidence and deterministic basis | **M** |
| H-05 | Authorized-use policy: open-source software or full consent of developers and rights holders only | **M** (first item; text already in [SECURITY.md](SECURITY.md)) |
| H-06 | Corpus policy: hashes and signatures only, source and license per entry, no third-party binaries, local lookups | **F**, **M** |
| H-07 | Oracle rule: no synthesis or reconstruction above L0 without an oracle; provenance for generated code | **N** (oracle report), **P** |
| H-08 | Reference corpus with ground truth and matcher precision/recall/calibration metrics | **M** (per wave), **L** (agent evaluation) |
| H-09 | Agent prompts, skill section and evaluation harness for hypothesis discipline | **L** |
| H-10 | Authorization record stored in research sessions and reports | **M** |

---

## Legacy and compatibility track (patches M–P, after 1.0)

This track delivers the product goal stated in [ARCHITECTURE.md](ARCHITECTURE.md): analyze modern and old programs without source, find why they fail or run badly today, and support an improvement or full rework with the **highest verifiable preservation of behavior**. It starts after patch J, because it reuses the controlled change loop, evidence, providers and validation.

**Pattern-based archaeology.** Era and domain analogies speed up the search for candidates (compiler idioms, framework structures, file formats). Deterministic detection comes first and yields facts; analogy yields only hypotheses in the ledger (patch D); confirmation needs an oracle and the checks of patches N–P. Analogy does not lower the bar of the L0–L3 levels.

**Authorized use (H-05).** The track works only with open-source software or software whose developers and rights holders have given full consent, because its purpose is to help them restore old programs that no longer work. Details in [SECURITY.md](SECURITY.md).

### Platform waves (priority order set by the maintainer)

The track is delivered as **vertical slices**: every wave goes through M, N, O and P for one target family, ends in an end-to-end trial on closed reference programs of that family, and is released as its own minor version. A later wave does not start before the previous wave has its trial.

| Wave | Release | Target family | Examples of what must be recognized and handled |
|---|---|---|---|
| 1 | 1.1 | **Windows up to 2010** | DOS (MZ), Windows 3.x (NE/LE/LX), Win9x/NT/2000/XP/Vista/7 PE32, 16- and 32-bit installers, packers (UPX and similar), Visual Basic 6, Delphi/C++ Builder, MFC/ATL, COM/ActiveX, .NET 1.x–3.5, DirectDraw/Direct3D ≤ 9, Glide, 8.3 paths, ANSI code pages, UAC and Program Files/HKLM write assumptions |
| 2 | 1.2 | **Old Linux** | a.out and early ELF, libc5/old glibc, i386 and static binaries, old kernel interfaces (OSS audio, vsyscall), Motif/GTK1/Qt3, old package formats |
| 3 | 1.3 | **Old Mac** | classic Mac OS (68k and PEF/CFM, resource forks), Mac OS X PowerPC and early Intel Mach-O, universal and 32-bit binaries, Carbon, old bundle layouts |
| 4 | 1.4 | **Old Android** | Dalvik/early ART, old API levels, 32-bit ARM/x86/MIPS native libraries, deprecated permissions and APIs |
| 5 | 1.5 | **Newer generations** of waves 1–4, in the same order | Windows after 2010, newer Linux, newer Mac, newer Android: same tasks with the newer toolchains and environments |

Host and target are different things: the host is where Reverse runs, the target is the analyzed program. Static analysis is host-independent; running old targets uses the environments of patch N, which may be emulators or virtual machines on any host. The statement that Linux is the first fully supported *host* profiling environment stays true.

### Patch M — Compatibility diagnosis and legacy formats (1.1–1.5)

Depends on E, F and G. Closes G-01, G-02, G-07, G-09.

- [ ] First: authorized-use and legal scope policy in [SECURITY.md](SECURITY.md) and the agent rules (copy protection, dongles, licenses, user-supplied OS images are never bundled).
- [ ] Authorization record (H-05, H-10): each legacy research session requires a declared basis (open-source license, or written consent of the developers and rights holders), stored in the session and in every report; without it the legacy operations refuse. The record is a declaration, not a legal verification.
- [ ] Corpus policy (H-06): a similarity corpus holds only hashes and signatures of open-source or consented material, each with source and license; no third-party binaries are bundled.
- [ ] Target profile: required OS and era, CPU, bitness, ABI, runtime, installer and toolchain, with evidence for each field; an optional analogy tag with confidence and its deterministic basis.
- [ ] Deterministic detectors first (H-04): Delphi RTTI/DFM, MFC message maps, Visual Basic 6 headers, Borland and other toolchain markers, dBASE/.dbf and similar documented formats are reported as static facts. Only what they cannot explain becomes a hypothesis.
- [ ] Similarity adapters (H-03) feed hypotheses with confidence and provenance to the ledger.
- [ ] Reference corpus with ground truth (H-08): open-source programs built with period compilers; measures precision and recall of detectors and similarity matches and the calibration of confidence values. Hypothesis features do not ship until this exists for the wave.
- [ ] Compatibility diagnosis report: imported APIs and libraries against per-OS-version availability tables (data files, versioned, sourced); privilege and virtualization assumptions; CPU-speed-dependent timing; graphics, audio, driver and hardware dependencies; DPI and resolution; locale, path and registry/preference assumptions; address-space and date limits. Every cause is a finding with source, confidence and limitations; causes that need running the program are marked "needs N".
- [ ] Format and toolchain detectors for the wave being delivered (table above), built on providers (for example Detect It Easy, rz-bin, Ghidra loaders) rather than new parsers where possible.
- [ ] Target-platform and era matrix in [CAPABILITIES.md](CAPABILITIES.md); a check compares it with the registered detectors.
- Wave deliverables: M1 Windows ≤ 2010, M2 old Linux, M3 old Mac, M4 old Android, M5 newer generations.

### Patch N — Execution environments (1.1–1.5)

Depends on G and M. Closes G-03.

- [ ] `ExecutionEnvironment` provider contract: detect, prepare, snapshot, restore, run with limits, collect traces, shut down; availability is reported only when the emulator or VM is really present.
- [ ] Adapters by wave: Wine and Windows VMs (QEMU, VirtualBox), DOSBox-class and 86Box-class emulators; old Linux userlands in containers or VMs; classic-Mac and PowerPC emulators; old-API Android emulator images; newer environments for wave 5.
- [ ] Environment images are supplied by the user (licensing); Reverse records their hashes and configuration in the environment fingerprint.
- [ ] Run the same target in several environments and produce a **works/fails matrix** with the first observable failure in each (missing library, refused system call, crash address, timing symptom).
- [ ] Oracle availability (H-07): each environment reports whether the original can be executed there, so later patches know which functions have an oracle.
- [ ] System-call and API tracing per environment (Wine relay, strace/ltrace, Windows API tracing, ADB/logcat), through providers, under `CONTROLLED_EXECUTION`.

### Patch O — Behavior capture and replay (1.1–1.5)

Depends on I and N. Closes G-04 and, with P, G-10.

- [ ] Behavior snapshot artifact: inputs, standard streams, files created or changed, registry/preferences, network exchanges, window and UI events (screenshots as hashes, accessibility trees where available), data files written and read.
- [ ] Control of nondeterminism: fixed time, random seed, locale, window size, scripted input (AutoIt, UI Automation, xdotool, ADB input as providers).
- [ ] Record and deterministic replay of scenarios; scenario corpus stored as fixtures.
- [ ] Code coverage of the original during the scenarios (DynamoRIO/drcov, Frida Stalker, emulator tracing, as providers) so the agent sees which parts were never exercised.
- [ ] Normalization rules and old-versus-new comparison, including programs whose results are visual or file-based.
- [ ] Behavior-preservation report, levels L0–L2 (definitions in [ARCHITECTURE.md](ARCHITECTURE.md)).

### Patch P — Function equivalence lab and migration advisor (1.1–1.5)

Depends on O and J. Closes G-05, G-06 and the L3 level of G-10.

- [ ] Equivalence lab: run the original function (emulation with Unicorn/Qiling-class providers, or in the original environment) and the replacement on the same large generated and recorded input sets; differential, property and fuzz tests; mismatch minimization.
- [ ] Candidate synthesis (H-07): an agent-designed replacement of a function, including one based on behavioral analogies, is accepted for validation only when an oracle exists (original function in emulation or its environment, or recorded data files such as samples of a documented file format). It then goes through the differential, property and fuzz tests above; the preservation level comes from those tests alone. Candidates without an oracle are marked `unverifiable`, capped at L0, and never presented as reconstruction. Every generated function carries a provenance record and must fit the license or consent of the target.
- [ ] Reconstruction checks: a function reconstructed from the binary is compiled and compared against the original bytes or behavior where the toolchain allows it.
- [ ] Migration strategy advisor: ranked options (configuration or compatibility layer, wrapper, emulation or VM packaging, minimal binary patch, recompilation from a reconstruction, full rewrite), each with expected gain, risk, effort, required permissions and the evidence it rests on; the agent decides, Reverse supplies the data and enforces the safety modes.
- [ ] Final report: what was found, why it fails today, the chosen strategy, the preservation level reached (L0–L3) with coverage and residual risk.
- [ ] Wave trials: each wave ends with two scenarios on closed reference programs: a program that does not run today and is made to run, and a program rewritten or repackaged with a measured preservation level.

**Version policy for the track.** 1.1 Windows ≤ 2010, 1.2 old Linux, 1.3 old Mac, 1.4 old Android, 1.5 newer generations. Patch L (agent integration and distribution) is independent of the track and may be released at any point after D and J.

---

## Release sections

Sequencing principle: do not start with Ghidra and do not try to implement every external analyzer at once. First strengthen Reverse's ability to investigate running programs, detect real performance problems and collect evidence, because the main job of Reverse is to help an AI agent find the causes of excessive resource use and objectively verify optimization results. Linux is the first fully supported profiling environment, with interfaces for Windows and macOS designed in from the start.

## 0.2.0-beta.3 — Patch C, part 1

- [x] Command-running MCP tools refuse unless `REVERSE_MODE=CONTROLLED_EXECUTION` and `REVERSE_COMMAND_ALLOWLIST` are set; optional `REVERSE_CWD_ROOT`; allowlisted child environment; tool annotations (F-01). **Breaking default**, announced here.
- [x] Benchmark statistics (P95, std-dev, MAD, outliers, 95% interval), `warmupRuns`, failed runs excluded; `compare_results` verdict by Mann-Whitney plus bootstrap, `insufficient_evidence` under 5 runs (F-04, R-13 in part).
- [x] Environment fingerprint, comparability warning, MCP tool `get_environment_fingerprint`.
- [x] `noUnusedParameters`, `.gitattributes`, Node 22 and 24 only (F-14, R-16). `improved` in `compare_results` is now `true` only for a statistically supported speedup.

## 0.2.0-beta.2 — hotfix from audit 1

- [x] Benchmark median is correct for even sample counts (F-02); captured output is capped in bytes, not characters (F-03).
- [x] `validate_changes` never matches truncated output; a clean mismatch is `completed` with `passed: false`, `partial` means the comparison could not be made in full (F-05).
- [x] MCP: parse errors answer `-32700`, a failing tool returns `isError: true`, unknown tools and missing names are `-32602` (F-06 a–c).
- [x] Source inventory: 2 MiB per-file read cap, exact 5000-file cap, `lstat`, `.wasm` no longer read as text (F-09 caps).
- [x] `noUnusedLocals` and `noImplicitReturns` enabled; unused symbols removed; stale planned-tool table fixed (F-14, F-15).

Everything else in [AUDIT.md](AUDIT.md) stays open and is assigned to patches C, D and E.

## 0.2.0-beta.1 — Patch B: Process intelligence and safety

- [x] OS-backed process inventory and inspection with available memory, CPU, I/O, thread and process-tree metrics.
- [x] Persisted time-series sampling, deterministic anomaly detection and process identity checks.
- [x] AbortSignal and MCP request cancellation.
- [x] Explicit operating modes and scoped Linux cgroup v2 resource limits (not a sandbox).
- [x] MCP process tools plus `get_resource_control_status`; backward-compatible existing tools.
- [x] Capability checks and updated safety / capability documentation.

The overall 0.2 milestone remains unreleased until patches C and D are complete. Windows/macOS metric parity and cross-platform CI are outstanding release gates.

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
- [x] PID, PPID and process tree; executable, launch arguments, uptime, thread count
- [x] RSS, virtual memory, CPU utilization and accumulated CPU time where exposed, disk I/O
- [x] Open file descriptors where available; child-process detection
- [x] Detection of processes consuming disproportionate resources
- [x] Observation over a given interval, not only a point-in-time snapshot
- [x] Linux `/proc` metrics with clear units and per-process CPU deltas
- [x] Windows CIM and macOS `ps` sampling adapters (metric parity remains limited)

**Time-Series Performance Profiler**
- [x] Sampling at a configured frequency: interval CPU, RSS/VMS, peak RAM and memory change, CPU time, read/write I/O, thread count where exposed
- [x] Modes: Snapshot, Monitor, Diagnostic, Compare
- [x] Detection of CPU spikes, sustained high load and continuously growing memory
- [x] Structured, persisted results
- [x] Reported as process-level monitoring, not as hot-function detection

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
- [x] PID existence and start-time identity checks; ownership verification where supported
- [x] Timeouts, capped stdout/stderr, child-process control, process-tree observation
- [x] Cancellation and cleanup, including safe removal of temporary cgroup directories
- [x] Modes `READ_ONLY` (default), `OBSERVE`, `CONTROLLED_EXECUTION`
- [x] Scoped Linux cgroup v2 CPU/RAM limits; no sandbox/isolation claim; Windows/macOS hard limits remain unsupported

**MCP interface**
- [x] `list_processes`, `monitor_process`, `get_process_metrics`, `get_process_tree`
- [x] `analyze_memory`, `analyze_cpu`, `analyze_io`, `detect_resource_anomalies`
- [ ] `create_benchmark_suite`, `run_benchmark_suite`, `compare_benchmarks`
- [ ] `get_environment_fingerprint`, `get_research_session`
- [ ] Existing MCP commands are preserved; backward compatibility is not broken

**Explicitly deferred from 0.2:** Ghidra and Rizin (0.3); Frida and GDB (0.4); eBPF, Windows ETW and macOS Instruments as separate platform providers later; Android implementation is scheduled across patches E–J. The independent-provider architecture is laid down now so these can be added without rewriting the core.

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
- [ ] Extensions added only when a real need appears, each with its own adapter, contracts, requirements and tests: Browser, GPU, Network, Database, Firmware, Container, Cloud, Compiler, Algorithm, Energy
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
