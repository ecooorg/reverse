## Status

Patch **M** closed at **1.2.0**, Patch **N** at **1.3.5**, Patch **O** at **1.4.0**, and Patch **P** remains in progress through **1.5.9** (2026-11-12); post-N debt increments through **1.3.10** close R-01, R-04, R-05, R-07, R-19 Windows, F-80, F-81, F-82 and F-84. Full matrix green on commit `78a47fd` (Capabilities 43172993614, Structure 43173076031, Mutation 43173019792, Golden 43173044415, Supply chain 43173096703). Residual limitations listed per row (L0 without oracle; Windows/macOS hard-isolation gaps; no full `SHT_GNU_verneed` walk, no `goblin`; F-08 / R-19 macOS closed in 1.3.11; O step 1 (`analyze_legacy_mac`) in 1.3.13 (`ps -p` / `pgrep -P`; true libproc not used)).

# Capability matrix

This file states what really works and what does not. Planned work is only in the last section and in [ROADMAP.md](ROADMAP.md). The first table covers the core areas; the sections below cover the capabilities added by later patches, newest area last.

| Area | Implemented (cumulative through 1.3.10; the patch that added a part is named in brackets) | Explicit limitations |
|---|---|---|
| ELF / PE / Mach-O / Java class | Header magic (Java `.class` is told apart from universal Mach-O), architecture/bitness, file size, hash evidence; **sections, symbols, imports/exports and load commands** where the format tables are present in the read window (Patch E) | No disassembly, decompilation, call graph, or malware verdict (provider engines in F) |
| Android APK/AAB | ZIP inventory: entries, `classes*.dex`, `lib/<abi>/*.so`, ABI list, AndroidManifest/resources.arsc presence, R8/ProGuard path indicators, sibling Gradle lock notes (Patch E) | Binary AXML not decoded; no DEX class listing; no full Gradle resolution |
| Source | Bounded file inventory (5000 files, 2 MiB read per file), extension counts, approximate lines, **comment- and string-aware external imports** (JS/TS/Python/Go/Rust/Java), package manifest (Patch E) | Not a full language AST; no call graph, dead-code proof, or vulnerability scan |
| Dependencies | package.json direct deps plus **lockfile resolution** (package-lock, yarn.lock, Cargo.lock, go.sum, requirements.txt, poetry.lock) with transitive/lock-only nodes and duplicate-version notes (Patch E) | No CVE database, no registry outdated query, no size/replacement recommendations |
| Processes | Visible inventory (listing cap 500; single-process inspection searches the full inventory), PID/PPID, executable/arguments, uptime, threads, RSS/VMS, CPU time where exposed, disk I/O and open-FD count on Linux; visible child tree; start-time identity tokens; UID ownership checks on Linux/macOS | No memory maps or thread stacks; Linux selected-PID inspection uses a direct `/proc/<pid>` fast path; Windows uses a persistent PowerShell CIM helper for inventory, filtered single-PID inspection and process-tree snapshots; macOS uses `ps -p` single-PID inspection and `pgrep -P` for children (F-08 / R-19 macOS closed in 1.3.11; true libproc not used — zero runtime native deps); Windows ownership is not verified; Windows does not report CPU % (RSS only); macOS does not report thread counts (BSD `ps` has no such column); cross-platform metrics are not at parity |
| Profiling | Process-level time series (CPU/RSS/IO); **function hotspots via `get_hotspots` when perf/sample is present and CONTROLLED_EXECUTION is set** (Patch H); disk I/O via `get_process_io` on Linux | Network per-process metrics limited; hotspots never fabricated without a real profiler |
| Benchmark | Repeated command execution, wall-clock duration, median/mean/min/max, stdout/stderr hard-capped at 1 MiB (bytes) per stream with truncation flags, whole-process-tree kill on timeout | Per-run CPU time and peak RAM are SAMPLED (Linux `/proc`, macOS `ps`; lower bounds, direct child only) and Windows uses the persistent PowerShell `Get-Process` helper (verified green on the 1.3.10 full matrix; first-sample startup overhead remains; very short runs may have no sample; Windows samples RSS only, not CPU %); I/O metrics and hardware normalization are not implemented. Interleaved benchmark suites and local baseline artifacts are available. Also reported: binary size of the command, cold/warm label (first process of a call is `cold`; the OS file cache is not dropped). Statistics: P95, std-dev, MAD, outliers, 95% interval, warm-up runs, environment fingerprint; `compare_results` returns `improved`, `regressed`, `no_significant_change` or `insufficient_evidence` (Mann-Whitney plus bootstrap, at least 5 successful runs per side) |
| Validation | Exact expected exit code/stdout/stderr checks; truncated output never matches; a clean mismatch is `completed` with `passed: false` | Not semantic equivalence, test discovery, or proof of correctness |
| Evidence | Typed evidence records, source/time/confidence/limitations/hash, local ID-addressable JSON artifacts, atomic writes and streamed file hashing; research sessions with hash-chained entries, evidence created from analyzer results through `session_id`, and a separate hypothesis ledger with content-checked promotion | Optional HMAC-SHA256 session signing is implemented (patch I); Merkle root and public-key detached signatures are not implemented (ROADMAP debt register, R-14); no remote artifact store |
| Safety | `READ_ONLY` by default; `OBSERVE` samples only verified-owned processes; explicit `CONTROLLED_EXECUTION` scoped cgroup-v2 resource-limit API on delegated Linux hierarchies; ownership and identity checks before moving a process; Linux bwrap/unshare sandbox for executed targets when present (R-20 partial) | Windows/macOS hard process quotas and full network/filesystem isolation are not implemented; cgroup availability depends on delegation and permissions; bwrap/unshare only on Linux when the binary is present |
| MCP | stdio JSON-RPC initialize, ping, tools/list, tools/call; protocol revisions through 2025-11-25; tool titles, annotations and output schemas; request cancellation; benchmark suites and research-session tools; prompts and resources methods (`prompts/list`, `prompts/get`, `resources/list`, `resources/read`, patch L); optional Bearer-token HTTP `POST /rpc` (patch K) | No stateless 2026-07-28 protocol era, roots or OAuth; the HTTP transport is optional, localhost by default and not full MCP Streamable HTTP |
| MCP tool documentation | `docs/MCP.md` tool table generated from the `src/mcp-tools*.ts` registry; `npm run docs:mcp:check` gates drift | The human-written protocol and transport sections remain maintained separately |

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

## Windows compatibility (patch M, closed at 1.2.0; increments through 1.3.10)

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
| Calibration harness (crafted fixtures + operator hash manifests) | step 2 | ✅ | Precision/recall, Brier score and five-bin ECE; crafted corpus is small and descriptive, not statistically representative; operator samples require SHA-256, source and license |
| Legacy authorization and provenance across analyzers, calibration, execution, capture/replay, preservation and migration | 1.3.8 | ✅ | Explicit authorization or authorized session is required; reports carry the declaration; legal status and referenced license/consent are not verified |

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
| Linux a.out (OMAGIC/NMAGIC/ZMAGIC/QMAGIC) | yes (`analyze_legacy_linux`) | must report a.out and architecture/bitness where header permits |
| Linux ELF32 / ELF64 | yes (`analyze_legacy_linux`) | must report class, endianness, machine and type where header permits |
| ELF PT_INTERP / DT_NEEDED / RPATH / RUNPATH | yes | bounded parser; incomplete or malformed tables remain partial |
| Linux libc5 / glibc / libstdc++ markers | yes | static string/soname indicators; not calibrated to production corpora |
| RPM / DEB / makeself / tar markers | yes | bounded static metadata inspection; scriptlets/payloads are never executed |
| readelf / objdump / lief | registered detect-only adapters | available only when executable is detected; `goblin` remains open |

`analyze_legacy_windows` and `analyze_legacy_linux` refuse without a declared authorization (stored in the research session or passed explicitly). The same gate now protects calibration, execution-environment runs, works/fails matrices, behavior observation/capture/replay, preservation reports and migration advice. Their result records carry the declaration as provenance; it is an operator assertion, not legal verification. Static analyzers do not execute targets or upload samples. Open detector and end-to-end items remain in the [Patch M and N plans](ROADMAP.md#active-work-product-patches-mq).

## Hypotheses, similarity and authorization

The hypothesis ledger is implemented in research sessions: hypotheses are tagged `kind: hypothesis`, carry provenance/confidence/status, remain separate from measured and static evidence, and can be promoted only by same-session Validation or Benchmark evidence. The `SimilarityProvider` contract and the `ghidra-similarity` adapter exist (patch F) and no corpus is bundled; further similarity adapters and the ground-truth reference corpus remain planned for O–Q. The initial M authorization record is stored in the research session, gates `analyze_legacy_windows`, and is embedded in its result; it is an operator declaration, not legal verification. See [SECURITY.md](SECURITY.md).

## Remaining product plan (planned, patches O–Q)

The remaining work is one ordered sequence, not parallel capability tracks: M (Windows through 2010), N (old Linux) and **O (Classic Mac / early macOS, closed at 1.4.0)** are closed; **P** delivers legacy Android end-to-end; **Q** extends the workflow to newer generations and unifies compatibility intelligence. Each patch includes the relevant Target Profile, sourced diagnosis, execution, behavior capture/replay, validation and migration reporting. Residual M/N limitations (no function-level equivalence lab, no full environment lifecycle snapshot/restore/trace, unconfigured BSim corpus, small calibration corpora, L0 without oracle) are recorded per row above and in the debt register. See [ROADMAP.md](ROADMAP.md).


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


## Cross-cutting M/N requirements (G-01…G-10, H-03…H-10)

| Requirement | Current M/N implementation | Residual limitation |
|---|---|---|
| G-01 compatibility diagnosis | Windows and Linux sourced tables; findings include table IDs and target evidence | Tables cover selected runtime/format indicators, not complete OS/API/device availability |
| G-02 legacy formats | Bounded DOS/Windows and a.out/ELF inventory | Remaining installer, package, architecture and era families stay as listed in the M/N plans |
| G-03 execution environments | Detected Wine/DOSBox/QEMU/chroot/QEMU-user/OSS-shim adapters, sandboxed runs and works/fails matrix | No general prepare/snapshot/restore/trace lifecycle; unavailable engines remain unsupported; kernel faults need VM |
| G-04 behavior capture/replay | Normalized stdout/stderr, exit/signal and output-file hashes; controlled execution; capture/replay comparison | No registry/preferences, network, UI/audio event capture, clock/random control or original-code coverage |
| G-05 equivalence lab | Oracle-aware preservation report consumes replay comparisons | No function-level equivalence harness or broad property/fuzz corpus |
| G-06 migration advisor | Evidence-backed ranked runtime/environment/hardening options | Not a complete strategy search over wrappers, source ports, rebuilds and rewrites |
| G-07 legal policy | Policy documented; shared authorization gate enforced on M/N legacy APIs | Operator declarations are not legal verification |
| G-08 platform order | M → N → O → P → Q is the only product sequence | O remains not started |
| G-09 support matrix | Windows and Linux format rows are checked against detector/table tests | Coverage is limited to the rows listed; not every format in the plans is implemented |
| G-10 preservation | L0–L3 report; no available oracle forces L0 | No L2/L3 claim for the current bundled M/N reference fixtures |
| H-03 similarity | SimilarityProvider contract and Ghidra BSim extension point | No configured BSim corpus or computed similarity score; further adapters remain open |
| H-04 deterministic-first | Static detections are emitted as facts; analogy tags require confidence and deterministic basis | No legacy analogy tag is currently emitted |
| H-05 authorization | Shared gate required for static analysis, calibration, execution, capture/replay, preservation and migration APIs | Declaration content is not independently verified |
| H-06 corpus policy | Calibration manifests reference files; operator entries require hash, source and license; embedded payload fields are rejected | Operator samples remain local and are not included in the repository |
| H-07 oracle rule | Preservation report enforces L0 without an available oracle | Oracle quality and declared scope remain operator responsibilities |
| H-08 calibration | Precision/recall, Brier score and five-bin ECE reported per detector | Crafted corpus is too small for production calibration; larger operator corpus remains optional |
| H-10 provenance | Authorization included in analysis, calibration, execution, capture/replay, preservation and migration results | Legal basis is self-declared, not verified |

## M/N cross-cutting governance and calibration (1.3.7)

| Capability | Status | Notes |
|---|---|---|
| Shared authorization gate on M/N analyzers, calibration, execution, capture/replay, preservation and migration | ✅ | Requires explicit authorization or a session declaration; outputs retain provenance; declaration is not legal verification |
| Calibration manifest provenance | ✅ | Every entry references a file and requires SHA-256, source and license; relative paths cannot escape manifest directory; embedded payload fields rejected |
| Calibration error metrics | ✅ | Precision/recall, Brier score and five-bin expected calibration error; small crafted corpora are descriptive, not production calibration |
| G-01…G-10 / H-03…H-10 status audit | ✅ | `ROADMAP.md` and this file distinguish current M/N subsets from residual/open scope |

## Patch N carry-over debt closure (1.3.6)

| Debt | Status | Evidence |
|---|---|---|
| R-07 MCP contract-first documentation | ✅ | Generated table from the same built tool registry used by `tools/list`; check runs in `npm run verify` and Capabilities CI |
| R-19 Windows persistent helper | ✅ | One PowerShell process serves CIM inventory, single-PID inspection, process-tree snapshots and benchmark samples; 1.3.9 fixed script/stdout newline framing (UTF-16LE EncodedCommand), 1.3.10 detaches the idle helper from the event loop (F-84); the lifecycle passes in the full matrix on commit `f85200e` |
| R-02 Linux untrusted text | ✅ | `analyzeLegacyLinux` applies `wrapUntrusted` at its library boundary; adversarial ELF PT_INTERP fixture verifies marker and truncation |
| R-15 Linux golden trials | ✅ | Golden manifest and legacy reference golden tests are included in the manual `Nightly Full Verification` workflow; fixture trials remain L0 without an oracle |


## Static quality gates and mutation baseline (R-05, R-04, R-01)

`npm run quality:static`, the format check and the own-line size gate (1.3.6) are joined in 1.3.10 by `npm run lint` (Biome, `src` and `tests/*.ts`, warnings are errors), `npm run dup:check` (`jscpd`, 0.83 % baseline, threshold 1.5 %) and `npm run unused:check` (`knip`). Lint and duplication run in the Capabilities workflow static gates step; `knip` runs right after the build (it follows the tests' imports of `dist`); all are in `npm run quality`. `tests/legacy-linux-property.test.ts` adds `fast-check` property tests (fixed seed) for the a.out, ELF and archive parsers and `summarizeVerneed`. `npm run mutation` and the manual `Mutation testing` workflow run Stryker on four pure modules; Stryker baseline (Linux, Node 22, command runner, 679 mutants in `benchmark-stats`, `process-parse`, `legacy-linux-symver` and `legacy-linux-packages`): **47.72 %** (316 killed, 8 timed out, 355 survived); per module 67.95 / 22.27 / 65.09 / 31.07 %. Floor `thresholds.break` = 45. The same 47.72 % was reproduced by the manual workflow in CI. The score is a recorded baseline, not a quality claim: two modules (`process-parse`, `legacy-linux-packages`) have many surviving mutants. The `.mjs` CI helpers are outside the lint scope.


## Classic Mac / early macOS (Patch O, closed at 1.4.0; surface grown through 1.4.2)

| Capability | Status | Notes |
|---|---|---|
| `analyzeLegacyMac` Mach-O / fat recognition | ✅ | Reuses bounded Mach-O load-command walk; dylibs, min OS, code-signature presence |
| PEF/CFM magic (`Joy!`) | ✅ | Architecture from header fourcc (`pwpc` / `m68k`) |
| AppleDouble resource-fork container | ✅ | Finder type/creator; scanned resource type fourccs when present |
| Mac Target Profile fields | ✅ | `codeModel`, `endianness`, `resourceInventory`, `creatorType`, `bundleLayout` (null), `rosettaOr32BitDependence` |
| MCP `analyze_legacy_mac` | ✅ | Session authorization required |
| 68k CODE deep parser, HFS images, `.app` / Info.plist | partial | Info.plist + CODE candidates + HFS leaf walk delivered; full segment loader residual |
| Calibration corpus + precision/recall | ✅ | Crafted fixtures (1.3.14); operator hash manifests |
| MacBinary II / BinHex 4.0 | ✅ | Header recognition |
| HFS / HFS+ volume signature at offset 1024 | ✅ | Bounded catalog leaf walk (`hfs-catalog-btree`) |
| StuffIt / disk-image container markers | ✅ | Detection only |
| Info.plist CFBundle* summary | ✅ | When path basename is Info.plist |
| Mach-O MH_PIE flag | ✅ | R-11 Mach-O partial |
| Hostile-input property tests (R-04 Mac) | ✅ | fast-check; fixed seed |
| 68k CODE deep parser, PEF fragment graph, HFS catalog | 🚧 | Remaining step 3 |

### Compatibility diagnosis (O step 4, 1.3.16)

| Table / rule | Status |
|---|---|
| `mac-code-models` (68k, PEF/CFM, PowerPC/Rosetta, 32-bit Intel, Classic removed) | ✅ |
| `mac-resource-filesystem` (resource-fork loss, creator/type, HFS names, BinHex) | ✅ |
| `mac-runtime-frameworks` (Carbon, QuickTime, codesign/notarization) | ✅ |
| `diagnoseMacFromTables` → `compatibilityFindings` with table ids | ✅ |
| Host runtime probe / emulator execution | 🚧 | O step 5 |

### Environments (O step 5, 1.3.17)

| Engine | Status |
|---|---|
| Basilisk II | ✅ detect-only (PATH) |
| Mini vMac | ✅ detect-only |
| SheepShaver | ✅ detect-only |
| qemu-system-ppc / ppc64 | ✅ detect-only |
| Operator ROM/image fingerprint | 🚧 | recorded limitation until hashed |
| Works/fails matrix with real runs | 🚧 | needs operator-supplied media |

### Inventory depth (O step 3 residual, 1.3.17)

| Item | Status |
|---|---|
| PEF section count | ✅ |
| CODE resource id scan | ✅ best-effort |
| HFS MDB allocation block size | ✅ |
| Full HFS catalog B-tree | 🚧 |
| PEF loader string / fragment graph | 🚧 |


### Capture / replay (O step 6, 1.3.21)

| Item | Status |
|---|---|
| Shared capture/replay round-trip (host deterministic scenario) | ✅ |
| Mac emulator fingerprints in trial limitations | ✅ |
| Operator ROM/image local SHA-256 | ✅ (never uploaded) |
| Emulator input injection / screenshot norm | 🚧 |
| Disk-image snapshot diffs | 🚧 |
| Toolbox trap tracing | 🚧 |


### Inventory residual (1.3.22)

| Item | Status |
|---|---|
| PEF loader string scan | ✅ best-effort |
| HFS volume name (Pascal) | ✅ |
| HFS catalog first extent | ✅ |
| HFS catalog B-tree walk | 🚧 |
| PEF fragment / import graph | 🚧 |


### Toolbox traps (1.3.23)

| Item | Status |
|---|---|
| A-line trap word scan (0xA000–0xA7FF) | ✅ best-effort detector `toolbox-traps` |
| Named trap inventory / dispatch table | 🚧 |


### O residual max (1.3.24)

| Item | Status |
|---|---|
| HFS catalog B-tree leaf walk (bounded) | ✅ `hfs-catalog-btree` |
| Named Toolbox traps (selected table) | ✅ |
| CODE segment candidates | ✅ `code-segments` |
| PEF import string detector | ✅ `pef-imports` |
| Mac reference trials (2 scenarios, L0) | ✅ |
| Disk-image hash diff (operator trees) | ✅ |
| Full PEF fragment/import graph | ✅ best-effort `pef-fragment-graph` |
| Emulator works/fails with operator ROM | 🚧 residual (operator media) |
| Patch O closed at 1.4.0 | ✅ |


### Size gate & works/fails (1.3.25)

| Item | Status |
|---|---|
| `legacy-mac.ts` ≤1000 lines via `legacy-mac-parsers.ts` | ✅ |
| Mac works/fails matrix API | ✅ (unsupported without ROM/emulator) |
| Real boot under Basilisk/SheepShaver | 🚧 operator ROM required |


## Patch O closed (1.4.0)

Classic Mac / early macOS static analysis and limited execution adapters are **delivered**. Residual 🚧 items are explicit limitations.

| Capability | Status |
|---|---|
| `analyze_legacy_mac` + authorization | ✅ |
| Mach-O / fat / PEF / AppleDouble / MacBinary / BinHex / HFS | ✅ |
| HFS catalog B-tree (bounded leaf walk) | ✅ |
| PEF imports + fragment graph (best-effort) | ✅ |
| Toolbox A-line traps (named subset) | ✅ |
| Diagnosis tables | ✅ |
| Emulator detect-only + works/fails API | ✅ (unsupported without ROM) |
| Reference trials (2, L0) | ✅ |
| Capture/replay host deterministic | ✅ |
| Emulator input injection / screenshots | 🚧 residual |
| Full PEF export/import symbol tables | 🚧 residual |
| Real ROM boot matrix | 🚧 residual (operator media) |


## Legacy Android (Patch P steps 0–1 and 6, 1.5.0–1.5.7)

| Capability | Status | Notes |
|---|---|---|
| `analyze_legacy_android` + authorization gate | ✅ | Session or explicit declaration |
| DEX magic / APK ZIP inventory reuse | ✅ | Via `analysis-android` |
| Target Profile (family Android, ABI, bitness, codeModel) | ✅ | minSdk not decoded |
| Signing scheme v1 hint | ✅ | META-INF; v2/v3 not parsed |
| AXML minSdk/targetSdk hints | ✅ | Best-effort scan (1.5.1) |
| Full AXML / resources.arsc decode | 🚧 | later P |
| Emulator / adb execution | 🚧 | P later steps |


### P step 3 (1.5.2)

| Item | Status |
|---|---|
| `android-api-behavior` table | ✅ |
| `android-runtime-models` table | ✅ |
| `diagnoseAndroidFromTables` | ✅ |
| Device/emulator execution | 🚧 |


### P step 4 (1.5.3)

| Item | Status |
|---|---|
| `adb` / `emulator` ExecutionEnvironment | ✅ detect-only |
| `runAndroidWorksFailsMatrix` | ✅ unsupported without SERIAL/AVD |
| Automated install/run | 🚧 operator confirm path |


### P step 5 (1.5.4)

| Item | Status |
|---|---|
| `planAndroidControlledInstall` | ✅ gated (mode + confirm + serial) |
| `collect_android_device_observations` MCP tool | ✅ session authorization, controlled mode, confirmation, bounded read-only adb; no serial returns unsupported |
| Host `runAndroidBehaviorRoundTrip` | ✅ via shared capture/replay |
| Device logcat/uiautomator capture | 🚧 |


### P step 6 (1.5.5–1.5.6)

| Item | Status | Notes |
|---|---|---|
| `runAndroidReferenceTrials` (L0) | ✅ | Crafted DEX + diagnosis + authorization provenance |
| `collectAndroidDeviceObservations` | ✅ | Library API only (not MCP-exposed); read-only `adb logcat` + `dumpsys activity activities`; authorization, controlled mode, confirm and serial required |
| Operator APK oracle / higher L | 🚧 | No original-API oracle automation |
| UI hierarchy / screenshots / seeded input replay | 🚧 | Remaining P step 6 |
| Network / persisted-state diff, Frida and profiler ingestion | 🚧 | Remaining P step 6 |
