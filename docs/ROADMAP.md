# Roadmap

The design behind each item is described in [ARCHITECTURE.md](ARCHITECTURE.md). Rules for assistants are in [AGENTS.md](../AGENTS.md); the reasons behind accepted tasks are in [AUDIT.md](AUDIT.md).

## How to read this file

This file is the single source of truth for **what is done, what is not done and what to do next**. Read it in this order:

1. [Status at a glance](#status-at-a-glance): the current version, the active patch and the next concrete step.
2. [Delivery plan](#delivery-plan-foundation-al-and-product-patches-mq): the one ordered table of all patches A–Q, how progress is measured and what "done" means.
3. [Active work: product patches M–Q](#active-work-product-patches-mq): the scope, the working checklist of Patch M and the delivery rules. **Start work here.**
4. [Carry-over debt register](#carry-over-debt-register): approved tasks that are still open although their patch is closed or that have no recorded closure.
5. Reference material, in this order: [completed foundation A–L](#completed-foundation-patches-al) (historical records, do not re-open), [approved audit backlog](#approved-audit-backlog-audit-1-approved-2026-11-09) (every finding and recommendation with its status), [coverage table](#coverage-of-the-roadmap), [release history](#release-history) and the original [core readiness criteria](#core-development-order-and-completion-criteria).

**Status vocabulary** used everywhere in this file: **done** (code, automated check and documentation are in place, and the capability gate was run), **in progress** (some items delivered, acceptance criteria still open), **not started**, **open** (an approved task without delivery), **partial** (delivered in part; the remainder is named), **pending verification** (delivered and tested locally, but a run that only GitHub Actions can provide is not recorded). Checkboxes: `[x]` delivered and proven, `[ ]` not delivered. Nothing is marked done without code and a passing check (AGENTS.md section 5).

**When you finish work, update in the same change:** the [status dashboard](#status-at-a-glance), the checklist of the patch, the [version index](#version-index), the affected backlog rows here and in AUDIT.md, the [debt register](#carry-over-debt-register), `ARCHITECTURE.md` (*planned* to *implemented*), `CAPABILITIES.md` and `MCP.md`.

## Status at a glance

State as of **1.1.0-beta.2** (`package.json` and `src/core-version.ts` agree; documentation-only patch of 2026-11-11 on top; no product change).

| Question | Answer |
|---|---|
| What is the product version? | **1.1.0-beta.2** (prerelease of the 1.2 milestone) |
| What is finished? | The 1.0 foundation, **patches A–L**: process intelligence, benchmark engine, evidence and research sessions, static analysis, providers (Ghidra, Rizin, JADX, Apktool, Frida, GDB, profilers), validation and integrity, controlled optimization loop, JS/.NET/WASM analyzers, agent integration. 60 MCP tools. Own code in `src/`: about 9,300 lines (budget 20,000–30,000). |
| What is being built? | **Patch M** — complete Windows compatibility, DOS through Windows 7-era software (up to 2010); target release **1.2**. Status: **in progress**. Delivered so far: initial detector slices (1.1.0-beta.1, 1.1.0-beta.2). |
| What has not started? | **Patches N, O, P, Q** (old Linux; Classic Mac/early macOS; legacy Android; newer generations and unified compatibility intelligence). Do not start them before M passes its acceptance criteria. |
| What is the next concrete step? | Follow the [work order inside M](#work-order-inside-m-approved-by-the-maintainer-2026-11-11). **Step 0** is the CI fix for F-75 (pin two action references), then **step 1**: shared contracts (Target Profile schema, one authorization and provenance gate for every legacy operation, the format of sourced data tables). |
| What is open but not blocking? | See the [carry-over debt register](#carry-over-debt-register): No open item blocks M. R-20 (sandbox for executed targets), R-11 (PE part), R-10 (`diec`, `yara-x`, `capa`) and F-75 are assigned to M and scheduled in its work order. |
| What is unverified? | (a) The last **recorded** full-matrix run (`os: all`, Linux, macOS, Windows, Node 22 and 24) is the A–D closure run of 0.2.0-beta.8 (run 42775483864). No later full-matrix run is recorded in the documentation, so macOS and Windows results for patches E–M are **not claimed**; run Actions → Capabilities → `os: all` before declaring any patch done. (b) GitHub artifact upload of the CI diagnostics and the rerun for F-67 are **pending verification**. (c) One known open defect: F-75, two unpinned action references (the R-03 check shows 🚧). |

## Delivery plan: foundation A–L and product patches M–Q

This plan closes **every** item listed in the release sections below (0.2, 0.3, 0.4 and Later), so that Reverse can analyze a program, reverse-engineer it, find the cause of excessive resource use, apply an optimization and prove the result, and then diagnose and restore old software. Each patch is a large, independently releasable unit: it ends in a merged, tested change set, not in a partially working branch. The patches are ordered by dependency; the release sections further down describe the same work item by item.

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

One table for every patch. Patches A–L are the completed 1.0 foundation; M–Q are the only future product patches (see [Active work](#active-work-product-patches-mq)).

| Patch | Name | Milestone / release | Depends on | Status |
|---|---|---|---|---|
| A | Defect closure and verification gate | 0.1.x (0.1.1) | none | done |
| B | Process intelligence and safety | 0.2 | A | done |
| C | Measurement engine and baselines | 0.2 | A | done |
| D | Evidence engine, research sessions and MCP surface | 0.2 | B, C | done |
| E | Static analysis core | 0.3 | A | done |
| F | Provider framework, Ghidra and Rizin | 0.3 | E | done |
| G | Dynamic analysis: Frida and GDB | 0.4 | F, B | done |
| H | Native profilers and hotspots | 0.4 | B, F | done |
| I | Validation, integrity and reports | 0.4 | C, D | done |
| J | Controlled optimization loop | 1.0 | G, H, I | done |
| K | Runtime analyzers and on-demand extensions | 1.0 | F, J | done |
| L | Agent integration and distribution | 1.x (core in 1.0.0, hygiene in 1.0.1) | D, J | done (full H-09 harness and optional single-file binary remain open) |
| M | Windows compatibility, DOS through Windows 7-era (up to 2010) | 1.2 | A–L foundation; initial analyzer in 1.1.0-beta.1/.2 | **in progress** |
| N | Old Linux software | 1.3 | M shared contracts and evidence model | not started |
| O | Classic Mac and early macOS software | 1.4 | N shared contracts and environment/replay foundations | not started |
| P | Legacy Android software | 1.5 | O shared contracts; Android foundations already present in E/J | not started |
| Q | Newer generations and unified compatibility intelligence | 2.0 | M–P complete | not started |

B and C can proceed in parallel after A; E can start at the same time. G and H can proceed in parallel once F is done (historical note; A–L are complete).

**Superseded classification.** Earlier drafts of this table listed N *Execution environments*, O *Behavior capture and replay* and P *Function equivalence lab and migration advisor* as separate patches, and M as "Compatibility diagnosis and legacy formats", "1.1–1.5 (waves; initial Windows slice in 1.1.0-beta.1)", depending on E, F, G and J (N depended on G and M, O on I and N, P on O and J). Audit 18 (F-71) replaced that with the platform sequence above. The three capability areas were not dropped: they are acceptance dimensions 3 to 5 of **every** product patch M–Q (see [Scope and acceptance for every product patch](#scope-and-acceptance-for-every-product-patch)).

## Active work: product patches M–Q

Patches A–L are the completed 1.0 foundation and remain historical release records. All remaining product work is delivered as **five sequential product patches: M, N, O, P and Q**. These letters are the only active planning units. Do not create parallel tracks, platform-wave sub-patches, M1-style release plans, or separate cross-cutting patch families. A patch may have internal implementation tasks, but it is released and accepted as one product outcome.

Each patch is a vertical product slice: detection and Target Profile, compatibility diagnosis, required execution environment, behavior capture/replay, validation/equivalence where an oracle exists, MCP/CLI surface, documentation, and end-to-end reference trials are delivered together to the extent relevant to that target family. Reuse shared interfaces; do not defer a capability to a later patch if it is necessary to make the current platform slice useful. Q consolidates and generalizes the completed platform work rather than introducing a second planning taxonomy.

### Ordered product patches

| Patch | Target and outcome | Target release | Depends on |
|---|---|---:|---|
| M | **Complete Windows compatibility, DOS through Windows 7-era software (up to 2010).** Finish the initial 1.1 Windows detector slice; deliver evidence-backed Target Profiles, sourced API/runtime compatibility diagnosis, relevant execution providers, behavior capture/replay, preservation reporting and migration recommendations. | 1.2 | A–L foundation; initial Windows analyzer in 1.1.0-beta.1/.2 |
| N | **Old Linux software.** Support a.out/early ELF, old libc and ABI generations, legacy desktop/audio stacks and old package formats; deliver the same end-to-end diagnosis, environment, replay and validation workflow. | 1.3 | M shared contracts and evidence model |
| O | **Classic Mac and early macOS software.** Support 68k, PEF/CFM, resource forks, PowerPC and early Intel Mach-O, Carbon and legacy bundle layouts; deliver end-to-end recovery and preservation workflow. | 1.4 | N shared contracts and environment/replay foundations |
| P | **Legacy Android software.** Support Dalvik/early ART, old API levels, 32-bit ARM/x86/MIPS native components and legacy framework behavior; deliver device/emulator diagnosis, capture/replay and preservation validation. | 1.5 | O shared contracts and Android foundations already present in E/J |
| Q | **Newer generations and unified compatibility intelligence.** Extend the proven workflow to post-2010 Windows, newer Linux, modern/classic-transition macOS and newer Android generations; unify profiles, API/runtime knowledge, evidence, confidence, environment matrices and migration reports across all supported platforms. | 2.0 | M–P complete |

### Scope and acceptance for every product patch

Every patch must deliver all of the following for its target family, with honest limitations where a platform or external engine cannot provide a capability:

1. **Target Profile and static inventory:** executable/container formats, architecture, ABI, OS era, toolchain/runtime/framework, installer/packager and dependencies. Every field links to source evidence, confidence and coverage.
2. **Compatibility diagnosis:** sourced, versioned OS/API/runtime availability data; concrete findings for missing/changed APIs, libraries, permissions, filesystem/registry/preferences, locale, graphics/audio, timing and hardware assumptions. Hypotheses remain separate from facts.
3. **Execution and observation:** real provider detection, user-supplied licensed images, environment fingerprints, bounded execution, first-failure diagnostics and traces. No fabricated provider results.
4. **Behavior capture and replay:** deterministic scenarios for applicable inputs, outputs, files, UI and other observable side effects; nondeterminism controls and explicit replay limitations.
5. **Preservation and migration:** differential validation against an oracle, coverage and residual-risk reporting, L0–L3 preservation levels, and ranked migration options. Without an oracle, preservation remains L0.
6. **Product integration:** stable CLI/MCP contracts, matching `docs/MCP.md`, capability checks, security review, examples and updated README/architecture/capabilities docs.
7. **Reference trials:** at least two reproducible reference-program scenarios where lawful fixtures and environments exist: diagnose/restore a program that fails in the current environment, and compare a changed/repackaged/reimplemented version against the original. If a platform oracle or licensed environment is unavailable, record that as an explicit release limitation rather than claiming success.

### Delivery rules

- Work strictly in M → N → O → P → Q order. Do not start a later patch while the current patch's acceptance criteria remain open, except for a documented blocking fix.
- Internal work breakdowns are not patch names and must not appear as competing roadmap classifications.
- Each patch has one scope, one acceptance checklist, one release record and one capability-gate result. A documentation-only maintenance change does not count as a product patch and is not folded into these five deliverables.
- Preserve backward compatibility and all existing safety gates. Legacy analysis is limited to open-source software or software with full rights-holder consent; operating-system images and proprietary tools are user supplied, never bundled.
- The initial Windows slice in 1.1.0-beta.1 and detector increment in 1.1.0-beta.2 are historical progress within M, not separate future roadmap units. M remains open until its complete Windows outcome passes the criteria above.

**Version policy:** M 1.2, N 1.3, O 1.4, P 1.5, Q 2.0. Do not assign versions to internal tasks or invent intermediate patch labels. Patch L remains part of the completed 1.0 foundation, not a parallel future track.

### Patch M working checklist

Patch M is **in progress** (target release 1.2). The items below are *internal tasks*, grouped by the seven acceptance dimensions above; they are not patches and must not be given patch labels or versions. A box is ticked only where code and a passing check exist at 1.1.0-beta.2. Backlog IDs refer to the [approved audit backlog](#approved-audit-backlog-audit-1-approved-2026-11-09).

**1. Target Profile and static inventory**
- [x] DOS MZ, Windows NE, LE, LX and PE header recognition (1.1.0-beta.1).
- [x] Machine, PE bitness and subsystem extraction from the bounded header window.
- [x] Bounded scan (8 MiB) for selected Borland/Delphi, VB6, MFC, Visual C++, DirectX and Glide markers.
- [x] Bounded PE import table: imported libraries and named functions (1.1.0-beta.2).
- [x] Static framework signatures: Delphi form/RTTI-style, VB6 metadata, MFC class/message-map (1.1.0-beta.2). Indicators with explicit confidence, **not calibrated**.
- [ ] Delay imports, bound imports and out-of-window tables (known limitation).
- [ ] PE hardening flags: ASLR, DEP, CFG, SEH (R-11, PE part; ELF flags go to N).
- [ ] Opt-in detect-only providers `diec`, `yara-x`, `capa` for packer and toolchain detection (R-10 subset).
- [ ] Hostile-input property tests (`fast-check`) for the PE/NE/LE parsers (R-04, new parsers).
- [ ] Shared Target Profile schema and one reusable authorization and provenance gate (work order step 1).
- [ ] Packer/protector detection.
- [ ] Installer/packager and dependency identification.
- [ ] Full Target Profile object: OS and era, CPU, bitness, ABI, toolchain/runtime/framework, installer, dependencies; every field with source evidence, confidence and coverage (ARCHITECTURE.md *Target Profile*).
- [ ] Remaining Windows detector matrix (F-63 stays open until done; G-02).
- [ ] Reference corpus with ground truth and precision/recall/calibration metrics for the detectors (H-08); corpus holds hashes and signatures only, with source and license per entry (H-06).
- [ ] Further similarity adapters (H-03) and the rule "deterministic detectors first; analogy tag only with confidence and deterministic basis" (H-04).
- [ ] Target-platform and era support matrix in `CAPABILITIES.md`, with a capability check against the registered format detectors (G-09).

**2. Compatibility diagnosis**
- [x] Preliminary static compatibility candidates from legacy headers and selected PE runtime/graphics imports, with confidence and limitations (F-69). They are candidates, not diagnosed causes.
- [ ] Sourced, versioned OS/API/runtime availability tables (data, not code; no OS-version availability is inferred today).
- [ ] Concrete findings with evidence per cause: removed or changed APIs, missing libraries, permissions, filesystem/registry, locale, graphics/audio/driver, timing tied to CPU speed, DPI and resolution, address-space and date limits, hardware assumptions (G-01).
- [ ] Causes that only a run can confirm are marked as needing an execution environment; hypotheses stay separate from facts.

**3. Execution and observation**
- [ ] Execution-environment provider contract (detect, prepare, snapshot, restore, run with limits, trace, shut down) and real, detected adapters for Wine, DOSBox-class emulators and QEMU/VMs; user-supplied licensed images only, hashes recorded in the environment fingerprint (G-03).
- [ ] Sandbox for executed targets under `CONTROLLED_EXECUTION` (R-20; approved prerequisite, step 5 of the work order: Patch M is the first patch that runs legacy targets).
- [ ] Bounded execution, first-failure diagnostics, traces and a works/fails matrix across environments. No fabricated provider results.

**4. Behavior capture and replay**
- [ ] Deterministic scenarios for inputs, outputs, files, registry/preferences, network, UI events; time and randomness control; code coverage of the original; normalization; old-versus-new comparison; explicit replay limitations (G-04).

**5. Preservation and migration**
- [ ] Differential validation against an oracle and the function equivalence lab (emulation, differential and property tests) (G-05).
- [ ] Behavior-preservation report with levels L0–L3, coverage and residual risk (G-10); no level above L0 without an oracle and provenance for generated code (H-07).
- [ ] Migration strategy advisor with ranked options (G-06).

**6. Product integration and authorization**
- [x] Legal-policy documentation (SECURITY.md, ARCHITECTURE.md); this closes only the documentation part of G-07.
- [x] Operator authorization declaration (`declare_legacy_authorization`) stored in the research session; `analyze_legacy_windows` refuses without it; the declaration is embedded in the result (F-64 in part, F-70, H-10 in part).
- [ ] Pin the two remaining tag references in `supply-chain.yml` (F-75, work order step 0).
- [ ] Extend the authorization and provenance gate to **every** new analysis, execution, capture, replay and migration operation (H-05, F-64 remainder, G-07 enforcement).
- [ ] Stable CLI/MCP contracts for all new tools, `docs/MCP.md` matching `tools/list` exactly, capability checks, security review, examples, updated README/ARCHITECTURE/CAPABILITIES.

**7. Reference trials**
- [ ] Scenario 1: diagnose and restore a lawful reference program that fails in the current environment.
- [ ] Scenario 2: compare a changed, repackaged or reimplemented version against the original.
- Where no lawful fixture, platform oracle or licensed environment exists, record that as an explicit release limitation instead of claiming success.

#### Work order inside M (approved by the maintainer, 2026-11-11)

The order follows the dependencies between the checklist items and puts risk first: shared contracts and measurement before new detectors, a safety layer before anything is executed, execution before capture/replay, and capture/replay before preservation claims. The steps are internal tasks, not patches: they carry no patch letter and no planned version. Each step ends in a tested, documented prerelease of the 1.1.x line (new checks in the capability suite, `docs/MCP.md` and `CAPABILITIES.md` updated, checklist ticked) and does not leave a half-working branch. Do not start a step while the previous one has open exit criteria, except for a documented blocking fix. Two rules apply to **every** step: (a) every new analysis, execution, capture, replay or migration operation goes through the shared authorization and provenance gate from step 1 in the same change that adds it (H-05, F-64, G-07); (b) every new detector, table or adapter ships with a check that can fail and with the limitation it has.

| Step | Work | Closes (checklist section, backlog IDs) | Exit criteria |
|---|---|---|---|
| 0 | **Pin the two remaining tag references** in `.github/workflows/supply-chain.yml` to the SHA already used for `upload-artifact` in the other workflows (`043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`, v7.0.1) | F-75, R-03 | The R-03 capability check shows ✅; no other change in the same commit |
| 1 | **Shared contracts.** (a) The Target Profile schema: every field carries source evidence, confidence and coverage. (b) One reusable authorization and provenance gate that every legacy operation calls. (c) The format for sourced, versioned data tables: one entry per fact with source, license and retrieval date, hashes and signatures only, no third-party binaries. | Sections 1 and 6; H-05, H-06, H-10, F-64 | The existing `analyze_legacy_windows` runs through the shared gate and emits the Target Profile envelope with unchanged fields; a check shows the gate refusing every legacy tool without a declaration; the table format has a validator with a failing fixture |
| 2 | **Ground truth and calibration before new detectors.** A reference manifest with expected answers and a harness that reports precision, recall and confidence calibration per detector. Fixtures are crafted headers and open-source or consented samples; an operator-supplied local corpus is read through a manifest of hashes (nothing is bundled or uploaded). | Section 1; H-08, H-06 | Existing Delphi, VB6 and MFC signatures and import detectors have measured precision/recall with the corpus size stated; a regression in a detector fails a check |
| 3 | **Complete the static Target Profile.** Delay and bound imports; packer/protector detection (built-in deterministic section and entropy rules, plus opt-in detect-only providers `diec`, `yara-x`, `capa`); installer/packager identification; PE hardening flags (ASLR, DEP, CFG, SEH); the remaining Windows detector matrix; the full Target Profile object; the target-platform and era support matrix in `CAPABILITIES.md` with a check against the registered detectors. Hostile-input property tests (`fast-check`) for the new PE/NE/LE parsers. | Section 1; G-02, G-09, F-63, R-10 (subset), R-11 (PE part), R-04 (new parsers), H-03, H-04 | Every Target Profile field has evidence; the matrix check fails when a detector and its matrix row disagree; step 2 metrics are reported for the new detectors; absent external tools are reported unavailable, never simulated |
| 4 | **Compatibility diagnosis on sourced data.** Versioned OS/API/runtime availability tables (DOS through Windows 7-era) with source and license per entry; one finding per cause with its evidence (G-01); hypotheses kept apart; causes that only a run can confirm are marked as needing an execution environment. | Section 2; G-01, F-69 (remainder) | Every finding traces to a table entry and a target fact; a target using a removed API gets the cause named with both sources; no OS-version availability is inferred from a missing table |
| 5 | **Safety layer, then execution.** (a) The sandbox for executed targets: no network by default, scratch directory, resource limits, tree-wide termination, the Linux mechanism first and a recorded limitation for each platform without one (R-20). (b) The `ExecutionEnvironment` provider contract (detect, prepare, snapshot, restore, run with limits, trace, shut down). (c) Real, detected adapters in this order: Wine (covers most Win32 targets), DOSBox-class emulators (DOS and early Windows), QEMU/VM with user-supplied licensed images hashed into the environment fingerprint. (d) Bounded execution, first-failure diagnostics, traces and the works/fails matrix. | Section 3; R-20, G-03 | Nothing runs outside the sandbox; a test proves that a target cannot reach the network or write outside the scratch directory; absent engines are `unsupported`; the works/fails matrix is produced from real runs of a fixture program |
| 6 | **Behavior capture and replay.** Deterministic scenarios for inputs, outputs, files, registry/preferences, network and UI events; time and randomness control; coverage of the original; normalization; old-versus-new comparison; replay limitations stated. Reuses the step 5 environments and the existing validation normalization. | Section 4; G-04 | A scenario recorded in one environment replays with identical normalized results; nondeterminism that cannot be controlled is reported, not hidden |
| 7 | **Preservation and migration.** The oracle rule and provenance for generated code (H-07); differential validation and the function equivalence lab; the behavior-preservation report with levels L0–L3, coverage and residual risk; the migration advisor with ranked options. | Section 5; G-05, G-06, G-10, H-07 | Without an oracle the level is L0 and cannot be raised; every report states level, coverage, scenario count, environments and residual risk; the advisor's options each cite evidence |
| 8 | **Reference trials and release.** The two reference scenarios (diagnose and restore a failing program; compare a changed version against the original) on lawful fixtures, with the explicit limitation where no oracle or licensed environment exists; documentation; security review; the manual `os: all` run on Linux, macOS and Windows; release record and version index; the closure of the backlog rows assigned to M. | Section 7; the "M is done when" conditions | All conditions below hold; the release is **1.2.0** |

Allowed overlap: step 4 may start once the step 1 Target Profile schema and table format are fixed and step 3 is under way; step 2 may start next to step 1 for the existing detectors. Nothing else runs in parallel. If a later step shows that an earlier contract is wrong, fix the contract first and record it as a finding.

**M is done when** every item above is ticked or recorded as an explicit limitation, the seven acceptance dimensions pass, the capability matrix has no ❌/⚠️ and no 🚧 for an in-scope M capability, the manual `os: all` run is green, backlog rows G-01…G-10, F-63, F-64, H-03…H-08, H-10 assigned to M are closed, and the release is **1.2.0** with its release record below.

### Patch M history: delivered increments

These are historical progress notes inside Patch M, not separate roadmap units. The open work is in the [Patch M working checklist](#patch-m-working-checklist).

#### Patch M implementation note — 1.1.0-beta.1 (initial Windows slice)

This prerelease adds `analyze_legacy_windows` and `declare_legacy_authorization`, the session authorization record, deterministic executable-header recognition (MZ/NE/LE/LX/PE), bounded selected marker scanning, and preliminary compatibility candidates. It closes only the legal-policy documentation item and the initial authorization/header-detector sub-slice; it does **not** close G-01/G-02/G-07/G-09 or the Windows wave. Remaining M checklist items are intentionally unchecked.

#### Patch M1 implementation note — historical label for the same patch M — 1.1.0-beta.2 (Windows detector expansion)

- [x] Bounded PE import-table parsing reports imported libraries and named functions without executing the target.
- [x] Static VB6/MFC runtime-import signatures and Delphi form-stream, VCL RTTI-style, VB6 metadata and MFC class/message-map signatures are reported with explicit confidence and evidence.
- [x] Selected VB6/MFC/DirectX/Glide imports feed compatibility candidates; no OS-version availability is inferred.
- [x] Legacy analysis results embed the research session's declared authorization basis, reference, declarant and timestamp.
- [x] Unit and capability checks cover import extraction, framework signatures and authorization provenance.

This is an M1 product increment, not completion of the Windows wave. Packer detection, sourced API availability tables, ground-truth corpus calibration and the full Target Profile remain open.

### Maintenance record: CI diagnostics (delivered in 1.1.0-beta.1; not a product patch)

This record was previously headed "CI diagnostics mini-patch". It is maintenance work outside the A–Q sequence; it claims no product capability and does not count toward M.

- [x] Publish a downloadable detailed-log ZIP artifact for each workflow (`Capabilities`, `Structure`, `Supply chain`), even when a job fails.
- [x] Publish a separate plain-text/Markdown `AI-DEBUG-SUMMARY.md` artifact with run identity, step inventory, failure exit codes and relevant error excerpts.
- [x] Add a reusable local summary generator and `npm run ci:summary`.
- [x] Document artifact names, contents, retention and the limits of AI-generated diagnosis in README and `docs/GITHUB.md`.
- [x] Harden the generator against empty/missing log content; distinguish missing exit markers from confirmed success; classify common failures; include command lines, file/line references, TAP failure names, surrounding context, capability JSON failures/drift, JUnit failures and stack frames when present; redact common secret patterns. Concrete test/assertion evidence takes precedence over incidental category keywords.
- [x] Close the first Patch M contract drift found by CI: add F-63…F-65 to the approved backlog and include both Patch M MCP tools in the exact 60-tool contract fixture.
- [x] Add regression tests and run them before generating the artifact in all workflows.
- [ ] Verify artifact upload and summary content in actual GitHub Actions runs for all three workflows; local checks cannot prove GitHub artifact availability.

## Carry-over debt register

Approved tasks that are **not** closed, collected from the backlog, the patch records and the audits, so that nothing hides inside a patch marked done. None of them is recorded as blocking Patch M. "State" says what was verified at 1.1.0-beta.2; "No implementation found" means a search of `src/` for the feature found nothing. Handling marked *approved* was confirmed by the maintainer on 2026-11-11 and is part of the plan; handling marked *proposal* still needs the maintainer's approval before it becomes plan (AGENTS.md section 1, point 3).

### Approved tasks without delivery or without recorded closure

| ID | Task | Backlog assignment | State at 1.1.0-beta.2 | Handling |
|---|---|---|---|---|
| F-75 / R-03 | Pin the two remaining tag references in `.github/workflows/supply-chain.yml` to full commit SHAs | 1.0.1 (R-03 recorded closed) | Open defect: the capability check shows 🚧 (2 of 25 references are tags; 23 pinned) | *Approved:* work order step 0, the first change of M (pin to `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`, v7.0.1, as in the other workflows), then re-run the check |
| R-20 | Sandbox for executed targets under `CONTROLLED_EXECUTION` (bwrap/unshare, sandbox-exec, Job Objects/AppContainer or a container provider; no network by default; scratch directory; rlimits) | G (done) | No implementation found. Only the cgroup v2 limiter exists; SECURITY.md lists the gap | *Approved:* inside M, work order step 5, before any execution environment is added, because M is the first patch that runs legacy targets |
| R-14 | Merkle root, Ed25519 detached signature, `reverse export` / `reverse verify` | I (done) | Hash chain and optional HMAC-SHA256 are done; Merkle, public-key signatures and the two commands: no implementation found | *Proposal:* schedule with Q (unified evidence) or earlier if a consumer needs third-party verification |
| R-11 | Hardening-flag report (PIE, NX, RELRO, canary, CFG, ASLR) | E (done) | No implementation found | *Approved:* PE flags in M (work order step 3); ELF flags in N |
| R-10 | Opt-in providers: lief/goblin, objdump/readelf, capa, yara-x, diec, syft, osv-scanner, cargo-auditable, Go build info | E, F, H (done) | Only rz-bin/Rizin, Ghidra, JADX, Apktool and profilers exist; the others: no implementation found | *Approved:* `diec`, `yara-x` and `capa` in M (work order step 3); the rest only when a real need appears |
| R-12 | Profile ingestion in standard formats (perf, pprof, `.cpuprofile`, Speedscope, Firefox Profiler); eBPF via bpftrace | H (done) | Export shape closed in 0.2.0-beta.6; ingestion: no implementation found | Open; schedule only when a task needs it |
| R-15 | Golden results and the three reference trials as manual CI jobs | J (done) | Fixture trials run in the suite; golden results and dedicated manual CI jobs: no implementation found | Open; reuse for the M reference trials |
| R-01 | Mutation testing (Stryker) on pure modules | D (done) | No mutation runner configured | Open, non-blocking |
| R-04 | Fuzz and property tests (`fast-check`) for parsers | D (done) | Partial: deterministic hostile process-parser corpus; `fast-check` and binary-parser fuzzing open | Open; approved for the new PE/NE/LE parsers of M (work order step 3) |
| R-05 | Linter, `knip`, `jscpd`, own-line size gate | C (done) | Partial: strict TypeScript, format gate, size gate, `quality:static`; `knip`, `jscpd` and a dedicated linter not installed | Open, non-blocking |
| R-07 | Contract-first MCP (docs generated from one definition) | D (done) | Partial: schemas, profiles, errors, pagination, size budget exist; docs are contract-tested, not generated | Open, non-blocking |
| R-19 | Windows/macOS metric parity: persistent helpers instead of a fork per sample; `typeperf`/ETW and `libproc` | D/H (done) | Open: PowerShell helper forks per sample | Open, non-blocking |
| F-08 | Single-PID fast path for inspection and sampling | B (done) | Linux and Windows done; macOS reads the full table | Open (macOS part), non-blocking |
| F-06 | MCP protocol: stateless 2026 protocol era | D (done) | Stateful revisions through 2025-11-25 only | Open |
| R-08 / R-18 / H-09 | Full live-agent evaluation corpus harness; optional single-file binary | L | Core shipped in 1.0.0; lite evaluation (`evaluateAgentPrompts`) in 1.0.1; full harness and single binary open | Open (patch L checklist) |
| H-03 / H-04 / H-05 / H-06 / H-07 / H-08 / H-10 | Similarity adapters, deterministic-first rule, authorization enforcement, corpus policy, oracle rule, calibrated reference corpus, authorization record in reports | M (introduced) | Partial or open; tracked in the [Patch M working checklist](#patch-m-working-checklist) | Closed by M, extended in N–Q |
| G-01…G-10 | Compatibility diagnosis, legacy formats, execution environments, capture/replay, equivalence lab, migration advisor, legal policy, platform order, support matrix, preservation report | M (introduced), extended in N–Q | Open except the documentation part of G-07 and the platform order (G-08, closed by F-71) | Closed by M, extended in N–Q |

### Non-claims carried over from the E–K audits (Audit 8 and others)

These capabilities are **not** implemented and must not be described as available. They stay provider-backed or explicit limitations until a task needs them.

- Full control-flow graph, interactive decompilation and cross-references; BSim scores without an operator corpus.
- CVE database, registry "outdated" queries, size and replacement recommendations for dependencies; binary `AndroidManifest.xml` (AXML) decoding; DEX class listing; full Gradle resolution.
- Continuous Frida call-frequency profiles and `Java.perform` session scripts; Windows ETW automatic hotspot sessions; per-process network I/O.
- Full test-framework discovery (jest, pytest); Merkle roots and detached signatures (R-14 above).
- Acceptance trials on real external applications of the three reference shapes (fixture trials are done); external commercial reference apps are not bundled.
- OS sandbox, network isolation, Windows/macOS hard resource quotas (R-20 above).

### Pending verification (delivered, run not recorded)

- Full-matrix `os: all` Capabilities run for patches E–M (last recorded: A–D closure run 42775483864 on 0.2.0-beta.8).
- GitHub artifact upload and summary content of the CI diagnostics workflows (F-66) and the rerun for F-67.

## Completed foundation: patches A–L

Historical records of the 1.0 foundation. These patches are done; do not re-open them. Remaining debts from them are in the [carry-over debt register](#carry-over-debt-register).

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
- [x] Opt-in Ghidra adapter with headless import + postScript function dump; Rizin/rabin2 structured inspect; never fabricated when absent.
- [x] Opt-in JADX and Apktool providers (`providers-android-tools`) for DEX/Smali/resources; native `.so` remains Ghidra/Rizin when available.
- [x] Disassembly/decompilation data only via adapters when tools exist on the host.
- [x] `SimilarityProvider` contract + `ghidra-similarity` adapter (H-03); no bundled corpus (H-06).

Capability checks that flip: *Providers — Ghidra/Rizin/JADX/Apktool registered* → ✅. Frida/GDB/perf/eBPF/ETW/Instruments become registered adapters in patches G–H.

**Milestone 0.3 is released: E and F are done (0.3.0-beta.2).**

### Patch G — Dynamic analysis: Frida and GDB (0.4) — done, released as 0.4.0-beta.1

Closes the dynamic-analysis part of the 0.4 section.

- [x] Opt-in Frida and GDB/LLDB adapters (`providers-frida`, `providers-gdb`): detect install, never fabricate results.
- [x] Tracing/attach only under `CONTROLLED_EXECUTION`; otherwise structured `unsupported`.
- [x] MCP `trace_execution` (Frida): attach sample with modules/threads/backtraces under CONTROLLED_EXECUTION.
- [x] GDB/LLDB batch attach (`bt`, threads) or file inspect under CONTROLLED_EXECUTION.
- [x] ADB env passthrough for Frida; continuous call-frequency and Java.perform remain host scripts.

Capability checks: Frida/GDB are **registered** adapters (not labels).

### Patch H — Native profilers and hotspots (0.4) — done, released as 0.4.0-beta.1

Closes **Function hotspots via real external profilers** and the **Disk/network I/O providers** items.

- [x] Providers: `perf`, `ebpf` (bpftrace/bpftool), `etw` (logman/wpr), `instruments` (sample/xctrace), `valgrind`, `simpleperf` — detect-only, no fake data.
- [x] `get_hotspots(pid)` — perf top (Linux) / sample (macOS) under CONTROLLED_EXECUTION; otherwise process-level only with limitation.
- [x] `get_process_io(pid)` — Linux `/proc/pid/io` disk counters; network gap documented.
- [x] MCP: `get_hotspots`, `get_process_io`.

Capability checks: profiler adapters **registered**; hotspots ✅ only when a real profiler produced them.

### Patch I — Validation, integrity and reports (0.4) — done, released as 0.4.0

Closes the validation, integrity and reporting part of the 0.4 section.

- [x] Validation normalization (whitespace, timestamps, sortLines) and fixture runner (`runValidationFixtures`).
- [x] Explicit "equivalence cannot be proven" when checks fail; never claim semantic equivalence.
- [x] Evidence hash-chain verify + optional HMAC-SHA256 (`REVERSE_EVIDENCE_KEY`) via `signSession` / `verifySessionSignature`.
- [x] Before/after `generateChangeReport` with residual risks and next steps.
- [x] MCP: `generate_change_report`, `verify_evidence_integrity`, `run_validation_fixtures`; `validate_changes` accepts `normalize`.
- [x] CLI: `hotspots`, `fixtures`; android help text corrected.

Capability checks: validation normalization ✅; evidence optional signing ✅.

**Milestone 0.4 is released: G, H and I are done (0.4.0).** Hardening and full doc/audit alignment: **0.4.1** (A–I-closed; Audit 8).

### Patch J — Controlled optimization loop (1.0) — done in 0.5.0-beta.2

Closes the research cycle (investigation, diagnosis, hypotheses, experiment, verification, decision, report) described in [ARCHITECTURE.md](ARCHITECTURE.md). The orchestration stays with the AI agent; Reverse provides the deterministic steps and enforces the safety rules.

- [x] Change workspace: directory copy under `REVERSE_HOME/workspaces/<id>/work`; original never written. `CONTROLLED_EXECUTION` + `confirm:true`.
- [x] Git worktree alternative: `create_git_worktree` / `remove_git_worktree`.
- [x] `apply_change` on workPath only; `rollback_change` / `accept_change` (accept does not overwrite original).
- [x] `decide_optimization`: accept / roll_back / need_more_data / reject.
- [x] APK pipeline on copy + `adb_install` / `adb_pm_clear` / `adb_emu_snapshot_load` (gated; test device only).
- [x] E2E trials for three reference shapes (fixture-based): `run_optimization_trial` / `run_all_reference_trials`.

Released as **0.5.0-beta.2**. External licensed reference apps remain optional operator data; fixtures cover the three shapes.

### Patch K — Runtime analyzers and on-demand extensions (1.0) — done in 1.0.0-beta.1

Closes the remaining **Later** items.

- [x] JavaScript/Electron static inventory (`analyze_javascript` / provider `javascript`).
- [x] .NET CLI-header detection on PE (`analyze_dotnet` / provider `dotnet`).
- [x] WebAssembly section inventory (`analyze_wasm` / provider `wasm`).
- [x] Optional HTTP MCP: `REVERSE_MCP_HTTP=1` + `REVERSE_MCP_TOKEN` (Bearer), POST `/rpc` on localhost by default (`mcp-http` CLI).
- [x] Further extensions (Browser, GPU, Network, …) remain on-demand extension-points when a real need appears.

**Version 1.0.0** — patches **A–K done**; green capability matrix on the release base. Residual 🚧 (R-03 full SHA pins, R-05 knip/jscpd, F-16 harness split, R-19 persistent helpers) are non-blocking quality debts.

### Patch L — Agent integration and distribution (1.x) — core in 1.0.0, hygiene in 1.0.1

Closes audit tasks R-08 and R-18 (core) and quality debts R-03 / F-16 / R-05 (partial).

- [x] MCP prompts / resources / `reverse setup` / skill / `server.json` (1.0.0).
- [x] H-09 **lite**: `evaluateAgentPrompts` scores prompt templates (not full live-agent corpus).
- [x] R-03: GitHub Actions in workflows pinned to full commit SHAs.
- [x] F-16: capability entry `capabilities.check.ts` is thin; checks live in `capabilities-suite.ts`.
- [x] R-05 partial: `npm run quality:static` (no new deps); knip/jscpd still optional.
- [ ] Full H-09 live-agent corpus harness; optional single-file binary.

### After 1.0.1 — planned order

1. Optional knip/jscpd and R-19 platform helpers when they block real work.
2. Product patches M–Q in the strict sequence defined below.

## Coverage of the roadmap

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
| Hypothesis ledger, similarity providers, authorization, oracles (Audit 3) | D, F, L, M–Q (see the Audit 3 table) |
| Legacy compatibility and recovery product outcomes | M–Q in strict sequence (see Product delivery after 1.0) |

## Approved audit backlog (Audit 1, approved 2026-11-09)

Every finding (F-xx) and recommendation (R-xx) of [Audit 1](AUDIT.md) is an **approved project task**. Each belongs to exactly one patch (or is already closed). A patch is not done until its rows here are closed and the matching findings in [AUDIT.md](AUDIT.md) carry `Status: closed in <version>`. The capability suite checks that every ID of the audit appears in this table. New audits append their IDs here in the same way. In rows and audits written before the consolidation, the label **M1** is a historical name for the early increments of Patch M (1.1.0-beta.1 and .2); it is not a separate patch.

### Findings (Audit 1, approved 2026-11-09, plus the later findings F-50 to F-71; sorted by ID — F-18 to F-41 follow in the tables of Audits 4 to 6)

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
| F-09 | File and size caps, `lstat`, `.wasm`; comment-aware imports | closed in 0.2.0-beta.2 (caps); comment-aware imports closed in **0.3.0-beta.1 / E** (not full AST) |
| F-10 | Dependency groups kept per group, `peerDependencies`, lockfiles | closed in **0.3.0-beta.1 / E** |
| F-11 | Streamed hashing, atomic evidence writes, lookup by evidence id, one evidence code path | closed in 0.2.0-beta.6 (shared atomic JSON writer) |
| F-12 | Process-group kill with identity-checked sweep; real counts on Windows | closed in 0.2.0-beta.6 |
| F-13 | Mach-O CPU type and fat slice table, PE `e_lfanew` beyond the buffer reported as `partial` | closed in **0.3.0-beta.1 / E** (hardened 0.4.1) |
| F-14 | Remaining: `.gitattributes`, `noUnusedParameters` | closed in 0.2.0-beta.3 |
| F-15 | Documentation drift and the planned-tools check | closed in 0.2.0-beta.2 |
| F-16 | Split capability harness | closed in **1.0.1** (entry + `capabilities-suite.ts`) |
| F-17 | Threat model: agent as untrusted caller, prompt injection through target data | closed in 0.2.0-beta.5 |
| R-25 | Docs lagged E–I implementation | closed in **0.4.1** |
| F-50 | CLI android help text wrong | closed in **0.4.1** |
| F-51 | Ghidra import-only without postScript | closed in **0.4.1** |
| F-52 | Frida/GDB trivial probes only | closed in **0.4.1** |
| F-53 | No isolated change workspace before J | closed in **0.5.0-beta.1 / J** |
| F-54 | No deterministic optimization decision helper | closed in **0.5.0-beta.1 / J** |
| F-55 | No git worktree path for changes | closed in **0.5.0-beta.2 / J** |
| F-56 | No adb install/pm clear/snapshot helpers | closed in **0.5.0-beta.2 / J** |
| F-57 | No E2E reference-shape trials | closed in **0.5.0-beta.2 / J** |
| F-58 | No JS/Electron/.NET/WASM analyzers | closed in **1.0.0-beta.1 / K** |
| F-59 | No optional HTTP MCP with auth | closed in **1.0.0-beta.1 / K** |
| F-60 | No MCP prompts/resources for agents | closed in **1.0.0 / L** |
| F-61 | No reverse setup / skill install | closed in **1.0.0 / L** |
| F-62 | No H-09 prompt evaluation harness | closed in **1.0.1** (lite) |
| F-63 | No deterministic Windows legacy executable header/marker analyzer | initial slice in **1.1.0-beta.1 / M**; full M1 detector matrix remains open |
| F-64 | No recorded declared authorization basis for legacy analysis | initial gate in **1.1.0-beta.1 / M**; report provenance closed in **1.1.0-beta.2 / M1**; future operation gates remain open |
| F-65 | Initial M slice not reflected consistently in package metadata and project documentation | closed in **1.1.0-beta.1 / M** |
| F-66 | CI AI summary could crash or omit actionable diagnostics | closed in **1.1.0-beta.1 maintenance** |
| F-67 | CI AI summary could misclassify capability-suite test failures as formatting failures | fix in **1.1.0-beta.1 maintenance**; verified by regression tests; GitHub rerun pending verification |
| F-68 | Windows legacy analyzer lacked PE imports and structural framework signatures | closed in **1.1.0-beta.2 / M1** (bounded static detectors; corpus calibration remains open) |
| F-69 | Legacy compatibility candidates ignored PE import evidence | closed in **1.1.0-beta.2 / M1** (selected imports; OS API availability tables remain open) |
| F-70 | Legacy authorization was not embedded in analysis results | closed in **1.1.0-beta.2 / M1** |
| F-71 | Future platform and cross-cutting work used overlapping patch classifications | closed in documentation-only planning patch (2026-11-10); no product capability claimed |

### Findings (Audit 4, A–D closure review, 2026-11-10)

| ID | Task | Patch / status |
|---|---|---|
| F-18 | Patch A text said "nine environments" next to "(6 environments)" | closed in 0.2.0-beta.7 |
| F-19 | Patch A has no recorded green run on macOS and Windows | closed in 0.2.0-beta.8 (A–D closure run 42775483864, commit `996cbf4`) |
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
| F-33 | R-03, R-05 and F-16 still open although patches C and D read as delivered | partly closed: F-16 closed in 1.0.1; R-03 closed in 1.0.1 but reopened by F-75 (two unpinned refs); R-05 partial (see the debt register) |

### Findings (Audit 5, CI evidence for 0.2.0-beta.7, 2026-11-10)

| ID | Task | Patch / status |
|---|---|---|
| F-34 | Windows timeout run reported `processesTerminated: 0` (finalized before the tree kill ended) | B/C, closed in 0.2.0-beta.8 (verified green in A–D closure run 42775483864 (AUDIT Audit 7)) |
| F-35 | Windows tree kill: one PowerShell per victim and a full table with command lines | B/C, closed in 0.2.0-beta.8 (verified green in A–D closure run 42775483864 (AUDIT Audit 7)) |
| F-36 | Windows `inspectProcess` enumerated every process for one PID | B (F-08, Windows part), closed in 0.2.0-beta.8 (verified green in A–D closure run 42775483864 (AUDIT Audit 7)); macOS part stays open as F-08 |
| F-37 | Four Windows checks assumed Linux timing | C/D tests, closed in 0.2.0-beta.8 (delays and windows scaled, assertions unchanged; verified green in A–D closure run 42775483864 (AUDIT Audit 7)) |
| F-38 | No single copyable closure record from the A–D closure workflow | closed in 0.2.0-beta.8 |

### Findings (Audit 6, A–D closure run of 0.2.0-beta.8, 2026-11-10)

| ID | Task | Patch / status |
|---|---|---|
| F-39 | Profile-mode and `OBSERVE` unit tests assumed Linux sample cost (3–4 samples in 600–1000 ms) | C/D tests, closed in 0.2.0-beta.8 (window derived from the measured sample cost, assertions unchanged; verified green in A–D closure run 42775483864 (AUDIT Audit 7)) |
| F-40 | A closure cell that failed before the capability suite left no log and no row in the record | closed in 0.2.0-beta.8 |
| F-41 | Windows: the research-cycle benchmark delay (150 ms) was below the start-up noise of a Windows process | C/D tests, closed in 0.2.0-beta.8 (1500 ms on Windows, assertion unchanged; verified green in A–D closure run 42775483864 (AUDIT Audit 7)) |

### Findings (Audit 19, roadmap and documentation consolidation, documentation-only, 2026-11-11)

| ID | Task | Patch / status |
|---|---|---|
| F-72 | ROADMAP structure and status drift: a stale A–P dependency table without Q, no working checklist for Patch M, unticked 0.3/0.4/Later checklists for delivered patches, "closed when the run is green" statuses after a green run, planning notes after the last section | closed in documentation-only consolidation patch (2026-11-11); no product capability claimed |
| F-73 | Cross-document drift: README tool count (34 versus 60), CAPABILITIES header and MCP row, mixed Windows tables, GITHUB.md action pins, duplicated ARCHITECTURE sentence, unstructured MCP.md rows, AUDIT.md notice in the middle of the file | closed in documentation-only consolidation patch (2026-11-11); no product capability claimed |
| F-74 | Approved tasks (R-10, R-11, R-12, R-14, R-15, R-20 and others) stayed assigned to completed patches with no recorded delivery | closed in documentation-only consolidation patch (2026-11-11) by the [carry-over debt register](#carry-over-debt-register); the tasks themselves remain open |
| F-75 | Two action references in `supply-chain.yml` are tags, not SHAs; the R-03 check shows 🚧 although R-03 was recorded as closed in 1.0.1 | open: found while verifying the 2026-11-11 documentation patch; proposed fix in the debt register |

### Recommendations

| ID | Task | Patch |
|---|---|---|
| R-01 | Mutation testing (Stryker) on pure modules | **D** (open; no mutation runner configured) |
| R-02 | Threat model and prompt-injection hardening (`untrustedContent` wrapper, length caps, adversarial fixtures) | closed in 0.2.0-beta.5 (basic wrapper and caps) |
| R-03 | Pin GitHub Action SHAs | closed in **1.0.1** for the workflow action refs of that time; **reopened by F-75** (two refs in `supply-chain.yml` are tags); provenance/Scorecard remain optional hardening |
| R-04 | Fuzz and property tests (`fast-check`, devDependency) for parsers | partial in 0.2.0-beta.6: deterministic hostile process-parser corpus; fast-check and binary parser fuzzing remain open |
| R-05 | Static gates: linter and formatter, `knip`, `jscpd`, own-line size gate | partial in 0.2.0-beta.6: strict TypeScript, format check and own-line size gate; knip/jscpd/dedicated linter remain open; 0.2.0-beta.7: format gate now covers every TypeScript file and the size gate limits line length to 140 characters; knip, jscpd and a dedicated linter remain open |
| R-06 | Reformat dense files, formatter check in the structure workflow | closed in 0.2.0-beta.7 (beta.6 had reformatted only part of the files and left 186 lines over 140 characters; now every `src/` and `tests/` file passes the format gate and the line-length gate) |
| R-07 | Contract-first MCP: one definition generates `tools/list`, [MCP.md](MCP.md) and schemas; compact/full schema profile; structured error codes; pagination; size budgets | partial in 0.2.0-beta.6: schemas, profiles, errors, offset pagination and 1 MiB budget implemented; docs are contract-tested but not generated |
| R-08 | MCP prompts and resources; `reverse setup` for Claude Code, Codex, Cursor, Gemini CLI with dry run and backups; investigation skill file | **L** |
| R-09 | `reverse doctor` | closed in 0.2.0-beta.6 |
| R-10 | Existing parsers and tools as opt-in providers (lief/goblin, objdump/readelf, rz-bin, capa, yara-x, diec, syft, osv-scanner, cargo-auditable, Go build info) | **E** (static), **F** (provider adapters), **H** (profiling); partly delivered; `diec`, `yara-x` and `capa` reassigned to **M** (approved 2026-11-11), the rest on demand |
| R-11 | Hardening-flag report (PIE, NX, RELRO, canary, CFG, ASLR) | **E**; not delivered; PE flags reassigned to **M**, ELF flags to **N** (approved 2026-11-11) |
| R-12 | Profile ingestion in standard formats (perf, pprof, `.cpuprofile`, Speedscope, Firefox Profiler); hyperfine-compatible benchmark export; eBPF via bpftrace | export shape closed in 0.2.0-beta.6; profile ingestion remains **H** |
| R-13 | Statistics: bootstrap intervals, Mann-Whitney with Hodges-Lehmann shift, effect size, MAD outliers, environment-noise detection, interleaved A/B runs by default, `insufficient_evidence` verdict | closed in 0.2.0-beta.6 (noise snapshot and interleaved suites added) |
| R-14 | Tamper-evident evidence: per-session hash chain, Merkle root, Ed25519 signature, `reverse export` / `reverse verify` | **I** |
| R-15 | Golden results and the three reference trials as manual CI jobs | **J** |
| R-16 | Node support window: drop Node 20, `engines` and matrix to 22 and 24 | closed in 0.2.0-beta.3 |
| R-17 | Node built-ins instead of code: `util.parseArgs`, `AbortSignal.timeout`, `fs.glob`, test coverage, `os.availableParallelism` | closed in 0.2.0-beta.6 |
| R-18 | Distribution: `npx` entry, install scripts that only check Node and print configuration, optional single binary, `server.json` for MCP registries | **L** |
| R-19 | Windows and macOS metric parity: persistent helpers instead of a fork per sample; `typeperf`/ETW and `libproc` providers | **D/H** open: PowerShell helper currently forks per sample (a run shorter than one sample has no CPU/RSS data on Windows); persistent helper and ETW/libproc remain |
| R-20 | Sandbox for executed targets under `CONTROLLED_EXECUTION` (bwrap/unshare, sandbox-exec, Job Objects/AppContainer or a container provider; no network by default; scratch directory; rlimits) | **G**; not delivered; reassigned to **M** (approved 2026-11-11), work order step 5 |

### Goal gaps (Audit 2, approved 2026-11-09)

| ID | Task | Patch |
|---|---|---|
| G-01 | Compatibility diagnosis with evidence per cause | **M** |
| G-02 | Legacy formats and toolchains, by platform wave | **M** |
| G-03 | Execution-environment providers, snapshots, works/fails matrix | **M** (introduced), extended in N–Q |
| G-04 | Behavior capture and replay, coverage, normalization, old-versus-new comparison | **M** (introduced), extended in N–Q |
| G-05 | Function equivalence lab (emulation, differential and property tests) | **M** (introduced), extended in N–Q |
| G-06 | Migration strategy advisor | **M** (introduced), extended in N–Q |
| G-07 | Authorized-use and legal scope policy (first item of M) | **M** |
| G-08 | Single ordered product sequence: Windows, old Linux, Classic Mac/early macOS, legacy Android, newer generations | **M–Q** |
| G-09 | Target-platform and era support matrix in `CAPABILITIES.md` | **M** |
| G-10 | Behavior-preservation report with levels L0–L3 | **M** (introduced), extended in N–Q |

### Hypotheses, analogy and authorization (Audit 3, approved 2026-11-09)

| ID | Task | Patch |
|---|---|---|
| H-01 | Hypothesis ledger record type with provenance, confidence, status and the promotion rule | **D** |
| H-02 | Fact category 3 redefined; MCP marks `kind: "hypothesis"`; hypotheses never stored as evidence or mixed into measured or static findings | **D** |
| H-03 | `SimilarityProvider` contract; Ghidra Function ID and BSim adapters; no embedded corpus | **F** (contract), **M** (further adapters) |
| H-04 | Deterministic legacy detectors first; analogy tag only with confidence and deterministic basis | **M** |
| H-05 | Authorized-use policy: open-source software or full consent of developers and rights holders only | partial in 1.0.1, patch M (enforced for `analyze_legacy_windows`; other legacy operations must gate too) |
| H-06 | Corpus policy: hashes and signatures only, source and license per entry, no third-party binaries, local lookups | **F**, **M** |
| H-07 | Oracle rule: no synthesis or reconstruction above L0 without an oracle; provenance for generated code | **M** (introduced), extended in N–Q |
| H-08 | Reference corpus with ground truth and matcher precision/recall/calibration metrics | **M** (introduced), extended in N–Q |
| H-09 | Agent prompts, skill section and evaluation harness for hypothesis discipline | **L** |
| H-10 | Authorization record stored in research sessions and reports | **M** |

---

## Release history

Sequencing principle: do not start with Ghidra and do not try to implement every external analyzer at once. First strengthen Reverse's ability to investigate running programs, detect real performance problems and collect evidence, because the main job of Reverse is to help an AI agent find the causes of excessive resource use and objectively verify optimization results. Linux is the first fully supported profiling environment, with interfaces for Windows and macOS designed in from the start.

### Version index

One line per release, oldest first. Details are in the patch records above and the release sections below.

| Version | Patch / content | Record |
|---|---|---|
| 0.1.0 | Compact MVP | 0.1.0 section below |
| 0.1.1 | Patch A defect closure | Patch A |
| 0.2.0-beta.1 … beta.8 | Patches B, C, D and the A–D closure (beta.7 closure, beta.8 Windows closure and evidence) | 0.2.0-beta.x sections below, A–D closure evidence |
| 0.3.0-beta.1 | Patch E static analysis core | Patch E |
| 0.3.0-beta.2 | Patch F providers (milestone 0.3) | Patch F |
| 0.4.0-beta.1 | Patches G and H | Patches G, H |
| 0.4.0 | Patch I (milestone 0.4) | Patch I |
| 0.4.1 | Hardening and documentation alignment of E–I (Audit 8) | Audit 8 |
| 0.5.0-beta.1, 0.5.0-beta.2 | Patch J controlled optimization loop | Patch J |
| 1.0.0-beta.1 | Patch K runtime analyzers | Patch K |
| 1.0.0 | Foundation A–K on a green capability matrix; Patch L core | Patch K, Patch L |
| 1.0.1 | Hygiene: SHA-pinned Actions, harness split, `quality:static`, lite H-09 | Patch L |
| 1.1.0-beta.1 | Patch M initial Windows slice; CI diagnostics maintenance | [Patch M history](#patch-m-history-delivered-increments) |
| 1.1.0-beta.2 | Patch M Windows detector expansion | Patch M history |
| 1.2.0 | Patch M complete (planned) | — |
| 1.3 / 1.4 / 1.5 / 2.0 | Patches N / O / P / Q (planned) | — |

### 0.1.0 — compact MVP

- [x] Standalone TypeScript project, CLI, MCP stdio server
- [x] ELF/PE/Mach-O header recognition
- [x] Source and npm manifest inventory
- [x] Basic process inventory and CPU/RSS sampling
- [x] Repeated wall-clock benchmark and comparison
- [x] Exact output/exit-code validation
- [x] Local JSON evidence/artifacts
- [x] Explicit extension-point registry and capability matrix

### 0.1.1 — defect closure (patch A)

- [x] Everything listed under Patch A above

### 0.2.0-beta.1 — Patch B: Process intelligence and safety

- [x] OS-backed process inventory and inspection with available memory, CPU, I/O, thread and process-tree metrics.
- [x] Persisted time-series sampling, deterministic anomaly detection and process identity checks.
- [x] AbortSignal and MCP request cancellation.
- [x] Explicit operating modes and scoped Linux cgroup v2 resource limits (not a sandbox).
- [x] MCP process tools plus `get_resource_control_status`; backward-compatible existing tools.
- [x] Capability checks and updated safety / capability documentation.

The overall 0.2 milestone remains unreleased until patches C and D are complete. Windows/macOS metric parity and cross-platform CI are outstanding release gates.

### 0.2.0-beta.2 — hotfix from audit 1

- [x] Benchmark median is correct for even sample counts (F-02); captured output is capped in bytes, not characters (F-03).
- [x] `validate_changes` never matches truncated output; a clean mismatch is `completed` with `passed: false`, `partial` means the comparison could not be made in full (F-05).
- [x] MCP: parse errors answer `-32700`, a failing tool returns `isError: true`, unknown tools and missing names are `-32602` (F-06 a–c).
- [x] Source inventory: 2 MiB per-file read cap, exact 5000-file cap, `lstat`, `.wasm` no longer read as text (F-09 caps).
- [x] `noUnusedLocals` and `noImplicitReturns` enabled; unused symbols removed; stale planned-tool table fixed (F-14, F-15).

Everything else in [AUDIT.md](AUDIT.md) stays open and is assigned to patches C, D and E.

### 0.2.0-beta.3 — Patch C, part 1

- [x] Command-running MCP tools refuse unless `REVERSE_MODE=CONTROLLED_EXECUTION` and `REVERSE_COMMAND_ALLOWLIST` are set; optional `REVERSE_CWD_ROOT`; allowlisted child environment; tool annotations (F-01). **Breaking default**, announced here.
- [x] Benchmark statistics (P95, std-dev, MAD, outliers, 95% interval), `warmupRuns`, failed runs excluded; `compare_results` verdict by Mann-Whitney plus bootstrap, `insufficient_evidence` under 5 runs (F-04, R-13 in part).
- [x] Environment fingerprint, comparability warning, MCP tool `get_environment_fingerprint`.
- [x] `noUnusedParameters`, `.gitattributes`, Node 22 and 24 only (F-14, R-16). `improved` in `compare_results` is now `true` only for a statistically supported speedup.

### 0.2.0-beta.4 — Patch C, part 2

- [x] Per-run CPU time and peak RAM of the benchmark child, sampled (Linux `/proc` every 5 ms, macOS/POSIX `ps` every 25 ms); fields are `null` where nothing could be sampled, never zero. Windows uses PowerShell `Get-Process` sampling (higher overhead; manual Windows CI verification remains required).
- [x] Binary size of the command, cold/warm labels (`temperature`, `coldDurationMs`, `warmMedianDurationMs`).
- [x] `compare_results` reports CPU time, peak RAM (own verdicts, 5-run minimum) and binary size per metric; the headline verdict stays wall-clock.
- [x] New module `src/benchmark-resources.ts`; parsers are unit-tested with fixtures on every platform (`tests/benchmark-resources.test.ts`).

### 0.2.0-beta.5 — Patch C, part 3

- [x] `src/core-untrusted.ts`: every MCP tool result gets `untrustedContent` and strings over 4096 characters are truncated (R-02). Tests: `tests/untrusted.test.ts`, capability check *Security — tool results carry untrustedContent…*.
- [x] Threat model (agent as untrusted caller, prompt injection through target data) in `docs/SECURITY.md` (F-17).
- Not done: filename/process-name fixtures beyond the long-string case; per-tool field allowlists.

### 0.2.0-beta.7 — A–D closure

- [x] Evidence promotion checks content (`promotionBlocker`); typed evidence is produced from analyzer results (`src/evidence-collect.ts`, optional `session_id` on 15 measurement tools).
- [x] Profile modes `Diagnostic` (anomaly findings) and `Compare` (two periods) differ from `Monitor`; `OBSERVE` samples only with verified ownership.
- [x] `createResourceLimiter` makes the cgroup writer testable; success and cleanup paths are tested; a real-cgroup check runs where the hierarchy is delegated.
- [x] Line-length gate (140 characters, `src/` and `tests/`), format gate over every TypeScript file, `mcp-server.ts` split into `mcp-tools*.ts`.
- [x] Documentation drift closed (Patch A text, 0.2 checklists, fact categories, duplicated MCP sentence, audit status lines).
- Open and recorded by checks, not claimed: R-03, R-05, F-16, R-19, F-08 (macOS), R-01, R-04 (fast-check), a green Windows run.

### 0.2.0-beta.8 — Windows closure and A–D evidence

- [x] Windows timeouts report `processesTerminated` after the tree kill finished (the run used to be finalized by the 2 s stdio grace timer first; AUDIT F-34).
- [x] Windows tree kill: lean table without command lines, one identity re-check, parallel `taskkill` (AUDIT F-35).
- [x] Windows single-PID inspection through a filtered WMI query, with fallback to the full table (AUDIT F-36, F-08 Windows part).
- [x] Windows time budgets of four capability checks scaled; no assertion weakened (AUDIT F-37).
- [x] A–D closure workflow writes one closure record; closure evidence of the 2026-11-10 run recorded in this file (AUDIT F-38).
- [x] Unit tests no longer assume Linux sample cost: the observation window follows the measured cost of one sample, no assertion weakened (AUDIT F-39).
- [x] A–D closure cells keep the log of the static gates and unit tests, and the record names cells without a report (AUDIT F-40).
- [x] The research-cycle trial uses a delay that dominates Windows start-up noise; no assertion weakened (AUDIT F-41).
- Open and recorded by checks, not claimed: the Windows run of the Capabilities workflow, R-19 (persistent helper), F-08 (macOS), R-03, R-05, F-16, R-01, R-04.

### 0.2 — Deep Process & Performance Intelligence

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

#### Acceptance criteria for 0.2

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

### 0.3 — static analysis and providers

- [x] Parse ELF program/section headers and symbol tables (Patch E)
- [x] PE sections/imports/exports and Mach-O load commands (Patch E)
- [x] Function discovery from symbols/exports and import-edge graph (Patch E); full CFG, duplicated/unused-component proof remain for provider engines (F)
- [x] Dependency lockfile parsers and transitive/lock-only nodes (Patch E); size/resource impact and replacement recommendations remain limitations
- [x] Provider contract tests and executable discovery (Patch F)
- [x] Real, opt-in Ghidra and Rizin adapters with integration tests (Ghidra as the main deep-analysis engine, Rizin as the alternative) (Patch F)

### 0.4 — dynamic analysis, validation and evidence

- [x] Real, opt-in Frida and GDB adapters with integration tests: attach sample with modules, threads and backtraces (Patch G)
- [ ] Residual of the same item: continuous call-frequency profiles, repeated computation, component interaction, behavior under different loads (not delivered; see the debt register)
- [x] Fixture-based regression execution (`run_validation_fixtures`) (Patch I)
- [ ] Residual: test-framework discovery (jest, pytest) and build verification (not delivered)
- [x] Structured behavior fixtures and normalization rules; comparison of behavior before and after a change on predefined inputs (for programs without source) (Patch I)
- [x] Explicit reporting when full equivalence cannot be proven (Patch I)
- [x] Evidence manifest integrity (hash chain) and optional HMAC-SHA256 signing (Patch I)
- [ ] Residual: Merkle root and public-key detached signatures (R-14; not delivered)
- [x] Before/after report generation with uncertainty and limitations (what was found, what changed and why, metrics before and after, residual risks, what to optimize next)

### Later

- [x] Function hotspots via real external profilers (perf and macOS `sample` produce hotspots; eBPF, ETW, Instruments, Valgrind, simpleperf are detect-only providers) (Patch H)
- [x] Disk I/O (`get_process_io`, Linux) (Patch H)
- [ ] Per-process network I/O (not delivered)
- [x] JS/Electron, .NET and WASM analyzers (Patch K)
- [x] Plugin loading and provider lifecycle (Patch F)
- [ ] (on demand, none required today) Extensions added only when a real need appears, each with its own adapter, contracts, requirements and tests: Browser, GPU, Network, Database, Firmware, Container, Cloud, Compiler, Algorithm, Energy
- [x] Optional token-gated HTTP MCP transport (Patch K; not full Streamable HTTP)

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
