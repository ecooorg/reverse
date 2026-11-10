# Capability matrix

| Area | Implemented in 0.1.x | Explicit limitations |
|---|---|---|
| ELF / PE / Mach-O / Java class | Header magic (Java `.class` is told apart from universal Mach-O), architecture/bitness, file size, hash evidence; **sections, symbols, imports/exports and load commands** where the format tables are present in the read window (Patch E) | No disassembly, decompilation, call graph, or malware verdict (provider engines in F) |
| Android APK/AAB | ZIP inventory: entries, `classes*.dex`, `lib/<abi>/*.so`, ABI list, AndroidManifest/resources.arsc presence, R8/ProGuard path indicators, sibling Gradle lock notes (Patch E) | Binary AXML not decoded; no DEX class listing; no full Gradle resolution |
| Source | Bounded file inventory (5000 files, 2 MiB read per file), extension counts, approximate lines, **comment- and string-aware external imports** (JS/TS/Python/Go/Rust/Java), package manifest (Patch E) | Not a full language AST; no call graph, dead-code proof, or vulnerability scan |
| Dependencies | package.json direct deps plus **lockfile resolution** (package-lock, yarn.lock, Cargo.lock, go.sum, requirements.txt, poetry.lock) with transitive/lock-only nodes and duplicate-version notes (Patch E) | No CVE database, no registry outdated query, no size/replacement recommendations |
| Processes | Visible inventory (listing cap 500; single-process inspection searches the full inventory), PID/PPID, executable/arguments, uptime, threads, RSS/VMS, CPU time where exposed, disk I/O and open-FD count on Linux; visible child tree; start-time identity tokens; UID ownership checks on Linux/macOS | No memory maps or thread stacks; Linux selected-PID inspection uses a direct `/proc/<pid>` fast path and Windows a filtered single-PID WMI query (macOS still reads the full table); Windows ownership is not verified; macOS does not report thread counts (BSD `ps` has no such column); cross-platform metrics are not at parity |
| Profiling | Process-level time series (CPU/RSS/IO); **function hotspots via `get_hotspots` when perf/sample is present and CONTROLLED_EXECUTION is set** (Patch H); disk I/O via `get_process_io` on Linux | Network per-process metrics limited; hotspots never fabricated without a real profiler |
| Benchmark | Repeated command execution, wall-clock duration, median/mean/min/max, stdout/stderr hard-capped at 1 MiB (bytes) per stream with truncation flags, whole-process-tree kill on timeout | Per-run CPU time and peak RAM are SAMPLED (Linux `/proc`, macOS `ps`; lower bounds, direct child only) and Windows uses PowerShell `Get-Process` sampling (higher overhead; short runs may have no sample); I/O metrics and hardware normalization are not implemented. Interleaved benchmark suites and local baseline artifacts are available. Also reported: binary size of the command, cold/warm label (first process of a call is `cold`; the OS file cache is not dropped). Statistics: P95, std-dev, MAD, outliers, 95% interval, warm-up runs, environment fingerprint; `compare_results` returns `improved`, `regressed`, `no_significant_change` or `insufficient_evidence` (Mann-Whitney plus bootstrap, at least 5 successful runs per side) |
| Validation | Exact expected exit code/stdout/stderr checks; truncated output never matches; a clean mismatch is `completed` with `passed: false` | Not semantic equivalence, test discovery, or proof of correctness |
| Evidence | Typed evidence records, source/time/confidence/limitations/hash, local ID-addressable JSON artifacts, atomic writes and streamed file hashing; research sessions with hash-chained entries, evidence created from analyzer results through `session_id`, and a separate hypothesis ledger with content-checked promotion | Session signing, Merkle root and detached signatures belong to patch I; no remote artifact store |
| Safety | `READ_ONLY` by default; `OBSERVE` samples only verified-owned processes; explicit `CONTROLLED_EXECUTION` scoped cgroup-v2 resource-limit API on delegated Linux hierarchies; ownership and identity checks before moving a process | No OS sandbox or filesystem/network isolation; Windows/macOS hard process quotas are not implemented; cgroup availability depends on delegation and permissions |
| MCP | stdio JSON-RPC initialize, ping, tools/list, tools/call; protocol revisions through 2025-11-25; tool titles, annotations and output schemas; request cancellation; benchmark suites and research-session tools | No modern stateless 2026-07-28 protocol era, HTTP transport, roots, resources, prompts, or OAuth |

## Windows compatibility — initial Patch M baseline (1.1.0-beta.1)

| Capability | Status | Limitation |
|---|---|---|
| DOS MZ / Windows NE / LE / LX / PE header recognition | ✅ | Static header recognition only; does not prove executability or identify every extender/loader |
| Windows toolchain and framework detection (VB6/MFC imports; Delphi form/RTTI-style and MFC/VB metadata signatures) | ✅ | Static signatures are indicators, not proof of runtime use; no reference-corpus precision/recall calibration |
| PE imported libraries and named functions | ✅ | Bounded PE import-table parsing; delay imports, bound imports and malformed/out-of-window tables may be absent |
| Compatibility candidates from legacy headers, PE runtime and graphics imports | 🚧 | Static candidates include evidence/confidence/limitations; OS-version API availability tables and execution confirmation belong to later M/N slices |
| Legacy authorization declaration on research sessions | ✅ | Operator declaration is recorded; legal status and the referenced license/consent are not verified |

The `analyze_legacy_windows` MCP tool refuses unless the supplied research session has a `declare_legacy_authorization` record. It reads at most 8 MiB for marker detection and hashes the complete file. This is initial progress inside product patch M, not completion of the Windows product outcome.

## Windows compatibility — detector increment within Patch M (1.1.0-beta.2)

| Capability | Status | Limitation |
|---|---|---|
| DOS MZ / Windows NE / LE / LX / PE header recognition | ✅ | Static recognition only; does not prove executability or identify every extender/loader |
| Machine, PE bitness and subsystem extraction | ✅ | Limited to fields present in the bounded header window; unusual/short headers may be partial |
| Selected Borland/Delphi, VB6, MFC, Visual C++, DirectX and Glide markers | 🚧 | Bounded string scan only; not structural RTTI/DFM/message-map or import-table analysis |
| Preliminary compatibility candidates | 🚧 | Static hypotheses/candidates with confidence and limitations; execution confirmation belongs to N |
| Session authorization declaration, analysis gate and report provenance | ✅ | Operator declaration is embedded in the result; legal status and referenced license/consent are not verified |

`analyze_legacy_windows` reads at most 8 MiB for signatures and PE import tables, hashes the complete input and requires a research session carrying `declare_legacy_authorization`. Its result embeds the declared basis, reference, declarant and timestamp. The detector does not execute the target or access a similarity corpus.

## Remaining product plan (planned, patches M–Q)

The remaining work is one ordered sequence, not parallel capability tracks: M completes Windows through 2010 end-to-end; N delivers old Linux end-to-end; O delivers Classic Mac/early macOS end-to-end; P delivers legacy Android end-to-end; Q extends the workflow to newer generations and unifies compatibility intelligence. Each patch includes the relevant Target Profile, sourced diagnosis, execution, behavior capture/replay, validation and migration reporting. Packer detection, full Target Profile, sourced OS/API availability data and calibrated reference corpus remain open in M. Delphi/VB6/MFC signatures and bounded PE import extraction are static indicators, not calibrated classifications. See [ROADMAP.md](ROADMAP.md).

## Hypotheses, similarity and authorization

The hypothesis ledger is implemented in research sessions: hypotheses are tagged `kind: hypothesis`, carry provenance/confidence/status, remain separate from measured and static evidence, and can be promoted only by same-session Validation or Benchmark evidence. Similarity providers and reference corpus remain planned. The initial M authorization record is stored in the research session, gates `analyze_legacy_windows`, and is embedded in its result; it is an operator declaration, not legal verification. See [SECURITY.md](SECURITY.md).

## Provider status

**Patches F–H:** Registered opt-in adapters (detect + real invoke when present; never fabricated): `ghidra`, `rizin`, `jadx`, `apktool`, `ghidra-similarity`, `frida`, `gdb`, `perf`, `ebpf`, `etw`, `instruments`, `valgrind`, `simpleperf`. Each probes PATH / install dirs, never fabricates results when absent, and returns a structured `Result`. Dynamic tracing (`trace_execution`) and debugger attach require `CONTROLLED_EXECUTION`. Hotspots (`get_hotspots`) report function-level data only from a real profiler.

## Status semantics

- `completed`: the implemented operation completed within its stated scope.
- `partial`: useful data was obtained, but coverage is incomplete or an error occurred.
- `unsupported`: reserved for a recognized operation that cannot be performed on this host/target.
- `failed`: reserved for a future normalized failure path; thrown CLI/MCP errors may currently surface directly.

Do not interpret `coverage.complete: true` as proof of correctness. It only describes the scope implemented by that operation.

## Process safety contract

Process sampling remains read-only. It captures an OS start-time identity token and stops if the token changes between samples, reducing PID-reuse contamination. Ownership can be verified against the current UID on Linux/macOS; Windows ownership is reported as unknown. `withProcessResourceLimits` is an opt-in library API: it requires `CONTROLLED_EXECUTION`, `confirm: true`, verified ownership, a stable identity token, and a delegated Linux cgroup v2 hierarchy. It moves the target into a temporary cgroup for the duration of the supplied callback, then attempts to restore it and remove the cgroup. It does not provide a general sandbox.


## Validation and integrity (patch I)

| Capability | Works when | Limitation |
|---|---|---|
| Exact stdout/stderr/exit validation | Always (caller-supplied expected) | Not semantic equivalence |
| Normalization | `normalize.whitespace` / `timestamps` / `sortLines` | Optional; off by default |
| Fixture directory runner | `run_validation_fixtures` / CLI `fixtures` | JSON cases only; no jest/pytest discovery |
| Evidence hash-chain verify | Research sessions | Detects edits to stored chain |
| Optional HMAC signature | `REVERSE_EVIDENCE_KEY` set | Not public-key / Merkle |
| Change report | `generate_change_report` | Aggregates caller evidence; does not invent metrics |


## Optimization loop (patch J, 0.5.0-beta.1)

| Capability | Works when | Limitation |
|---|---|---|
| Isolated change workspace | CONTROLLED_EXECUTION + confirm | Directory copy, not full git worktree yet |
| Apply source/config/dep/runtime changes | Active workspace | Closed binary code patch not supported |
| Rollback / accept | confirm | Accept never auto-writes original |
| Decision rules | Caller supplies verdict + validation | Does not re-run benchmarks |
| APK rebuild pipeline | apktool present + confirm | Signing needs REVERSE_APK_KEYSTORE; adb install not auto |

## Optimization loop completion (0.5.0-beta.2)

| Capability | Status |
|---|---|
| Directory workspace + git worktree | ✅ gated |
| ADB install / pm clear / emu snapshot | ✅ when adb present; test device policy |
| Reference-shape E2E trials | ✅ fixture-based |

## Runtime analyzers (patch K, 1.0.0-beta.1)

| Analyzer | Works | Limitation |
|---|---|---|
| JavaScript / Electron | Directory inventory, electron hints | No runtime execution |
| .NET | PE CLI directory detect | No IL decompile |
| WASM | Section inventory | No code validation |
| HTTP MCP | Token-gated POST /rpc | Optional; localhost default |


## Agent integration (1.0.0 / L)

| Capability | Status |
|---|---|
| MCP prompts (research_cycle, hypothesis_discipline, optimization_decision) | ✅ |
| MCP resources `reverse://…` | ✅ local store |
| `reverse setup` dry-run / confirm | ✅ |
| H-09 full evaluation harness | 🚧 later |
