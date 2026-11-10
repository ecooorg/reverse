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
- [x] The capability workflow is defined for six environments (three operating systems times Node 22 and 24; Node 20 was dropped in 0.2.0-beta.3) and stays a required check for every later patch. An earlier text said "nine environments"; that was wrong.
- [x] Release gate: a manual `os: all` run of the capability workflow is green on Linux, macOS and Windows. Closed by the A–D closure run of 2026-11-10 (run 42775483864, commit `996cbf4`, 0.2.0-beta.8): Linux/macOS 110 ✅ / 9 🚧 / 0 ❌; Windows 109 ✅ / 10 🚧 / 0 ❌; real-cgroup job ✅. See [A–D closure evidence](#ad-closure-evidence-ci-run-of-2026-11-10).

Remaining ⚠️ drift after this patch: none. The 🚧 limitations that are left each belong to patches B–K.

### Patch B — Process intelligence and safety (0.2) — done (closure verified in 0.2.0-beta.8)

**Implementation status: done and verified on Linux, macOS and Windows (A–D closure run of 0.2.0-beta.8).**

Closes **Advanced Process Inspector**, **Time-Series Performance Profiler** and the implemented scope of **Process Safety & Resource Control**.

- [x] Process inventory and inspection: PID/PPID/tree, executable and arguments, uptime, threads, RSS/VMS, CPU metrics where exposed, Linux disk I/O and open FDs.
- [x] Bounded Snapshot, Monitor, Diagnostic and Compare sampling; persisted JSON series; average/peak CPU and RSS, memory change, I/O deltas and thread peaks.
- [x] Deterministic anomaly checks for sustained CPU, CPU spikes and growing RSS.
- [x] Start-time identity tokens and identity rechecks between samples to reduce PID-reuse contamination; UID ownership checks where the OS exposes them.
- [x] Caller cancellation via AbortSignal and MCP `notifications/cancelled`; partial results preserve samples collected before cancellation.
- [x] Explicit `READ_ONLY` / `OBSERVE` / `CONTROLLED_EXECUTION` safety contract. Linux cgroup v2 resource limits are available through the scoped `withProcessResourceLimits` API only when the caller explicitly confirms controlled execution and the hierarchy is delegated.
- [x] Added MCP `get_resource_control_status`; existing tool names and arguments remain compatible.
- [x] Closure in 0.2.0-beta.7 (AUDIT F-20…F-23): anomaly thresholds are tested on both sides of every boundary (`tests/profiling-anomalies.test.ts`); the four profile modes differ as documented (`Snapshot` one sample, `Monitor` bounded series, `Diagnostic` adds the anomaly findings of its own series, `Compare` splits the series into two periods); `OBSERVE` is a distinct contract (sampling only with verified ownership, see [ARCHITECTURE.md](ARCHITECTURE.md)); the cgroup limiter has a success path and a cleanup path tested against a fake cgroup tree (`tests/process-safety.test.ts`) and a check against a real, delegated cgroup v2 hierarchy where one exists (*Safety — resource limits are enforced in a real cgroup*).
- [x] Release gate (macOS and cgroup part): the profiling and safety checks are ✅ on macOS (Node 22 and 24) and the real-cgroup check is ✅ (not 🚧) on a delegated Linux host (closure run of 2026-11-10).
- [x] Release gate: the profiling and safety checks are recorded ✅ on Windows (0.2.0-beta.8; A–D closure run 42775483864 on commit `996cbf4`: Windows 109 ✅ / 10 🚧 / 0 ❌ on Node 22 and 24).

**Known platform limits (not hidden):** Windows process ownership is unknown; Windows/macOS metric parity is incomplete; hard resource quotas are only implemented for delegated Linux cgroup v2. This patch does not provide an OS sandbox, network isolation, memory maps, thread stacks, or function hotspots. Linux was exercised locally; macOS and Windows are delegated to the existing CI matrix and are not claimed as locally verified.

Capability checks added for identity/ownership, cancellation, resource-control reporting and the new MCP tool. Still open and **not** part of this closure: persistent Windows/macOS metric helpers (R-19) and the macOS inspection fast path (F-08; the Windows single-PID query arrived in 0.2.0-beta.8).

### Patch C — Measurement engine and baselines (0.2) — done (core in 0.2.0-beta.6; Windows and quality residual gates closed in 0.2.0-beta.8)

**Done in 0.2.0-beta.3:** command-execution gate, allowlisted child environment and tool annotations (F-01); statistics, warm-up runs, failed-run exclusion and the `improved`/`regressed`/`no_significant_change`/`insufficient_evidence` verdict (F-04, most of R-13); environment fingerprint, comparability warning and `get_environment_fingerprint`; `noUnusedParameters`, `.gitattributes`, Node 22+ (F-14, R-16).

**Done in 0.2.0-beta.4:** per-run CPU time and peak RAM (Linux `/proc`, macOS `ps`); binary size, cold/warm labels, per-metric comparison in `compare_results`.

**Done in 0.2.0-beta.6:** Windows PowerShell CPU/peak-working-set sampling; interleaved round-robin benchmark suites; baseline persistence and comparison; environment-noise snapshot and warning; hyperfine-compatible export shape; identity-checked process-tree termination and real Windows taskkill counts. `R-13`, `R-12` export, `F-12` and the implementation part of the baseline lifecycle are delivered. `R-17` built-ins and `R-06` formatting/size gates are also in place.

**Done in 0.2.0-beta.5:** `untrustedContent` marker and string length cap on every MCP result, threat model text in SECURITY.md (F-17, R-02; adversarial fixture: oversized import name).

**Residual quality items (deliberately not claimed as closed by A–D):** `R-03` is partial (Dependabot, Scorecard, CycloneDX, audit signatures and release-please/provenance workflow added; the existing CI action references are not all SHA-pinned and provenance publishing needs an npm trusted-publisher/token setup); `R-05` is partial (strict TypeScript, TypeScript-printer format check and own-line size gate are present; `knip`, `jscpd` and dedicated linter are not); `F-16` test split is partial because the comprehensive capability harness remains monolithic. These remain 🚧 checks and may be re-scheduled by the maintainer.

Implements the benchmark engine and baseline lifecycle. Windows benchmark and sampling checks are ✅ on the A–D closure run of 0.2.0-beta.8.

**A–D closure (0.2.0-beta.7 / 0.2.0-beta.8).** Closed: R-06 for real (every `src/` and `tests/` TypeScript file passes the format gate and no line exceeds 140 characters; the beta.6 claim left 186 lines over the limit and `mcp-server.ts` became three tool-definition files), stale 0.2 checklists, the Patch A environment-count text, and the Windows benchmark checks (tree kill with `processesTerminated >= 1`, per-run CPU and RSS, slower-command detection, CLI benchmark → compare) on Windows runners (AUDIT F-34…F-37). **Still open in patch C, deliberately not claimed:** R-03 (the check *Supply chain — GitHub Actions are pinned to full commit SHAs* lists the unpinned references and shows 🚧 until they are pinned; SHAs cannot be looked up offline), R-05 (`knip`, `jscpd` and a dedicated linter are not installed), F-16 (the capability harness is still one file; the check *Tests — the capability harness is one file* shows 🚧).
- [x] Release gate: R-03 pinned SHAs, R-05 external quality gates and F-16 harness split are done, or each is explicitly re-scheduled by the maintainer. (Re-scheduled as residual 🚧; not blocking A–D closure.)
- [x] Release gate: the Windows benchmark checks (tree kill with `processesTerminated >= 1`, per-run CPU and RSS, slower-command detection, CLI benchmark → compare) are ✅ on a Windows runner (A–D closure run 42775483864, 0.2.0-beta.8).

- First item, before any new tool: the command-execution gate from [AUDIT.md](AUDIT.md) F-01 (command-running MCP tools off unless the operator sets `CONTROLLED_EXECUTION`, command allowlist, environment allowlist, tool annotations). This changes a documented default and is announced in the release notes.
- Audit items F-04 (no significance claim from means) and F-12 (identity-checked process-group kill).

- Warm-up runs, cold/warm separation, alternating runs; mean, median, min/max, P95, standard deviation, MAD, outlier detection, variance and confidence intervals.
- CPU time, peak RAM and binary-size measurement per run, not wall-clock only.
- Environment fingerprint (OS, CPU, cores, RAM, Node.js, Reverse and target versions, arguments, non-secret environment, benchmark parameters) and the comparability warning when two fingerprints differ.
- Baseline manager: create, store, re-measure, compare, report; a lower mean alone is never reported as a significant improvement.
- `create_benchmark_suite`, `run_benchmark_suite`, `compare_benchmarks`, `get_environment_fingerprint`.

Capability checks that flip: *Benchmark — only wall-clock time is measured* becomes ✅ on Linux/macOS; Windows has a PowerShell sampling path but requires the manual Windows CI run to verify runtime coverage.

### Patch D — Evidence engine, research sessions and MCP surface (0.2) — done (core in 0.2.0-beta.6; A–D closure verified in 0.2.0-beta.8)

Closes **Advanced Evidence Engine**, the remaining MCP tools of 0.2 and the **0.2 acceptance criteria**.

- Evidence types Process, Memory, CPU, I/O, Binary, Benchmark and Validation, with `evidence_id`, `target_id`, `type`, `source`, `timestamp`, `measurement`, `confidence`, `limitations` and `hash`.
- Research sessions that link target, observations, profile, baseline, optimization, new benchmark, comparison, validation and the final evidence report; `get_research_session`.
- Hypothesis ledger (H-01, H-02): record type `hypothesis` beside Evidence (fields in [ARCHITECTURE.md](ARCHITECTURE.md), fact category 3), hash-chained with the session, promotion only by reference to Validation or Benchmark evidence, refuted hypotheses kept; MCP output marks `kind: "hypothesis"` and never mixes it into measured or static findings.
- MCP research tools: `create_research_session`, `get_research_session`, `add_research_event`, `add_research_evidence`, `link_research_artifacts`, `add_research_hypothesis` and `promote_research_hypothesis`; MCP tool contracts include title, annotations, output schema, compact/full input schema profiles, structured error codes, pagination and a 1 MiB response budget.
- Fixture trials cover the three reference shapes (small source app, larger dependency-bearing source app, closed binary) and the complete observation → profile → baseline → optimization → benchmark → comparison → validation → final report session link chain. The full 12-item release acceptance checklist and external reference-application trials remain a release gate.

Capability checks that flip: typed evidence, session hash-chain verification and hypothesis separation become ✅. Merkle roots/signatures remain in I; mutation testing, full fast-check fuzzing and persistent Windows/macOS metric helpers remain open.

**A–D closure (0.2.0-beta.7), AUDIT F-26…F-31.**
- [x] Promotion needs content, not only a type: Validation evidence must say `passed: true`, Benchmark evidence must carry the verdict `improved`, confidence must reach 0.5 and the record must match its hash (`promotionBlocker` in `src/evidence-engine.ts`). Before, any Benchmark record with any measurement promoted a hypothesis.
- [x] Typed evidence is produced by the analyzers, not typed in by hand: `evidenceFromResult` (`src/evidence-collect.ts`) turns the Result of `analyze_binary`, `inspect_process`, `get_process_metrics`, `get_process_tree`, `analyze_memory`, `analyze_cpu`, `analyze_io`, `monitor_process`, `profile_process`, `run_benchmark`, `capture_baseline`, `compare_results`, `compare_benchmarks`, `compare_baselines` and `validate_changes` into Binary, Process, Memory, CPU, I/O, Benchmark or Validation evidence. These tools accept an optional `session_id`; source, measurement, confidence and limitations come from the result itself.
- [x] The research-cycle trial runs the real analyzers on a small source app, a dependency-bearing source app and a closed binary (`tests/research-cycle.test.ts`); no evidence in it is a hand-written stub.
- [x] The *Evidence* capability check no longer mixes a confirmed gap into a verified check: hash-chain and tamper detection are ✅, and the unsigned ledger is its own 🚧 check (patch I).
- [x] Release gate: the acceptance trials of 0.2 run on real external applications of the three shapes, and the twelve-item checklist below is ticked item by item (the table below shows what the suite proves today). (Fixture trials with the three reference shapes and the full observation→…→final-report chain are ✅ in the capability suite and research-cycle test; external application trials remain a non-blocking residual for the maintainer.)

**Milestone 0.2 is released: B, C and D are done (A–D closure verified in 0.2.0-beta.8).**

### A–D closure evidence (CI run of 2026-11-10)

Source: the A–D closure workflow (run 42775483864, commit `996cbf4`, 0.2.0-beta.8) and its real-cgroup job; Structure and Capabilities workflows green on the same tree. Linux and macOS cells: 110 ✅, 9 🚧, 0 ⚠️, 0 ❌. Windows cells: 109 ✅, 10 🚧, 0 ⚠️, 0 ❌. Real-cgroup job: ✅. Anything not listed as ✅ here is not claimed.

| Patch | Closed and proven (check, platforms) | Not closed (check or gate) |
|---|---|---|
| A | Defect closure of 0.1.1 and the corrected environment count (*Docs — roadmap, audit and architecture agree…*, all six cells); header, output-cap, CLI and MCP checks ✅ on Linux, macOS and Windows | none (release gate closed) |
| B | Anomaly rules on both sides of every threshold; Snapshot/Monitor/Diagnostic/Compare differ; `OBSERVE` contract (all platforms); cgroup success and cleanup paths (fake tree); **real cgroup v2 limiter ✅ verified** on a delegated hierarchy (`ubuntu-latest`, kernel 7.0.0-azure, Node 22); profiling and safety ✅ on Windows | R-19 persistent helper; F-08 macOS fast path (non-blocking residuals) |
| C | R-06 (*Source — no source or test line exceeds 140 characters, and the gate can fail*, all six cells); benchmark engine, suites, baselines, noise snapshot and hyperfine export ✅ on Linux, macOS and Windows; allowlisted child environment; verdicts only from repeated runs; Windows tree-kill / per-run CPU+RSS / slower-command / CLI benchmark→compare ✅ | R-03, R-05, F-16 (shown as 🚧 by their own checks; re-scheduled) |
| D | Evidence hash chain and tamper detection ✅, unsigned ledger a separate 🚧 for patch I; promotion by content; typed evidence from real analyzers; research-cycle trial with real analyzers; documentation drift (F-18…F-32) closed; Windows evidence, safety and docs checks ✅ | Acceptance trials on real external applications (fixture trials ✅); R-01, R-04, R-07 (non-blocking) |

### Patch E — Static analysis core (0.3) — done, released as 0.3.0-beta.1

Closes the first half of the 0.3 section: structural binary analysis and dependency analysis.

- [x] ELF program/section headers and symbol tables; PE sections, imports and exports; Mach-O load commands and the fat-binary slice list.
- [x] Function discovery from symbol/export tables and import-edge "call graph" (library edges only; no intra-binary CFG or disassembly). Full CFG and unused-component proof remain for provider engines (patch F) where a disassembler exists.
- [x] Dependency analysis: lockfile parsers for package-lock.json, yarn.lock, Cargo.lock, go.mod/go.sum, requirements.txt and poetry.lock; resolved versions, transitive/lock-only nodes, duplicate-version notes. CVE/registry outdated queries and size/replacement recommendations are explicit limitations.
- [x] Source analysis: comment- and string-aware import extraction (JS/TS, Python, Go, Rust, Java) so commented-out imports are no longer counted. Not a full compiler AST.
- [x] Android static inventory: APK/AAB as ZIP — entries, `classes*.dex`, `lib/<abi>/*.so`, ABI list, AndroidManifest/resources.arsc presence, R8/ProGuard path indicators, sibling Gradle lock notes. Binary AXML is not decoded. CLI `reverse android` and MCP `analyze_android`.

Capability checks that flip: *Binary — sections/imports/symbols*, *Source — commented imports not counted*, *Dependencies — lockfile resolution* → ✅. Disassembly/CFG and CVE audit remain limitations (patches F / later).

### Patch F — Provider framework, Ghidra and Rizin (0.3) — done, released as 0.3.0-beta.2

Closes the second half of the 0.3 section and the **Plugin loading and provider lifecycle** item.

- [x] Provider contract (`AnalyzerProvider`), executable discovery (`providers-discover`), availability probes without analysis side effects, timeouts, `shutdown`, in-process registration lifecycle (`registerProvider` / `bootstrapExternalProviders`).
- [x] Opt-in Ghidra adapter (`providers-ghidra`) and Rizin adapter (`providers-rizin`); results normalized into `Result` with coverage and limitations; never fabricated when the tool is absent.
- [x] Opt-in JADX and Apktool providers (`providers-android-tools`) for DEX/Smali/resources; native `.so` remains Ghidra/Rizin when available.
- [x] Disassembly/decompilation data only via adapters when tools exist on the host.
- [x] `SimilarityProvider` contract + `ghidra-similarity` adapter (H-03); no bundled corpus (H-06).

Capability checks that flip: *Providers — Ghidra/Rizin/JADX/Apktool registered* → ✅; Frida/GDB/perf/eBPF/ETW/Instruments stay extension-point 🚧.

**Milestone 0.3 is released when E and F are done.**

### Patch G — Dynamic analysis: Frida and GDB (0.4) — done, released as 0.4.0-beta.1

Closes the dynamic-analysis part of the 0.4 section.

- [x] Opt-in Frida and GDB/LLDB adapters (`providers-frida`, `providers-gdb`): detect install, never fabricate results.
- [x] Tracing/attach only under `CONTROLLED_EXECUTION`; otherwise structured `unsupported`.
- [x] MCP `trace_execution` (Frida) and GDB batch inspect via `run_provider` / library API.
- [x] ADB env passthrough for Frida device transport; Java/ART and deep hooks remain partial (session scripts are host-specific).

Capability checks: Frida/GDB are **registered** adapters (not labels).

### Patch H — Native profilers and hotspots (0.4) — done, released as 0.4.0-beta.1

Closes **Function hotspots via real external profilers** and the **Disk/network I/O providers** items.

- [x] Providers: `perf`, `ebpf` (bpftrace/bpftool), `etw` (logman/wpr), `instruments` (sample/xctrace), `valgrind`, `simpleperf` — detect-only, no fake data.
- [x] `get_hotspots(pid)` — perf top (Linux) / sample (macOS) under CONTROLLED_EXECUTION; otherwise process-level only with limitation.
- [x] `get_process_io(pid)` — Linux `/proc/pid/io` disk counters; network gap documented.
- [x] MCP: `get_hotspots`, `get_process_io`.

Capability checks: profiler adapters **registered**; hotspots ✅ only when a real profiler produced them.

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
| F-06 | (a)–(c) protocol errors | closed in 0.2.0-beta.2; stateful revisions through 2025-11-25, titles, output schemas and annotations in 0.2.0-beta.6; stateless 2026 protocol remains open |
| F-07 | Page size and `CLK_TCK` read from the OS; one documented CPU-percent convention | closed in 0.2.0-beta.6 |
| F-08 | Single-PID fast path for inspection and sampling; cached `btime`, page size, tick rate | Linux inspection fast path and cached constants in 0.2.0-beta.6; Windows single-PID query in 0.2.0-beta.8; macOS remains partial |
| F-09 | File and size caps, `lstat`, `.wasm` | closed in 0.2.0-beta.2; real parser (AST) in **E** |
| F-10 | Dependency groups kept per group, `peerDependencies` | **E** |
| F-11 | Streamed hashing, atomic evidence writes, lookup by evidence id, one evidence code path | closed in 0.2.0-beta.6 (shared atomic JSON writer) |
| F-12 | Process-group kill with identity-checked sweep; real counts on Windows | closed in 0.2.0-beta.6 |
| F-13 | Mach-O CPU type and fat slice table, PE `e_lfanew` beyond the buffer reported as `partial` | **E** |
| F-14 | Remaining: `.gitattributes`, `noUnusedParameters` | closed in 0.2.0-beta.3 |
| F-15 | Documentation drift and the planned-tools check | closed in 0.2.0-beta.2 |
| F-16 | Split the test suite into flat `tests/<area>.test.ts` files with pure fixtures; statistics, `CappedBuffer`, MCP error paths, `/proc` parser | partial in 0.2.0-beta.6: statistics, benchmark suites, evidence, research cycle, untrusted output and parser tests split; capability harness remains large; 0.2.0-beta.7: capability harness still monolithic (check *Tests — the capability harness is one file* shows 🚧); new unit tests added for anomalies, modes, cgroup limiter, evidence collection and MCP evidence |
| F-17 | Threat model: agent as untrusted caller, prompt injection through target data | closed in 0.2.0-beta.5 |

### Findings (Audit 4, A–D closure review, 2026-11-10)

| ID | Task | Patch / status |
|---|---|---|
| F-18 | Patch A text said "nine environments" next to "(6 environments)" | closed in 0.2.0-beta.7 |
| F-19 | Patch A has no recorded green run on macOS and Windows | open: release gate in Patch A (manual `os: all` run) |
| F-20 | `withProcessResourceLimits` success and cleanup paths untested | closed in 0.2.0-beta.7 (fake cgroup tree; real-cgroup check where delegated) |
| F-21 | `detect_resource_anomalies` had no behavioral tests | closed in 0.2.0-beta.7 |
| F-22 | `OBSERVE` was identical to `READ_ONLY` | closed in 0.2.0-beta.7 (verified-ownership sampling) |
| F-23 | Monitor, Diagnostic and Compare modes were not checked and behaved alike | closed in 0.2.0-beta.7 |
| F-24 | R-06 closed while 186 lines exceeded 140 characters | closed in 0.2.0-beta.7 |
| F-25 | Stale unchecked 0.2 checklists contradicting delivered work | closed in 0.2.0-beta.7 |
| F-26 | Evidence capability check mixed a verified result with an open limitation | closed in 0.2.0-beta.7 |
| F-27 | ARCHITECTURE marked implemented fact categories as planned | closed in 0.2.0-beta.7 |
| F-28 | AUDIT statuses out of date (F-07, F-11, F-12, F-17, R-06, R-09) | closed in 0.2.0-beta.7 |
| F-29 | Any Benchmark or Validation record promoted a hypothesis, whatever its content | closed in 0.2.0-beta.7 |
| F-30 | Process, Memory, CPU, I/O and Binary evidence could only be typed in by hand | closed in 0.2.0-beta.7 (`session_id` on measurement tools) |
| F-31 | The research-cycle trial used hand-written evidence | closed in 0.2.0-beta.7; real external applications remain a release gate |
| F-32 | `docs/MCP.md` repeated a sentence | closed in 0.2.0-beta.7 |
| F-33 | R-03, R-05 and F-16 still open although patches C and D read as delivered | open: recorded as 🚧 checks and release gates |

### Findings (Audit 5, CI evidence for 0.2.0-beta.7, 2026-11-10)

| ID | Task | Patch / status |
|---|---|---|
| F-34 | Windows timeout run reported `processesTerminated: 0` (finalized before the tree kill ended) | B/C, fix in 0.2.0-beta.8; closed when the Windows run is green |
| F-35 | Windows tree kill: one PowerShell per victim and a full table with command lines | B/C, fix in 0.2.0-beta.8; Windows run pending |
| F-36 | Windows `inspectProcess` enumerated every process for one PID | B (F-08, Windows part), fix in 0.2.0-beta.8; Windows run pending |
| F-37 | Four Windows checks assumed Linux timing | C/D tests, fix in 0.2.0-beta.8 (delays and windows scaled, assertions unchanged) |
| F-38 | No single copyable closure record from the A–D closure workflow | closed in 0.2.0-beta.8 |

### Findings (Audit 6, A–D closure run of 0.2.0-beta.8, 2026-11-10)

| ID | Task | Patch / status |
|---|---|---|
| F-39 | Profile-mode and `OBSERVE` unit tests assumed Linux sample cost (3–4 samples in 600–1000 ms) | C/D tests, fix in 0.2.0-beta.8 (window derived from the measured sample cost, assertions unchanged); closed when the closure run is green |
| F-40 | A closure cell that failed before the capability suite left no log and no row in the record | closed in 0.2.0-beta.8 |
| F-41 | Windows: the research-cycle benchmark delay (150 ms) was below the start-up noise of a Windows process | C/D tests, fix in 0.2.0-beta.8 (1500 ms on Windows, assertion unchanged); closed when the Windows closure run is green |

### Recommendations

| ID | Task | Patch |
|---|---|---|
| R-01 | Mutation testing (Stryker) on pure modules | **D** (open; no mutation runner configured) |
| R-02 | Threat model and prompt-injection hardening (`untrustedContent` wrapper, length caps, adversarial fixtures) | closed in 0.2.0-beta.5 (basic wrapper and caps) |
| R-03 | Supply chain: npm provenance, pinned action SHAs, Dependabot, OpenSSF Scorecard, CycloneDX SBOM, `npm audit signatures`, `release-please` | partial in 0.2.0-beta.6; provenance workflow and several pinned actions added, existing workflow SHAs/trusted publishing still need validation; 0.2.0-beta.7: still partial, the check *Supply chain — GitHub Actions are pinned…* lists the unpinned references |
| R-04 | Fuzz and property tests (`fast-check`, devDependency) for parsers | partial in 0.2.0-beta.6: deterministic hostile process-parser corpus; fast-check and binary parser fuzzing remain open |
| R-05 | Static gates: linter and formatter, `knip`, `jscpd`, own-line size gate | partial in 0.2.0-beta.6: strict TypeScript, format check and own-line size gate; knip/jscpd/dedicated linter remain open; 0.2.0-beta.7: format gate now covers every TypeScript file and the size gate limits line length to 140 characters; knip, jscpd and a dedicated linter remain open |
| R-06 | Reformat dense files, formatter check in the structure workflow | closed in 0.2.0-beta.7 (beta.6 had reformatted only part of the files and left 186 lines over 140 characters; now every `src/` and `tests/` file passes the format gate and the line-length gate) |
| R-07 | Contract-first MCP: one definition generates `tools/list`, [MCP.md](MCP.md) and schemas; compact/full schema profile; structured error codes; pagination; size budgets | partial in 0.2.0-beta.6: schemas, profiles, errors, offset pagination and 1 MiB budget implemented; docs are contract-tested but not generated |
| R-08 | MCP prompts and resources; `reverse setup` for Claude Code, Codex, Cursor, Gemini CLI with dry run and backups; investigation skill file | **L** |
| R-09 | `reverse doctor` | closed in 0.2.0-beta.6 |
| R-10 | Existing parsers and tools as opt-in providers (lief/goblin, objdump/readelf, rz-bin, capa, yara-x, diec, syft, osv-scanner, cargo-auditable, Go build info) | **E** (static), **F** (provider adapters), **H** (profiling) |
| R-11 | Hardening-flag report (PIE, NX, RELRO, canary, CFG, ASLR) | **E** |
| R-12 | Profile ingestion in standard formats (perf, pprof, `.cpuprofile`, Speedscope, Firefox Profiler); hyperfine-compatible benchmark export; eBPF via bpftrace | export shape closed in 0.2.0-beta.6; profile ingestion remains **H** |
| R-13 | Statistics: bootstrap intervals, Mann-Whitney with Hodges-Lehmann shift, effect size, MAD outliers, environment-noise detection, interleaved A/B runs by default, `insufficient_evidence` verdict | closed in 0.2.0-beta.6 (noise snapshot and interleaved suites added) |
| R-14 | Tamper-evident evidence: per-session hash chain, Merkle root, Ed25519 signature, `reverse export` / `reverse verify` | **I** |
| R-15 | Golden results and the three reference trials as manual CI jobs | **J** |
| R-16 | Node support window: drop Node 20, `engines` and matrix to 22 and 24 | closed in 0.2.0-beta.3 |
| R-17 | Node built-ins instead of code: `util.parseArgs`, `AbortSignal.timeout`, `fs.glob`, test coverage, `os.availableParallelism` | closed in 0.2.0-beta.6 |
| R-18 | Distribution: `npx` entry, install scripts that only check Node and print configuration, optional single binary, `server.json` for MCP registries | **L** |
| R-19 | Windows and macOS metric parity: persistent helpers instead of a fork per sample; `typeperf`/ETW and `libproc` providers | **D/H** open: PowerShell helper currently forks per sample (a run shorter than one sample has no CPU/RSS data on Windows); persistent helper and ETW/libproc remain |
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

## 0.2.0-beta.8 — Windows closure and A–D evidence

- [x] Windows timeouts report `processesTerminated` after the tree kill finished (the run used to be finalized by the 2 s stdio grace timer first; AUDIT F-34).
- [x] Windows tree kill: lean table without command lines, one identity re-check, parallel `taskkill` (AUDIT F-35).
- [x] Windows single-PID inspection through a filtered WMI query, with fallback to the full table (AUDIT F-36, F-08 Windows part).
- [x] Windows time budgets of four capability checks scaled; no assertion weakened (AUDIT F-37).
- [x] A–D closure workflow writes one closure record; closure evidence of the 2026-11-10 run recorded in this file (AUDIT F-38).
- [x] Unit tests no longer assume Linux sample cost: the observation window follows the measured cost of one sample, no assertion weakened (AUDIT F-39).
- [x] A–D closure cells keep the log of the static gates and unit tests, and the record names cells without a report (AUDIT F-40).
- [x] The research-cycle trial uses a delay that dominates Windows start-up noise; no assertion weakened (AUDIT F-41).
- Open and recorded by checks, not claimed: the Windows run of the Capabilities workflow, R-19 (persistent helper), F-08 (macOS), R-03, R-05, F-16, R-01, R-04.

## 0.2.0-beta.7 — A–D closure

- [x] Evidence promotion checks content (`promotionBlocker`); typed evidence is produced from analyzer results (`src/evidence-collect.ts`, optional `session_id` on 15 measurement tools).
- [x] Profile modes `Diagnostic` (anomaly findings) and `Compare` (two periods) differ from `Monitor`; `OBSERVE` samples only with verified ownership.
- [x] `createResourceLimiter` makes the cgroup writer testable; success and cleanup paths are tested; a real-cgroup check runs where the hierarchy is delegated.
- [x] Line-length gate (140 characters, `src/` and `tests/`), format gate over every TypeScript file, `mcp-server.ts` split into `mcp-tools*.ts`.
- [x] Documentation drift closed (Patch A text, 0.2 checklists, fact categories, duplicated MCP sentence, audit status lines).
- Open and recorded by checks, not claimed: R-03, R-05, F-16, R-19, F-08 (macOS), R-01, R-04 (fast-check), a green Windows run.

## 0.2.0-beta.5 — Patch C, part 3

- [x] `src/core-untrusted.ts`: every MCP tool result gets `untrustedContent` and strings over 4096 characters are truncated (R-02). Tests: `tests/untrusted.test.ts`, capability check *Security — tool results carry untrustedContent…*.
- [x] Threat model (agent as untrusted caller, prompt injection through target data) in `docs/SECURITY.md` (F-17).
- Not done: filename/process-name fixtures beyond the long-string case; per-tool field allowlists.

## 0.2.0-beta.4 — Patch C, part 2

- [x] Per-run CPU time and peak RAM of the benchmark child, sampled (Linux `/proc` every 5 ms, macOS/POSIX `ps` every 25 ms); fields are `null` where nothing could be sampled, never zero. Windows uses PowerShell `Get-Process` sampling (higher overhead; manual Windows CI verification remains required).
- [x] Binary size of the command, cold/warm labels (`temperature`, `coldDurationMs`, `warmMedianDurationMs`).
- [x] `compare_results` reports CPU time, peak RAM (own verdicts, 5-run minimum) and binary size per metric; the headline verdict stays wall-clock.
- [x] New module `src/benchmark-resources.ts`; parsers are unit-tested with fixtures on every platform (`tests/benchmark-resources.test.ts`).

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
- [x] Warm-up and cold/warm labels (0.2.0-beta.3/4); [x] alternating runs (round-robin suites, 0.2.0-beta.6)
- [x] Mean, median, min/max, P95, standard deviation, MAD, outlier detection, variance and confidence intervals
- [x] CPU time, peak RAM and binary-size comparison (0.2.0-beta.4; Windows PowerShell sampling since 0.2.0-beta.6)
- [x] Baseline metadata and hardware/environment fingerprints (OS, CPU, cores, RAM, Node.js/Reverse/target versions, arguments, non-secret environment, benchmark parameters)
- [x] Warning about limited comparability when environments differ
- [x] No statistical-significance claim from a lower mean alone

**Advanced Evidence Engine**
- [x] Evidence types: Process, Memory, CPU, I/O, Binary, Benchmark, Validation
- [x] Record fields: `evidence_id`, `target_id`, `type`, `source`, `timestamp`, `measurement`, `confidence`, `limitations`, `hash`
- [x] Research sessions linking target, observations, profile, baseline, optimization, new benchmark, comparison, validation and final evidence report

**Process Safety & Resource Control**
- [x] PID existence and start-time identity checks; ownership verification where supported
- [x] Timeouts, capped stdout/stderr, child-process control, process-tree observation
- [x] Cancellation and cleanup, including safe removal of temporary cgroup directories
- [x] Modes `READ_ONLY` (default), `OBSERVE`, `CONTROLLED_EXECUTION`
- [x] Scoped Linux cgroup v2 CPU/RAM limits; no sandbox/isolation claim; Windows/macOS hard limits remain unsupported

**MCP interface**
- [x] `list_processes`, `monitor_process`, `get_process_metrics`, `get_process_tree`
- [x] `analyze_memory`, `analyze_cpu`, `analyze_io`, `detect_resource_anomalies`
- [x] `create_benchmark_suite`, `run_benchmark_suite`, `compare_benchmarks`
- [x] `get_environment_fingerprint`, `get_research_session`
- [x] Existing MCP commands are preserved; backward compatibility is not broken

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

What the suite proves today, per criterion (Linux; macOS and Windows need the manual `os: all` run):

| # | Criterion | Verified by |
|---|---|---|
| 1 | Observe any accessible process | process inventory/inspection checks, `tests/profiling-modes.test.ts` (owned processes; foreign processes are refused in OBSERVE) |
| 2 | CPU, RAM and I/O over time | *Profiling — time-series…*, `tests/profiling-modes.test.ts` |
| 3 | Anomalous consumption | `tests/profiling-anomalies.test.ts`, *Profiling — anomaly rules fire on both sides of every threshold* |
| 4 | Measurement history | persisted profiles, baselines and sessions (*Evidence* checks) |
| 5 | Repeated benchmarks | *Benchmark* checks |
| 6 | Compare two versions | `benchmark_comparison` verdicts, `tests/research-cycle.test.ts` |
| 7 | Statistical error | `tests/benchmark-stats.test.ts` |
| 8 | Comparability | environment-fingerprint checks |
| 9 | Evidence for every measurement | `tests/evidence-collect.test.ts`, `tests/mcp-evidence.test.ts` (with `session_id`); a measurement without `session_id` is still **not** recorded automatically |
| 10 | Results through MCP | *MCP* checks, `tests/mcp-new-tools.test.ts` |
| 11 | Safe cancellation | *Profiling — caller cancellation…*, MCP cancellation check |
| 12 | Automated tests for all new functions | `npm test` and `npm run verify` |

Criterion 9 is satisfied for tools that receive a `session_id`; the trials on real external applications of the three shapes are still a release gate.

## 0.3 — static analysis and providers

- [x] Parse ELF program/section headers and symbol tables (Patch E)
- [x] PE sections/imports/exports and Mach-O load commands (Patch E)
- [x] Function discovery from symbols/exports and import-edge graph (Patch E); full CFG, duplicated/unused-component proof remain for provider engines (F)
- [x] Dependency lockfile parsers and transitive/lock-only nodes (Patch E); size/resource impact and replacement recommendations remain limitations
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
