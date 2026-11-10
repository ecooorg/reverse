# Audit log

This file is permanent. **New audits are added at the top** (newest first); older audits are never edited except to mark a finding as closed (`Status: closed in <version>, <patch>`). Each audit lists findings with an ID, severity, evidence and a recommended fix, then improvement proposals. Findings that are accepted are copied into [ROADMAP.md](ROADMAP.md) under the patch named in the "Patch" column; this file stays the record of *why*.

IDs: **F** finding (defect or drift), **R** recommendation, **G** goal gap, **H** hypothesis and authorization gap. Severity: **High** = wrong results or a safety/honesty violation of [AGENTS.md](../AGENTS.md); **Medium** = incorrect or fragile behavior with limited blast radius; **Low** = hygiene, docs, polish.

---

## Audit 6 — 2026-11-10 — A–D closure run of 0.2.0-beta.8 (red cells without a report)

**Scope.** The A–D closure run of 0.2.0-beta.8 (run 42770029602, commit `58ab0d0`) was read against the workflows and the unit tests. Structure and Capabilities were green; the closure workflow was red.

**What the logs prove.** Every report that exists is clean: Linux (Node 22 and 24) and macOS (Node 22) show 110 ✅, 9 🚧, 0 ⚠️, 0 ❌, and the real-cgroup job is ✅. The supplied logs hold **no** report for Windows and for macOS on Node 24: those cells ended before the capability suite, so nothing says why they were red. The difference to the Capabilities workflow is the cause of the red: Capabilities runs the unit tests and the built-target structure check on Linux only, the closure workflow runs them on every operating system, so these tests had never run on macOS or Windows.

**Method of this audit.** Linux sandbox, Node 22. The old unit tests were run against a build whose `inspectProcess` was slowed by 400 ms (the cost of a `ps` or PowerShell sample): 4 of 9 tests of `profiling-modes` and `mcp-evidence` failed. With the patched tests all 66 unit tests pass at normal speed and at the slowed speed. **Not run:** any Windows or macOS job. The root cause is established by that reproduction, not by the missing logs.

| ID | Sev | Area | Finding | Status |
|---|---|---|---|---|
| F-39 | Medium | Tests | Monitor, Diagnostic and Compare in `tests/profiling-modes.test.ts` and the `OBSERVE` Compare check in `tests/mcp-evidence.test.ts` asserted 3–4 samples inside fixed 600–1000 ms windows; with a sample cost of 0.1–1.5 s (`ps`, PowerShell) they cannot hold. AGENTS.md §7 forbids tests that depend on timing luck | Status: fix in 0.2.0-beta.8, A–D closure (`tests/sampling-window.ts` derives the window from the measured cost of one sample; no assertion weakened); closed when the closure run is green on every cell |
| F-40 | Low | CI | A closure cell that failed in the static gates or the unit tests wrote no JSON report and no log, and the closure record silently omitted it | Status: closed in 0.2.0-beta.8, A–D closure (both steps keep a log in the cell's artifact; the record names every cell without a report) |

**Still open, deliberately.** Whether Windows and macOS on Node 24 are green is decided by the next closure run. Unit tests still run on Linux only in the Capabilities workflow; running them elsewhere stays a closure-only gate.

Tasks F-39 and F-40 are tracked in the [approved audit backlog](ROADMAP.md#approved-audit-backlog-audit-1-approved-2026-11-09). Audit 5 follows.

---

## Audit 5 — 2026-11-10 — CI evidence for 0.2.0-beta.7 (A–D closure, Windows)

**Scope.** The Capabilities run (`workflow_dispatch`, `os: all`, commit `82c2182`) and the A–D closure run of 0.2.0-beta.7 were read against the source. Nothing new was reviewed; the question was why the suite was red and what the logs prove.

**What the logs prove.** Linux and macOS, Node 22 and 24: 110 ✅, 9 🚧, 0 ⚠️, 0 ❌ in each of the four cells. The A–D checks are ✅ in all four: hash-chained sessions, promotion by content, typed evidence from real analyzers, anomaly rules on both sides of each threshold, the four profile modes, `OBSERVE`, the 140-character gate, documentation agreement. The A–D closure workflow ran on Linux (Node 22, 24) and macOS (Node 24) with the same totals. The real-cgroup check ended ✅ (verified, not 🚧) on a delegated cgroup v2 hierarchy (`ubuntu-latest`, kernel 7.0.0-azure, Node 22.23.4). The package check passed on Linux and Windows. Windows: 105 ✅ / 3 ❌ (Node 22) and 104 ✅ / 5 ❌ (Node 24); every ❌ is a Windows runtime problem and none touches the evidence, safety or documentation checks.

**Method of this audit.** Linux sandbox, Node 22. Build, unit tests, format, size and structure gates and the capability suite ran locally. **Not run:** any Windows or macOS code path; the changes for Windows below are verified by fixtures and by reading the logs only.

| ID | Sev | Area | Finding | Status |
|---|---|---|---|---|
| F-34 | **High** | Benchmark | On Windows a timed-out run was reported with `processesTerminated: 0`: the run was finalized by the 2 s stdio grace timer while the tree kill (PowerShell snapshot, one more PowerShell call per victim, `taskkill`) was still running, so the count was never stored | Status: fix in 0.2.0-beta.8, A–D closure; closed when the Windows run of the Capabilities workflow is green |
| F-35 | Medium | Process | A Windows tree kill started one PowerShell per victim to re-check identity and read the full process table with command lines; seconds per kill | Status: fix in 0.2.0-beta.8, A–D closure (lean `WINDOWS_TREE_SCRIPT`, one re-check, parallel `taskkill`); Windows run pending |
| F-36 | Medium | Profiling | `inspectProcess` on Windows enumerated every process for one PID (F-08, Windows part), so Monitor and Compare got under one sample per second | Status: fix in 0.2.0-beta.8, A–D closure (filtered single-PID WMI query with fallback); macOS fast path stays open; Windows run pending |
| F-37 | Medium | Tests | Four Windows checks assumed Linux timing (a 300 ms delay against a start-up of several hundred ms, a 400 ms child against a PowerShell sample of 0.5–1.5 s, 700 ms and 1000 ms profile windows); AGENTS.md §7 forbids tests that depend on timing luck | Status: fix in 0.2.0-beta.8, A–D closure (the injected delay and the observation window are scaled on Windows; no assertion was weakened) |
| F-38 | Low | CI | The A–D closure workflow printed one result per cell but no single record that could be copied into the documents | Status: closed in 0.2.0-beta.8, A–D closure (`record` job) |

**Still open, deliberately.** R-19: on Windows every sample still starts a PowerShell. A child that ends before the first sample has no CPU or RSS data (`resources.available: false`, reason recorded); the capability check uses a child that outlives a sample. A persistent helper is the fix and is not part of this change because it cannot be verified without a Windows runner.

Tasks F-34…F-38 are tracked in the [approved audit backlog](ROADMAP.md#approved-audit-backlog-audit-1-approved-2026-11-09). Audit 4 follows.

---

## Audit 4 — 2026-11-10 — closure review of patches A–D (0.2.0-beta.6)

**Scope.** Not a new feature review. The question was whether patches A, B, C and D can be called closed under [ROADMAP.md](ROADMAP.md) "How progress is measured". The archive `reverse-0.2.0-beta.6-green` and the closure notes supplied with it were compared with the source, the tests, the roadmap and this file.

**Method and what was actually run.** Linux sandbox, Node 22, TypeScript 6 (the repository pins TypeScript 7 for building and 5.9 for the format printer; those were not available offline). Build, `tsc` for the tests, the unit tests, the format gate and the size gate ran locally; before the changes 31 unit tests passed. **Not run:** `npm ci` (no network), the capability suite on macOS and Windows, a real delegated cgroup v2 hierarchy (the sandbox is cgroup v1), the packaging check.

**Verdict.** The code was in good shape, the closure claims were not. Patch A had no recorded cross-platform run and an inconsistent environment count; patch B tested neither the cgroup success path nor the anomaly thresholds, and `OBSERVE` and the profile modes were labels; patch C declared R-06 closed with 186 lines over 140 characters; patch D allowed any Benchmark or Validation record, whatever it contained, to promote a hypothesis, and typed evidence could only be entered by hand. These are fixed or recorded as explicit gates in 0.2.0-beta.7. Items that cannot be closed from this environment stay open and are measured by checks that show 🚧 (R-03, F-16) or by release gates in the roadmap (macOS/Windows runs, external reference applications).

| ID | Sev | Area | Finding | Status |
|---|---|---|---|---|
| F-18 | Low | Docs | Patch A said "nine environments" next to "(6 environments)" | Status: closed in 0.2.0-beta.7, A–D closure |
| F-19 | Medium | CI | No recorded green run of the capability workflow on macOS and Windows | open: release gate in Patch A |
| F-20 | **High** | Safety | `withProcessResourceLimits`: only refusals were tested; moving the process, writing limits and cleanup were not | Status: closed in 0.2.0-beta.7, A–D closure |
| F-21 | Medium | Profiling | `detect_resource_anomalies` thresholds had no behavioral tests | Status: closed in 0.2.0-beta.7, A–D closure |
| F-22 | Medium | Safety | `OBSERVE` behaved exactly like `READ_ONLY` | Status: closed in 0.2.0-beta.7, A–D closure |
| F-23 | Medium | Profiling | Diagnostic and Compare behaved like Monitor and no check covered the modes | Status: closed in 0.2.0-beta.7, A–D closure |
| F-24 | Medium | Quality | R-06 closed while 186 lines exceeded 140 characters; the size gate counted lines, not their length | Status: closed in 0.2.0-beta.7, A–D closure |
| F-25 | Low | Docs | Unchecked 0.2 checklists contradicted delivered work | Status: closed in 0.2.0-beta.7, A–D closure |
| F-26 | Medium | Tests | The Evidence check reported a confirmed gap inside a verified check | Status: closed in 0.2.0-beta.7, A–D closure |
| F-27 | Low | Docs | Implemented fact categories were marked planned | Status: closed in 0.2.0-beta.7, A–D closure |
| F-28 | Low | Docs | Audit statuses for F-07, F-11, F-12, F-17, R-06 and R-09 were out of date or outside the audit list | Status: closed in 0.2.0-beta.7, A–D closure |
| F-29 | **High** | Evidence | A Benchmark record with any measurement promoted a hypothesis; hash and confidence were ignored | Status: closed in 0.2.0-beta.7, A–D closure |
| F-30 | Medium | Evidence | Process, Memory, CPU, I/O and Binary evidence existed only as a type name | Status: closed in 0.2.0-beta.7, A–D closure |
| F-31 | Medium | Tests | The research-cycle trial used hand-written evidence | Status: closed in 0.2.0-beta.7, A–D closure (real analyzers on fixtures; external applications remain a release gate) |
| F-32 | Low | Docs | `docs/MCP.md` repeated a sentence | Status: closed in 0.2.0-beta.7, A–D closure |
| F-33 | Medium | Process | R-03, R-05 and F-16 are open although patches C and D read as delivered | open: shown as 🚧 checks and release gates |

**Behavior changes users can notice.** A hypothesis can no longer be promoted by arbitrary Benchmark or Validation evidence. `REVERSE_MODE=OBSERVE` now refuses sampling of processes whose ownership is unverified. `Diagnostic` and `Compare` results carry extra fields. `withProcessResourceLimits` is now created by `createResourceLimiter` (same signature and behavior). Measurement tools accept an optional `session_id`.

**Not covered.** Windows and macOS runtime behavior; real cgroup enforcement (the check shows 🚧 without a delegated hierarchy); mutation testing; fast-check fuzzing; the TypeScript 5.9 printer on the new files.

Tasks F-18…F-33 are tracked in the [approved audit backlog](ROADMAP.md#approved-audit-backlog-audit-1-approved-2026-11-09). Audit 3 follows.

---

## Audit 3 — 2026-11-09 — AI hypothesis engine and pattern-based archaeology proposals (design audit)

**Scope.** Not a code review. Two proposal documents (analogy-based reverse engineering, a "Hypothesis Core" module and patches to ARCHITECTURE.md and ROADMAP.md) were compared with the project principles in [ARCHITECTURE.md](ARCHITECTURE.md), the roadmap dependencies and [AGENTS.md](../AGENTS.md). Source code was not run or changed.

**Verdict.** The idea is accepted: analogies are a valid source of hypotheses. The form is changed. A separate `HYPOTHESIS CORE` module with its own signature database and a prompt builder conflicts with the rules against duplicated AI logic and embedded knowledge bases, so it is replaced by a hypothesis ledger (a record type beside Evidence) and similarity providers. Rejected or reworded: a "fact category 5" next to the existing category 3; the phrase shifting the barrier to "semantic equivalence"; synthesis of unreadable code without an oracle; "training the agent" inside Reverse; analogy claims for things that parsers can establish as facts. The maintainer added the authorized-use rule: open-source software or full consent of developers and rights holders only.

**Approval.** Approved by the maintainer on 2026-11-09.

| ID | Sev | Gap | Task | Patch |
|---|---|---|---|---|
| H-01 | **High** | Hypotheses have no storage that keeps them apart from facts | Hypothesis ledger with provenance, confidence, status and the promotion rule | D |
| H-02 | **High** | Fact category 3 says hypotheses are not stored; the proposal added a conflicting category | Redefine category 3; `kind: "hypothesis"` in MCP output | D |
| H-03 | Medium | Proposed matcher duplicates existing tools | `SimilarityProvider` contract over Ghidra Function ID/BSim and others; no embedded corpus | F, M |
| H-04 | Medium | Deterministic facts presented as analogies | Delphi, MFC, VB6, toolchain and documented-format detectors first; analogy tag with confidence | M |
| H-05 | **High** | Legal scope not tied to rights holders | Open-source or full-consent policy; declared basis required for legacy operations | M |
| H-06 | **High** | Source of the similarity corpus undefined | Hashes and signatures only, source and license per entry, local lookups, no bundled binaries | F, M |
| H-07 | **High** | Synthesis of unreadable code cannot be verified | Oracle rule; no level above L0 without an oracle; provenance for generated code | N, P |
| H-08 | Medium | Matcher quality is unmeasured | Reference corpus with ground truth; precision, recall and confidence calibration | M, L |
| H-09 | Medium | "Train the agent" is not an available mechanism | Prompts, skill section and evaluation harness | L |
| H-10 | Medium | Consent is not recorded | Authorization record in sessions and reports | M |

Tasks H-01…H-10 are tracked in the [approved audit backlog](ROADMAP.md#approved-audit-backlog-audit-1-approved-2026-11-09). Audit 2 follows.

---

## Audit 2 — 2026-11-09 — product goal versus roadmap (goal-gap audit)

**Scope.** Not a code review. The maintainer stated the product goal: fully analyze modern **and old** programs without source, explain why they do not work or work badly on modern hardware and in a modern environment, and let an agent propose concrete improvements or a full rework **with full preservation of functionality**. This audit compares that goal with [ROADMAP.md](ROADMAP.md) (patches A–L) and [ARCHITECTURE.md](ARCHITECTURE.md). No code was run or changed.

**Verdict.** Patches A–K deliver a strong general core (observation, measurement, evidence, static analysis, providers, controlled optimization). They are aimed at *performance of current programs*. For the stated goal they leave seven gaps: there is no compatibility diagnosis, no legacy formats and eras, no multi-environment execution, no behavior capture that could prove preservation, no function-level equivalence lab, no migration strategy, and no scope/legal policy. Full preservation of behavior cannot be *proven* by any tool; Reverse must report a **confidence level with its coverage**, never a guarantee.

**Approval and priority.** Approved by the maintainer on 2026-11-09. Target platforms are delivered in this order, each as a complete vertical slice through patches M–P: (1) Windows up to 2010, (2) old Linux, (3) old Mac, (4) old Android, (5) the same four in their newer generations.

| ID | Sev | Gap | Task | Patch |
|---|---|---|---|---|
| G-01 | **High** | No answer to "why does it not work today" | Compatibility diagnosis: required OS, CPU, bitness, ABI; imported APIs against what the target OS still provides; missing libraries; privilege and virtualization assumptions; CPU-speed-dependent timing; graphics, audio and driver dependencies; DPI and resolution; locale and path assumptions; address-space limits; date limits. Every cause is a finding with evidence | M |
| G-02 | **High** | Old formats and technologies are not recognized | Legacy formats and toolchains per platform wave (see the wave table in the roadmap) | M |
| G-03 | **High** | Programs can only be run in the current host | Execution-environment providers (Wine, DOSBox-class emulators, QEMU/VMs, old userland containers, classic-Mac and old-Android emulators), snapshots, a works/fails matrix across environments | N |
| G-04 | **High** | Behavior preservation cannot be shown | Behavior capture and replay: inputs, outputs, files, registry/preferences, network, UI events, time and random control, code coverage, normalization, comparison old versus new | O |
| G-05 | **High** | A rewritten function cannot be checked against the original | Equivalence lab: emulate or run the original function and the replacement on the same large input sets, differential and property tests, coverage-based confidence | P |
| G-06 | Medium | No guidance on *how* to fix | Migration strategy advisor: ranked options from configuration or compatibility layer through wrapper, emulation/VM packaging, minimal binary patch, recompilation from a reconstruction, to full rewrite, each with risk, effort and evidence | P |
| G-07 | Medium | No scope and legal policy | Authorized-use policy, handling of copy protection, dongles and licenses, user-supplied OS images; first item of patch M | M |
| G-08 | Medium | Platform priority is not encoded | Wave order is a roadmap rule: nothing for a later wave starts before the previous wave has its end-to-end trial | M–P |
| G-09 | Medium | No per-target support matrix | `CAPABILITIES.md` gets a target-platform and era matrix; the suite checks it against the registered format detectors | M |
| G-10 | Medium | "Full preservation" is an unmeasurable promise | Behavior-preservation report with levels L0–L3 (defined in [ARCHITECTURE.md](ARCHITECTURE.md)); L4 (formal proof) is explicitly out of scope | O, P |

Tasks G-01…G-10 are tracked in the [approved audit backlog](ROADMAP.md#approved-audit-backlog-audit-1-approved-2026-11-09). Audit 1 follows; its text is unchanged except for status marks.

---

## Audit 1 — 2026-11-09 — baseline `reverse-0-2-0-green` (0.2.0-beta.1, Patch B done)

**Scope.** Every file in `src/` (18 files, about 57 KB), `tests/`, `docs/`, `.github/workflows/`, `package.json`, `tsconfig*.json`, `AGENTS.md`. Reviewed against [AGENTS.md](../AGENTS.md), [ROADMAP.md](ROADMAP.md) (patch B) and the MCP/CLI contracts.

**Method and what was actually run.** Static review plus targeted runtime probes on Linux (Node 22 in a sandbox). `npm ci`, `npm run build`, `node tests/check-structure.mjs --built` passed; `npm audit --omit=dev` reports 0 vulnerabilities (zero runtime dependencies); `tsc --noUnusedLocals` reports 2 unused symbols. The capability suite was run (`npm run verify`) and no check failed. The test-suite counts were not captured, so no pass/fail numbers are claimed here. macOS and Windows were **not** run.

**Verdict.** Patch B is functionally in place and the code matches its documented scope in most places. The structure, honesty rules and the capability gate are strong. However, the audit found **one safety gap, three correctness defects and several doc/behavior drifts** that should be closed before Patches C and D build on top of them. None of them is hidden by the current checks, so each needs a new check (see "Checks to add").

**Approval.** On 2026-11-09 the maintainer approved every finding (F-01…F-17) and every recommendation (R-01…R-20) of this audit. They are tracked as project tasks in the [approved audit backlog](ROADMAP.md#approved-audit-backlog-audit-1-approved-2026-11-09); the "Patch" column below and section D are superseded by that table where they differ.

### A. Findings — defects and drift

| ID | Sev | Area | Finding | Evidence | Recommended fix | Patch |
|---|---|---|---|---|---|---|
| F-01 | **High** | MCP safety | `run_benchmark`, `capture_baseline` and `validate_changes` execute **any command the model supplies**, with the full parent environment, no allowlist, no mode gate, no confirmation. A prompt-injected agent gets arbitrary code execution as the user. This contradicts the design rule that the model must not get unrestricted access to the local system ([ARCHITECTURE.md](ARCHITECTURE.md)) and the `READ_ONLY` default in [AGENTS.md](../AGENTS.md) §6. The operating modes exist only for the cgroup API. | `tools/call run_benchmark {"command":"nonexistent-xyz"}` is accepted and spawned. `OperatingMode` is not consulted in `mcp-server.ts` or `benchmark-engine.ts`. | Gate command-running tools behind `CONTROLLED_EXECUTION` set by the operator (env `REVERSE_MODE`, default `READ_ONLY`; tools refuse otherwise with a clear message). Add an operator allowlist (`REVERSE_ALLOWED_COMMANDS`, resolved absolute paths) and a `cwd` root. Pass an **environment allowlist** to children instead of `process.env`. Mark these tools with MCP annotations (`readOnlyHint:false`, `destructiveHint:true`, `openWorldHint:true`). | C (before new benchmark tools) |
| F-02 | **High** | Statistics | The reported **median is wrong for even sample counts**: `sorted[floor(n/2)]` returns the upper middle element. With 2 runs the median equals the maximum. The median is the headline robust statistic in [BENCHMARKS.md](BENCHMARKS.md) ("compare medians"). | Probe: runs `[26.80, 21.32]` → `medianDurationMs 26.80`, `maxDurationMs 26.80`. | Average the two middle values for even n; add a unit test with n = 1, 2, 3, 4. Move statistics to one pure module (`benchmark-stats.ts`) used by engine and comparator. | C (hotfix first) |
| F-03 | Medium | Benchmark | The "1 MiB per stream" cap counts **UTF-16 characters, not bytes**: 2 MiB of real output is retained for 1.1 M two-byte characters. Docs and tests say "exactly 1 MiB". `slice` can also cut a surrogate pair in half. | Probe: `stdout chars 1048576, bytes 2097152`. | Capture `Buffer` chunks, cap by bytes, decode once at the end with `StringDecoder`/`TextDecoder` (`fatal:false`), or document the unit as characters. | C |
| F-04 | Medium | Benchmark | `compareBenchmarks` compares **means only** and returns `improved: delta<0`. This is the "lower mean alone" claim that [AGENTS.md](../AGENTS.md) §5 forbids; the wording hedges it, but the boolean invites misuse by an agent. Timed-out/failed runs are included in the mean. | `benchmark-engine.ts` `compareBenchmarks`. | Rename to `observedLowerMean`, exclude failed runs from statistics, require ≥ 5 runs per side and a confidence interval (bootstrap or Welch with Hodges-Lehmann shift) before any `significant` flag; otherwise return `insufficient_evidence`. | C |
| F-05 | Medium | Validation | `validateBehavior` can **pass on truncated output**: truncation flags are ignored, so an expected string equal to the first 1 MiB of a longer output passes. A failed check is returned as `partial`, which means "incomplete coverage" elsewhere. | `benchmark-validation.ts`: no use of `stdoutTruncated`. | Fail (or `partial` with an explicit reason) when either stream is truncated; return a dedicated `passed:false` finding with `status:'completed'` for a clean mismatch. Add a normalization step (line endings, trailing whitespace) as opt-in. | I (small fix now) |
| F-06 | Medium | MCP protocol | (a) A line that is not valid JSON gets **no reply** (should be `-32700 Parse error`). (b) Tool execution errors are sent as JSON-RPC errors (`-32000`); the MCP spec expects `result.isError:true` with the message in `content`, so the model can see and react to the error. Unknown tool names should be `-32602`. (c) `req.params.name` is dereferenced without validation. (d) Server speaks protocol versions up to `2025-06-18` only; newer revisions exist. | Probe: `not json` produced no output; `analyze_binary /nope` returned `error -32000`. | Implement the three fixes (about 30 lines); add `outputSchema` plus tool `title` and `annotations` (read-only hints for analysis tools). Re-check the current MCP revision before bumping `SUPPORTED_PROTOCOLS`. Consider the official `@modelcontextprotocol/sdk` as a **devDependency for contract tests only** (runtime stays dependency-free). | D |
| F-07 | Medium | Linux metrics | `linuxInfo` hard-codes **page size 4096 and CLK_TCK 100**. On ARM64 kernels with 16 KiB/64 KiB pages (Apple Silicon Linux, some servers) RSS is under-reported 4–16× and CPU time is wrong where `CLK_TCK` differs. CPU percent is divided by the CPU count here, while `ps`-based values on macOS use 100 % = one core, so cross-platform numbers are not comparable. | `process-inspector.ts` line with `page=4096, hz=100`. | Read `getconf PAGESIZE`/`CLK_TCK` once (cached), or parse `/proc/self/auxv`; define one CPU-percent convention (per-core, can exceed 100) and document it in [CAPABILITIES.md](CAPABILITIES.md). | D (with metric parity) |
| F-08 | Medium | Performance | `inspectProcess` **enumerates the whole process table** to find one PID, and `profileProcess` calls it every sample. At 100 ms intervals on a busy host this is hundreds of `/proc` reads per sample and distorts the target (observer effect), contrary to "profiling adds load" in [BENCHMARKS.md](BENCHMARKS.md). `btime` is re-read per process. | `process-inspector.ts` `enumerate()` used by `inspectProcess`. | Add `readProcess(pid)` fast path (single `/proc/<pid>`; targeted `ps -p`; PowerShell `-Filter ProcessId=`). Cache `btime`, page size, CLK_TCK. | D |
| F-09 | Medium | Source analysis | `analyzeSource` reads each file fully with `readFile` and no size limit (a 1 GB `.c`/`.wasm` is read into memory as UTF-8). `.wasm` is treated as source text. The 5000-file cap is checked per directory, so the count can exceed it. Symlinked files are silently followed by `stat`. Import regex misses `import 'x'`, `import('x')`, Python/Rust/Go imports, and counts commented code (a documented limitation). | `analysis-source.ts`. | Cap per-file bytes (for example 2 MiB) and mark the file skipped; drop `.wasm` from text scanning; enforce the file cap inside the inner loop; use `lstat`. Replace regexes with a parser in Patch E (`typescript` API as optional devDependency-free provider, or `tree-sitter` via WASM as an opt-in provider). | E (cap fixes now) |
| F-10 | Medium | Dependencies | The three dependency groups are merged with object spread, so a package in both `dependencies` and `devDependencies` **loses its group** and the finding has no `kind` field; production and development dependencies cannot be told apart. | `analysis-dependencies.ts`. | Emit `{name, declaredVersion, group}` per group; keep duplicates; add `peerDependencies`. | E |
| F-11 | Medium | Evidence | `fileEvidence` hashes with `readFile` (whole file in memory): a multi-GB binary causes an out-of-memory failure; `saveJson` writes non-atomically (a crash leaves a truncated JSON that `EvidenceEngine.get` silently skips); `get` scans every file on each lookup (O(n)); `EvidenceEngine.record/persist` are not used by the analyzers (they call `fileEvidence` directly), so there are two evidence paths. | `core-util.ts`, `evidence-engine.ts`. | Stream the hash (`createReadStream` + `createHash`); write to `*.tmp` then `rename`; name files by evidence id (`evidence/<id>.json`) so lookup is O(1); keep one code path. Fits Patch D's schema work. | D |
| F-12 | Medium | Process kill | `killProcessTree` kills PIDs from a `ps` snapshot **without an identity re-check**, although the repo already has start-time identity tokens; a PID recycled between snapshot and kill could be hit. On POSIX the child is not placed in its own process group, so a more robust `kill(-pgid)` is not used. Windows returns `1` regardless of what `taskkill` did. | `process-tree.ts`, `benchmark-engine.ts`. | Spawn with `detached: true` on POSIX and kill the group first, then sweep the snapshot with identity checks; on Linux use `/proc` instead of `ps`; report real counts on Windows (parse `taskkill` output or use a Job Object provider later). | C |
| F-13 | Low | Binary | Mach-O thin headers expose CPU type/subtype at offset 4/8 but report `architecture: 'see-load-commands'`; fat headers list slices in the first bytes but are not parsed. `status` is `completed` although `coverage.complete` is `false` (consistent with docs, but confusing). `magic` variable is unused. Only 64 KiB is read, so a PE with a large DOS stub or `e_lfanew` beyond it falls to "DOS/PE-like" without a limitation note. | `analysis-binary.ts`. | Cheap wins before Patch E: Mach-O `cputype`, fat slice table, PE `e_lfanew` beyond buffer → `partial` with a note. | E |
| F-14 | Low | Hygiene | The delivered archive contains a **stale `dist/`** (no `process-parse`, `process-safety`, `process-tree` outputs): contradicts [AGENTS.md](../AGENTS.md) §3 (no `dist/` in deliveries). Two unused symbols (`stat` in `process-inspector.ts`, `magic` in `analysis-binary.ts`). The `unused*` flags are not enabled. `package.json` lists `tsx` but `dev` is the only user. | archive listing; `tsc --noUnusedLocals`. | Remove `dist/` from archives; enable `noUnusedLocals`/`noUnusedParameters`/`noImplicitReturns` in `tsconfig.json`; add `.gitattributes` (`* text=auto eol=lf`). | now |
| F-15 | Low | Docs drift | (a) [ARCHITECTURE.md](ARCHITECTURE.md) still lists `list_processes`, `monitor_process`, `analyze_*`, `detect_resource_anomalies` in the "remaining planned 0.2 tools" table although they exist ([MCP.md](MCP.md)). (b) The roadmap marks the 0.2 MCP tools `[x]` while patch D still lists them as pending. (c) [CAPABILITIES.md](CAPABILITIES.md) says "inventory (cap 500)" for processes; `inspectProcess` has no cap. (d) `failed` status is "reserved" but thrown errors reach MCP as protocol errors (see F-06). | docs | Fix in the same change as the code fixes; add a check that compares the planned-tools table with `tools/list`. | D |
| F-16 | Low | Tests | `tests/core.test.ts` has 5 smoke tests; almost everything is in the 893-line `capabilities.check.ts`, which mixes unit-level and end-to-end concerns. There are no tests for statistics, `appendCapped`, MCP error paths, or the Linux parser with fixtures (`/proc/<pid>/stat` with `)` in the name is correct but untested). | `tests/` | Split into `tests/<area>.test.ts` files (flat) with pure-function fixtures; keep `capabilities.check.ts` for black-box checks. | C/D |
| F-17 | Low | Security docs | [SECURITY.md](SECURITY.md) states commands are "explicitly supplied by the caller"; through MCP the caller is the model. The threat model should name the agent as an untrusted caller and prompt injection from analyzed targets (strings, filenames, process names returned in results) as an attack path. | docs | Add a "Threat model" section (see Recommendation R-02). Status: closed in 0.2.0-beta.5, patch C. | C |


### A2. Status after hotfix 0.2.0-beta.2

| ID | Status |
|---|---|
| F-02 median | closed in 0.2.0-beta.2 (`median()` exported and tested for n = 0, 1, 2, 3, 4) |
| F-03 byte cap | closed in 0.2.0-beta.2 (`CappedBuffer`, checked with 2-byte characters) |
| F-05 validation | closed in 0.2.0-beta.2 (truncation fails the check; mismatch is `completed`, `passed:false`). Normalization rules stay in patch I |
| F-06 MCP | (a) `-32700`, (b) `isError`, (c) `-32602` closed in 0.2.0-beta.2. (d) newer protocol revisions, `outputSchema`, `title`, annotations and the SDK contract tests remain open (patch D) |
| F-09 source | file/size caps, `lstat`, `.wasm` closed in 0.2.0-beta.2. Parser (AST) remains open (patch E) |
| F-13 | unused `magic` removed; Mach-O CPU type, fat slices and PE `e_lfanew` remain open (patch E) |
| F-14 | stale `dist/` is not part of the hotfix archive; `noUnusedLocals`, `noImplicitReturns` enabled; unused symbols removed. `.gitattributes` and `noUnusedParameters` remain open |
| F-15 | (a) and (b) closed in 0.2.0-beta.2 with a check that compares the planned-tools table with `tools/list`; (c) closed; (d) closed together with F-06 |
| F-01, F-04 | Status: closed in 0.2.0-beta.3, patch C |
| F-14 (rest) | Status: closed in 0.2.0-beta.3, patch C (`noUnusedParameters`, `.gitattributes`) |
| F-07 | Status: closed in 0.2.0-beta.6, patch D (OS page size and tick rate, one per-core CPU convention) |
| F-08 | partial: Linux single-PID `/proc` fast path and cached constants in 0.2.0-beta.6; non-Linux fast paths remain open |
| F-10 | open, patch E |
| F-11 | Status: closed in 0.2.0-beta.6, patch D (atomic JSON writes, streamed hashing, lookup by ID) |
| F-12 | Status: closed in 0.2.0-beta.6, patch C (identity-checked process-group termination, real Windows counts) |
| F-16 | open (partial): focused test files exist, the capability harness is still one file |
| F-17 | Status: closed in 0.2.0-beta.5, patch C |
| R-02 | Status: closed in 0.2.0-beta.5 (basic wrapper and caps) |
| R-06 | Status: closed in 0.2.0-beta.7, A–D closure (the beta.6 claim was premature, see Audit 4 F-24) |
| R-09 | Status: closed in 0.2.0-beta.6 (`reverse doctor`) |
| R-13, R-16, R-17 | Status: closed (R-13 and R-17 in 0.2.0-beta.6, R-16 in 0.2.0-beta.3) |

Behavior changes users can notice: MCP tool failures now arrive as `isError` results instead of JSON-RPC errors; a non-JSON line now gets a `-32700` reply; `validate_changes` returns `completed` for a clean mismatch; `.wasm` files are no longer counted by `analyze_source`.

### B. What is correct and should be kept

- Flat layout, `Result` envelope, honest `limitations`/`coverage`, extension points never reported as available — consistent with [AGENTS.md](../AGENTS.md) §5.
- `spawn(command, args)` without a shell; tree kill with a snapshot-first order; the 2-second stdio grace period after a kill.
- Process identity tokens (`boot_id` + start ticks on Linux) and the identity check between samples; ownership checks before cgroup moves; cgroup cleanup in `finally`.
- `/proc/<pid>/stat` parsing is correct (it uses the last `)`, so names containing `)` are safe) and field offsets match `proc(5)`.
- Cancellation path (`notifications/cancelled` → `AbortSignal` → partial result with collected samples).
- Pure parsers for macOS/Windows output with fixtures; CI that is cheap by default and expensive only on demand; zero runtime dependencies; `npm audit` clean.

### C. Checks to add (each must be able to fail)

1. Median for n = 1, 2, 3, 4 (F-02). 2. Byte-accurate output cap with multi-byte text (F-03). 3. `validate` fails on truncated output (F-05). 4. MCP: invalid JSON → `-32700`; failing tool → `isError:true`; unknown tool → `-32602` (F-06). 5. Command tools refuse without `CONTROLLED_EXECUTION` (F-01). 6. Page size and `CLK_TCK` are not hard-coded (static drift check) (F-07). 7. Every tool in `tools/list` has `annotations` and appears in [MCP.md](MCP.md); planned-tools table in [ARCHITECTURE.md](ARCHITECTURE.md) contains no existing tool (F-15). 8. `analyzeSource` skips files above the size cap and respects the file cap exactly (F-09).

### D. Recommended order of work

1. **Hotfix patch `0.2.0-beta.2` (small, before C):** F-02, F-03, F-05, F-06, F-14, plus the cap fixes of F-09 and the drift fixes of F-15. About 150–250 changed lines.
2. **Patch C:** start with F-01 (execution gate) because every new benchmark tool inherits it; then F-04, F-12 and the statistics module.
3. **Patch D:** F-07, F-08, F-11, F-15, F-16, and the MCP output schemas.
4. **Patch E:** F-09 (parser), F-10, F-13.

### E. Recommendations for the project as a whole (after development is complete)

Sources: the architecture and tooling of [morluto/rea](https://github.com/morluto/rea) (read 2026-11-09: README, root file list) and current public MCP/Node practice. Items that need a new dependency follow the zero-runtime-dependency rule: they go to devDependencies or to opt-in providers.

**Quality and trust**

- **R-01 Mutation testing.** rea ships Stryker configs (`stryker.config.mjs`, separate semantics config). Adopt Stryker on the pure modules (statistics, parsers, `appendCapped`, decision rules). It directly serves the rule "a check must be able to fail".
- **R-02 Threat model and prompt-injection hardening.** Treat everything returned from a target (strings, paths, process names) as untrusted text: wrap it in a `untrustedContent` field, never place it in tool descriptions, cap lengths, and test with adversarial fixtures. Document the agent as an untrusted caller. rea documents the same class of risk in its `SECURITY.md` and bounds updater output.
- **R-03 Supply-chain and release integrity.** npm provenance (`npm publish --provenance`), pinned GitHub Action SHAs, `permissions:` least privilege (already present), Dependabot, OpenSSF Scorecard, CycloneDX SBOM and `npm audit signatures` in CI. For releases use `release-please` (rea uses it) so the version in `core-version.ts`, `package.json` and the lockfile cannot drift.
- **R-04 Fuzzing the binary and process parsers.** Add property/fuzz tests (`fast-check` as devDependency) for ELF/PE/Mach-O headers and `/proc`, `ps` and CIM parsers: truncated, oversized and hostile inputs must yield `partial`, never throw or allocate unbounded memory.
- **R-05 Static quality gates.** Replace ad-hoc checks with fast tooling as devDependencies: `oxlint`/`oxfmt` (as rea), or ESLint with typescript-eslint; `knip` for dead exports and unused files (rea has `knip.json`); `jscpd` for duplicate code (rea has `.jscpd.json`) to keep the compact-core promise measurable; add a size gate for own lines (target 20–30 k).
- **R-06 Reformat the dense files.** `mcp-server.ts`, `benchmark-engine.ts`, `process-inspector.ts` and several others use one-line functions with 300+ characters, which [AGENTS.md](../AGENTS.md) §7 forbids for new code. Reformat each when it is next changed (with `prettier`/`oxfmt`) and add the formatter check to the structure workflow.

**Agent experience (MCP)**

- **R-07 Contract-first MCP.** Generate `tools/list`, [MCP.md](MCP.md) and the output schemas from one TypeScript definition (zod or hand-written JSON Schema) so the table cannot drift; keep compact vs full input-schema profiles for context economy (rea exposes `REA_MCP_INPUT_SCHEMA_PROFILE` and `REA_MCP_OUTPUT_SCHEMA_PROFILE`; Reverse can mirror this with `REVERSE_MCP_SCHEMA_PROFILE`). Add `title`, `annotations`, `outputSchema`, structured errors with machine-readable `code`, pagination cursors and response-size budgets.
- **R-08 Prompts, resources and setup.** Expose MCP *prompts* for the research cycle (investigate → diagnose → hypothesize → experiment → verify → report) and *resources* for evidence records and research sessions (`reverse://evidence/<id>`); add `reverse setup` that registers the server in Claude Code, Codex, Cursor and Gemini CLI with backups and a dry-run, as `npx rea-agents setup` does, plus a skill file with the investigation workflow (rea publishes one on skills.sh). Keep it opt-in and show the diff before writing.
- **R-09 `reverse doctor`.** One command that reports Node version, `ps`/PowerShell availability, cgroup delegation, detected providers (path + version) and the active safety mode. rea has readiness checks per agent and provider; this prevents the "silent absent tool" failure class and feeds [CAPABILITIES.md](CAPABILITIES.md) automatically.

**Analysis depth**

- **R-10 Use existing parsers instead of writing new ones** (consistent with the no-reimplementation rule), as opt-in providers: `lief` or `goblin`-based helper, `pefile` import hash, GNU `objdump`/`readelf`, `rizin`/`rz-bin` JSON output, `capa` for capabilities, `yara-x` rules, `diec` (Detect It Easy) for packer detection, `syft`/`cyclonedx` for dependency SBOMs, `osv-scanner` for vulnerabilities, `cargo-auditable` data in Rust binaries and Go build info — rea already reads the last two and several other static formats (PE imports and certificates, ELF notes, hardening flags, Android APK signatures, WASM via WABT) without a native engine; use its list as the backlog for Patch E.
- **R-11 Hardening-flag report.** Add PIE/NX/RELRO/stack-canary/CFG/ASLR flags to the binary analyzer (cheap, header-only, high value to the agent).
- **R-12 Profiling providers with standard formats.** Ingest `perf script`/`perf record`, Linux `pprof`, Chrome/V8 `.cpuprofile`, Node `--cpu-prof`, Speedscope and Firefox Profiler JSON, instead of writing a profiler. Add `hyperfine`-style methodology (warm-up, outlier warnings, `--export-json` compatible shape) for benchmarks and `eBPF` via `bpftrace`/`bcc` in Patch H.
- **R-13 Statistics done properly.** Bootstrap confidence intervals, Mann-Whitney U with Hodges-Lehmann shift, effect size, outlier detection by MAD, environment-noise detection (CPU frequency governor, load average, thermal state) and an explicit `insufficient_evidence` verdict. Interleaved A/B runs by default.

**Evidence and reproducibility**

- **R-14 Tamper-evident evidence.** Hash chain per research session, Merkle root in the report, optional detached signature (Ed25519 via `node:crypto`; later Sigstore/cosign), plus a deterministic export bundle (`reverse export <session>` → one JSON + artifacts) that a third party can re-verify with `reverse verify`. rea's CLI has Evidence snapshots, import and export.
- **R-15 Golden results.** Keep small reference binaries and expected `Result` JSON (with volatile fields masked) in `tests/`; trials on the three reference applications from the roadmap become CI jobs on the manual workflow.

**Platform and delivery**

- **R-16 Node support window.** Node 20 is end-of-life (April 2026); the Node 20 matrix entry and `engines: >=20.11` should move to 22 and 24 (rea requires 22.x/24.x/26.x). Do it in Patch C together with the `node:sqlite`/`fs.glob`/`util.parseArgs` options below.
- **R-17 Use Node built-ins to delete code.** `util.parseArgs` for the CLI, `AbortSignal.timeout`, `fs.promises.glob` (22+), `node:test` coverage (`--experimental-test-coverage`), `process.report` for host data, `os.availableParallelism()`; keep zero runtime dependencies.
- **R-18 Single-file distribution and install paths.** `npx reverse-compact`, an `install.sh`/`install.ps1` that only checks Node and prints MCP configuration, and optionally a Node SEA/`bun build --compile` binary for machines without Node. Publish `server.json` for MCP registries.
- **R-19 Windows and macOS parity.** Replace PowerShell/`ps` fork-per-sample with a persistent helper or `typeperf`/ETW provider (Windows) and `libproc` via a tiny helper (macOS); until then keep the "metrics not at parity" limitation visible in tool output, not only in docs.
- **R-20 Sandbox for executed targets.** For `CONTROLLED_EXECUTION`: `bwrap`/`firejail` or `unshare -n` on Linux, `sandbox-exec` on macOS (deprecated but available), Job Objects/AppContainer on Windows, or a container provider; read-only bind mounts, no network by default, scratch directory, rlimits via `prlimit`.

### F. Open questions for the maintainer — decisions taken

1. **Command-running MCP tools off by default (F-01): yes, in patch C.** It is a breaking default, so it is not part of a hotfix; it ships as the first item of patch C with an operator switch (`REVERSE_MODE=CONTROLLED_EXECUTION`), an allowlist and release notes. Until then [SECURITY.md](SECURITY.md) must be read as "do not attach Reverse to an untrusted agent".
2. **Hotfix before patch C: yes** — released as `0.2.0-beta.2` (see [ROADMAP.md](ROADMAP.md)).
3. **Official MCP SDK as a devDependency for contract tests only: yes, in patch D.** The runtime stays dependency-free; the SDK client validates `tools/list`, `outputSchema` and error shapes against the specification.

### G. Not covered (explicit)

macOS/Windows runtime behavior; the 893-line capability suite was run but not reviewed line by line; real cgroup v2 enforcement (needs a delegated hierarchy); performance under load; `package-lock.json` contents beyond `npm audit`. These go to the next audit.

---

<!-- New audits are inserted above this line, directly under the introduction. Do not delete earlier audits. -->

## Implementation status after 0.2.0-beta.6

Superseded: statuses of F-07, F-08, F-11, F-12, F-16, F-17 and the recommendations are recorded in section A2 above, and the closure review of 0.2.0-beta.7 is Audit 4 at the top of this file.
