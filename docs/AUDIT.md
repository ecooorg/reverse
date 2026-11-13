## Audit 36 — 2026-11-13 — audit-2.0.5 remediation (2.0.6)

**Scope.** Address maintainer audit-2.0.5 against green 2.0.5 (Capabilities **43426001819**).

**P0 documentation.**
- Q status corrected from blanket "done" to **partial** with residual checklist explicit.
- Status at a glance / verification updated to run **43426001819**.
- README project status aligned; package description clarified.
- This entry is the maintainer-facing sign-off that Q residual items are limitations, not silent opens (Q-02).

**Code.**
- D-01: expanded `EXEC_TOOLS` so validation/trial/provider/trace paths use `checkCommandGate`.
- D-03: sandbox seed paths validated with `path.relative`; nested seeds get `mkdir`.
- D-05: CLI `parseArgs` declares `confirm`, `verdict`, `validation`, `bin`.
- D-06: CI AI summary ignores additional TAP-success patterns.
- N-01: CLI commands `analyze-legacy-android`, `inventory-newer`, `unified-report`.

**Not in this change (still residual / N-series):** R-14 Merkle/Ed25519 export-verify; full harness/single-binary; complete M–O MCP parity with Android; HTTP MCP tool subset documentation depth; full Q detailed checklist implementation.

**Status:** remediation shipped as **2.0.6**. Re-run Capabilities after unpack.

## Audit 35 — 2026-11-13 — 2.0.1 repair of red 2.0.0 (compile + format)

**Scope.** Fix TypeScript and format gates that failed on 2.0.0 (`8d4d9a7`).

**Failures (evidence).**
- Capabilities **43417613778**, Mutation **43417643951**, Nightly Full Verification **43417671212**:
  - `TS6133` unused `dllCharOff` in `newer-generation-inventory.ts`
  - `TS2339` `TargetProfile.arch` / `TargetProfile.format` (schema uses `cpu` and has no `format`)
  - Format drift on 9 files (printer 5.9 not applied after Q edits)

**Fixes.**
- Map unified report fields to real `TargetProfile` keys (`cpu`, `toolchainRuntimeFramework`).
- Remove unused PE offset temporary.
- Re-print drifted sources with TypeScript 5.9 printer; line length ≤140.
- Capability fixture for Patch Q uses a complete `schemaVersion: '1.0'` profile.

**Status:** repair shipped as **2.0.1**. Re-run Capabilities / Structure / Mutation / Nightly to confirm green.

## Audit 34 — 2026-11-13 — Patch P closed (1.5.22)

**Scope.** Close Patch P (legacy Android) with residual operator-plan surface and explicit limitations.

**Delivered in close:** build/Play-services path markers; Frida call-frequency script plan; proxy/pcap plan (non-MITM); security review note; CAPABILITIES residual list; ROADMAP P → done.

**Verification foundation:** Capabilities **43410508116** (6 environments) on 1.5.20 `0235676`; Structure/Supply/Mutation companion runs recorded in Audit 30.

**Status:** Patch P closed in 1.5.22. Residual depth items are limitations, not open checklist blockers.

## Audit 33 — 2026-11-13 — Patch P green baseline 1.5.20 / docs close 1.5.21

**Scope.** Record multi-workflow green verification of **1.5.20** (`0235676`) and close Patch P checklist debts that are proven by code and the capability matrix.

**Evidence.**
- Capabilities **43410508116** — 6 environments, no failed must-work checks (AI-DEBUG “error-like” lines are TAP false positives).
- Structure **43410586035**, Supply chain **43410611527**, Mutation testing **43410529473**.

**Closed against P plan (docs 1.5.21):** multi-OS run ID; MCP docs contract; L0 reference trials (R-15 L0 share via capability suite); provider registration; install/clear gates; works/fails matrix; inventory-level ABI/build markers; G-09 Android rows as implemented.

**Still open / explicit limitations:** full ARSC values, full cert chains, continuous Frida, proxy/pcap, multi-API oracle L1+, security-review narrative for release 1.5.0, deep TEXTREL/Play-services analysis.

**Status:** verification recorded; residual items remain limitations until deepened or accepted at 1.5.0 exit.

## Audit 32 — 2026-11-12 — Capability suite timeout on Windows Node 22 (1.5.10)

**Scope.** Explain the red *Enforce required checks* step of Nightly Full Verification #3 (run 43302140821, commit de40f11) after the 1.5.9 shell repair.

**Findings (closed in 1.5.10).**
- F-94: `npm run verify` passed `--test-timeout=90000`. Node 22 applies that limit to the test file as a whole, so the cumulative run time counts, not each check. On Windows the suite needs about 92 s (the slowest checks are 23 s, 11 s, 9 s and 8 s); the file was cancelled after 129 passing checks and 0 failures, and the remaining checks never ran. Node 24 passed all 182 checks in the same run. `capabilities.yml` already uses 240000. `verify` now uses 240000 and every check keeps a 90 s limit of its own, so a hung check is still named. A capability check fails if the whole-file limit drops below 240000.

**Confirmed by the same run.** The default bash shell of 1.5.9 works: static gates, build and the capability suite ran on Windows. The supply-chain job passed and the mutation job published its Markdown table within the summary limit (score 47.72 %, floor 45 %).

**Verification.** In the 1.5.10 environment (Linux, Node 22.23, TypeScript 6.0.3 standing in for the locked 5.9 printer, `@types/node` 26; `npm ci` was not possible offline) the package build, the unit suite (160 tests; the two `fast-check` property files could not run), the capability suite (183 checks: 177 verified, 6 documented limitations, 0 drift, 0 failed), MCP docs, source and built structure, size and static-quality checks passed, and the printer reported no drift in 124 files. Nightly Full Verification #3 (run 43302140821, commit de40f11) showed on Windows Node 24 all 182 capability checks passing; on Windows Node 22 129 checks passed and the file hit the old 90 s limit, which 1.5.10 replaces; the supply-chain and mutation jobs of that run passed (mutation score 47.72 %, floor 45 %). The Windows Node 22 re-run of 1.5.10 is pending verification. Biome lint, `jscpd`, `knip`, the property tests, coverage, macOS and the manual `os: all` run were not run here.

---

## Audit 31 — 2026-11-12 — Nightly Full Verification repair, Windows red (1.5.9)

**Scope.** Explain and close the Windows failures of Nightly Full Verification #2 (run 43299003746, commit 753b5a1) and the annotation raised by its mutation job.

**Findings (closed in 1.5.9).**
- F-92: the workflow declared no default shell. On Windows runners `run` steps use PowerShell, which cannot parse the bash group redirection, `KNIP_DISABLE_RAW_TRANSFER=1 npm …` prefix or `${!check}` expansion; static gates (step 5), build (step 6), the status table (step 12) and the enforcement step (step 16) failed on Node 22 and Node 24, and the dependent steps were skipped. Linux and macOS were unaffected. `capabilities.yml` and `structure.yml` already set `defaults.run.shell: bash`.
- F-93: the mutation job appended `ci-logs/mutation-report.json` (2.6 MB) to the step summary, which GitHub limits to 1 MiB. It now pipes the Markdown table from `tests/mutation-summary.mjs` into the summary; the JSON stays an artifact.
- New check *Workflows — Windows-capable workflows default to bash and never append raw JSON to the step summary* fails against the 1.5.8 workflow and passes now.

**Limits of this diagnosis.** Step logs of the run require a sign-in and were not readable; the cause follows from the failing step numbers, the workflow file and the contrast with the workflows that are green on Windows. Windows steps that were previously skipped (capability suite, coverage, structure, golden trials) have not run in this workflow yet, so further Windows-specific failures cannot be excluded.

**Verification.** In the 1.5.9 environment (Linux, Node 22.23, TypeScript 6.0.3 standing in for the locked 5.9 printer, `@types/node` 26; `npm ci` was not possible offline) the package build, the unit suite (160 tests; the two `fast-check` property files could not run), the capability suite (182 checks: 176 verified, 6 documented limitations, 0 drift, 0 failed), MCP docs, source and built structure, size and static-quality checks passed, and the printer reported no drift in 124 files. The Windows failures of Nightly Full Verification #2 were diagnosed from the run annotations and the workflow file (step logs require a sign-in); the fix is pending verification on Windows. Biome lint, `jscpd`, `knip`, the property tests, coverage, mutation, the macOS and Node 24 matrix and the manual `os: all` run were not run here.

---

## Audit 30 — 2026-11-12 — CI repair of 1.5.7 (1.5.8)

**Scope.** Close the failures hidden behind the first red gate of Capabilities run #529 and the checks that 1.5.7 never executed.

**Findings (all closed in 1.5.8).**
- F-89: `src/index.ts`, `src/legacy-android-behavior.ts` and `tests/legacy-android.test.ts` drifted from the TypeScript printer; the multi-line export/import would print as 190/167-character lines, so they were split into two statements.
- F-90: `DOCUMENTED_TOOLS` in `tests/capabilities-suite.ts` omitted `collect_android_device_observations` (position after `analyze_legacy_android`), failing four MCP and Legacy Android checks (64 ≠ 63).
- F-91: the device-text assertions in `tests/legacy-android.test.ts` and `tests/capabilities-suite.ts` required length ≤ 4096, contradicting the documented `wrapUntrusted` marker contract (`tests/untrusted.test.ts`). The product is unchanged; the assertions now require exactly 4096 characters plus `…[truncated 904 chars]`, and fail under a deliberate change of the cut length or the marker count.

**Verification.** In the 1.5.8 environment (Linux, Node 22.23, TypeScript 6.0.3 standing in for the locked 5.9 printer, `@types/node` 26; `npm ci` was not possible offline) the package build, the unit suite (160 tests; the two `fast-check` property files could not run), the capability suite (181 checks: 175 verified, 6 documented limitations, 0 drift, 0 failed), MCP docs, source and built structure, size and static-quality checks passed, and the printer reported no drift in 124 files. Biome lint, `jscpd`, `knip`, the property tests, coverage, mutation, the macOS/Windows and Node 24 matrix and the manual `os: all` workflow were not run.

---

## Audit 29 — 2026-11-12 — Patch P step 6 MCP integration and manual deep verification (1.5.7)

**Scope.** Expose the bounded Android observation helper through the stable MCP contract and consolidate the expensive manual verification workflows without adding automatic triggers.

**Delivered.**
- Added `collect_android_device_observations` to MCP `tools/list` and `tools/call`; it resolves authorization from the research session and preserves `CONTROLLED_EXECUTION`, `confirm=true`, explicit serial, bounded output and read-only adb behavior.
- Added an MCP end-to-end test that creates a session, declares authorization, discovers the tool and verifies the no-serial refusal path without running adb.
- Replaced the Patch N-only manual workflow file with `Nightly Full Verification`, a `workflow_dispatch`-only deep gate covering the 3-OS × Node 22/24 matrix, static quality, build, unit tests, capability verification, coverage, structure, reference golden trials, supply-chain/package checks and optional Stryker mutation testing.
- No `schedule`, `push` or `pull_request` trigger is configured for the new workflow. The existing `Capabilities` workflow is unchanged.

**Remaining.** Android UI hierarchy/screenshots, seeded input replay, network and persisted-state diffs, Frida profiles and simpleperf/Perfetto ingestion remain open under Patch P.

**Verification.** `npm ci --ignore-scripts --fetch-retries=5 --fetch-timeout=120000` timed out after five minutes. The resulting dependency tree is incomplete: `npm run build` stops at TS2688 (missing Node type definitions), and `tests/format-check.mjs` cannot load `typescript-api`. The new MCP server, tool registry and test were transpiled with the system TypeScript 5.8.3 compiler; the focused MCP integration file passed 3/3 tests, including the new authorized no-device path. `tests/mcp-docs.mjs`, `tests/check-structure.mjs --built`, `tests/size-gate.mjs` and `tests/quality-static.mjs` passed. The required TypeScript 5.9 printer, full build, complete unit suite, capability suite, coverage, mutation and cross-platform matrix remain unverified. No green full-matrix result is claimed.

---

## Audit 28 — 2026-11-12 — Patch P step 6: bounded Android device observations (1.5.6)

**Scope.** Deliver the first device-side capture slice without claiming full scenario replay.

**Delivered.**
- `collectAndroidDeviceObservations` uses the shared authorization gate and requires `REVERSE_MODE=CONTROLLED_EXECUTION`, `confirm=true` and an explicit device serial.
- Read-only `adb logcat -d -t N` and `adb shell dumpsys activity activities` calls use argument arrays (no shell), 15-second per-command timeouts and bounded output.
- Missing/invalid serial returns `unsupported` without starting adb. The helper does not install, launch, clear or otherwise mutate the device.
- Device-controlled output passes through `wrapUntrusted`; adversarial tests verify the untrusted marker and string cap (R-02).

**Remaining.** UI hierarchy/screenshots, seeded input replay, network and persisted-state diffs, Frida scripts/call-frequency profiles, and `simpleperf`/Perfetto ingestion remain open under P step 6.

**Verification.** Local dependency installation did not complete in this environment (Node 22.16.0; package engine warnings and install timeout). Structure check passes; build, unit, capability, format and cross-platform CI gates remain pending. No green matrix is claimed.

---

## Audit 27 — 2026-11-12 — Debt register 1.4.2; Patch P steps 0–1 start (1.5.0)

**Scope.** Fold the 1.4.2 debt-register revision into project docs; correct CAPABILITIES header drift; open **Patch P** (legacy Android) at **1.5.0** with step 0 decision and step 1 authorization-gated Target Profile (`analyze_legacy_android`).

**Debt register (slice 1.4.2 → start of P).**

| Class | IDs | Notes |
|---|---|---|
| Closed since 1.3.10 | F-08/R-19 macOS, Patch O at 1.4.0, hygiene 1.4.1–1.4.2 | Do not reopen |
| Open observe | **F-83** | Linux N22 timeout historically; not reproduced on 1.4.2 green matrix |
| Open low | **F-86** | 4 moderate dev-tree advisories; production audit clean |
| Docs | **F-87** | CAPABILITIES intro still cited 1.3.10 / `78a47fd` — **closed in this audit** |
| Process | **F-88** | `os: all` run ID for O close not yet pasted by maintainer — still open |
| Residual R | R-10 goblin, R-11 hardening depth, R-20 isolation gaps, verneed walk | Carry-over |
| O residuals | O-R1…O-R8 | PEF symbols, full HFS B-tree, emulator injection, real ROM matrix, … — explicit 🚧 |
| G/H partial | G-03…G-06, G-10, H-03, H-08, H-09 | Shared M–Q dimensions |

**Patch P step 0 decision.** Audit 8 Android non-claims are **not** promoted into P scope before step 3. Step 1 delivers authorization + Target Profile only; AXML decode, emulator runs and capture/replay remain later steps.

**Product.** `src/legacy-android.ts` + MCP `analyze_legacy_android`; DEX/APK inventory reused from `analysis-android`; limitations recorded (no AXML decode, no v2/v3 parse).

**Verification.** Structure/format/size gates expected green; capability checks for tool registration and DEX profile. Full matrix after merge.

---

## Audit 26 — 2026-11-12 — Patch O closed; green matrix on 1.4.2 (documentation)

**Scope.** Record the closure of Patch O (Classic Mac / early macOS) at **1.4.0** and the post-close maintenance line **1.4.1–1.4.2** after a green Capabilities matrix. Documentation-only; no product code change in this entry.

**Product outcome.**

| Item | Status |
|---|---|
| Patch O (Classic Mac / early macOS) | **Closed at 1.4.0** with release record in ROADMAP |
| Post-close 1.4.1 | knip: wire `diffDiskImageHashes` into tests and public index export |
| Post-close 1.4.2 | ROADMAP M–Q status table O = **done**; capability suite no longer expects O `in progress` |
| Capability matrix | **Green** on 1.4.2 (operator-confirmed) |

**Delivered surface (O).** `analyze_legacy_mac` + session authorization; Mach-O/fat, PEF, AppleDouble, MacBinary, BinHex, HFS MDB + bounded catalog leaf walk; PEF imports and best-effort fragment graph; named Toolbox A-line traps; CODE segment candidates; sourced Mac diagnosis tables; calibration harness; detect-only BasiliskII / Mini vMac / SheepShaver / qemu-ppc; works/fails matrix (unsupported without operator ROM); host capture/replay round-trip; ROM local hashing; disk-image hash diff; two reference trials at L0.

**Explicit residuals (CAPABILITIES.md, not ❌ for delivered scope).** Full PEF export/import symbol tables; emulator input injection and screenshot normalization; real ROM boot works/fails only when the operator supplies ROM/image and an emulator on PATH; native resource-fork write paths.

**Next product unit.** Patch P (legacy Android) — not started; entry criteria = O released as 1.4.0.

**Verification.** Operator reports all CI checks green on the 1.4.2 tree. Maintainer should record the final `os: all` run ID in the ROADMAP release notes when available.

---

## Audit 25 — 2026-11-12 — O step 0: macOS single-PID process path (1.3.11)

**Scope.** Close F-08 macOS and R-19 macOS before Patch O feature work. No Classic Mac format work is included.

**Findings closed.**

| ID | Severity | Area | Summary | Status |
|---|---|---|---|---|
| F-08 | Medium | Processes / macOS | Single-PID inspection enumerated the full `ps -ax` table | Status: closed in 1.3.11 — `ps -p <pid>` + `pgrep -P` for children |
| R-19 (macOS) | Medium | Processes / macOS | Sampling forked a full-table `ps` per sample; debt named `libproc` | Status: closed in 1.3.11 for the stated goal (no full-table read on inspect/sample). True `libproc` is not used: zero runtime native dependencies; pure `ps -p` is the portable equivalent |

**Implementation notes.** `macOsInfo` in `process-inspector.ts` runs two `ps -p` calls (metrics columns and args) and optional `pgrep -P` for direct children. Inventory (`listProcesses`) still uses full `ps -ax`. Coverage notes state the limitation explicitly. Linux and Windows fast paths are unchanged.

**Verification.** Structure check passes. Unit/capability suite on Linux host: process checks remain green (darwin branch is compile-time selected). Full macOS matrix verification is pending the next `os: all` run.

---

## Audit 24 — 2026-11-12 — Documentation sync after green 1.3.10 matrix (no product code change)

**Scope.** Align ROADMAP, CAPABILITIES, AUDIT, MCP, ARCHITECTURE, README and SECURITY with the final green matrix on commit `78a47fd` and with the debts audit. Close documentation debts that are confirmed by logs or existing code. No version bump and no product-feature work; this is a documentation-only maintenance entry (no patch letter).

**Findings.**

| ID | Severity | Area | Summary | Status |
|---|---|---|---|---|
| F-85 | Low | Documentation | Drift after 1.3.10: CAPABILITIES labelled Patch M in progress; ROADMAP debt register had a contradictory G-01…G-10 row; Status at a glance cited superseded run IDs; MCP/ARCHITECTURE/README/SECURITY carried stale M-in-progress and sandbox wording | Status: closed in this documentation sync |
| F-86 | Low | Supply chain (dev) | `npm ci` reports 4 moderate advisories in the full tree (minimatch via Stryker, qs via typed-rest-client); production audit (`--omit=dev`) is clean | Status: open; dev-only; do not change dependencies without maintainer approval |

**Closures confirmed by the final matrix (Capabilities 43172993614 and companions on `78a47fd`).**

- **F-80** — format gate passes (109 TypeScript files). Status: closed in 1.3.10.
- **F-81** — summary regression test and green summary job. Status: closed in 1.3.10.
- **F-82 / F-84** — Windows helper protocol and idle-helper unref. Status: closed in 1.3.9 / 1.3.10; final verification on 43172993614.
- **R-19 (Windows)** — persistent PowerShell helper verified on all Windows cells. Status: closed in 1.3.10; macOS part remains O step 0.
- **R-05 / F-33 (available part)** — Biome, jscpd, knip and quality:static are CI-gated; R-03 check ✅ on all six cells. Status: closed in 1.3.10.
- **F-83** — still open; not reproduced in three consecutive green matrices including 43172993614; root cause unconfirmed; do not weaken timeouts.

**Verification.** Archive matches commit `78a47fd` (149 tracked files; size gate 78 files / 13796 lines). Local: `npm ci`, build, check-structure --built, docs:mcp:check, quality:static and capability suite 157/157 pass on the untouched baseline. Tools/list remains 61 tools.

**Readiness for Patch O.** Entry criteria are met (N closed at 1.3.5; matrix, structure, mutation and golden green on final code). First work items of O are step 0 debts F-08 macOS and R-19 macOS (`inspectProcess` still reads the full `ps -ax` table; no `libproc`). F-83 remains open for observation only.

---

## Audit 23 — 2026-11-11 — Windows helper protocol recovery and Linux Node 22 timeout (1.3.9)

**Scope.** Diagnose Capabilities run [43084133732](https://github.com/ecooorg/reverse/actions/runs/43084133732). Fix the confirmed Windows persistent PowerShell helper source/framing defect without weakening process, profiling, benchmark or MCP checks. Record the separate Linux Node 22 timeout as unresolved because the available failure brief does not identify a failing capability check. No Patch O work is included.

**Findings.**

- **F-82 — Persistent PowerShell helper used escaped text instead of line boundaries.** The helper assembled its multiline script with the two-character sequence `\\n` and searched stdout for that same sequence; PowerShell received a malformed `Select-Object` expression and exited before returning process data. The source now joins script lines with LF, frames stdout on LF (stripping an optional CR), and starts PowerShell with UTF-16LE `-EncodedCommand` so multiline source is not subject to `-Command` quoting. A platform-independent test decodes the command and checks the real newline contract. Windows execution remains pending a Windows CI run.
- **F-84 — Idle Windows helper kept the host process alive.** Run 43105112195: the Windows capability file reported every check as passed but did not exit and was cancelled by the 240 s timeout. The persistent PowerShell child and its three pipes held the event loop, and the `exit` handler that kills the child never ran. Fix: `unref` the child and its streams; pending requests stay alive through their own timers.
- **F-83 — Linux Node 22 capability-suite timeout/cancellation.** The 1.3.9 source snapshot records that the Linux Node 22 capability job exited with a timeout/cancellation classification in run 43084133732. The available failure brief lists selected successful checks but does not identify the timed-out check or provide the complete test-runner tail. Root cause is therefore unconfirmed; keep open and inspect the full job log on the next run rather than increasing timeouts or weakening checks speculatively.

**Verification.** On Linux with Node 22.16.0 and the available TypeScript 5.8.3 toolchain: `npm test` passes 124/124; a direct capability-suite invocation passes 157/157; `format:check` passes 108 TypeScript files; `quality:static`, size gate, MCP docs check, CI summary tests (12/12), and source/built structure checks pass. `npm ci` was not run, so the locked TypeScript 5.9.3 toolchain is not verified. The `npm run verify` wrapper did not finish within the local command window, although the direct capability suite passed. Windows PowerShell execution and the Linux Node 22.23.4 GitHub matrix remain pending.

| ID | Sev | Area | Finding | Status |
|---|---|---|---|---|
| F-82 | High | Windows process helper | Literal escaped newlines malformed the persistent PowerShell script and stdout framing | Status: fixed in 1.3.9; platform-independent contract test added; verified by the green full matrix on `f85200e` |
| F-84 | High | Windows process helper | Idle persistent PowerShell helper kept the host process alive; the capability file finished all 108 checks but hit the 240 s timeout | Status: fixed in 1.3.10 (`unref` of helper and pipes); verified by the green full matrix on `f85200e` |
| F-83 | Medium | CI / Linux Node 22 | Capability suite exited with timeout/cancellation classification; available failure brief does not identify the check | Status: open, not reproduced in the green full matrix (run 43110447213); probable cause F-84 (unconfirmed: the failure-brief header said Linux while log paths were Windows); no timeout policy changed |

---

## Audit 22 — 2026-11-11 — CI formatting recovery and failure aggregation (1.3.8)

**Scope.** Resolve the first failing gate in Capabilities run [43079862360](https://github.com/ecooorg/reverse/actions/runs/43079862360) and prevent a downstream summary job from obscuring an upstream failure when no capability report exists. No product capability or Patch O work is included.

**Findings.**

- **F-80 — TypeScript formatting drift.** The 1.3.7 manual matrix failed its static quality step on all six OS/Node cells because the TypeScript printer check found ten unformatted `.ts` files. The previous local verification had not run `format:check` with the locked formatter package because dependency installation timed out. The ten files are now printed using the TypeScript compiler printer; the repository format check is locally exercised with the available global compiler, while the exact locked TypeScript 5.9.3 toolchain and GitHub rerun remain pending.
- **F-81 — Cascading missing-report failure.** The capability suite did not start after the earlier formatting step failed, so its `after` hook could not create JSON reports. The summary job nevertheless ran `capability-report.mjs reports/*.json` and failed with a second, derivative error. Report aggregation now runs only when the capability matrix succeeds; otherwise the job writes an explicit note that reports are absent because the prerequisite matrix failed. The original capability job remains the authoritative failure.

**Verification.** Ten TypeScript files were normalized with the available TypeScript 5.8.3 printer; the format check, static quality, size gate, source structure, and CI summary tests are recorded in the delivery report. `npm ci --ignore-scripts` timed out, so the locked TypeScript 5.9.3 package and full build/test suite were not available locally. The required manual `os: all` rerun has not yet been run. No cross-platform green result is claimed.

| ID | Sev | Area | Finding | Status |
|---|---|---|---|---|
| F-80 | Medium | CI formatting | Ten TypeScript files failed the formatter gate in all six 1.3.7 matrix cells; local verification had not run the locked formatter | Status: pending verification in 1.3.8; TypeScript 5.8.3 printer check passes locally, exact locked-toolchain CI rerun pending |
| F-81 | Low | CI diagnostics | Summary aggregation reported missing capability JSON as a second failure when upstream jobs failed before the capability suite ran | Status: implemented in 1.3.8; local regression test passes, GitHub workflow rerun pending verification |

---

## Audit 21 — 2026-11-11 — M/N cross-cutting governance and roadmap verification (1.3.7)

**Scope.** Close the remaining M/N governance gap identified while reviewing G-01…G-10 and H-03…H-10, enforce corpus provenance in calibration manifests, add meaningful calibration error metrics, and reconcile the Roadmap/Architecture/CAPABILITIES statements. No Patch O work is included.

**Delivered.**

- **H-05 / H-10:** the shared authorization gate now protects Windows/Linux calibration, execution-environment runs, works/fails matrices, behavior observation/capture/replay, preservation reports and migration advice. Analysis, calibration, execution, capture/replay, preservation and migration outputs carry the operator declaration. This is not legal verification. The internal M/N reference-trial helpers use the declaration only for their own generated fixtures.
- **H-06:** calibration manifests now reference files only, reject embedded payload fields, constrain relative paths to the manifest directory, and require a valid SHA-256, source and license for every entry. The hash is checked before analysis. Crafted fixtures also carry hashes and provenance.
- **H-08:** calibration reports add Brier score and five-bin expected calibration error alongside precision/recall. The small crafted corpora are explicitly described as descriptive, not production calibration.
- **H-03:** `ghidra-similarity` no longer emits a fabricated zero/zero-confidence hit when Ghidra exists but no BSim database is configured; it returns no findings and a clear limitation.
- **G-01…G-10 / H-03…H-10 audit:** a per-requirement M/N status matrix now distinguishes implemented subsets from open function-level equivalence, full lifecycle execution, full capture coverage, unconfigured BSim, and non-representative calibration.
- **Roadmap coherence:** ARCHITECTURE no longer says M is open; the N summary no longer claims R-04/R-10/R-11 or all G/H work is closed; the status dashboard, release index, debt register and CAPABILITIES use the same 1.3.7 state.

**Not delivered / not claimed.** No function-level equivalence lab; no full environment prepare/snapshot/restore/trace lifecycle; no registry/network/UI/audio/time/randomness capture or original-code coverage; no complete migration strategy search; no configured BSim corpus or computed score; no production-calibrated confidence; no complete OS/API availability database. G/H statuses remain partial/open as listed in `ROADMAP.md` and `CAPABILITIES.md`. R-01, R-04 (`fast-check`), R-05, R-19 Windows verification and R-19 macOS remain open. No Patch O feature was started.

**Verification.** Local Linux build and test compilation passed; all 123 unit tests passed. `npm run docs:mcp:check`, `npm run quality:static`, source size gate and source/built structure checks passed. `npm run format:check` could not run because `typescript-api` was absent after `npm ci` timed out. `npm run verify` ran the capability suite but did not complete within the execution window; it is not claimed green. The capability checks specifically covering authorization, corpus policy, the Ghidra similarity fallback, the Linux support matrix and M/N Roadmap status passed. Full manual `os: all` and Windows helper lifecycle verification remain pending. Build used the global TypeScript 5.8.3 compiler and an available system `@types/node` path after the locked install timed out; this is not a successful `npm ci` claim.

| ID | Sev | Area | Finding | Status |
|---|---|---|---|---|
| F-76 | High | Legacy authorization | M/N execution, capture/replay, preservation, migration and calibration library APIs could be called without the shared legal authorization declaration; some calibration helpers supplied an internal default authorization | Status: closed in 1.3.7 for current M/N APIs; all such operations require an explicit authorization/session and report it as provenance |
| F-77 | Medium | Calibration corpus policy | Calibration manifests did not enforce hash/source/license provenance for operator samples and could accept unexpected embedded payload fields | Status: closed in 1.3.7; every manifest entry requires SHA-256/source/license, relative paths are bounded, embedded payload fields are rejected |
| F-78 | Medium | Roadmap/documentation drift | Architecture still said M was open; N's debt summary implied R-04/R-10/R-11 and all G/H portions were closed despite explicit residuals; no M/N G/H status matrix existed | Status: closed in 1.3.7 documentation reconciliation; residual capabilities remain partial/open, not claimed complete |
| F-79 | Medium | Similarity evidence | `ghidra-similarity` returned a zero score with zero confidence when no BSim database was configured, which could be mistaken for a measured dissimilarity | Status: closed in 1.3.7; no score/findings are returned until a lawful local BSim corpus is configured |

---

## Audit 20 — 2026-11-11 — Patch N carry-over debt increment (1.3.6)

**Scope.** Close the N/Linux portions and deliver the Windows implementation of approved carry-over work without starting Patch O or adding the unavailable quality-tool dependencies.

**Delivered.**

- **R-07:** `docs/MCP.md`'s tool table is generated from the built `src/mcp-tools*.ts` registry used by `tools/list`. `npm run docs:mcp:check` fails on drift and runs in `npm run verify` and Capabilities CI.
- **R-19 (Windows):** a single persistent PowerShell helper now serves process inventory, single-PID inspection, process-tree snapshots and benchmark resource samples. Requests are allow-listed, serialized, bounded by timeouts, and the helper is restarted after failure. A Windows-only lifecycle test checks reuse; it has not yet run on a Windows runner.
- **R-02 (N/Linux):** `analyzeLegacyLinux` applies the existing `wrapUntrusted` wrapper at its library boundary, bounding ELF-derived strings and marking them as untrusted. An adversarial ELF PT_INTERP fixture verifies truncation.
- **R-15 (N/Linux):** checked-in golden expectations cover both Linux reference trials, and a manual `workflow_dispatch` workflow runs the golden test. Results remain L0 because no operator-supplied rootfs/oracle is bundled.
- **F-33 / R-05 available portion:** dependency-free `quality:static` now runs in `quality`, `verify` and Capabilities CI beside format and size gates. `knip`, `jscpd` and a dedicated linter remain open.

**Not delivered / not claimed.** R-01 (Stryker), R-05 (`knip`, `jscpd`, dedicated linter), and R-04 (`fast-check`) remain open. R-15 portions for M/O/P/Q remain open. R-02 portions for M/O/P/Q remain open. R-19 macOS remains assigned to O. No Patch O feature was started.

**Verification.** Local Linux TypeScript build, test compilation, all 119 unit tests, structure checks (source and built), MCP documentation drift check passed. Windows helper execution and the manual `os: all` matrix were not run in this environment; Windows verification remains required before closing R-19 Windows and before O.

| ID | Sev | Area | Finding | Status |
|---|---|---|---|---|
| R-07 | Medium | MCP contract | Tool documentation was maintained separately from the registry and could drift | Status: closed in 1.3.6; generated tool table and CI drift check |
| R-19 (Windows) | Medium | Process metrics | Windows process inventory and benchmark samples spawned PowerShell repeatedly | Status: implementation delivered in 1.3.6; closure pending Windows CI lifecycle verification; macOS portion remains open |
| R-02 (N/Linux) | Medium | Untrusted content | ELF strings and related Linux analysis metadata were not explicitly wrapped at the library boundary | Status: N/Linux portion closed in 1.3.6; hostile ELF fixture verifies marking and truncation |
| R-15 (N/Linux) | Low | Reference trials | Linux reference trials had no checked-in golden expectations or dedicated manual workflow | Status: N/Linux portion closed in 1.3.6; M/O/P/Q portions remain open |
| F-33 / R-05 | Low | Quality gates | The dependency-free static hygiene gate was not part of CI | Status: available portion delivered in 1.3.6 (`quality:static` added to CI); dedicated linter, `knip` and `jscpd` remain open |

---

# Audit log

This file is permanent. **New audits are added at the top** (newest first); older audits are never edited except to mark a finding as closed (`Status: closed in <version>, <patch>`). Each audit lists findings with an ID, severity, evidence and a recommended fix, then improvement proposals. Findings that are accepted are copied into [ROADMAP.md](ROADMAP.md) under the patch named in the "Patch" column; this file stays the record of *why*.

IDs: **F** finding (defect or drift), **R** recommendation, **G** goal gap, **H** hypothesis and authorization gap. Severity: **High** = wrong results or a safety/honesty violation of [AGENTS.md](../AGENTS.md); **Medium** = incorrect or fragile behavior with limited blast radius; **Low** = hygiene, docs, polish.

---

## Audit 19 — 2026-11-11 — Roadmap and documentation consolidation (documentation-only)

**Scope.** Make the roadmap readable and consistent after many iterations, so that any assistant can tell what is done, what is open and where the project stands, without changing any product behavior. All existing roadmap content was kept; blocks were moved, headed or corrected. Package version stays 1.1.0-beta.2.

**Delivered.**

- `docs/ROADMAP.md` is reorganized: a status dashboard first, one table for patches A–Q (the stale A–P table without Q and with the superseded N/O/P names was replaced), the active product patches with an explicit working checklist for Patch M, a carry-over debt register, the completed foundation A–L, the approved audit backlog (sorted by ID), the coverage table, and the release history with a version index. Planning notes that sat after the last section moved into Patch M history and a maintenance record; the old "mini-patch" label was removed because it contradicted the rule that only M–Q are patch units.
- Statuses were corrected where the evidence already existed: F-19, F-34…F-37, F-39 and F-41 are closed by the green A–D closure run 42775483864 (Audit 7); F-33 is partly closed (F-16 closed in 1.0.1; R-03 closed in 1.0.1 but reopened as F-75; R-05 partial). The stale 0.3, 0.4 and Later checklists were ticked per delivered patch, with the undelivered remainder kept as explicit unchecked residuals.
- Approved tasks that stayed assigned to completed patches with no delivery were checked against `src/` (no implementation found for R-11, R-12, R-15, R-20, the Merkle/Ed25519 part of R-14 and the extra providers of R-10) and recorded in the debt register. Nothing was marked delivered.
- On 2026-11-11 the maintainer approved the work order inside Patch M (steps 0–8 in the roadmap) and the reassignment of R-20, R-11 (PE part to M, ELF part to N), the `diec`/`yara-x`/`capa` part of R-10 and the F-75 fix to Patch M. All open debts were assigned to patches M–Q and approved by the maintainer on 2026-11-11; each debt is a checkbox in section 8 of its patch plan in `docs/ROADMAP.md` (the debt closure schedule there is an index), and none may stay open past the exit of Patch Q.
- README, CAPABILITIES, MCP, ARCHITECTURE, SECURITY, GITHUB and AGENTS were aligned with the code and with each other (60 tools; HTTP transport, prompts and resources exist; Windows capability tables merged; action pins are full SHAs).

**Found while verifying (fixed in Patch M step 0).** The capability suite showed the R-03 check as 🚧: two action references in `.github/workflows/supply-chain.yml` were tags (F-75). Closed by pinning both to the SHA already used for `upload-artifact` in the other workflows.

**Not done / not verified.** No product capability was implemented or claimed. No GitHub Actions run was made for this change; the Linux build, unit tests, structure check and capability suite were run locally (see the delivery note).

| ID | Sev | Area | Finding | Status |
|---|---|---|---|---|
| F-72 | Medium | Planning/documentation | ROADMAP structure and status drift: stale A–P dependency table without Q, no working checklist for Patch M, unticked checklists for delivered patches, "closed when green" statuses after a green run, planning notes after the last section | Status: closed in documentation-only consolidation patch (2026-11-11); no product capability claimed |
| F-73 | Low | Documentation | Cross-document drift: README tool count, CAPABILITIES header and MCP row, mixed Windows tables, GITHUB.md action pins, duplicated ARCHITECTURE sentence, unstructured MCP.md rows, AUDIT.md notice in the middle of the file | Status: closed in documentation-only consolidation patch (2026-11-11); no product capability claimed |
| F-74 | Medium | Planning | Approved tasks (R-10, R-11, R-12, R-14, R-15, R-20 and others) stayed assigned to completed patches with no recorded delivery | Status: closed in documentation-only consolidation patch (2026-11-11) by the carry-over debt register; the tasks themselves remain open |
| F-75 | Medium | CI / supply chain | Two action references in `.github/workflows/supply-chain.yml` (`actions/upload-artifact@v6`, `actions/upload-artifact/merge@v6`) are tags, not full commit SHAs, so the check *Supply chain — GitHub Actions are pinned to full commit SHAs (R-03)* shows 🚧 (23 of 25 references pinned). R-03 was recorded as closed in 1.0.1; the two references appeared later (CI diagnostics, 1.1.0-beta.1 maintenance) | Status: closed in 1.1.0-beta.2 (Patch M step 0); both references pinned to `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` (v7.0.1) |

---

## Audit 18 — 2026-11-10 — Product roadmap and architecture coherence (documentation-only)

**Scope.** Consolidate the post-1.0 plan into one ordered set of product patches. Earlier documentation described platform waves (M–P) and cross-cutting capabilities (execution, replay, equivalence and migration) as separate classifications, making it unclear which patch owned a complete product outcome.

**Delivered.** The roadmap now defines exactly five future product patches in strict order: M Windows through 2010, N old Linux, O Classic Mac/early macOS, P legacy Android, and Q newer generations plus unified compatibility intelligence. Each patch is a vertical product slice with the same acceptance dimensions; execution, replay, preservation and migration are delivered within each relevant platform patch, not as parallel patch families. Architecture, capability status, security, MCP, README and assistant instructions now use the same sequence. This is a documentation-only planning correction; it does not implement product capabilities or close product limitations.

| ID | Sev | Area | Finding | Status |
|---|---|---|---|---|
| F-71 | Medium | Planning/documentation | Future platform and cross-cutting work used overlapping patch classifications, obscuring the next actionable product unit | Status: closed in documentation-only planning patch (2026-11-10); no product capability claimed |

---

## Audit 17 — 2026-11-10 — Patch M1 Windows detector expansion (1.1.0-beta.2)

**Scope.** Expand the initial Windows legacy slice with bounded PE import extraction, deterministic framework signatures and authorization provenance in analysis results.

**Delivered.** The analyzer now extracts PE imported library/function names within the 8 MiB analysis window, detects selected VB6/MFC runtime imports and Delphi form/RTTI-style plus VB6/MFC metadata signatures, derives additional compatibility candidates from imports, and embeds the session authorization declaration in the result. All detections remain static indicators; there is no execution, reference-corpus calibration or OS API availability database.

| ID | Sev | Area | Finding | Status |
|---|---|---|---|---|
| F-68 | Medium | Legacy analysis | Windows legacy analyzer lacked PE imports and structural framework signatures | Status: closed in 1.1.0-beta.2 (bounded static detectors; ground-truth calibration remains open) |
| F-69 | Medium | Compatibility diagnosis | Runtime/graphics dependency candidates ignored PE import-table evidence | Status: closed in 1.1.0-beta.2 (selected imports; OS API availability tables remain open) |
| F-70 | High | Authorization | Declared legacy authorization was not copied into the analysis result | Status: closed in 1.1.0-beta.2 (basis, reference, declarant and declaration timestamp embedded) |

---

## Audit 16 — 2026-11-10 — Capability/MCP contract drift and CI diagnosis (1.1.0-beta.1 maintenance)

**Scope.** Fix the current Linux Capabilities run: approved audit IDs F-63…F-65 were missing from the roadmap backlog, the hard-coded MCP contract fixture omitted the two Patch M tools, and the AI summary classified a capability-suite failure as a formatting gate because it matched a weaker keyword first.

**Delivered.** The roadmap backlog now tracks F-63…F-65 with their actual partial/closed status; the MCP contract fixture includes `declare_legacy_authorization` and `analyze_legacy_windows` (60 tools total); and the summary classifier gives concrete test/assertion evidence precedence over incidental formatting words. Regression tests cover capability-suite failures whose output mentions formatting as context.

| ID | Sev | Area | Finding | Status |
|---|---|---|---|---|
| F-67 | Medium | CI diagnostics / contract drift | Capability-suite failures could be mislabeled as formatting failures, obscuring the actual assertion failures | Status: fix in 1.1.0-beta.1 maintenance; GitHub rerun pending |

---

## Audit 15 — 2026-11-10 — CI AI summary reliability and diagnostic depth (1.1.0-beta.1 maintenance)

**Scope.** Fix a CI summary generator crash on missing log content and improve the copy-paste report so an assistant can identify the earliest failure, exact command, diagnostic context, file/line references and JUnit failures without requiring the full log archive. Also close the formatter drift reported for `tests/legacy-windows.test.ts`.

**Delivered.** The generator now treats missing/empty logs safely, distinguishes explicit exit markers from unrecorded status, classifies common failure families, captures error context and commands, includes per-step summaries, capability JSON failures/drift, JUnit failures and runtime stack frames when present, redacts common secret-like values, and has regression tests. Every workflow runs those tests before producing the summary. The previously reported formatter drift in the legacy Windows test was corrected without changing test behavior.

| ID | Sev | Area | Finding | Status |
|---|---|---|---|---|
| F-66 | Medium | CI diagnostics | AI summary generator could crash on missing content and did not provide enough structured evidence for diagnosis | Status: closed in 1.1.0-beta.1 maintenance; actual GitHub artifact verification remains pending |

---

## Audit 14 — 2026-11-10 — Patch M initial Windows slice (1.1.0-beta.1)

**Scope.** Review the first Windows ≤2010 implementation slice against AGENTS.md and the M1 roadmap. This is a prerelease slice, not closure of the Windows wave or patch M.

**Delivered.** Static MZ/NE/LE/LX/PE header recognition; bounded marker scan for selected legacy toolchains and graphics APIs; preliminary compatibility candidates with confidence and limitations; session-scoped operator authorization declaration and MCP gate for `analyze_legacy_windows`. Package metadata, product version, MCP contract, README, capability matrix, architecture, security, roadmap and this audit record are updated together.

**Not delivered / remains open.** Structural VB6/Delphi/MFC detection, packer identification, full target profile, sourced OS/API compatibility tables, ground-truth corpus and precision/recall calibration, similarity adapters for M, automatic authorization embedding in every report, and end-to-end M–P Windows trial. No claim is made that the complete M1 wave is done.

| ID | Sev | Area | Finding | Status |
|---|---|---|---|---|
| F-63 | Medium | Legacy analysis | No deterministic Windows legacy executable header/marker analyzer | Status: initial slice implemented in 1.1.0-beta.1; full M1 detector matrix remains open |
| F-64 | High | Authorization | Legacy research session had no recorded declared authorization basis | Status: initial session record and `analyze_legacy_windows` gate implemented in 1.1.0-beta.1; report provenance closed in 1.1.0-beta.2; future operation gates remain open |
| F-65 | Low | Documentation/release | Initial M slice was not reflected consistently in package metadata and project documentation | Status: closed in 1.1.0-beta.1 (metadata and documentation synchronized) |

---

## Audit 13 — 2026-11-10 — Hygiene 1.0.1 (R-03, F-16, R-05 partial, H-09 lite)

**Scope.** Pin Actions to full SHAs; split capability harness; lightweight quality:static; prompt evaluation harness.

| ID | Sev | Area | Finding | Status |
|---|---|---|---|---|
| R-03 | Medium | CI | Unpinned action tags in workflows | Status: closed in 1.0.1 (SHA pins); reopened by F-75 (Audit 19): two references in `supply-chain.yml` are tags |
| F-16 | Medium | Tests | Monolithic capabilities.check.ts | Status: closed in 1.0.1 (suite split) |
| R-05 | Low | Quality | knip/jscpd/linter | Status: partial in 1.0.1 (`quality:static`; knip/jscpd still optional) |
| F-62 | Low | Agent | No H-09 prompt scoring | Status: closed in 1.0.1 (lite eval harness) |

---

## Audit 12 — 2026-11-10 — Release 1.0.0 and Patch L core

**Scope.** Fix 1.0.0 label after green A–K capability base; ship agent integration core (prompts, resources, setup, skill, server.json).

**Status.** Product version **1.0.0**. Patch L checklist partially closed (H-09 full harness still open). Quality debts R-03/R-05/F-16/R-19 remain recorded as non-blocking.

| ID | Sev | Area | Finding | Status |
|---|---|---|---|---|
| F-60 | Medium | MCP | No prompts/resources surface for agents | Status: closed in 1.0.0, patch L |
| F-61 | Medium | Distribution | No `reverse setup` / skill install | Status: closed in 1.0.0, patch L |
| R-08 | Medium | Agent integration | MCP prompts/resources and setup | Status: partial in 1.0.0 (core shipped; full H-09 later) |
| R-18 | Low | Distribution | server.json / setup path | Status: partial in 1.0.0 |

---

## Audit 11 — 2026-11-10 — Patch K (1.0.0-beta.1)

**Scope.** JS/Electron, .NET and WASM analyzers as providers; optional authenticated HTTP MCP transport.

| ID | Sev | Area | Finding | Status |
|---|---|---|---|---|
| F-58 | Medium | Runtime | No JS/Electron/.NET/WASM analyzers | Status: closed in 1.0.0-beta.1, patch K |
| F-59 | Low | MCP | No optional HTTP transport with auth | Status: closed in 1.0.0-beta.1, patch K |

---

## Audit 10 — 2026-11-10 — Patch J completed (0.5.0-beta.2)

**Scope.** Remaining J items: git worktree workspaces, adb install/pm clear/emu snapshot, fixture E2E trials for three reference shapes.

**Status.** Patch J checklist items closed. External commercial reference apps are not bundled (fixtures substitute). ADB paths remain confirm-gated.

| ID | Sev | Area | Finding | Status |
|---|---|---|---|---|
| F-55 | Medium | Optimization | No git worktree path for changes | Status: closed in 0.5.0-beta.2, patch J |
| F-56 | Medium | Optimization | No adb install/pm clear/snapshot helpers | Status: closed in 0.5.0-beta.2, patch J |
| F-57 | Medium | Optimization | No E2E reference-shape trials | Status: closed in 0.5.0-beta.2, patch J (fixtures) |

---

## Audit 9 — 2026-11-10 — Patch J first vertical slice (0.5.0-beta.1)

**Scope.** Controlled optimization loop foundations: change workspaces, apply/rollback/accept, decision rules, APK pipeline on copy.

**Delivered.** Isolated workspaces under `REVERSE_HOME/workspaces`; original never written by Reverse. Decision function covers accept/roll_back/need_more_data/reject. APK apktool path with optional zipalign/apksigner. MCP tools and capability checks added.

**Still open for full J close.** Git worktree mode; automated adb install / pm clear / emulator snapshot; E2E trials on three external reference applications.

| ID | Sev | Area | Finding | Status |
|---|---|---|---|---|
| F-53 | Medium | Optimization | No isolated change application before J | Status: closed in 0.5.0-beta.1, patch J (workspace + confirm gate) |
| F-54 | Medium | Optimization | No deterministic accept/rollback decision helper | Status: closed in 0.5.0-beta.1, patch J |

---

## Audit 8 — 2026-11-10 — Patches E–I implemented (0.3.0-beta.1 → 0.4.1)

**Scope.** Static analysis core (E), provider framework with Ghidra/Rizin/JADX/Apktool (F), Frida/GDB dynamic adapters (G), native profilers and hotspots (H), validation normalization, evidence HMAC integrity and change reports (I). Cumulative hardening released as **0.4.1** (`A-I-closed`).

**What was verified in code (not claimed from absent CI alone).**

- ELF/PE/Mach-O structure parsers emit sections/symbols/imports where the format allows; large ELF section headers are re-fetched beyond the 2 MiB prefix; Mach-O short buffers no longer throw.
- Source inventory blanks comments but keeps string literal import paths; commented-out imports are not counted.
- Lockfile resolution (npm/yarn/Cargo/Go/poetry) and package.json groups; status `completed` with limitation when lockfile is absent.
- APK/AAB ZIP inventory (dex, native libs, ABI, manifest presence); binary AXML not decoded.
- Providers register via `bootstrapExternalProviders`; missing tools return `unsupported` with limitations — results are never fabricated.
- Ghidra headless: import + `ReverseListFns` postScript (up to 500 function names when analysis succeeds). Rizin/rabin2 emit real tool text. JADX/Apktool run when installed.
- Frida under `CONTROLLED_EXECUTION`: attach sample with modules, threads and backtraces (`REVERSE_FRIDA` JSON). GDB/LLDB: batch attach + backtrace or file inspect under the same gate.
- `get_hotspots`: perf top (Linux) / sample (macOS) under CONTROLLED_EXECUTION; otherwise process-level only. `get_process_io`: Linux `/proc/pid/io`.
- Validation: optional normalize (whitespace/timestamps/sortLines); fixture runner; explicit non-proof of semantic equivalence. Evidence: hash-chain verify + optional HMAC-SHA256 (`REVERSE_EVIDENCE_KEY`). Change reports via `generate_change_report`.

**Residual / non-claims (not closed by E–I).**

- Full CFG, interactive decompile/xrefs, BSim scores without operator corpus.
- Continuous Frida call-frequency profiles and `Java.perform` session scripts.
- Windows ETW auto hotspot sessions; per-process network I/O.
- Merkle roots / public-key detached signatures; full test-framework discovery (jest/pytest).
- Prior residuals: R-03, R-05, F-16, R-19, F-08, external acceptance trials.

| ID | Sev | Area | Finding | Status |
|---|---|---|---|---|
| F-10 | Medium | Dependencies | Dependency groups and lockfile resolution incomplete | Status: closed in 0.3.0-beta.1, patch E (groups + lockfiles; CVE/size still limitation) |
| F-13 | Medium | Binary | Mach-O CPU/fat and PE beyond-buffer handling | Status: closed in 0.3.0-beta.1 / 0.4.1, patch E (CPU map, fat slices, bounds, ELF shdrs re-read) |
| F-09 (parser depth) | Medium | Source | Caps done earlier; real comment-aware import extraction | Status: closed in 0.3.0-beta.1, patch E (comment-aware imports; not a full AST) |
| F-50 | Low | Docs/CLI | CLI help listed android as package.json dependencies | Status: closed in 0.4.1, A–I-closed |
| F-51 | Medium | Providers | Ghidra adapter was import-only without postScript | Status: closed in 0.4.1, A–I-closed (postScript function dump) |
| F-52 | Medium | Dynamic | Frida/GDB registered but only trivial probes | Status: closed in 0.4.1, A–I-closed (attach sample / batch attach; still not continuous profiling) |
| R-25 | Low | Docs | ROADMAP/ARCHITECTURE lagged implemented providers and MCP tools | Status: closed in 0.4.1, A–I-closed (doc revision) |

---

## Audit 7 — 2026-11-10 — A–D closure verified green (0.2.0-beta.8)

**Scope.** The successful A–D closure run of 0.2.0-beta.8 (run 42775483864, commit `996cbf4a3c4212b2251c9ac5adc6f736354e3038`), Structure and Capabilities workflows, and the real-cgroup job.

**What the logs prove.** All six matrix cells and the real-cgroup job succeeded. Linux (Node 22/24) and macOS (Node 22/24): 110 ✅, 9 🚧, 0 ⚠️, 0 ❌. Windows (Node 22/24): 109 ✅, 10 🚧, 0 ⚠️, 0 ❌. Real-cgroup: 1 ✅. The extra Windows limitation is the Linux-only real-cgroup check (expected 🚧). Key A–D checks (hash-chain/tamper, promotion by content, real analyzer evidence, anomaly rules both sides, profile modes, OBSERVE contract, tree-kill timeout, R-06 line length, docs agreement) are ✅ on every platform. Matrix: success; cgroup-real: success.

**Consequence.** Patches A, B, C and D are closed. Release gates that depended on a green Windows run are satisfied. Residual 🚧 items (R-03 SHA pins, R-05 external quality tools, F-16 harness split, acceptance trials on real external apps, R-19 persistent helpers, F-08 macOS fast path) remain non-blocking and are recorded as such in [ROADMAP.md](ROADMAP.md).

| ID | Sev | Area | Finding | Status |
|---|---|---|---|---|
| F-19 | Medium | CI | No recorded green run of the capability workflow on macOS and Windows | Status: closed in 0.2.0-beta.8, A–D closure (run 42775483864) |

---

## Audit 6 — 2026-11-10 — A–D closure run of 0.2.0-beta.8 (red cells without a report)

**Scope.** The A–D closure run of 0.2.0-beta.8 (run 42770029602, commit `58ab0d0`) was read against the workflows and the unit tests. Structure and Capabilities were green; the closure workflow was red.

**What the logs prove.** Every report that exists is clean: Linux (Node 22 and 24) and macOS (Node 22) show 110 ✅, 9 🚧, 0 ⚠️, 0 ❌, and the real-cgroup job is ✅. The supplied logs hold **no** report for Windows and for macOS on Node 24: those cells ended before the capability suite, so nothing says why they were red. The difference to the Capabilities workflow is the cause of the red: Capabilities runs the unit tests and the built-target structure check on Linux only, the closure workflow runs them on every operating system, so these tests had never run on macOS or Windows.

**Method of this audit.** Linux sandbox, Node 22. The old unit tests were run against a build whose `inspectProcess` was slowed by 400 ms (the cost of a `ps` or PowerShell sample): 4 of 9 tests of `profiling-modes` and `mcp-evidence` failed. With the patched tests all 66 unit tests pass at normal speed and at the slowed speed. **Not run:** any Windows or macOS job. The root cause is established by that reproduction, not by the missing logs.

| ID | Sev | Area | Finding | Status |
|---|---|---|---|---|
| F-39 | Medium | Tests | Monitor, Diagnostic and Compare in `tests/profiling-modes.test.ts` and the `OBSERVE` Compare check in `tests/mcp-evidence.test.ts` asserted 3–4 samples inside fixed 600–1000 ms windows; with a sample cost of 0.1–1.5 s (`ps`, PowerShell) they cannot hold. AGENTS.md §7 forbids tests that depend on timing luck | Status: fix in 0.2.0-beta.8, A–D closure (`tests/sampling-window.ts` derives the window from the measured cost of one sample; no assertion weakened); closed in 0.2.0-beta.8 (verified green in A–D closure run 42775483864 (Audit 7)) |
| F-40 | Low | CI | A closure cell that failed in the static gates or the unit tests wrote no JSON report and no log, and the closure record silently omitted it | Status: closed in 0.2.0-beta.8, A–D closure (both steps keep a log in the cell's artifact; the record names every cell without a report) |
| F-41 | Medium | Tests | Windows closure run 42773325959 (Node 22 and 24): the only failing unit test was `research cycle` (`tests/research-cycle.test.ts`): the benchmark of a 150 ms delay against no delay gave `no_significant_change` instead of `improved`, because the delay is smaller than the spread of a Windows process start-up. The other 65 unit tests passed there, including the profile-mode and `OBSERVE` tests of F-39 | Status: fix in 0.2.0-beta.8, A–D closure (the delay is 1500 ms on Windows, as in the capability check of F-37; the assertion is unchanged); closed in 0.2.0-beta.8 (verified green in A–D closure run 42775483864 (Audit 7)) |

**Update after the second closure run (commit `484dbde`).** Linux, macOS (Node 22 and 24) and the real-cgroup job are green; the logs added by F-40 show that Windows ended in the unit tests with one failure (F-41).

**Still open, deliberately.** Whether Windows is green is decided by the next closure run. Unit tests still run on Linux only in the Capabilities workflow; running them elsewhere stays a closure-only gate.

Tasks F-39, F-40 and F-41 are tracked in the [approved audit backlog](ROADMAP.md#approved-audit-backlog-audit-1-approved-2026-11-09). Audit 5 follows.

---

## Audit 5 — 2026-11-10 — CI evidence for 0.2.0-beta.7 (A–D closure, Windows)

**Scope.** The Capabilities run (`workflow_dispatch`, `os: all`, commit `82c2182`) and the A–D closure run of 0.2.0-beta.7 were read against the source. Nothing new was reviewed; the question was why the suite was red and what the logs prove.

**What the logs prove.** Linux and macOS, Node 22 and 24: 110 ✅, 9 🚧, 0 ⚠️, 0 ❌ in each of the four cells. The A–D checks are ✅ in all four: hash-chained sessions, promotion by content, typed evidence from real analyzers, anomaly rules on both sides of each threshold, the four profile modes, `OBSERVE`, the 140-character gate, documentation agreement. The A–D closure workflow ran on Linux (Node 22, 24) and macOS (Node 24) with the same totals. The real-cgroup check ended ✅ (verified, not 🚧) on a delegated cgroup v2 hierarchy (`ubuntu-latest`, kernel 7.0.0-azure, Node 22.23.4). The package check passed on Linux and Windows. Windows: 105 ✅ / 3 ❌ (Node 22) and 104 ✅ / 5 ❌ (Node 24); every ❌ is a Windows runtime problem and none touches the evidence, safety or documentation checks.

**Method of this audit.** Linux sandbox, Node 22. Build, unit tests, format, size and structure gates and the capability suite ran locally. **Not run:** any Windows or macOS code path; the changes for Windows below are verified by fixtures and by reading the logs only.

| ID | Sev | Area | Finding | Status |
|---|---|---|---|---|
| F-34 | **High** | Benchmark | On Windows a timed-out run was reported with `processesTerminated: 0`: the run was finalized by the 2 s stdio grace timer while the tree kill (PowerShell snapshot, one more PowerShell call per victim, `taskkill`) was still running, so the count was never stored | Status: closed in 0.2.0-beta.8, A–D closure (verified green in A–D closure run 42775483864 (Audit 7)) |
| F-35 | Medium | Process | A Windows tree kill started one PowerShell per victim to re-check identity and read the full process table with command lines; seconds per kill | Status: fix in 0.2.0-beta.8, A–D closure (lean `WINDOWS_TREE_SCRIPT`, one re-check, parallel `taskkill`); closed in 0.2.0-beta.8 (verified green in A–D closure run 42775483864 (Audit 7)) |
| F-36 | Medium | Profiling | `inspectProcess` on Windows enumerated every process for one PID (F-08, Windows part), so Monitor and Compare got under one sample per second | Status: fix in 0.2.0-beta.8, A–D closure (filtered single-PID WMI query with fallback); macOS fast path stays open (F-08); Windows part closed in 0.2.0-beta.8 (verified green in A–D closure run 42775483864 (Audit 7)) |
| F-37 | Medium | Tests | Four Windows checks assumed Linux timing (a 300 ms delay against a start-up of several hundred ms, a 400 ms child against a PowerShell sample of 0.5–1.5 s, 700 ms and 1000 ms profile windows); AGENTS.md §7 forbids tests that depend on timing luck | Status: closed in 0.2.0-beta.8, A–D closure (the injected delay and the observation window are scaled on Windows; no assertion was weakened; verified green in A–D closure run 42775483864 (Audit 7)) |
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
| F-19 | Medium | CI | No recorded green run of the capability workflow on macOS and Windows | Status: closed in 0.2.0-beta.8, A–D closure (run 42775483864) |
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
| F-33 | Medium | Process | R-03, R-05 and F-16 are open although patches C and D read as delivered | Status: partly closed: F-16 closed in 1.0.1; R-03 closed in 1.0.1 but reopened by F-75; R-05 partial (see the ROADMAP debt register) |

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

Tasks H-01…H-10 are tracked in the [approved audit backlog](ROADMAP.md#approved-audit-backlog-audit-1-approved-2026-11-09); the "Patch" column here is historical and the backlog table is authoritative where they differ. Audit 2 follows.

---

## Audit 2 — 2026-11-09 — product goal versus roadmap (goal-gap audit)

**Scope.** Not a code review. The maintainer stated the product goal: fully analyze modern **and old** programs without source, explain why they do not work or work badly on modern hardware and in a modern environment, and let an agent propose concrete improvements or a full rework **with full preservation of functionality**. This audit compares that goal with [ROADMAP.md](ROADMAP.md) (patches A–L) and [ARCHITECTURE.md](ARCHITECTURE.md). No code was run or changed.

**Verdict.** Patches A–K deliver a strong general core (observation, measurement, evidence, static analysis, providers, controlled optimization). They are aimed at *performance of current programs*. For the stated goal they leave seven gaps: there is no compatibility diagnosis, no legacy formats and eras, no multi-environment execution, no behavior capture that could prove preservation, no function-level equivalence lab, no migration strategy, and no scope/legal policy. Full preservation of behavior cannot be *proven* by any tool; Reverse must report a **confidence level with its coverage**, never a guarantee.

**Approval and priority (historical; superseded by Audit 18).** Approved by the maintainer on 2026-11-09. The original proposal described target platforms as vertical slices through M–P. Audit 18 replaces that overlapping classification with one ordered product-patch sequence M–Q; retain this entry as the historical approval record, not as the active delivery plan.

| ID | Sev | Gap | Task | Patch |
|---|---|---|---|---|
| G-01 | **High** | No answer to "why does it not work today" | Compatibility diagnosis: required OS, CPU, bitness, ABI; imported APIs against what the target OS still provides; missing libraries; privilege and virtualization assumptions; CPU-speed-dependent timing; graphics, audio and driver dependencies; DPI and resolution; locale and path assumptions; address-space limits; date limits. Every cause is a finding with evidence | M |
| G-02 | **High** | Old formats and technologies are not recognized | Legacy formats and toolchains in the ordered product patches (see the roadmap) | M |
| G-03 | **High** | Programs can only be run in the current host | Execution-environment providers (Wine, DOSBox-class emulators, QEMU/VMs, old userland containers, classic-Mac and old-Android emulators), snapshots, a works/fails matrix across environments | N |
| G-04 | **High** | Behavior preservation cannot be shown | Behavior capture and replay: inputs, outputs, files, registry/preferences, network, UI events, time and random control, code coverage, normalization, comparison old versus new | O |
| G-05 | **High** | A rewritten function cannot be checked against the original | Equivalence lab: emulate or run the original function and the replacement on the same large input sets, differential and property tests, coverage-based confidence | P |
| G-06 | Medium | No guidance on *how* to fix | Migration strategy advisor: ranked options from configuration or compatibility layer through wrapper, emulation/VM packaging, minimal binary patch, recompilation from a reconstruction, to full rewrite, each with risk, effort and evidence | P |
| G-07 | Medium | No scope and legal policy | Authorized-use policy, handling of copy protection, dongles and licenses, user-supplied OS images; first item of patch M | M |
| G-08 | Medium | Platform priority is not encoded | Product patch order is strict: nothing for a later patch starts before the current patch passes its end-to-end trial | M–P |
| G-09 | Medium | No per-target support matrix | `CAPABILITIES.md` gets a target-platform and era matrix; the suite checks it against the registered format detectors | M |
| G-10 | Medium | "Full preservation" is an unmeasurable promise | Behavior-preservation report with levels L0–L3 (defined in [ARCHITECTURE.md](ARCHITECTURE.md)); L4 (formal proof) is explicitly out of scope | O, P |

Tasks G-01…G-10 are tracked in the [approved audit backlog](ROADMAP.md#approved-audit-backlog-audit-1-approved-2026-11-09); the "Patch" column here is historical and the backlog table is authoritative where they differ (Audit 18). Audit 1 follows; its text is unchanged except for status marks.

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

Sources: the architecture, tooling and current public MCP/Node practice. Items that need a new dependency follow the zero-runtime-dependency rule: they go to devDependencies or to opt-in providers.

**Quality and trust**

- **R-01 Mutation testing.** reverse ships Stryker configs (`stryker.config.mjs`, separate semantics config). Adopt Stryker on the pure modules (statistics, parsers, `appendCapped`, decision rules). It directly serves the rule "a check must be able to fail".
- **R-02 Threat model and prompt-injection hardening.** Treat everything returned from a target (strings, paths, process names) as untrusted text: wrap it in a `untrustedContent` field, never place it in tool descriptions, cap lengths, and test with adversarial fixtures. Document the agent as an untrusted caller. Reverse documents the same class of risk in its `SECURITY.md` and bounds updater output.
- **R-03 Supply-chain and release integrity.** npm provenance (`npm publish --provenance`), pinned GitHub Action SHAs, `permissions:` least privilege (already present), Dependabot, OpenSSF Scorecard, CycloneDX SBOM and `npm audit signatures` in CI. For releases use `release-please` so the version in `core-version.ts`, `package.json` and the lockfile cannot drift.
- **R-04 Fuzzing the binary and process parsers.** Add property/fuzz tests (`fast-check` as devDependency) for ELF/PE/Mach-O headers and `/proc`, `ps` and CIM parsers: truncated, oversized and hostile inputs must yield `partial`, never throw or allocate unbounded memory.
- **R-05 Static quality gates.** Replace ad-hoc checks with fast tooling as devDependencies: `oxlint`/`oxfmt`, or ESLint with typescript-eslint; `knip` for dead exports and unused files; `jscpd` for duplicate code to keep the compact-core promise measurable; add a size gate for own lines (target 20–30 k).
- **R-06 Reformat the dense files.** `mcp-server.ts`, `benchmark-engine.ts`, `process-inspector.ts` and several others use one-line functions with 300+ characters, which [AGENTS.md](../AGENTS.md) §7 forbids for new code. Reformat each when it is next changed (with `prettier`/`oxfmt`) and add the formatter check to the structure workflow.

**Agent experience (MCP)**

- **R-07 Contract-first MCP.** Generate `tools/list`, [MCP.md](MCP.md) and the output schemas from one TypeScript definition (zod or hand-written JSON Schema) so the table cannot drift; keep compact vs full input-schema profiles for context economy. Add `title`, `annotations`, `outputSchema`, structured errors with machine-readable `code`, pagination cursors and response-size budgets.
- **R-08 Prompts, resources and setup.** Expose MCP *prompts* for the research cycle (investigate → diagnose → hypothesize → experiment → verify → report) and *resources* for evidence records and research sessions (`reverse://evidence/<id>`); add `reverse setup` that registers the server in Claude Code, Codex, Cursor and Gemini CLI with backups and a dry-run, as `npx reverse-agents setup` does, plus a skill file with the investigation workflow. Keep it opt-in and show the diff before writing.
- **R-09 `reverse doctor`.** One command that reports Node version, `ps`/PowerShell availability, cgroup delegation, detected providers (path + version) and the active safety mode. This prevents the "silent absent tool" failure class and feeds [CAPABILITIES.md](CAPABILITIES.md) automatically.

**Analysis depth**

- **R-10 Use existing parsers instead of writing new ones** (consistent with the no-reimplementation rule), as opt-in providers: `lief` or `goblin`-based helper, `pefile` import hash, GNU `objdump`/`readelf`, `rizin`/`rz-bin` JSON output, `capa` for capabilities, `yara-x` rules, `diec` (Detect It Easy) for packer detection, `syft`/`cyclonedx` for dependency SBOMs, `osv-scanner` for vulnerabilities, `cargo-auditable` data in Rust binaries and Go build info — reverse already reads the last two and several other static formats (PE imports and certificates, ELF notes, hardening flags, Android APK signatures, WASM via WABT) without a native engine; use its list as the backlog for Patch E.
- **R-11 Hardening-flag report.** Add PIE/NX/RELRO/stack-canary/CFG/ASLR flags to the binary analyzer (cheap, header-only, high value to the agent).
- **R-12 Profiling providers with standard formats.** Ingest `perf script`/`perf record`, Linux `pprof`, Chrome/V8 `.cpuprofile`, Node `--cpu-prof`, Speedscope and Firefox Profiler JSON, instead of writing a profiler. Add `hyperfine`-style methodology (warm-up, outlier warnings, `--export-json` compatible shape) for benchmarks and `eBPF` via `bpftrace`/`bcc` in Patch H.
- **R-13 Statistics done properly.** Bootstrap confidence intervals, Mann-Whitney U with Hodges-Lehmann shift, effect size, outlier detection by MAD, environment-noise detection (CPU frequency governor, load average, thermal state) and an explicit `insufficient_evidence` verdict. Interleaved A/B runs by default.

**Evidence and reproducibility**

- **R-14 Tamper-evident evidence.** Hash chain per research session, Merkle root in the report, optional detached signature (Ed25519 via `node:crypto`; later Sigstore/cosign), plus a deterministic export bundle (`reverse export <session>` → one JSON + artifacts) that a third party can re-verify with `reverse verify`. CLI has Evidence snapshots, import and export.
- **R-15 Golden results.** Keep small reference binaries and expected `Result` JSON (with volatile fields masked) in `tests/`; trials on the three reference applications from the roadmap become CI jobs on the manual workflow.

**Platform and delivery**

- **R-16 Node support window.** Node 20 is end-of-life (April 2026); the Node 20 matrix entry and `engines: >=20.11` should move to 22 and 24. Do it in Patch C together with the `node:sqlite`/`fs.glob`/`util.parseArgs` options below.
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

## Maintenance note — full-matrix confirmation (2026-11-11)

**Evidence provided by the maintainer (green runs, commit `66fee60`).**

| Workflow | Run | Result | Matrix |
|---|---|---|---|
| Capabilities | [43024000265](https://github.com/ecooorg/reverse/actions/runs/43024000265) | Success | Ubuntu/macOS/Windows × Node 22/24; package Ubuntu/Windows; one artifact `Capabilities` |
| Structure | [43024033261](https://github.com/ecooorg/reverse/actions/runs/43024033261) | Success | Ubuntu/macOS/Windows; one artifact `Structure` |
| Supply chain | [43024423915](https://github.com/ecooorg/reverse/actions/runs/43024423915) | Success | Ubuntu; one artifact `Supply chain` |

This closes the documentation gap that macOS/Windows results for post–A–D work were “not claimed”, and verifies the single-artifact CI layout (F-66). Roadmap status dashboard and pending-verification list updated in the same change.

## Maintenance note — Patch M release 1.2.0 (2026-11-11)

Patch M is closed. Evidence: green full-matrix runs on commit `b66312e` —
Capabilities [43037232211](https://github.com/ecooorg/reverse/actions/runs/43037232211),
Structure [43037271948](https://github.com/ecooorg/reverse/actions/runs/43037271948),
Supply chain [43037302969](https://github.com/ecooorg/reverse/actions/runs/43037302969).

Annotations that appeared on those green runs as "error-like lines" were false positives from TAP self-tests whose names contain the word "failure"; `ci-ai-summary` no longer emits Annotations for suspicious-only (no failed step / junit / capability issue).

Explicit product limitations at M exit: no bundled licensed Windows oracle (preservation L0); Windows/macOS hard sandbox isolation not wired; partial PE bound-import coverage as noted in CAPABILITIES.md.

## Maintenance note — Patch N release 1.3.5 (2026-11-11)

Patch N is closed. Evidence: green full-matrix runs on commit `b5ea3fa` — Capabilities [43059743774](https://github.com/ecooorg/reverse/actions/runs/43059743774),
Structure [43059819947](https://github.com/ecooorg/reverse/actions/runs/43059819947),
Supply chain [43059851184](https://github.com/ecooorg/reverse/actions/runs/43059851184).

The first red run of this stage (MCP contract: 61 served tools against 60 documented, `analyze_legacy_linux` missing from the fixture and from `docs/MCP.md`) was fixed by aligning the fixture and documentation with the served tool surface; the tool itself was already correct.

Explicit product limitations at N exit: no old-Linux rootfs or oracle bundled (preservation L0); kernel-ABI faults need a VM; string-residue verneed summary only; `goblin` not wired. Step 0 debts R-01, R-05, R-07, R-19 (Windows part) and `fast-check` for R-04 stay open in the carry-over register.

## Maintenance note — release 1.3.10 (2026-11-12)

Green full matrix on commit `f85200e`: Capabilities 43110447213, Structure 43110487271, Supply chain 43111192808, Patch N Linux golden trials 43111237082. 1.3.10 closes R-04, R-05 and R-01 and fixes F-84. Stryker baseline (Linux, Node 22, command runner, 679 mutants in `benchmark-stats`, `process-parse`, `legacy-linux-symver` and `legacy-linux-packages`): **47.72 %** (316 killed, 8 timed out, 355 survived); per module 67.95 / 22.27 / 65.09 / 31.07 %. Floor `thresholds.break` = 45. Open: R-19 macOS and F-08 macOS (O step 0), R-10, R-11 residual, F-83 (not reproduced).

## Maintenance note — release 1.3.10 verification (2026-11-12)

The first 1.3.10 matrix (run 43167151360) was red on all OS: `knip` ran before the build, so the tests' `dist` imports were unresolved and six exports used only by tests were reported unused. `knip` now runs right after the build. After that fix the workflows are green on all OS: Capabilities [43167841716](https://github.com/ecooorg/reverse/actions/runs/43167841716) (commit `aee7343`; six environments, 0 drift, 0 failed; 151/6 on darwin and linux, 150/7 on win32), Structure [43167239605](https://github.com/ecooorg/reverse/actions/runs/43167239605) (commit `58ed786`), Mutation testing (47.72 % in CI, equal to the local baseline; floor 45 % held) and Patch N Linux golden trials (reported green; no log attached, no run link recorded). R-01, R-04, R-05 and F-84 stay closed; F-83 is still not reproduced.
