## Status

Patch **M** closed at **1.2.0** and Patch **N** closed at **1.3.5** (2026-11-11). Residual limitations listed per row (L0 without oracle; sandbox hard-isolation gaps; no full `SHT_GNU_verneed` walk, no `goblin`).

# Capability matrix

This file states what really works and what does not. Planned work is only in the last section and in [ROADMAP.md](ROADMAP.md). The first table covers the core areas; the sections below cover the capabilities added by later patches, newest area last.

| Area | Implemented (cumulative through 1.1.0-beta.2; the patch that added a part is named in brackets) | Explicit limitations |
|---|---|---|
| ELF / PE / Mach-O / Java class | Header magic (Java `.class` is told apart from universal Mach-O), architecture/bitness, file size, hash evidence; **sections, symbols, imports/exports and load commands** where the format tables are present in the read window (Patch E) | No disassembly, decompilation, call graph, or malware verdict (provider engines in F) |
| Android APK/AAB | ZIP inventory: entries, `classes*.dex`, `lib/<abi>/*.so`, ABI list, AndroidManifest/resources.arsc presence, R8/ProGuard path indicators, sibling Gradle lock notes (Patch E) | Binary AXML not decoded; no DEX class listing; no full Gradle resolution |
| Source | Bounded file inventory (5000 files, 2 MiB read per file), extension counts, approximate lines, **comment- and string-aware external imports** (JS/TS/Python/Go/Rust/Java), package manifest (Patch E) | Not a full language AST; no call graph, dead-code proof, or vulnerability scan |
| Dependencies | package.json direct deps plus **lockfile resolution** (package-lock, yarn.lock, Cargo.lock, go.sum, requirements.txt, poetry.lock) with transitive/lock-only nodes and duplicate-version notes (Patch E) | No CVE database, no registry outdated query, no size/replacement recommendations |
| Processes | Visible inventory (listing cap 500; single-process inspection searches the full inventory), PID/PPID, executable/arguments, uptime, threads, RSS/VMS, CPU time where exposed, disk I/O and open-FD count on Linux; visible child tree; start-time identity tokens; UID ownership checks on Linux/macOS | No memory maps or thread stacks; Linux selected-PID inspection uses a direct `/proc/<pid>` fast path and Windows a filtered single-PID WMI query (macOS still reads the full table); Windows ownership is not verified; macOS does not report thread counts (BSD `ps` has no such column); cross-platform metrics are not at parity |
| Profiling | Process-level time series (CPU/RSS/IO); **function hotspots via `get_hotspots` when perf/sample is present and CONTROLLED_EXECUTION is set** (Patch H); disk I/O via `get_process_io` on Linux | Network per-process metrics limited; hotspots never fabricated without a real profiler |
| Benchmark | Repeated command execution, wall-clock duration, median/mean/min/max, stdout/stderr hard-capped at 1 MiB (bytes) per stream with truncation flags, whole-process-tree kill on timeout | Per-run CPU time and peak RAM are SAMPLED (Linux `/proc`, macOS `ps`; lower bounds, direct child only) and Windows uses PowerShell `Get-Process` sampling (higher overhead; short runs may have no sample); I/O metrics and hardware normalization are not implemented. Interleaved benchmark suites and local baseline artifacts are available. Also reported: binary size of the command, cold/warm label (first process of a call is `cold`; the OS file cache is not dropped). Statistics: P95, std-dev, MAD, outliers, 95% interval, warm-up runs, environment fingerprint; `compare_results` returns `improved`, `regressed`, `no_significant_change` or `insufficient_evidence` (Mann-Whitney plus bootstrap, at least 5 successful runs per side) |
| Validation | Exact expected exit code/stdout/stderr checks; truncated output never matches; a clean mismatch is `completed` with `passed: false` | Not semantic equivalence, test discovery, or proof of correctness |
| Evidence | Typed evidence records, source/time/confidence/limitations/hash, local ID-addressable JSON artifacts, atomic writes and streamed file hashing; research sessions with hash-chained entries, evidence created from analyzer results through `session_id`, and a separate hypothesis ledger with content-checked promotion | Optional HMAC-SHA256 session signing is implemented (patch I); Merkle root and public-key detached signatures are not implemented (ROADMAP debt register, R-14); no remote artifact store |
| Safety | `READ_ONLY` by default; `OBSERVE` samples only verified-owned processes; explicit `CONTROLLED_EXECUTION` scoped cgroup-v2 resource-limit API on delegated Linux hierarchies; ownership and identity checks before moving a process | No OS sandbox or filesystem/network isolation; Windows/macOS hard process quotas are not implemented; cgroup availability depends on delegation and permissions |
| MCP | stdio JSON-RPC initialize, ping, tools/list, tools/call; protocol revisions through 2025-11-25; tool titles, annotations and output schemas; request cancellation; benchmark suites and research-session tools; prompts and resources methods (`prompts/list`, `prompts/get`, `resources/list`, `resources/read`, patch L); optional Bearer-token HTTP `POST /rpc` (patch K) | No stateless 2026-07-28 protocol era, roots or OAuth; the HTTP transport is optional, localhost by default and not full MCP Streamable HTTP |

## Status semantics

- `completed`: the implemented operation completed within its stated scope.
- `partial`: useful data was obtained, but coverage is incomplete or an error occurred.
- `unsupported`: reserved for a recognized operation that cannot be performed on this host/target.
- `failed`: reserved for a future normalized failure path; thrown CLI/MCP errors may currently surface directly.

Do not interpret `coverage.complete: true` as proof of correctness. It only describes the scope implemented by that operation.

## Process safety contract

Process sampling remains read-only. It captures an OS start-time identity token and stops if the token changes between samples, reducing PID-reuse contamination. Ownership can be verified against the current UID on Linux/macOS; Windows ownership is reported as unknown. `withProcessResourceLimits` is an opt-in library API: it requires `CONTROLLED_EXECUTION`, `confirm: true`, verified ownership, a stable identity token, and a delegated Linux cgroup v2 hierarchy. It moves the target into a temporary cgroup for the duration of the supplied callback, then attempts to restore it and remove the cgroup. It does not provide a general sandbox.

## Provider status

**Patches F–H:** Registered opt-in adapters (detect + real invoke when present; never fabricated): `ghidra`, `rizin`, `jadx`, `apktool`, `ghidra-similarity`, `frida`, `gdb`, `perf`, `ebpf`, `etw`, `instruments`, `valgrind`, `simpleperf`. Each probes PATH / install dirs, never fabricates results when absent, and returns a structured `Result`. Dynamic tracing (`trace_execution`) and debugger attach require `CONTROLLED_EXECUTION`. Hotspots (`get_hotspots`) report function-level data only from a real profiler.

## Validation and integrity (patch I)

| Capability | Works when | Limitation |
|---|---|---|
| Exact stdout/stderr/exit validation | Always (caller-supplied expected) | Not semantic equivalence |
| Normalization | `normalize.whitespace` / `timestamps` / `sortLines` | Optional; off by default |
| Fixture directory runner | `run_validation_fixtures` / CLI `fixtures` | JSON cases only; no jest/pytest discovery |
| Evidence hash-chain verify | Research sessions | Detects edits to stored chain |
| Optional HMAC signature | `REVERSE_EVIDENCE_KEY` set | Not public-key / Merkle |
| Change report | `generate_change_report` | Aggregates caller evidence; does not invent metrics |

## Optimization loop (patch J, completed in 0.5.0-beta.2)

| Capability | Works when | Limitation |
|---|---|---|
| Isolated change workspace | CONTROLLED_EXECUTION + confirm; directory copy, or git worktree (0.5.0-beta.2) | Original is never written |
| Apply source/config/dep/runtime changes | Active workspace | Closed binary code patch not supported |
| Rollback / accept | confirm | Accept never auto-writes original |
| Decision rules | Caller supplies verdict + validation | Does not re-run benchmarks |
| APK rebuild pipeline | apktool present + confirm | Signing needs REVERSE_APK_KEYSTORE; the pipeline does not install by itself |
| ADB install / pm clear / emulator snapshot (`adb_install`, `adb_pm_clear`, `adb_emu_snapshot_load`) | ✅ when adb is present; confirm + CONTROLLED_EXECUTION; test device only | Not run automatically by the APK pipeline |
| Reference-shape E2E trials | ✅ fixture-based (small source app, dependency-bearing source app, closed binary) | External licensed reference applications are optional operator data, not bundled |

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

## Windows compatibility (patch M, in progress; 1.1.0-beta.1 and 1.1.0-beta.2)

| Capability | Since | Status | Limitation |
|---|---|---|---|
| DOS MZ / Windows NE / LE / LX / PE header recognition | beta.1 | ✅ | Static recognition only; does not prove executability or identify every extender/loader |
| Machine, PE bitness and subsystem extraction | beta.1 | ✅ | Limited to fields present in the bounded header window; unusual/short headers may be partial |
| Selected Borland/Delphi, VB6, MFC, Visual C++, DirectX and Glide string markers | beta.1 | ✅ | Bounded string scan (8 MiB); indicators, not proof of runtime use; no reference-corpus precision/recall calibration |
| PE imported libraries and named functions | beta.2 | ✅ | Bounded PE import-table parsing; delay imports, bound imports and malformed/out-of-window tables may be absent |
| Static framework signatures: Delphi form/RTTI-style, VB6 metadata, MFC class/message-map; VB6/MFC runtime imports | beta.2 | ✅ | Static indicators with explicit confidence; not calibrated classifications; not proof of runtime use |
| Compatibility candidates from legacy headers, PE runtime and graphics imports | beta.1, beta.2 | ✅ | Findings cite sourced table entry ids (G-01); execution confirmation still required where marked |
| Sourced Windows runtime/API tables (VB6, MFC, DirectX, Glide, Win16, LE/LX, DEP/ASLR) | step 4 | ✅ | Documentary tables only; host runtime presence is not probed; missing rows never invent availability |
| PE hardening flags (ASLR, DEP, CFG, SEH) from DllCharacteristics | step 3 | ✅ | Link-time flags only; host policy not evaluated |
| Delay-load import libraries | step 3 | ✅ | Bound imports and out-of-window tables still limited |
| Packer/protector heuristics (stubs + high-entropy sections) | step 3 | ✅ | Not a substitute for diec/yara-x/capa |
| Opt-in detect-only providers `diec`, `yara-x`, `capa` | step 3 | 🚧 | Registered; report `unsupported` when absent — never simulated |
| Sandbox for executed targets (R-20): scratch dir, timeout, process-group kill; bwrap/unshare on Linux when present | step 5 | ✅ | No network by default only when bwrap/unshare available; Windows/macOS hard isolation not wired; requires CONTROLLED_EXECUTION + confirm |
| ExecutionEnvironment contract + Wine / DOSBox / QEMU adapters | step 5 | ✅ | Detect-only when binary absent; never simulated; works/fails matrix from real runs |
| Behavior capture and replay (scenario, normalize, compare) | step 6 | ✅ | Requires CONTROLLED_EXECUTION; duration not compared; nondeterminism must be listed in volatileFields |
| Preservation report L0–L3 + migration advisor with evidenced options | step 7 | ✅ | Without oracle level is L0 and cannot be raised; options always cite evidence |
| Reference trials: diagnose-and-advise + compare-versions on crafted fixtures | step 8 | ✅ | No licensed oracle — L0 limitations always recorded; not a claim of full M/1.2.0 closure |

| Target Profile envelope (per-field evidence/confidence/coverage) | step 1 | ✅ | Installer field null until detectors land; confidence uncalibrated |
| Calibration harness (crafted fixtures + operator hash manifests) | step 2 | ✅ | Operator corpus optional; nothing uploaded |
| Legacy authorization declaration on research sessions; gate on `analyze_legacy_windows`; declaration embedded in the result | beta.1, beta.2 | ✅ | Operator declaration is recorded; legal status and the referenced license/consent are not verified |

### Target-platform and era support matrix (G-09)

| Format / era detector | Registered | Capability check |
|---|---|---|
| DOS MZ | yes (`analyze_legacy_windows`) | must recognize MZ without PE/NE/LE/LX |
| Windows NE (16-bit) | yes | must report bitness 16 |
| Windows LE / LX | yes | must report format LE or LX |
| Windows PE 32/64 | yes | must report bitness from optional header |
| Delphi / VB6 / MFC markers | yes | structural detectors or toolchain markers |
| PE imports / delay imports | yes | libraries list when table in window |
| PE hardening flags | yes | DllCharacteristics mapped |
| diec / yara-x / capa | registered adapters | available only when binary on PATH |

`analyze_legacy_windows` refuses unless the supplied research session has a `declare_legacy_authorization` record (or an explicit authorization object on the library path). It reads at most 8 MiB for signatures and PE import tables and hashes the complete file. Compatibility findings cite sourced table entries. The detector does not execute the target or upload samples. Open items remain in the [Patch M working checklist](ROADMAP.md#patch-m-working-checklist).

## Hypotheses, similarity and authorization

The hypothesis ledger is implemented in research sessions: hypotheses are tagged `kind: hypothesis`, carry provenance/confidence/status, remain separate from measured and static evidence, and can be promoted only by same-session Validation or Benchmark evidence. The `SimilarityProvider` contract and the `ghidra-similarity` adapter exist (patch F) and no corpus is bundled; further similarity adapters and the ground-truth reference corpus are planned (patch M). The initial M authorization record is stored in the research session, gates `analyze_legacy_windows`, and is embedded in its result; it is an operator declaration, not legal verification. See [SECURITY.md](SECURITY.md).

## Remaining product plan (planned, patches M–Q)

The remaining work is one ordered sequence, not parallel capability tracks: M completes Windows through 2010 end-to-end; N delivers old Linux end-to-end; O delivers Classic Mac/early macOS end-to-end; P delivers legacy Android end-to-end; Q extends the workflow to newer generations and unifies compatibility intelligence. Each patch includes the relevant Target Profile, sourced diagnosis, execution, behavior capture/replay, validation and migration reporting. Packer detection, full Target Profile, sourced OS/API availability data and calibrated reference corpus remain open in M. Delphi/VB6/MFC signatures and bounded PE import extraction are static indicators, not calibrated classifications. See [ROADMAP.md](ROADMAP.md).


## Legacy Linux (Patch N)

| Capability | Status | Notes |
|---|---|---|
| `analyzeLegacyLinux` a.out + ELF32/64 inventory | ✅ | PT_INTERP, DT_NEEDED, RPATH/RUNPATH, PIE/NX/RELRO hints |
| Linux fields on shared Target Profile | ✅ | libcGeneration, compilerAbiGeneration, dynamicInterpreter, threadModel (stub) |
| libc5 / glibc / libstdc++ markers | ✅ | Static string/soname heuristics; not calibrated |
| Linux calibration fixtures + precision/recall harness | ✅ | Crafted a.out/ELF only; operator corpora via hash manifest |
| Sourced Linux libc/libstdc++ diagnosis tables | ✅ | Documentary rows; findings cite table ids |
| GNU symbol-version string hints (GLIBC/GLIBCXX/CXXABI) | ✅ | Bounded string scan; not full verneed graph |
| Package metadata: RPM/DEB/makeself/gzip markers | ✅ | Static head only; never runs scriptlets |
| Opt-in readelf/objdump detect-only providers | ✅ | Unavailable when missing; never simulated |
| qemu-user / chroot-rootfs / oss-shim execution environments | ✅ | Absent rootfs/binary → unavailable, never simulated |
| Desktop/audio sourced tables (X11, GTK1, Qt3, OSS) | ✅ | Documentary diagnosis rows |
| Linux reference trials (diagnose-and-advise + compare-versions) | ✅ | L0 without operator rootfs/oracle |
| Linux behavior capture/replay round-trip helper | ✅ | Shared sandbox pipeline; no rootfs claim |
| Verneed-oriented version summary (max GLIBC/GLIBCXX) | ✅ | String-residue scan; not full SHT_GNU_verneed |
| MCP `analyze_legacy_linux` | ✅ | Session authorization required |
| Opt-in lief detect-only provider | ✅ | Unavailable when missing; never simulated |
| Full SHT_GNU_verneed structure walk, goblin | 🚧 | Residual; string summary covers practical diagnosis |
