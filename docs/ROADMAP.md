# Roadmap

The design behind each item is described in [ARCHITECTURE.md](ARCHITECTURE.md). Rules for assistants are in [AGENTS.md](../AGENTS.md); the reasons behind accepted tasks are in [AUDIT.md](AUDIT.md).

## How to read this file

This file is the single source of truth for **what is done, what is not done and what to do next**. Read it in this order:

1. [Status at a glance](#status-at-a-glance): the current version, the active patch and the next concrete step.
2. [Delivery plan](#delivery-plan-foundation-al-and-product-patches-mq): the one ordered table of all patches A–Q, how progress is measured and what "done" means.
3. [Active work: product patches M–Q](#active-work-product-patches-mq): the scope and delivery rules, the working checklist and work order of Patch M (**start work here**) and the detailed plans for [N, O, P and Q](#detailed-plans-for-patches-n-o-p-and-q), which are written in advance and not started.
4. [Carry-over debt register](#carry-over-debt-register): approved tasks that are still open although their patch is closed or that have no recorded closure, and the [debt closure schedule](#debt-closure-schedule) that fixes when each one must be closed (none may remain open past Q).
5. Reference material, in this order: [completed foundation A–L](#completed-foundation-patches-al) (historical records, do not re-open), [approved audit backlog](#approved-audit-backlog-audit-1-approved-2026-11-09) (every finding and recommendation with its status), [coverage table](#coverage-of-the-roadmap), [release history](#release-history) and the original [core readiness criteria](#core-development-order-and-completion-criteria).

**Status vocabulary** used everywhere in this file: **done** (code, automated check and documentation are in place, and the capability gate was run), **in progress** (some items delivered, acceptance criteria still open), **not started**, **open** (an approved task without delivery), **partial** (delivered in part; the remainder is named), **pending verification** (delivered and tested locally, but a run that only GitHub Actions can provide is not recorded). Checkboxes: `[x]` delivered and proven, `[ ]` not delivered. Nothing is marked done without code and a passing check (AGENTS.md section 5).

**When you finish work, update in the same change:** the [status dashboard](#status-at-a-glance), the checklist of the patch, the [version index](#version-index), the affected backlog rows here and in AUDIT.md, the [debt register](#carry-over-debt-register), `ARCHITECTURE.md` (*planned* to *implemented*), `CAPABILITIES.md` and `MCP.md`.

## Status at a glance

State as of **1.5.2** (Patch O closed — Classic Mac / early macOS; post-close maintenance green; 2026-11-12).

**Verification.** Capability matrix **green** on **1.4.2** (operator-confirmed). Patch O remains closed at **1.4.0**; 1.4.1–1.4.2 are post-close hygiene only.

| Question | Answer |
|---|---|
| What is the product version? | **1.5.2** (Patch P steps 0–1 — legacy Android Target Profile) |
| What is finished? | The 1.0 foundation (**patches A–L**), **Patch M** (Windows, **1.2.0**), **Patch N** (old Linux, **1.3.5**), and **Patch O** (Classic Mac / early macOS, **1.4.0**). |
| What is being built? | **Patch P** in progress through **1.5.2**: sourced Android diagnosis tables. |
| What has not started? | **Patch Q** (newer generations and unified compatibility intelligence). Patch P is the next product unit. |
| When must the accumulated debts be closed? | Each debt is a checkbox inside the plan of its patch (section 8 *Debts due in this patch* of M, N, O, P, Q); the [debt closure schedule](#debt-closure-schedule) is only an index. Step 0 of M closes F-75; nothing may stay open past the exit of Q (release 2.0.0). |
| What is the next concrete step? | Patch P step 4 — execution environments (emulator/adb detect-only) and works/fails scaffolding. |
| What is open but not blocking? | R-10 residual (`goblin` and later providers), R-11 residual (Mach-O and unified report), F-83 (Linux Node 22 timeout; not reproduced in three consecutive green matrices), F-86 (dev-only moderate advisories), and the low Stryker score on two modules (recorded baseline, floor held). M/N G/H residual scope is itemized below and in `CAPABILITIES.md`. See the [carry-over debt register](#carry-over-debt-register). |
| What is unverified? | Residual M/N limitations (explicit): no bundled Windows/Linux oracle (preservation stays L0); execution lifecycle lacks snapshot/restore/trace; behavior capture does not cover registry/network/UI/audio/time/randomness or code coverage; no function-level equivalence lab; migration options are limited; similarity BSim is unconfigured; calibration uses small crafted corpora; containers share the host kernel; the verneed summary is a string-residue scan, not a full `SHT_GNU_verneed` walk; `goblin` is not wired; libc/compiler generation heuristics are not calibrated beyond the crafted fixtures. The 1.3.7 manual matrix (Capabilities run 43079862360) stopped at the formatting gate on all six OS/Node cells, before build or capability tests; no cross-platform result is inferred from that run. Capabilities run 43084133732 exposed malformed PowerShell source on Windows (fixed in 1.3.9) and a Windows capability file that finished all 108 checks but did not exit (F-84, fixed in 1.3.10). The full matrix is green on commit `78a47fd` (Capabilities 43172993614, Structure 43173076031, Mutation 43173019792, Golden 43173044415, Supply chain 43173096703). An earlier green matrix on `f85200e` is superseded by this final verification run. The earlier N closure matrix remains recorded for commit `b5ea3fa` (Capabilities 43059743774, Structure 43059819947, Supply chain 43059851184). Windows/macOS hard sandbox isolation remains a recorded limitation from M. |

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
| M | Windows compatibility, DOS through Windows 7-era (up to 2010) | 1.2 | A–L foundation; steps 0–8; reference trials | **done** (1.2.0) |
| N | Old Linux software | 1.3 | M shared contracts and evidence model | **done** (1.3.5) |
| O | Classic Mac and early macOS software | 1.4 | N shared contracts and environment/replay foundations | **done** (1.4.0) |
| P | Legacy Android software | 1.5 | O shared contracts; Android foundations already present in E/J | **in progress** (1.5.0 steps 0–1) |
| Q | Newer generations and unified compatibility intelligence | 2.0 | M–P complete | not started |

B and C can proceed in parallel after A; E can start at the same time. G and H can proceed in parallel once F is done (historical note; A–L are complete).

**Superseded classification.** Earlier drafts of this table listed N *Execution environments*, O *Behavior capture and replay* and P *Function equivalence lab and migration advisor* as separate patches, and M as "Compatibility diagnosis and legacy formats", "1.1–1.5 (waves; initial Windows slice in 1.1.0-beta.1)", depending on E, F, G and J (N depended on G and M, O on I and N, P on O and J). Audit 18 (F-71) replaced that with the platform sequence above. The three capability areas were not dropped: they are acceptance dimensions 3 to 5 of **every** product patch M–Q (see [Scope and acceptance for every product patch](#scope-and-acceptance-for-every-product-patch)).

## Active work: product patches M–Q

Patches A–L are the completed 1.0 foundation and remain historical release records. All remaining product work is delivered as **five sequential product patches: M, N, O, P and Q**. These letters are the only active planning units. Detailed plans for N, O, P and Q follow the Patch M checklist below. Do not create parallel tracks, platform-wave sub-patches, M1-style release plans, or separate cross-cutting patch families. A patch may have internal implementation tasks, but it is released and accepted as one product outcome.

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
- The initial Windows slice in 1.1.0-beta.1 and detector increment in 1.1.8 are historical progress within M, not separate future roadmap units. Patch M is closed at 1.2.0; residual G/H scope that spans platforms continues in O–Q.

**Version policy:** M 1.2, N 1.3, O 1.4, P 1.5, Q 2.0. Do not assign versions to internal tasks or invent intermediate patch labels. Patch L remains part of the completed 1.0 foundation, not a parallel future track.

### Patch M working checklist

Patch M is **done** (release **1.2.0**). The items below are *internal tasks*, grouped by the seven acceptance dimensions above; they are not patches and must not be given patch labels or versions. A box is ticked only where code and a passing check exist at 1.1.8. Backlog IDs refer to the [approved audit backlog](#approved-audit-backlog-audit-1-approved-2026-11-09).

**1. Target Profile and static inventory**
- [x] DOS MZ, Windows NE, LE, LX and PE header recognition (1.1.0-beta.1).
- [x] Machine, PE bitness and subsystem extraction from the bounded header window.
- [x] Bounded scan (8 MiB) for selected Borland/Delphi, VB6, MFC, Visual C++, DirectX and Glide markers.
- [x] Bounded PE import table: imported libraries and named functions (1.1.8).
- [x] Static framework signatures: Delphi form/RTTI-style, VB6 metadata, MFC class/message-map (1.1.8). Indicators with explicit confidence, **not calibrated**.
- [x] Delay imports detected (IMAGE_DIRECTORY_ENTRY_DELAY_IMPORT); bound imports and out-of-window tables remain a known limitation.
- [x] PE hardening flags: ASLR, DEP, CFG, SEH from DllCharacteristics (R-11 PE part); ELF flags go to N.
- [x] Opt-in detect-only providers `diec`, `yara-x`, `capa` registered (R-10 subset); unavailable when absent, never simulated.
- [x] Hostile-input property tests for PE/NE/LE parsers (R-04): random/malformed buffers must not throw (deterministic suite; fast-check optional later).
- [x] Shared Target Profile schema and one reusable authorization and provenance gate (work order step 1).
- [x] Packer/protector heuristics (UPX/Themida/VMProtect/ASPack/PECompact stubs + high-entropy sections). Opt-in diec/yara-x/capa still open (R-10).
- [ ] Installer/packager and dependency identification.
- [x] Full Target Profile object: OS and era, CPU, bitness, ABI, toolchain/runtime/framework, installer, dependencies; every field with source evidence, confidence and coverage (ARCHITECTURE.md *Target Profile*). Installer remains null until detectors land; calibration pending H-08.
- [ ] Remaining Windows detector matrix (F-63 stays open until done; G-02).
- [x] Reference corpus with ground truth and precision/recall/calibration metrics for the detectors (H-08); corpus holds hashes and signatures only, with source and license per entry (H-06). Crafted fixture harness shipped; operator corpus via hash manifest.
- [ ] Further similarity adapters (H-03) and the rule "deterministic detectors first; analogy tag only with confidence and deterministic basis" (H-04).
- [x] Target-platform and era support matrix in `CAPABILITIES.md` with capability checks against format detectors (G-09).

**2. Compatibility diagnosis**
- [x] Compatibility diagnosis from sourced tables (VB6/MFC/DirectX/Glide/Win16/LE/LX/DEP-ASLR) citing table entry ids (G-01, F-69); execution confirmation still open.
- [ ] Sourced, versioned OS/API/runtime availability tables (data, not code; no OS-version availability is inferred today).
- [ ] Concrete findings with evidence per cause: removed or changed APIs, missing libraries, permissions, filesystem/registry, locale, graphics/audio/driver, timing tied to CPU speed, DPI and resolution, address-space and date limits, hardware assumptions (G-01).
- [ ] Causes that only a run can confirm are marked as needing an execution environment; hypotheses stay separate from facts.

**3. Execution and observation**
- [ ] Execution-environment provider contract (detect, prepare, snapshot, restore, run with limits, trace, shut down) and real, detected adapters for Wine, DOSBox-class emulators and QEMU/VMs; user-supplied licensed images only, hashes recorded in the environment fingerprint (G-03).
- [x] Sandbox for executed targets under `CONTROLLED_EXECUTION` (R-20): scratch directory, timeout, process-group termination; Linux bwrap/unshare when present; honest limitations on other hosts (step 5).
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
- [x] Pin the two remaining tag references in `supply-chain.yml` (F-75, work order step 0).
- [ ] Extend the authorization and provenance gate to **every** new analysis, execution, capture, replay and migration operation (H-05, F-64 remainder, G-07 enforcement).
- [ ] Stable CLI/MCP contracts for all new tools, `docs/MCP.md` matching `tools/list` exactly, capability checks, security review, examples, updated README/ARCHITECTURE/CAPABILITIES.

**7. Reference trials**
- [ ] Scenario 1: diagnose and restore a lawful reference program that fails in the current environment.
- [ ] Scenario 2: compare a changed, repackaged or reimplemented version against the original.
- Where no lawful fixture, platform oracle or licensed environment exists, record that as an explicit release limitation instead of claiming success.

**8. Debts due in this patch** (one box per debt; a debt whose box already sits in sections 1–7 is only named here, so no task has two boxes)
- [x] F-66 and F-67: confirmed on green runs 43024000265 / 43024033261 / 43024423915 and reconfirmed on 1.3.10 matrix 43172993614 (one final artifact per workflow with AI-DEBUG-SUMMARY + detailed logs).
- [ ] R-02: every new source of untrusted text introduced in M (executable strings, resources, installer metadata) passes through the existing untrusted-content wrapper, with an adversarial fixture (step 3).
- [ ] R-15: golden results and a manual CI job for the M reference trials (step 8).
- [x] Record a green manual `os: all` run (Linux, macOS, Windows; Node 22 and 24) with its run ID; one run covers the unrecorded E–M release gates (step 8). Closed by Capabilities 43172993614 on `78a47fd` (and prior E–M closure runs).
- Tracked by boxes in the sections above: F-75 / R-03 in section 6 (step 0); R-20 in section 3 (step 5); R-11 PE part, R-10 `diec`/`yara-x`/`capa` and R-04 for the PE/NE/LE parsers in section 1 (step 3); F-63, F-64, G-01…G-10, H-03…H-08 and H-10 in sections 1–7.

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

**M is done when** every item above (including section 8, the debts) is ticked or recorded as an explicit limitation, the seven acceptance dimensions pass, the capability matrix has no ❌/⚠️ and no 🚧 for an in-scope M capability, the manual `os: all` run is green, backlog rows G-01…G-10, F-63, F-64, H-03…H-08, H-10 assigned to M are closed, and the release is **1.2.0** with its release record below.

### Detailed plans for patches N, O, P and Q

Patch M has the full working checklist and work order above. Patches N, O, P and Q have the same level of detail below. They are written **now** so that any assistant can see what must be built, in which order and with which exit criteria, but they are **not started**: nothing in them may be begun before the previous patch passes its acceptance criteria (see Delivery rules). Where this section names a file format, tool or platform fact, it defines the **scope to cover**, not a claim that the capability exists; the capability matrix in `CAPABILITIES.md` stays the only statement of what works.

#### Rules shared by N, O, P and Q

**Entry criteria.** A patch may start only when (1) the previous patch is released and its release record, version index row and backlog closures are in this file; (2) the manual `os: all` Capabilities run of the previous release is green and recorded; (3) the debts listed in section 8 of that patch's plan are known (those marked *step 0* are closed before any feature), and (4) the shared contracts from M (Target Profile envelope, authorization and provenance gate, sourced-data table format, calibration harness, sandbox, `ExecutionEnvironment` provider contract, capture/replay scenario format, preservation levels) are reused, not copied. If a shared contract turns out to be wrong, fix the contract first and record a finding.

**Common work order.** Every patch runs the same nine internal steps, in this order, each ending in a tested, documented prerelease of its own version line (for example 1.3.0-beta.x for N); steps are internal tasks, never patch labels:

| Step | Work |
|---|---|
| 0 | Debts and hygiene due in this patch (section 8 of the patch plan); no product feature in the same commit |
| 1 | Extend the shared contracts only where the new family needs a new field, never a parallel schema; add the family's Target Profile fields |
| 2 | Ground-truth corpus and calibration for the new detectors, before the detectors are added |
| 3 | Static inventory: formats, ABI/runtime/toolchain/installer detection, hardening flags, dependencies, the family's rows in the support matrix |
| 4 | Sourced, versioned compatibility tables and concrete diagnosis findings for the family |
| 5 | Execution environments for the family (providers detected, user-supplied images hashed, sandbox applied, works/fails matrix from real runs) |
| 6 | Behavior capture and replay for the family |
| 7 | Preservation reporting (L0–L3), equivalence lab and migration advisor for the family |
| 8 | Two reference trials, documentation, security review, manual `os: all` run, release record, closure of the backlog rows |

**Rules that hold in every step.** Every new operation passes the shared authorization and provenance gate in the same change that adds it. Every detector, table and adapter ships with a check that can fail and with its stated limitation. External engines, operating-system images, ROMs, installers and proprietary tools are user supplied and never bundled. Absent engines report `unsupported`; results are never simulated. Own source stays inside the 20,000–30,000 line budget; engine-specific logic belongs in thin provider adapters, and a patch that would exceed the budget must propose a split of the work to the maintainer instead of growing the core.

**Definition of done for each patch (the "N/O/P/Q is done when" line below refers to this list):** every checklist item of the patch, **including section 8, its debts**, is ticked or recorded as an explicit limitation in `CAPABILITIES.md`; the seven acceptance dimensions pass; the capability matrix has no ❌ or ⚠️ and no 🚧 for an in-scope capability of the patch; the manual `os: all` run (Linux, macOS, Windows; Node 22 and 24) is green and its run ID is recorded; a debt may be left open only by a signed-off maintainer decision recorded here and in an AUDIT entry; README, `ARCHITECTURE.md`, `CAPABILITIES.md`, `MCP.md`, `SECURITY.md` and this roadmap are updated; an AUDIT entry records what was verified and what was not; the release record and the version index row are added.

### Patch N working plan — Old Linux software (target release 1.3, **done**, closed at 1.3.5)

**Closure (2026-11-11).** Patch N is closed at **1.3.5** with the release record below. Work-order steps 1–8 were delivered in the 1.3.0–1.3.5 line. Items of this plan that stayed unticked are recorded as explicit limitations or carry-over debts in the [register](#carry-over-debt-register) and in `CAPABILITIES.md`; none of them is a ❌ or ⚠️ in the capability matrix.

**Outcome.** Reverse can take an old Linux program (roughly 1993 through 2010: kernel 1.x to 2.6.3x era, libc5 and glibc 2.x, XFree86 and early X.Org desktops) that fails on a current system and (a) identify exactly what it is, (b) name the concrete causes of the failure with sources, (c) run it in a suitable old-userland environment under a sandbox, (d) capture and replay deterministic scenarios, (e) validate a repaired, repackaged or rebuilt version against the original, and (f) rank migration options. The same seven acceptance dimensions apply as for M.

**Entry criteria.** Patch M released as 1.2.0 (see the shared rules above).

**Target families and era boundaries.**

| Area | In scope |
|---|---|
| Executable formats | a.out (OMAGIC, NMAGIC, ZMAGIC, QMAGIC) executables and a.out shared libraries (jump-table `.sa`/`.so.N.M` style); ELF32 for x86 (i386 to i686) as the main case; ELF64 x86-64 from its first releases; ELF for other architectures of the era (PowerPC, ARM, m68k, SPARC, Alpha, MIPS) at detection level, with execution where an emulator and user-supplied rootfs exist |
| C library and ABI | Linux libc5, glibc 2.0 through 2.x generations, uClibc and early musl at detection level; symbol versioning (`.gnu.version_r`, `GLIBC_x.y`), `DT_NEEDED` sonames, RPATH/RUNPATH, prelink data, executable-stack requirement, TEXTREL |
| C++ and compiler ABI | libstdc++ generations (`libstdc++-libc6.x-y.so.2.x`, `.so.3`, `.so.5`, `.so.6`), GCC 2.95 → 3.x → 4.x ABI breaks, `GLIBCXX`/`CXXABI` version tags, `egcs`-era binaries |
| Kernel and threading | Syscall ABI generations; LinuxThreads versus NPTL; vsyscall versus vDSO; 32-bit binaries on a 64-bit kernel (`ia32`, `personality`); removed or changed `/proc`, `/dev`, `sysctl` and devfs paths |
| Desktop, audio, video, input | X11 and XFree86-specific extensions; Motif/LessTif; GTK 1.x and 2.x; Qt 1 to 3; SDL 1.2; OSS (`/dev/dsp`, `/dev/mixer`), ESD, aRts, ALSA; svgalib and the framebuffer console; GLX/Mesa and 3dfx Glide |
| Packaging and installers | `.tar.gz`/`.tgz`, `.rpm`, `.deb`, Slackware packages, Loki-style `.run` and makeself self-extractors, `.bin` installers, RPM/DEB metadata and scriptlets read statically (never executed) |

**Work order inside N.**

| Step | Work | Closes | Exit criteria |
|---|---|---|---|
| 0 | Debts due: R-05 (linter, `knip`, `jscpd`, line-size gate kept), R-07 (MCP docs generated from one tool definition), R-19 Windows part (persistent PowerShell helper for process inspection/tree and benchmark samples), R-01 (mutation testing with Stryker on the pure modules: normalization, scoring, parser helpers) | R-01, R-05, R-07, R-19 (Windows), F-33 remainder | Each tool installed and gated in CI or recorded as a limitation; docs/MCP.md is generated or contract-tested from the same definitions |
| 1 | Linux fields in the shared Target Profile (libc generation, ABI/GCC generation, thread model, kernel interface expectations, desktop/audio stack, installer type) | Section 1 | The M Target Profile envelope carries them without a second schema |
| 2 | Linux ground-truth corpus and calibration: crafted a.out/ELF fixtures plus open-source or consented samples, manifest of hashes for operator corpora | H-08 for N | Precision and recall reported per new detector; a regression fails a check |
| 3 | Static inventory: a.out and ELF parsers (header, program/section headers, dynamic section, symbol versions, needed libraries, interpreter, RPATH/RUNPATH, notes), libc/libstdc++/GCC generation detection, ELF hardening flags (PIE, NX, RELRO, stack canary, FORTIFY), installer and package metadata readers, opt-in providers `readelf`, `objdump` and `lief`/`goblin`, hostile-input property tests for every new parser, Linux rows of the support matrix | G-02 (Linux), G-09 (Linux), R-11 (ELF part), R-10 (`lief`/`goblin`, `objdump`/`readelf`), R-04 (a.out/ELF/archive parsers) | Every field has evidence; absent providers are unavailable, never simulated; fuzz tests exist for each parser |
| 4 | Sourced compatibility tables (libc symbol-version availability, libstdc++ generations, removed devices and `/proc` entries, OSS/ESD/aRts/ALSA availability by era, X11 extensions, GTK/Qt generations) and diagnosis: missing sonames, `version GLIBC_x.y not found`, wrong ELF class, a.out loader support removed, `ld.so` path, executable-stack and TEXTREL denials, missing `/dev/dsp`, threading and `mmap` assumptions | G-01 (Linux) | Each finding cites a table entry and a target fact; causes that need a run are marked as such |
| 5 | Environments: user-supplied old root filesystems (chroot, namespaces from the R-20 sandbox), QEMU user-mode for foreign architectures, QEMU system mode with an old kernel and rootfs for kernel-ABI faults, compat-library injection (`LD_LIBRARY_PATH`, `LD_PRELOAD`), OSS emulation shims (`padsp`/`aoss`-class), `Xvfb`/`Xephyr`; each environment fingerprinted (rootfs hash, kernel, libc, shims) | G-03 (Linux) | Real runs produce a works/fails matrix; the limitation "containers share the host kernel, so kernel-ABI faults need a VM" is recorded and enforced by the provider choice |
| 6 | Capture/replay: `strace`/`ltrace` ingestion (user-supplied tools, detected), clock control (`libfaketime`-class), seeded randomness, controlled `/dev` and `/proc` views, filesystem overlay diffs, X11 event injection and screenshot normalization, captured audio writes, recorded network via namespaces | G-04 (Linux) | A scenario replays with identical normalized results or reports the uncontrolled nondeterminism |
| 7 | Preservation: original binary in the original-era environment as the oracle; for open-source targets, period-compiler versus modern-compiler rebuild comparison; L0–L3 report; migration advisor (compat libraries, packaged chroot/VM, static relink, source port such as OSS → ALSA/SDL2 or GTK 1 → GTK 2/3, rebuild) | G-05, G-06, G-10 (Linux) | Without an oracle the level stays L0; options cite evidence |
| 8 | Two reference trials (a lawful old Linux program that fails today and is diagnosed and restored; a changed or repackaged version compared with the original), documentation, security review, `os: all` run, release 1.3.0 | Section 7 | Definition of done holds |

**Detailed checklist.**

*1. Target Profile and static inventory*
- [ ] a.out magic and format detection (OMAGIC, NMAGIC, ZMAGIC, QMAGIC), a.out shared-library jump tables.
- [ ] ELF class, endianness, machine, OSABI, type, interpreter, program and section headers, dynamic section, notes.
- [ ] `DT_NEEDED`, RPATH/RUNPATH, symbol-version requirements and definitions, GNU hash versus SysV hash.
- [ ] libc5/glibc/uClibc/musl generation detection with confidence and coverage.
- [ ] libstdc++ and GCC generation detection from needed libraries, symbol versions and `.comment`.
- [ ] Threading model (LinuxThreads versus NPTL) and kernel-interface expectations from imports and notes.
- [ ] Executable-stack, TEXTREL, prelink and vDSO/vsyscall dependence indicators.
- [ ] ELF hardening flags (R-11, ELF part).
- [ ] Desktop, audio and video stack detection from needed libraries and strings (X11, Motif, GTK, Qt, SDL, OSS, ESD, aRts, ALSA, svgalib, Glide, Mesa).
- [ ] Package and installer readers: `.rpm`, `.deb`, tar variants, Slackware, Loki-style `.run`, makeself headers; metadata and scriptlets read without execution.
- [ ] Opt-in providers `readelf`, `objdump`, `lief`/`goblin` (R-10).
- [ ] Linux rows in the support matrix and its capability check (G-09).

*2. Compatibility diagnosis*
- [ ] Sourced, versioned tables for libc, libstdc++, kernel interfaces, devices, X11 extensions, audio and toolkit generations.
- [ ] Findings for each cause with evidence: missing or renamed sonames, symbol versions not found, wrong ELF class or architecture, removed a.out support, interpreter path, executable-stack and TEXTREL denial, removed `/dev` and `/proc` entries, threading and memory-layout assumptions, X11 and toolkit absence, audio device absence, locale and time assumptions.
- [ ] Causes confirmable only by execution are marked as needing an environment; hypotheses stay separate.

*3. Execution and observation*
- [ ] Providers: old-rootfs chroot/namespace runner, QEMU user-mode, QEMU system-mode, compat-library injection, audio shims, `Xvfb`/`Xephyr`; all detected, none simulated.
- [ ] Rootfs and kernel images are user supplied and hashed into the environment fingerprint.
- [ ] Sandbox (from M) applied to every run; resource limits and tree-wide termination.
- [ ] First-failure diagnostics and a works/fails matrix across the environments.

*4. Behavior capture and replay*
- [ ] Syscall and library-call trace ingestion; clock, randomness and device control; filesystem diffs; X11 input injection and screenshot normalization; audio capture; network capture in a namespace.
- [ ] Replay limitations (uncontrollable nondeterminism, hardware dependence) stated in every result.

*5. Preservation and migration*
- [ ] Oracle runs of the original in the original-era environment; differential comparison of normalized observations.
- [ ] Rebuild-versus-original comparison for open-source targets; L0–L3 report with coverage and residual risk.
- [ ] Migration advisor with ranked options and evidence.

*6. Product integration*
- [ ] Stable CLI/MCP tools for every new capability; `docs/MCP.md` matches `tools/list`; authorization gate on each; examples; README, `ARCHITECTURE.md`, `CAPABILITIES.md`, `SECURITY.md` updated.

*7. Reference trials*
- [ ] Scenario 1 and scenario 2 on lawful fixtures; explicit limitation where no oracle or licensed environment exists.

*8. Debts due in this patch* (one box per debt; a debt whose box already sits in sections 1–7 is only named here)
- [x] R-05 / F-33 remainder: dependency-free `quality:static`, format and size gates (1.3.6); Biome linter (`npm run lint`, `src` and `tests/*.ts`, warnings are errors), `jscpd` (`npm run dup:check`, 0.83 % baseline, threshold 1.5 %) and `knip` (`npm run unused:check`, run after the build because the tests import `dist`) are CI-gated (1.3.10).
- [x] R-07: `docs/MCP.md` tool table generated from the built MCP tool registry used by `tools/list`; `docs:mcp:check` fails on drift (1.3.6).
- [x] R-01: Stryker mutation testing on the pure modules (`benchmark-stats`, `process-parse`, `legacy-linux-symver`, `legacy-linux-packages`) with a recorded baseline score: Stryker baseline (Linux, Node 22, command runner, 679 mutants in `benchmark-stats`, `process-parse`, `legacy-linux-symver` and `legacy-linux-packages`): **47.72 %** (316 killed, 8 timed out, 355 survived); per module 67.95 / 22.27 / 65.09 / 31.07 %. Floor `thresholds.break` = 45; manual workflow `Mutation testing` (1.3.10).
- [x] R-19 Windows part: persistent helper for process inventory, single-PID inspection, process-tree snapshots and benchmark samples (1.3.6); protocol fixed in 1.3.9 and idle-helper exit fixed in 1.3.10; Windows verified by the full matrix on commit `f85200e`.
- [x] R-04: hostile-input property tests (`fast-check`, fixed seed) for the a.out, ELF and archive parsers and for `summarizeVerneed`: `tests/legacy-linux-property.test.ts` (1.3.10).
- [x] R-02 (N/Linux): `analyzeLegacyLinux` wraps its result at the library boundary; hostile ELF PT_INTERP fixture verifies untrusted marker and string truncation (1.3.6).
- [x] R-15 (N/Linux): checked-in golden expectations for both reference trials and manual `Patch N Linux golden trials` workflow (1.3.6).
- [x] Record a green manual `os: all` run with its run ID (step 8). Closed by Capabilities 43172993614 on `78a47fd` (and N closure 43059743774).
- Tracked by boxes in the sections above: R-11 ELF part and R-10 (`readelf`, `objdump`, `lief`/`goblin`) in section 1; the N share of G-01…G-10, H-03…H-08 and H-10 in sections 1–7.

**N implementation summary (not a blanket closure of all assigned debts).** The N/Linux portions of R-02 and R-15 were closed in 1.3.6; R-07 was closed in 1.3.6. Linux a.out/ELF analysis, selected sourced diagnosis, detect-only `readelf`/`objdump`/`lief` providers, basic execution adapters, behavior round-trip and L0 preservation reporting exist with the limitations in `CAPABILITIES.md`. R-01, R-04 (`fast-check`), R-05 and Windows R-19 were closed in 1.3.10; R-10 (`goblin`) and R-11 residual ELF hardening are not closed. G/H items are partial by capability, not all closed by the N release.

**Out of scope and known limits.** Kernel-mode code, drivers and kernel modules; hardware-specific software without an emulator; copy-protected or encrypted commercial software without rights-holder consent; reconstructing proprietary libraries. Containers cannot reproduce old kernel behavior, so those faults are diagnosed in a VM or reported as unconfirmed.

**N is done when** section 8 (the debts) and the definition of done for N, O, P and Q holds for the Linux family and the release has its release record. **Recorded:** closed at **1.3.5** (the release line 1.3.x; see [1.3.5 — Patch N closed](#135--patch-n-closed-old-linux-compatibility)). The original 1.3.5 close left R-01, R-05, R-07, R-19 (Windows), and `fast-check` for R-04 open. Post-closure maintenance 1.3.6 closes R-07 and the N/Linux portions of R-02 and R-15; R-19 Windows is implemented but pending Windows CI verification. R-01, R-05 and `fast-check` remain open.

### Patch O working plan — Classic Mac and early macOS software (target release 1.4, **done**, closed at 1.4.0)

**Outcome.** Reverse can take a classic Mac OS or early Mac OS X program (roughly System 1 in 1984 through Mac OS X 10.6 in 2009–2010) and (a) identify its code model, resources and bundle layout, (b) name the concrete causes it fails on a current Mac, (c) run it in a suitable emulator or virtual machine under a sandbox, (d) capture and replay deterministic scenarios, (e) validate a repaired, repackaged or rebuilt version against the original, and (f) rank migration options.

**Entry criteria.** Patch N released as 1.3.5 (closed; see the shared rules above).

**Target families and era boundaries.**

| Area | In scope |
|---|---|
| Code models | 68k applications (`CODE` resources, jump table, segment loader, A-line Toolbox traps), PEF/CFM applications and shared libraries (`cfrg` resource, fragments, import/export tables), Mach-O for PowerPC and early Intel, fat/universal binaries (PowerPC, i386, early x86-64), Carbon in both CFM and Mach-O form, early Cocoa/Objective-C |
| Resources and files | Resource forks and the Resource Manager (`CODE`, `PICT`, `snd `, `vers`, `BNDL`, `FREF`, `ICN#`, `STR `, `DLOG` and similar), creator and type codes, AppleDouble, MacBinary, BinHex, StuffIt and Compact Pro archives, HFS and HFS+ volumes, disk images (`.img`, `.dsk`, `.dmg`, `.sit`) |
| OS generations | System 1 to 7.x, Mac OS 8 to 9.2, the Classic environment, Mac OS X 10.0 to 10.6, Rosetta (PowerPC on Intel), 32-bit Intel |
| Bundle and packaging | `.app` bundles (`Contents/Info.plist`, `MacOS`, `Resources`), classic application files, installers (`.pkg`, Installer VISE, Stuffit installers), frameworks and plug-ins (CFM and Mach-O) |
| Behavior assumptions | Big-endian data, handle-based Memory Manager and 24/32-bit-clean addressing, colon-separated paths and 31-character names, cooperative multitasking, QuickDraw/QuickTime/Sound Manager, AltiVec, display and timing assumptions |

**Work order inside O.**

| Step | Work | Closes | Exit criteria |
|---|---|---|---|
| 0 | Debts due: F-08 macOS part (single-PID fast path) and R-19 macOS part (`libproc`-based sampling) | F-08, R-19 (macOS) | macOS inspection and sampling no longer read the full process table; checks prove it |
| 1 | Classic and early-macOS fields in the shared Target Profile (code model, endianness, OS era, resource inventory, creator/type, bundle layout, Rosetta/32-bit dependence) | Section 1 | **Done in 1.3.13** (no second schema; bundle layout still null until step 3) |
| 2 | Ground-truth corpus and calibration: crafted 68k, PEF and Mach-O fixtures, resource-fork fixtures, open-source or consented samples | H-08 for O | **Done in 1.3.14** (crafted fixtures + precision/recall; operator hash manifests supported) |
| 3 | Static inventory: 68k `CODE`/segment parser, PEF container and `cfrg` parser, Mach-O and fat parser (load commands, dylibs, minimum OS version, code signature presence), resource-fork parser (via AppleDouble, MacBinary, extended attributes, native fork where the host exposes it), BinHex/StuffIt/Compact Pro container recognition, HFS/HFS+ image reading, bundle and `Info.plist` readers, Toolbox trap and Carbon/Cocoa API usage inventory, support-matrix rows, hostile-input property tests | G-02 (Mac), G-09 (Mac), R-04 (Mac parsers), R-11 (Mach-O flags) | **Mostly closed through 1.3.22:** PEF section count + loader string scan, CODE resource id scan, HFS MDB + catalog first extent + volume name. Open residual: full segment loader, PEF fragment graph, HFS catalog B-tree walk; Toolbox trap **scan delivered in 1.3.23** (inventory depth still limited) |
| 4 | Sourced compatibility tables (Toolbox and Carbon availability by OS version, QuickDraw/QuickTime/Classic/Rosetta/32-bit removal points, Cocoa API deprecations, resource and filesystem behavior) and diagnosis: CFM versus Mach-O, PowerPC on Intel, 32-bit-only, removed Classic, resource-fork loss during copy, creator/type reliance, endianness, handle and addressing assumptions, path-separator and name-length issues, code signing and notarization effects | G-01 (Mac) | **Done in 1.3.16** (documentary tables; each finding cites table id + source) |
| 5 | Environments: 68k emulators (Basilisk II, Mini vMac class), PowerPC Mac OS emulation (SheepShaver, QEMU `mac99` class), early Mac OS X images under QEMU where legally runnable; user-supplied ROMs, system software and installers hashed in the fingerprint; the host-licensing limitation for Apple operating systems is recorded for the operator | G-03 (Mac) | **Detect-only closed in 1.3.17** (BasiliskII/Mini vMac/SheepShaver/qemu-ppc). Real works/fails matrix needs operator ROM/image (recorded limitation) |
| 6 | Capture/replay: emulator-level input injection, screenshot normalization, disk-image snapshots and diffs (the way to observe file and resource-fork changes), emulator clock control, Toolbox-trap tracing where the emulator exposes hooks (otherwise a recorded limitation) | G-04 (Mac) | **Partial in 1.3.21:** shared capture/replay round-trip + ROM hash helper + emulator fingerprints as limitations. Open: input injection, screenshot norm, disk-image snapshots, trap tracing |
| 7 | Preservation: original in the original-era emulator as the oracle; differential comparison of disk-image and screen observations; for open-source targets, rebuild comparison with a user-supplied period toolchain; L0–L3 report; migration advisor (keep in an emulator, convert data formats and resource forks, port Carbon to Cocoa, recompile, repackage as a bundle) | G-05, G-06, G-10 (Mac) | Without an oracle the level stays L0 |
| 8 | Two reference trials, documentation, security review, `os: all` run, release 1.4.0 | Section 7 | Definition of done holds |

**Detailed checklist.**

*1. Target Profile and static inventory*
- [ ] 68k: `CODE 0` jump table, segment resources, trap usage.
- [ ] PEF: container header, sections, loader section, `cfrg` fragment descriptions, imported and exported symbols.
- [ ] Mach-O and fat: architectures, load commands, dylibs, minimum OS version, code signature presence, Objective-C runtime markers.
- [ ] Resource forks from every source the host can provide; resource type inventory with sizes and hashes.
- [ ] Container recognition: MacBinary, BinHex, AppleDouble, StuffIt, Compact Pro, disk images; HFS/HFS+ directory reading.
- [ ] Bundle layout and `Info.plist` keys (minimum OS, executable, architectures, document types).
- [ ] Toolbox, Carbon and Cocoa API usage inventory.
- [ ] Rosetta and 32-bit dependence indicators.
- [ ] Mach-O hardening flags (R-11, Mach-O part).
- [ ] Mac rows in the support matrix and its capability check (G-09).

*2. Compatibility diagnosis*
- [ ] Sourced tables for OS-version API availability and the removal points listed above.
- [ ] Findings per cause with evidence: CFM versus Mach-O, PowerPC on Intel, 32-bit-only, missing Classic, QuickDraw/QuickTime removal, resource-fork loss, creator/type reliance, endianness, handle and addressing assumptions, path and name limits, signing and notarization.
- [ ] Causes needing an emulator are marked; hypotheses stay separate.

*3. Execution and observation*
- [ ] Providers: Basilisk II, SheepShaver, Mini vMac, QEMU PowerPC/early-OS-X class; detected, never simulated.
- [ ] ROMs, system software and installers are user supplied and hashed; licensing limitation recorded for the operator.
- [ ] Sandbox applied; first-failure diagnostics; works/fails matrix.

*4. Behavior capture and replay*
- [ ] Input injection, screenshot normalization, disk-image snapshot diffs, clock control, trap tracing where available; limitations stated.

*5. Preservation and migration*
- [ ] Oracle comparisons, rebuild comparison for open-source targets, L0–L3 report, ranked migration options with evidence.

*6. Product integration*
- [ ] Stable tools, `docs/MCP.md` match, gates, examples, updated documentation.

*7. Reference trials*
- [ ] Two scenarios on lawful fixtures; explicit limitation where no oracle or licensed environment exists.

*8. Debts due in this patch* (one box per debt; a debt whose box already sits in sections 1–7 is only named here)
- [x] F-08 macOS part: single-PID fast path for inspection and sampling (step 0; 1.3.11, `ps -p`).
- [x] R-19 macOS part: sampling without reading the full process table (step 0; 1.3.11, `ps -p` + `pgrep -P`; true libproc not used — zero runtime native deps).
- [ ] R-04: hostile-input property tests (`fast-check`) for the 68k, PEF, Mach-O/fat, resource-fork, container and HFS parsers (step 3).
- [ ] R-02: every new source of untrusted text (resource strings, `Info.plist`, installer metadata) passes through the untrusted-content wrapper, with an adversarial fixture (step 3).
- [ ] R-15: golden results and a manual CI job for the O reference trials (step 8).
- [ ] Record a green manual `os: all` run with its run ID (step 8).
- Tracked by boxes in the sections above: R-11 Mach-O part in section 1; the O share of G-01…G-10, H-03…H-08 and H-10 in sections 1–7.

**Debts closed in O (summary of section 8 and of the boxes it names).** F-08 (macOS part), R-19 (macOS part), R-11 (Mach-O part), R-04 for the Mac parsers, and the O share of G-01…G-10, H-03…H-08, H-10.

**Out of scope and known limits.** Bundling ROMs, system software or proprietary tools; defeating copy protection; hardware-bound software (specific expansion cards, dongles) without an emulator path; running current Apple operating systems on non-Apple hardware.

**O is done when** section 8 (the debts) and the definition of done for N, O, P and Q holds for the Mac family and the release is **1.4.0** with its release record. **Recorded:** closed at **1.4.0** (2026-11-12). Residuals (full PEF symbol tables, emulator input injection/screenshots, real ROM works/fails, native resource-fork writes) are explicit limitations in CAPABILITIES.md — not ❌ for in-scope delivered surface.



### 1.4.2 — post-close hygiene (green matrix)

**Date.** 2026-11-12.

**Changes.** Status table O row set to **done (1.4.0)**; capability suite asserts O closed (not `in progress`); `diffDiskImageHashes` retained as a used export (1.4.1). No new Mac product surface.

**Verification.** All CI checks green on 1.4.2 (operator-confirmed).

## 1.4.0 — Patch O closed (Classic Mac / early macOS)

**Date.** 2026-11-12.

**Delivered.** Target Profile + `analyze_legacy_mac` (authorization gate); Mach-O/fat/PEF/AppleDouble/MacBinary/BinHex/HFS inventory; sourced Mac diagnosis tables; calibration harness; detect-only BasiliskII/Mini vMac/SheepShaver/qemu-ppc environments; capture/replay host round-trip; ROM local hashing; works/fails matrix (unsupported without operator ROM); HFS catalog B-tree leaf walk; named Toolbox traps; CODE segments; PEF imports + best-effort fragment graph; two Mac reference trials at L0; disk-image hash diff.

**Explicit residuals (not blocking close).** Full PEF export/import symbol tables; emulator UI injection and screenshot normalization; real works/fails only when operator supplies ROM/image and emulator on PATH; native resource-fork write paths; complete Toolbox trap name index.

**Verification.** Capability suite and unit tests cover the delivered surface. Manual `os: all` green run ID to be recorded by the maintainer after this release tag lands.


### Patch P working plan — Legacy Android software (target release 1.5, **in progress**)

**Outcome.** Reverse can take an old Android application (roughly Android 1.0 to 5.1, API levels 1 to 22, Dalvik and early ART, 2008 to about 2015) and (a) identify its build, runtime and native components, (b) name the concrete causes it fails on a current device, (c) run it on an emulator or device of a suitable API level under controlled conditions, (d) capture and replay deterministic scenarios, (e) validate a repaired, retargeted or rebuilt version against the original, and (f) rank migration options. The Android foundations from E, F, G, H and J are reused, not rewritten.

**Entry criteria.** Patch O released as 1.4.0 (see the shared rules above).

**Target families and era boundaries.**

| Area | In scope |
|---|---|
| Package formats | APK (v1 JAR signatures, and v2/v3 where present), split and expansion files, `resources.arsc`, binary `AndroidManifest.xml` (AXML), `classes.dex` versions of the era, ODEX/OAT/VDEX/ART images at detection level, Ant, Eclipse/ADT and early Gradle layouts |
| Runtimes | Dalvik (to Android 4.4) and early ART (5.x); multidex; Java 6/7 language level; support library and Google Play services dependencies of the era |
| Native code | `armeabi`, `armeabi-v7a`, `x86`, `mips` (and `arm64-v8a` for the boundary), bionic and linker behavior by API level, TEXTREL and hash-style, 32-bit-only components |
| Framework behavior | API-level-dependent behavior changes: runtime permissions, background execution and implicit broadcasts, cleartext traffic, storage access, `org.apache.http` removal, WebView and TLS changes, notification and service rules, activity/fragment lifecycle changes |
| Devices and tools | Android emulator images of old API levels, ARM-to-x86 translation limits, real devices over `adb`, `logcat`, `dumpsys`, `uiautomator`, `monkey`/`input`, Frida, `simpleperf`, Perfetto where the API level supports it |

**Work order inside P.**

| Step | Work | Closes | Exit criteria |
|---|---|---|---|
| 0 | Debts due: nothing blocking; decide with the maintainer whether any of the Android-related Audit 8 non-claims (see the register) is promoted into P scope before step 3 | none | **Done in 1.5.0 / Audit 27:** non-claims **not** promoted before step 3 |
| 1 | Legacy-Android fields in the shared Target Profile (API levels, runtime, ABIs, build system, signing scheme, framework-behavior flags, services dependencies) | Section 1 | No second schema |
| 2 | Ground-truth corpus and calibration: crafted AXML/DEX/ARSC fixtures, open-source or consented APKs | H-08 for P | Precision and recall reported per detector |
| 3 | Static inventory: binary AXML decoder, `resources.arsc` reader, DEX class and method listing, signature scheme detection, ABI and native-library inventory, build-system and dependency identification (Ant, ADT, Gradle files where present), Play-services dependency detection, hostile-input property tests, Android rows of the support matrix | G-02 (Android), G-09 (Android), R-04 (AXML/DEX/ARSC parsers) | Every field has evidence; the manifest and class listing no longer depend on JADX or Apktool being present |
| 4 | Sourced compatibility tables (framework behavior changes by API level, removed libraries, permission model, ABI availability by device generation) and diagnosis: `targetSdkVersion`/`minSdkVersion` effects, runtime permissions, background limits, cleartext, storage, removed HTTP stack, missing ABIs on current devices, Play-services and push-service dependency, WebView and TLS issues | G-01 (Android) | Each finding cites a table entry and a target fact |
| 5 | Environments: emulator images by API level and ABI (user-installed through the operator's SDK, licenses accepted by the operator), device runs, snapshots (`adb_emu_snapshot_load`, existing), install and clear (`adb_install`, `adb_pm_clear`, existing), translation-layer limits recorded; sandbox policy for the host side | G-03 (Android) | Real runs on at least two API levels produce a works/fails matrix |
| 6 | Capture/replay: `logcat` and `dumpsys` collection, UI hierarchy and screenshot normalization, deterministic `input`/`monkey` scenarios with fixed seeds, Frida `Java.perform` session scripts and continuous call-frequency profiles, network capture through a proxy, file and database diffs, `simpleperf` and Perfetto ingestion for performance scenarios | G-04 (Android), R-12 (Android formats) | A scenario replays with identical normalized observations or reports the uncontrolled nondeterminism |
| 7 | Preservation: original APK on the original-API-level environment as the oracle; differential comparison of UI hierarchy, logs and persisted state; retarget and repackage options built on the existing apktool rebuild path; L0–L3 report; migration advisor (retarget SDK, compatibility shims, rewrite permission and storage flows, replace removed libraries, rebuild from source) | G-05, G-06, G-10 (Android) | Without an oracle the level stays L0 |
| 8 | Two reference trials, documentation, security review, `os: all` run, release 1.5.0 | Section 7 | Definition of done holds |

**Detailed checklist.**

*1. Target Profile and static inventory*
- [ ] Binary AXML decoding (permissions, components, SDK levels, features, intent filters) without external tools.
- [ ] `resources.arsc` reading (configurations, string and resource tables).
- [ ] DEX header, class and method listing, multidex, obfuscation indicators.
- [ ] Signature scheme detection (v1, v2, v3) and certificate metadata.
- [ ] ABI inventory per native library; TEXTREL, hash style, bionic dependencies.
- [ ] Build-system and dependency identification (Ant, ADT, Gradle files, bundled libraries, Play-services components).
- [ ] Android rows in the support matrix and its capability check (G-09).

*2. Compatibility diagnosis*
- [ ] Sourced tables for behavior changes by API level and for ABI and library availability.
- [ ] Findings per cause with evidence: SDK-level effects, permissions, background and broadcast limits, cleartext traffic, storage, removed HTTP stack, missing ABIs, services dependencies, WebView and TLS.
- [ ] Causes needing an emulator or device are marked; hypotheses stay separate.

*3. Execution and observation*
- [ ] Providers: Android emulator by API level and ABI, real device via `adb`; detected, never simulated; images and licenses are the operator's.
- [ ] Snapshot, install and clear helpers reused with their existing gates.
- [ ] First-failure diagnostics and a works/fails matrix across at least two API levels.

*4. Behavior capture and replay*
- [ ] `logcat`, `dumpsys`, UI hierarchy, screenshots, seeded `monkey`/`input` scenarios, Frida session scripts and call-frequency profiles, proxy network capture, file and database diffs, `simpleperf` and Perfetto ingestion.

*5. Preservation and migration*
- [ ] Oracle comparisons on the original API level, retarget and repackage workflow, L0–L3 report, ranked migration options with evidence.

*6. Product integration*
- [ ] Stable tools, `docs/MCP.md` match, gates, examples, updated documentation.

*7. Reference trials*
- [ ] Two scenarios on lawful fixtures (open-source or consented APKs); explicit limitation where no oracle or licensed image exists.

*8. Debts due in this patch* (one box per debt; a debt whose box already sits in sections 1–7 is only named here)
- [ ] R-04: hostile-input property tests (`fast-check`) for the AXML, DEX and `resources.arsc` parsers (step 3).
- [ ] R-02: every new source of untrusted text (manifest strings, resources, class and method names) passes through the untrusted-content wrapper, with an adversarial fixture (step 3).
- [ ] R-15: golden results and a manual CI job for the P reference trials (step 8).
- [ ] Record a green manual `os: all` run with its run ID (step 8).
- Tracked by boxes in the sections above: the Android Audit 8 items (binary AXML decoding, DEX class listing, Gradle/build dependencies, `Java.perform` scripts and call-frequency profiles, Perfetto and `dumpsys`) and the Android part of R-12 (`simpleperf`, Perfetto) in sections 1 and 4; the P share of G-01…G-10, H-03…H-08 and H-10 in sections 1–7.

**Debts closed in P (summary of section 8 and of the boxes it names).** The Android items of the Audit 8 non-claims (binary AXML decoding, DEX class listing, Gradle and build-system dependency analysis, Frida call-frequency profiles and `Java.perform` session scripts, Perfetto and `dumpsys` collection), the Android part of R-12, R-04 for the AXML/DEX/ARSC parsers, and the P share of G-01…G-10, H-03…H-08, H-10.

**Out of scope and known limits.** Bundling system images or Google components; defeating licensing or DRM; apps that depend on a vendor ROM or proprietary hardware without an emulator path; ARM-translation results are labeled as translated.

**P is done when** section 8 (the debts) and the definition of done for N, O, P and Q holds for the legacy Android family and the release is **1.5.0** with its release record.

### Patch Q working plan — Newer generations and unified compatibility intelligence (target release 2.0, not started)

**Outcome.** The workflow proven for Windows, Linux, Classic Mac/early macOS and legacy Android is extended to newer generations (post-2010 Windows, newer Linux, macOS from 10.7 to current, Android 6.0 to current) **and** unified: one Target Profile, one compatibility knowledge base, one evidence and confidence model, one environment matrix and one preservation/migration report across every supported platform. Q is not a fifth platform wave: it generalizes M–P and finishes the product. Release 2.0 is the first release that may claim the whole product outcome (analyze, reverse-engineer, find resource-use causes, optimize and prove, diagnose and restore old software) across all supported families.

**Entry criteria.** Patch P released as 1.5.0 (see the shared rules above), and the maintainer has reviewed the unified schema proposal from step 1 before step 3 starts.

**Newer generations in scope.**

| Family | In scope |
|---|---|
| Windows after Windows 7 | Windows 8, 8.1, 10 and 11 on x86, x64 and ARM64/ARM64EC; WoW64 and emulation behavior; MSIX/AppX/UWP packaging; .NET Core and .NET 5+; CFG, CET and other mitigations; driver-signing and SmartScreen effects on legacy and newer software |
| Linux, newer | Current glibc and musl, symbol-version compatibility of older binaries on new systems, containers and portable packages (Flatpak, Snap, AppImage), systemd, Wayland, PipeWire/PulseAudio, current sandboxing facilities |
| macOS, modern and transition | macOS 10.7 and later to current: 64-bit only, hardened runtime, code signing and notarization, Gatekeeper and SIP, Apple Silicon (arm64, arm64e), Rosetta 2, universal binaries, Mac Catalyst |
| Android, newer | API 23 to current: runtime permissions, scoped storage, background and foreground-service limits, 64-bit requirements, App Bundles and split APKs, current WebView and TLS behavior |

**Work order inside Q.**

| Step | Work | Closes | Exit criteria |
|---|---|---|---|
| 0 | Debts due: F-06 (re-check the current MCP specification first; implement the stateless protocol era if it is final, otherwise record the decision), R-15 golden results as manual CI jobs for every earlier reference trial, plus a full review of every row still open in the debt register | F-06, R-15 | Decision or implementation recorded; golden-result jobs exist for M–P trials |
| 1 | **Unified schema proposal:** one Target Profile, one evidence and confidence model, one environment registry and one report format covering M–P and the new families; compatibility with every released field; written proposal reviewed by the maintainer before implementation | Section 1 (all families) | Maintainer approval recorded; migration of existing results defined |
| 2 | **Compatibility knowledge base:** one versioned, sourced store for all families (entry = fact, source, license, retrieval date, scope, confidence), query by family, era and API or library, staleness flags, validator and a consistency check that finds contradictions across families; M–P tables are imported without loss | G-01, G-09 (unified) | One query answers "is this API/library available in this OS or runtime version" for every supported family with its source |
| 3 | **Calibration across platforms:** ground-truth corpora of M–P merged into one calibration report; confidence meaning made comparable; contradictions between detectors surfaced, never hidden | H-08 (unified) | One calibration report per release; a regression fails a check |
| 4 | **Newer-generation static inventory:** Windows 8+ packaging and mitigations, ARM64/ARM64EC, .NET Core/5+ detection, modern ELF and package formats, macOS signing, notarization and arm64e, Android bundles and split APKs; hardening flags for every family | G-02, G-09 for the new families, R-10 remainder (`syft`, `osv-scanner`, `cargo-auditable`, Go build info) | Every field has evidence; every family has its support-matrix rows |
| 5 | **Newer-generation diagnosis and environments:** sourced tables and findings for post-2010 behavior (including mitigations, signing, sandboxes, background limits); environment providers for current Windows, Linux, macOS (on Apple hardware only where licensing allows) and Android; one environment matrix across all platforms and versions | G-01, G-03 for the new families | Real runs produce one cross-platform works/fails matrix |
| 6 | **Unified capture, replay and profiling:** one scenario format across platforms; profile ingestion in standard formats (`perf`, pprof, `.cpuprofile`, Speedscope, Firefox Profiler, bpftrace; Windows ETW sessions; per-process network I/O); continuous Frida profiles for newer targets | G-04, R-12 (remainder) | A scenario recorded on one platform replays under the same contract on every platform that supports it |
| 7 | **Unified preservation and migration:** one L0–L3 report across platforms, one ranked migration advisor that may recommend a cross-platform path (for example emulate, port, rebuild), differential validation reused for every family | G-05, G-06, G-10 (unified), H-07 | The same report structure for every family; no level above L0 without an oracle and provenance |
| 8 | **Third-party-verifiable evidence:** per-session Merkle root, Ed25519 detached signatures, `reverse export` and `reverse verify` | R-14 | An exported bundle verifies with the public key on a machine without Reverse's state |
| 9 | **Distribution and agent-evaluation completion:** the full live-agent evaluation corpus harness and the optional single-file binary | R-08, R-18, H-09 | The harness runs against the corpus and records pass rates; the binary starts the MCP server on the supported platforms or the limitation is recorded |
| 10 | **Cross-platform reference trials, 2.0 stabilization and release:** two reference scenarios for each platform family on lawful fixtures; the run-all manual CI job with golden results on Linux, macOS and Windows; documentation freeze and an API/tool-stability and deprecation policy; a full security review; a final support matrix by platform, era and capability; an audit of every row of the debt register and the Audit 8 non-claims (each delivered, or recorded as an explicit limitation with the maintainer's sign-off); release record | Section 7; the "Q is done when" conditions | Definition of done holds and **no open debt remains** (see the debt closure schedule); the release is **2.0.0** |

**Detailed checklist.**

*1. Unified Target Profile and static inventory*
- [ ] One Target Profile schema for every family; every field with evidence, confidence and coverage; backward compatibility with M–P results defined.
- [ ] Newer Windows, Linux, macOS and Android inventory items listed in step 4.
- [ ] Hardening and mitigation flags for every family in one report.
- [ ] Remaining opt-in providers of R-10 (`syft`, `osv-scanner`, `cargo-auditable`, Go build info) or an explicit won't-do with sign-off.
- [ ] Final platform × era × capability support matrix in `CAPABILITIES.md` with its capability check.

*2. Unified compatibility intelligence*
- [ ] Compatibility knowledge base with sources, licenses, retrieval dates, staleness flags and a contradiction check.
- [ ] Diagnosis findings for newer generations; findings reference the knowledge base only.
- [ ] CVE and dependency-vulnerability queries and the dependency-size and replacement recommendations of the Audit 8 non-claims, or an explicit limitation.

*3. Unified execution and environment matrix*
- [ ] One environment registry (provider, image hash, fingerprint) and one works/fails matrix across every platform and version.
- [ ] Providers for newer generations detected and never simulated; operator licensing limits recorded.

*4. Unified capture and replay*
- [ ] One scenario format; profile ingestion formats listed in step 6; per-process network I/O; Windows ETW automatic hotspot sessions; continuous Frida call-frequency profiles.
- [ ] Test-framework discovery (jest, pytest) and build verification, or an explicit limitation.

*5. Unified preservation and migration*
- [ ] One L0–L3 report and one migration advisor across families; cross-platform recommendations cite evidence.

*6. Product integration and release*
- [ ] Stateless MCP protocol decision or implementation (F-06).
- [ ] Merkle roots, Ed25519 signatures, `reverse export` and `reverse verify` (R-14).
- [ ] Full live-agent evaluation harness and single-file binary (R-08, R-18, H-09).
- [ ] API/tool-stability and deprecation policy; documentation freeze; full security review.

*7. Reference trials*
- [ ] Two scenarios for every platform family; run-all manual CI job with golden results (R-15) on all three operating systems; explicit limitations where no oracle or licensed environment exists.

*8. Debts due in this patch* (one box per debt; a debt whose box already sits in sections 1–7 is only named here)
- [ ] R-11: the hardening and mitigation flag report covers every supported family in one report (step 4).
- [ ] R-04: hostile-input property tests for the parsers of the newer generations (step 4).
- [ ] R-02: every new source of untrusted text passes through the untrusted-content wrapper, with an adversarial fixture (step 4).
- [ ] R-15: golden-result jobs exist for every reference trial of M–P (step 0) and for the Q trials (step 10).
- [ ] Debt register audit: every row of the carry-over debt register and every Audit 8 non-claim is closed, or is an explicit limitation in `CAPABILITIES.md` signed off by the maintainer; the register is empty (step 10).
- [ ] Record a green manual `os: all` run with its run ID (step 10).
- Tracked by boxes in the sections above: F-06, R-14, R-08, R-18 and H-09 in section 6; R-10 remainder in section 1; R-12 remainder, per-process network I/O, ETW sessions, continuous Frida profiles and test-framework discovery in section 4; CVE and dependency queries in section 2; the Q share of G-01…G-10, H-03…H-08 and H-10 in sections 1–7.

**Debts closed in Q (summary of section 8 and of the boxes it names).** F-06, R-14, R-15 (remainder), R-12 (remainder), R-10 (remainder), R-08, R-18, H-09, the Audit 8 non-claims not delivered earlier (each delivered or an explicit limitation), the Q share of G-01…G-10, H-03…H-08, H-10, and every other row still open in the debt register.

**Out of scope and known limits.** Reverse remains an observational and analysis tool for open-source software or software with full rights-holder consent; it does not bundle operating systems, ROMs, images or proprietary tools, and it does not defeat protection or licensing. Platforms that cannot be run lawfully or at all in the operator's environment are reported as `unsupported`, never simulated.

**Q is done when** section 8 (the debts) and the definition of done for N, O, P and Q holds for every supported family, the debt register is empty or every remaining row is an explicit, signed-off limitation, and the release is **2.0.0** with its release record.

### Patch M history: delivered increments

These are historical progress notes inside Patch M, not separate roadmap units. The open work is in the [Patch M working checklist](#patch-m-working-checklist).

#### Patch M implementation note — 1.1.0-beta.1 (initial Windows slice)

This prerelease adds `analyze_legacy_windows` and `declare_legacy_authorization`, the session authorization record, deterministic executable-header recognition (MZ/NE/LE/LX/PE), bounded selected marker scanning, and preliminary compatibility candidates. It closes only the legal-policy documentation item and the initial authorization/header-detector sub-slice; it does **not** close G-01/G-02/G-07/G-09 or the Windows wave. Remaining M checklist items are intentionally unchecked.

#### Patch M1 implementation note — historical label for the same patch M — 1.1.8 (Windows detector expansion)

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
- [x] Verify artifact upload and summary content in actual GitHub Actions runs for all three workflows (closed 2026-11-11: runs 43024000265, 43024033261, 43024423915 — one final artifact each with failure brief + detailed logs).

## Carry-over debt register

Approved tasks that are **not** closed, collected from the backlog, the patch records and the audits, so that nothing hides inside a patch marked done. None of them is recorded as blocking Patch M. "State" says what was verified at 1.1.8; "No implementation found" means a search of `src/` for the feature found nothing. Every assignment below was approved by the maintainer on 2026-11-11 and is part of the plan. The task itself lives as a checkbox inside the plan of the patch that owns it (Patch M checklist section 8; section 8 of the N, O, P and Q plans), so a patch can be worked from its own description alone; this register and the debt closure schedule are indexes.

### Approved tasks without delivery or without recorded closure

| ID | Task | Backlog assignment | State at 1.1.8 | Handling |
|---|---|---|---|---|
| F-75 / R-03 | Pin the two remaining tag references in `.github/workflows/supply-chain.yml` to full commit SHAs | 1.0.1 (R-03 recorded closed) | **Closed** in this increment (step 0 of M): both remaining tags pinned to `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` (v7.0.1); R-03 check is ✅ | *Closed:* work order step 0 |
| R-20 | Sandbox for executed targets under `CONTROLLED_EXECUTION` (bwrap/unshare, sandbox-exec, Job Objects/AppContainer or a container provider; no network by default; scratch directory; rlimits) | G (done) | **Partial:** Linux bwrap/unshare + scratch dir + timeout + process-group kill delivered in M step 5; Windows/macOS hard isolation still open | *Approved:* inside M step 5 (Linux partial closed); Windows/macOS remainder tracked as residual |
| R-14 | Merkle root, Ed25519 detached signature, `reverse export` / `reverse verify` | I (done) | Hash chain and optional HMAC-SHA256 are done; Merkle, public-key signatures and the two commands: no implementation found | *Approved:* Patch Q step 8 (box in the Q plan, section 6) |
| R-11 | Hardening-flag report (PIE, NX, RELRO, canary, CFG, ASLR) | E (done) | **Partial:** PE DllCharacteristics flags in M step 3; ELF PIE/NX/RELRO hints in N; Mach-O and unified multi-family report remain | *Approved:* PE closed in M; ELF partial in N; Mach-O in O step 3; all families in Q step 4 |
| R-10 | Opt-in providers: lief/goblin, objdump/readelf, capa, yara-x, diec, syft, osv-scanner, cargo-auditable, Go build info | E, F, H (done) | **Partial:** detect-only `diec`/`yara-x`/`capa` (M), `readelf`/`objdump`/`lief` (N) registered; `goblin` and the Q-era providers remain open | *Approved:* M/N subsets closed as detect-only; remainder in Q step 4 or explicit won't-do |
| R-12 | Profile ingestion in standard formats (perf, pprof, `.cpuprofile`, Speedscope, Firefox Profiler); eBPF via bpftrace | H (done) | Export shape closed in 0.2.0-beta.6; ingestion: no implementation found | *Approved:* Android formats in P step 6; the other formats, ETW and network I/O in Q step 6 |
| R-15 | Golden results and the three reference trials as manual CI jobs | J (done) | N/Linux golden manifest and manual workflow delivered in 1.3.6; M/O/P and Q remainder still due | *Approved:* M step 8, each later patch step 8; N/Linux portion closed in 1.3.6; remaining portions due in their patch steps |
| R-01 | Mutation testing (Stryker) on pure modules | D (done) | Stryker baseline recorded in 1.3.10: 47.72 % on four pure modules (floor 45 %) | *Approved:* N step 0; **closed in 1.3.10** |
| R-04 | Fuzz and property tests (`fast-check`) for parsers | D (done) | Partial: deterministic hostile process-parser corpus; `fast-check` property tests for a.out/ELF/archive parsers closed in 1.3.10; parsers of O, P and Q remain in their steps | *Approved:* step 3 of M, N, O and P for the parsers each patch adds (boxes in sections 1 or 8 of those plans); newer-generation parsers in Q step 4 |
| R-05 | Linter, `knip`, `jscpd`, own-line size gate | C (done) | Done in 1.3.10: Biome linter, `jscpd` and `knip` join the format/size gates and `quality:static` in CI | *Approved:* N step 0; **closed in 1.3.10** |
| R-07 | Contract-first MCP (docs generated from one definition) | D (done) | **Closed in 1.3.6:** `docs/MCP.md` tool table generated from the registry used by `tools/list`; drift check is a CI gate | *Approved:* N step 0; closed in post-N maintenance 1.3.6 |
| R-19 | Windows/macOS metric parity: persistent helpers instead of a fork per sample; `typeperf`/ETW and `libproc` | D/H (done) | Windows persistent helper closed in 1.3.10; macOS single-PID `ps -p` / `pgrep -P` sampling closed in 1.3.11 (true libproc not used — zero runtime native deps) | *Closed:* Windows N step 0 (1.3.10); macOS O step 0 (**1.3.11**) |
| F-08 | Single-PID fast path for inspection and sampling | B (done) | Linux, Windows and macOS done (`ps -p` on darwin, 1.3.11) | *Closed:* O step 0 (**1.3.11**) |
| F-06 | MCP protocol: stateless 2026 protocol era | D (done) | Stateful revisions through 2025-11-25 only | *Approved:* Q step 0 (box in the Q plan, section 6) |
| R-08 / R-18 / H-09 | Full live-agent evaluation corpus harness; optional single-file binary | L | Core shipped in 1.0.0; lite evaluation (`evaluateAgentPrompts`) in 1.0.1; full harness and single binary open | *Approved:* Q step 9 (box in the Q plan, section 6) |
| H-03 / H-04 / H-05 / H-06 / H-07 / H-08 / H-10 | Similarity adapters, deterministic-first rule, authorization enforcement, corpus policy, oracle rule, calibrated reference corpus, authorization record in reports | M (introduced) | H-03 partial (Ghidra BSim extension only, no configured corpus); H-04 partial (no legacy analogy tags emitted); H-05 and H-10 closed for current M/N APIs in 1.3.7; H-06 calibration-manifest policy enforced, similarity corpus remains local/operator supplied; H-07 L0 oracle rule enforced; H-08 partial (metrics implemented, small crafted corpus not representative) | Remaining similarity/calibration scope continues in O–Q |
| G-01…G-10 | Compatibility diagnosis, legacy formats, execution environments, capture/replay, equivalence, migration, legal policy, platform order, support matrix, preservation report | M (introduced), extended in N–Q | G-01/02/03/04/06/07/09/10 partial for current M/N subsets; G-05 function-level equivalence lab open; G-08 sequence rule closed by F-71. Exact limitations in `CAPABILITIES.md` | Extended by O–Q; no M/N blanket closure claimed |

### Non-claims carried over from the E–K audits (Audit 8 and others)

These capabilities are **not** implemented and must not be described as available. They stay provider-backed or explicit limitations until a task needs them.

- Full control-flow graph, interactive decompilation and cross-references; BSim scores without an operator corpus.
- CVE database, registry "outdated" queries, size and replacement recommendations for dependencies; binary `AndroidManifest.xml` (AXML) decoding; DEX class listing; full Gradle resolution.
- Continuous Frida call-frequency profiles and `Java.perform` session scripts; Windows ETW automatic hotspot sessions; per-process network I/O.
- Full test-framework discovery (jest, pytest); Merkle roots and detached signatures (R-14 above).
- Acceptance trials on real external applications of the three reference shapes (fixture trials are done); external commercial reference apps are not bundled.
- Full OS sandbox / network isolation on Windows and macOS; hard resource quotas outside delegated Linux cgroup v2 (R-20 partial: Linux bwrap/unshare delivered).

### Pending verification (delivered, run not recorded)

- ~~Full-matrix `os: all` Capabilities run for patches E–M~~ **Closed 2026-11-11.** Maintainer-provided green runs on commit `66fee60`:
  - Capabilities run [43024000265](https://github.com/ecooorg/reverse/actions/runs/43024000265) — Success; jobs: `capabilities` on ubuntu/macOS/windows × Node 22/24, `package` on ubuntu/windows, capability matrix, single final artifact.
  - Structure run [43024033261](https://github.com/ecooorg/reverse/actions/runs/43024033261) — Success; ubuntu/macOS/windows + single final artifact.
  - Supply chain run [43024423915](https://github.com/ecooorg/reverse/actions/runs/43024423915) — Success; single final artifact.
  - Prior baseline: A–D closure run 42775483864 (0.2.0-beta.8).
- GitHub artifact layout (one workflow artifact with `AI-DEBUG-SUMMARY.md` + `detailed-logs.zip`) verified on the same runs (F-66). F-67 remains only if a future diagnostics regression needs a dedicated rerun.

### Debt closure schedule

**This table is an index.** Each debt below is also a checkbox inside the plan of the patch that owns it (section 8 *Debts due in this patch*, or the section named there); the checkbox in the patch plan is the one to tick, and the patch is not done while it is open. **Rule.** Every open debt has exactly one due point: a patch and a step. A debt scheduled as *step 0* of a patch is closed before any feature of that patch starts. **No debt may stay open past the exit of patch Q:** release 2.0.0 requires the [carry-over debt register](#carry-over-debt-register) to be empty or every remaining row to be an explicit limitation in `CAPABILITIES.md` signed off by the maintainer. A due date moves only by a maintainer decision recorded in the roadmap and in an AUDIT entry. All assignments in this table were approved by the maintainer on 2026-11-11.

| Debt | Due | Status of the assignment |
|---|---|---|
| F-66 artifact upload and F-67 rerun | Verified green on 2026-11-11 runs 43024000265 / 43024033261 / 43024423915 (one artifact per workflow) | **closed** |
| `os: all` runs for E–M (not recorded) | M step 8 (one run covers E–M); then at the exit of every later patch | approved |
| F-75 / R-03 (two unpinned action references) | M step 0 | approved |
| R-20 sandbox for executed targets | M step 5 | approved |
| R-11 hardening flags | PE: M step 3; ELF: N step 3; Mach-O: O step 3; every family again in Q step 4 | approved |
| R-10 providers | `diec`, `yara-x`, `capa`: M step 3; `lief`/`goblin`, `objdump`/`readelf`: N step 3; `syft`, `osv-scanner`, `cargo-auditable`, Go build info: Q step 4, or an explicit won't-do with sign-off | approved |
| R-04 fuzz and property tests | New parsers of each patch in step 3 of that patch (M, N, O, P); existing binary parsers (ZIP, WASM, .NET, ELF) are covered when touched in N step 3 | approved |
| R-05 linter, `knip`, `jscpd`; F-33 remainder | N step 0 | **Closed 1.3.10** (gates CI-gated) |
| R-07 contract-first MCP (docs from one definition) | N step 0 | **closed 1.3.6** |
| R-01 mutation testing on the pure modules | N step 0 | **Closed 1.3.10** (baseline 47.72 %) |
| R-19 metric parity | Windows part: N step 0; macOS part together with F-08: O step 0 | **Windows closed 1.3.10; macOS closed 1.3.11 (`ps -p` / `pgrep -P`) ** |
| F-08 macOS single-PID fast path | O step 0 | **Closed 1.3.11** |
| R-12 profile ingestion | Android formats (`simpleperf`, Perfetto): P step 6; `perf`, pprof, `.cpuprofile`, Speedscope, Firefox Profiler, bpftrace, ETW, per-process network I/O: Q step 6 | approved |
| Android items of the Audit 8 non-claims (AXML, DEX class listing, Gradle/build dependencies, Frida call-frequency and `Java.perform` scripts, Perfetto, `dumpsys`) | P steps 3 and 6 | approved |
| Other Audit 8 non-claims (CVE and registry queries, dependency-size recommendations, test-framework discovery, continuous Frida profiles for non-Android targets, ETW hotspots, network I/O, full CFG/decompilation/xrefs/BSim without a corpus) | Q step 6 or an explicit limitation at Q step 10; full CFG, decompilation and BSim stay provider-backed and are never claimed as built in | approved |
| F-06 stateless MCP protocol | Q step 0 | approved |
| R-14 Merkle, Ed25519, export, verify | Q step 8 | approved |
| R-15 golden results and manual CI jobs | M step 8; N step 8; O/P step 8; Q step 0 and 10 | **N/Linux closed 1.3.6; other patch portions remain due** |
| R-08, R-18, H-09 full harness and single-file binary | Q step 9 | approved |
| G-01…G-10, F-63, F-64, H-03…H-08, H-10 | M (introduced); the family share is closed in step 8 of each of N, O, P; unified in Q | approved |
| R-02 untrusted-content hardening (basic form closed in 0.2.0-beta.5) | Every new source of untrusted text (strings, resources, manifests, package metadata, installer scripts read statically) goes through the existing untrusted-content wrapper with an adversarial fixture, in step 3 of each patch M–Q | N/Linux portion closed in 1.3.6; M/O/P/Q portions remain assigned |
| Any other row of the backlog or the audits that is open and not listed above | Reviewed at the exit of every patch; any row still open at Q step 10 is closed or becomes a signed-off limitation | approved |

### M/N cross-cutting status audit (G-01…G-10, H-03…H-10)

This matrix is the authoritative summary of what the current code proves for M/N. It does not close future-platform work and does not imply that the full Audit 2/3 goals are complete.

| ID | M/N status at 1.3.7 | Evidence / remaining scope |
|---|---|---|
| G-01 | partial | Windows and Linux diagnosis emits sourced table IDs for selected runtime/format facts; comprehensive OS/API/device availability tables remain open |
| G-02 | partial | DOS/Windows and a.out/ELF detectors exist; remaining format, installer and toolchain families are listed in each patch plan |
| G-03 | partial | Wine/DOSBox/QEMU/chroot/QEMU-user/OSS-shim detection and sandboxed runs exist; no complete prepare/snapshot/restore/trace lifecycle |
| G-04 | partial | Controlled capture/replay compares normalized streams and output-file hashes; no registry/network/UI/audio/time/randomness control or code coverage |
| G-05 | open | No function-level equivalence lab or broad differential/property/fuzz harness |
| G-06 | partial | Evidence-backed runtime/environment/hardening options are ranked; full migration strategy search and effort/gain estimates remain open |
| G-07 | partial | Authorized-use policy and current M/N operation gates exist; operator declaration is not legal verification |
| G-08 | closed | Strict M → N → O → P → Q sequence is documented and enforced in the roadmap (F-71) |
| G-09 | partial | Windows and Linux support rows exist with detector/table tests; matrix does not cover every planned family |
| G-10 | partial | L0–L3 report and no-oracle L0 guard exist; current M/N fixtures have no independent oracle and remain L0 |
| H-03 | partial | SimilarityProvider contract and Ghidra BSim extension point exist; no configured corpus or computed score |
| H-04 | partial | Deterministic detections remain facts; schema supports analogy basis, but no M/N analogy tag is emitted |
| H-05 | closed for current M/N APIs | Shared gate now protects analyzers, calibration, execution, capture/replay, preservation and migration; O–Q must reuse it |
| H-06 | partial | Calibration manifests require operator SHA-256/source/license and reject embedded payloads; similarity corpora remain operator-supplied/local |
| H-07 | closed for current M/N reports | Preservation computation forces L0 without an available oracle; future generated-code provenance remains open |
| H-08 | partial | Precision/recall, Brier and five-bin ECE are reported; crafted corpora are too small for production calibration |
| H-10 | closed for current M/N reports | Authorization provenance is included in analysis, calibration, execution, capture/replay, preservation and migration outputs |

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

### Findings (Audit 1, approved 2026-11-09, plus the later findings F-50 to F-86; sorted by ID — F-18 to F-41 follow in the tables of Audits 4 to 6)

| ID | Task | Patch / status |
|---|---|---|
| F-01 | Command-execution gate: command-running MCP tools refuse unless the operator selects `CONTROLLED_EXECUTION`; command allowlist and `cwd` root; environment allowlist for children; MCP tool annotations | closed in 0.2.0-beta.3 |
| F-02 | Correct median for even counts | closed in 0.2.0-beta.2 |
| F-03 | Output cap counted in bytes | closed in 0.2.0-beta.2 |
| F-04 | No `improved`/significance claim from means; exclude failed runs; minimum runs and confidence interval, else `insufficient_evidence` | closed in 0.2.0-beta.3 |
| F-05 | Validation never matches truncated output | closed in 0.2.0-beta.2; normalization rules in **I** |
| F-06 | (a)–(c) protocol errors | closed in 0.2.0-beta.2; stateful revisions through 2025-11-25, titles, output schemas and annotations in 0.2.0-beta.6; stateless 2026 protocol remains open |
| F-07 | Page size and `CLK_TCK` read from the OS; one documented CPU-percent convention | closed in 0.2.0-beta.6 |
| F-08 | Single-PID fast path for inspection and sampling; cached `btime`, page size, tick rate | **closed in 1.3.11** (Linux `/proc`, Windows CIM, macOS `ps -p` + `pgrep -P`) |
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
| F-64 | No recorded declared authorization basis for legacy analysis | initial gate in **1.1.0-beta.1 / M**; report provenance closed in **1.1.8 / M1**; current M/N operation gates closed in **1.3.7**; O–Q must reuse the gate |
| F-65 | Initial M slice not reflected consistently in package metadata and project documentation | closed in **1.1.0-beta.1 / M** |
| F-66 | CI AI summary could crash or omit actionable diagnostics | closed in **1.1.0-beta.1 maintenance** |
| F-67 | CI AI summary could misclassify capability-suite test failures as formatting failures | fix in **1.1.0-beta.1 maintenance**; verified by regression tests; GitHub rerun pending verification |
| F-68 | Windows legacy analyzer lacked PE imports and structural framework signatures | closed in **1.1.8 / M1** (bounded static detectors; corpus calibration remains open) |
| F-69 | Legacy compatibility candidates ignored PE import evidence | closed in **1.1.8 / M1** (selected imports; OS API availability tables remain open) |
| F-70 | Legacy authorization was not embedded in analysis results | closed in **1.1.8 / M1** |
| F-71 | Future platform and cross-cutting work used overlapping patch classifications | closed in documentation-only planning patch (2026-11-10); no product capability claimed |
| F-76 | M/N legacy execution, capture/replay, preservation, migration and calibration APIs lacked shared authorization gates and report provenance | closed in 1.3.7 for current M/N APIs; O–Q must reuse the same gate |
| F-77 | Calibration manifests did not enforce SHA-256/source/license provenance and accepted unexpected embedded payload fields | closed in 1.3.7; every entry is hash-checked and sourced; embedded payload fields are rejected |
| F-78 | M/N G/H status and architecture statements contradicted actual delivered scope | closed in 1.3.7 documentation reconciliation; residuals remain partial/open |
| F-79 | `ghidra-similarity` returned a zero score when no BSim database was configured, risking a false measured dissimilarity | closed in 1.3.7; no score/findings are returned until a local corpus is configured |
| F-80 | Ten TypeScript source/test files failed the formatter gate in the 1.3.7 full-matrix run; local verification had not used the locked formatter package | **closed in 1.3.10**; format gate passes 109 files on Capabilities 43172993614 |
| F-81 | Summary job emitted a second missing-capability-report failure when upstream capability jobs stopped before the suite could write reports | **closed in 1.3.10**; regression test and green summary on Capabilities 43172993614 |
| F-82 | Persistent PowerShell helper used escaped `\\n` text instead of real line boundaries, causing Windows process/profiling/benchmark/MCP failures | fixed in 1.3.9 with LF framing and UTF-16LE `-EncodedCommand`; verified by the green full matrix on `f85200e` (1.3.10) |
| F-83 | Linux Node 22 capability suite exited with timeout/cancellation classification in run 43084133732; available failure brief does not identify the check | open; not reproduced in three consecutive green matrices including Capabilities 43172993614 on `78a47fd`; root cause unconfirmed; do not weaken checks or change timeout without evidence |
| F-84 | Idle persistent PowerShell helper kept the Windows host process alive, so a capability file that finished all checks did not exit and hit the 240 s timeout (run 43105112195) | **closed in 1.3.10** (`detachFromEventLoop`: `unref`); verified by Capabilities 43172993614 on `78a47fd` |
| F-85 | Documentation drift after 1.3.10: CAPABILITIES still labelled Patch M in progress, ROADMAP debt register had a contradictory G-01…G-10 row, Status at a glance cited superseded run IDs, MCP/ARCHITECTURE/README/SECURITY carried stale M-in-progress and sandbox wording | **closed in documentation sync 2026-11-12** (Audit 24); no product code change |
| F-86 | `npm ci` reports 4 moderate advisories in the full dependency tree (minimatch via Stryker, qs via typed-rest-client); `npm audit --omit=dev` is clean | open (Low, dev-only); do not change dependencies without maintainer approval |

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
| F-75 | Two action references in `supply-chain.yml` are tags, not SHAs; the R-03 check shows 🚧 although R-03 was recorded as closed in 1.0.1 | closed in 1.1.8, Patch M step 0 |

### Recommendations

| ID | Task | Patch |
|---|---|---|
| R-01 | Mutation testing (Stryker) on pure modules | **D** (closed in 1.3.10; baseline 47.72 %) |
| R-02 | Threat model and prompt-injection hardening (`untrustedContent` wrapper, length caps, adversarial fixtures) | Basic wrapper closed in 0.2.0-beta.5; N/Linux analyzer boundary and adversarial ELF fixture closed in 1.3.6; M/O/P/Q portions remain due |
| R-03 | Pin GitHub Action SHAs | closed in **1.0.1** for the workflow action refs of that time; **reopened by F-75** (two refs in `supply-chain.yml` are tags); provenance/Scorecard remain optional hardening |
| R-04 | Fuzz and property tests (`fast-check`, devDependency) for parsers | partial in 0.2.0-beta.6: deterministic hostile process-parser corpus; fast-check property tests for the a.out/ELF/archive parsers closed in 1.3.10 |
| R-05 | Static gates: linter and formatter, `knip`, `jscpd`, own-line size gate | partial in 0.2.0-beta.6: strict TypeScript, format check and own-line size gate; knip/jscpd/dedicated linter remain open; 0.2.0-beta.7: format gate now covers every TypeScript file and the size gate limits line length to 140 characters; closed in 1.3.10: Biome linter, `jscpd` and `knip` are CI-gated |
| R-06 | Reformat dense files, formatter check in the structure workflow | closed in 0.2.0-beta.7 (beta.6 had reformatted only part of the files and left 186 lines over 140 characters; now every `src/` and `tests/` file passes the format gate and the line-length gate) |
| R-07 | Contract-first MCP: one definition generates `tools/list`, [MCP.md](MCP.md) and schemas; compact/full schema profile; structured error codes; pagination; size budgets | Core schemas/profiles/errors/pagination/size budget from 0.2.0-beta.6; tool table generated from the built registry and drift-gated in 1.3.6 |
| R-08 | MCP prompts and resources; `reverse setup` for Claude Code, Codex, Cursor, Gemini CLI with dry run and backups; investigation skill file | **L** |
| R-09 | `reverse doctor` | closed in 0.2.0-beta.6 |
| R-10 | Existing parsers and tools as opt-in providers (lief/goblin, objdump/readelf, rz-bin, capa, yara-x, diec, syft, osv-scanner, cargo-auditable, Go build info) | **E** (static), **F** (provider adapters), **H** (profiling); partly delivered; `diec`, `yara-x` and `capa` reassigned to **M** (approved 2026-11-11), the rest on demand |
| R-11 | Hardening-flag report (PIE, NX, RELRO, canary, CFG, ASLR) | **E**; not delivered; PE flags reassigned to **M**, ELF flags to **N** (approved 2026-11-11) |
| R-12 | Profile ingestion in standard formats (perf, pprof, `.cpuprofile`, Speedscope, Firefox Profiler); hyperfine-compatible benchmark export; eBPF via bpftrace | export shape closed in 0.2.0-beta.6; profile ingestion remains **H** |
| R-13 | Statistics: bootstrap intervals, Mann-Whitney with Hodges-Lehmann shift, effect size, MAD outliers, environment-noise detection, interleaved A/B runs by default, `insufficient_evidence` verdict | closed in 0.2.0-beta.6 (noise snapshot and interleaved suites added) |
| R-14 | Tamper-evident evidence: per-session hash chain, Merkle root, Ed25519 signature, `reverse export` / `reverse verify` | **I** |
| R-15 | Golden results and the three reference trials as manual CI jobs | **J**; M/N/O/P each add their golden workflow at step 8; N/Linux portion closed in 1.3.6 |
| R-16 | Node support window: drop Node 20, `engines` and matrix to 22 and 24 | closed in 0.2.0-beta.3 |
| R-17 | Node built-ins instead of code: `util.parseArgs`, `AbortSignal.timeout`, `fs.glob`, test coverage, `os.availableParallelism` | closed in 0.2.0-beta.6 |
| R-18 | Distribution: `npx` entry, install scripts that only check Node and print configuration, optional single binary, `server.json` for MCP registries | **L** |
| R-19 | Windows and macOS metric parity: persistent helpers instead of a fork per sample; `typeperf`/ETW and `libproc` providers | **closed** — Windows 1.3.10; macOS 1.3.11 (`ps -p` / `pgrep -P`; true libproc not used) |
| R-20 | Sandbox for executed targets under `CONTROLLED_EXECUTION` (bwrap/unshare, sandbox-exec, Job Objects/AppContainer or a container provider; no network by default; scratch directory; rlimits) | **M step 5 (2026-11-11):** Linux bwrap/unshare when present; process-group+scratch+timeout everywhere; Windows/macOS hard isolation still open |

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
| H-05 | Authorized-use policy: open-source software or full consent of developers and rights holders only | policy plus shared authorization gate for current M/N analyzers, calibration, execution, capture/replay, preservation and migration APIs in 1.3.7; operator declaration is not legal verification; O–Q remain due |
| H-06 | Corpus policy: hashes and signatures only, source and license per entry, no third-party binaries, local lookups | **F**, **M**; calibration manifest enforcement strengthened in 1.3.7, similarity corpus remains operator-supplied/local |
| H-07 | Oracle rule: no synthesis or reconstruction above L0 without an oracle; provenance for generated code | **M** (introduced), extended in N–Q |
| H-08 | Reference corpus with ground truth and matcher precision/recall/calibration metrics | **M** (introduced), extended in N–Q; 1.3.7 adds Brier/ECE metrics, but small crafted corpora are not production calibration |
| H-09 | Agent prompts, skill section and evaluation harness for hypothesis discipline | **L** |
| H-10 | Authorization record stored in research sessions and reports | **M** |

---

## Release history

### 1.3.10 — R-04, R-05, R-01 closure and Windows idle-helper fix (maintenance; no product patch)

- **Scope.** `unref` the persistent PowerShell helper and its pipes so an idle helper cannot keep the host process alive (F-84). `fast-check` property tests for the a.out, ELF and archive parsers and `summarizeVerneed` (R-04). Biome linter, `jscpd` and `knip` as CI gates (R-05); real findings fixed in `src` (unused catch binding, unused label, assignments in expressions, optional chains, one dead function). Stryker configuration on four pure modules, mutating the built `dist` files, with a manual `Mutation testing` workflow (R-01). New CI summary categories for the three gates.
- **Baseline.** Stryker baseline (Linux, Node 22, command runner, 679 mutants in `benchmark-stats`, `process-parse`, `legacy-linux-symver` and `legacy-linux-packages`): **47.72 %** (316 killed, 8 timed out, 355 survived); per module 67.95 / 22.27 / 65.09 / 31.07 %. Floor `thresholds.break` = 45. `jscpd`: 5 clones, 0.83 % duplicated lines, threshold 1.5 %. Survivors concentrate in `process-parse` and `legacy-linux-packages`.
- **Notes.** Stryker needs `tsconfigFile` pointed at a missing file because `typescript@7` has no JS API for its preprocessor; mutation results map to `dist`, not `src`. `knip` needs `KNIP_DISABLE_RAW_TRANSFER=1` on hosts with a limited virtual address space (set in the CI step). Biome lint covers `src` and `tests/*.ts`; the `.mjs` CI helpers are covered by their own tests.
- **Verification.** Full matrix green on commit `f85200e` before the tooling changes: Capabilities [43110447213](https://github.com/ecooorg/reverse/actions/runs/43110447213) (all six OS/Node cells and the package job), Structure [43110487271](https://github.com/ecooorg/reverse/actions/runs/43110487271), Supply chain [43111192808](https://github.com/ecooorg/reverse/actions/runs/43111192808) and Patch N Linux golden trials [43111237082](https://github.com/ecooorg/reverse/actions/runs/43111237082), all on commit `f85200e`. Diagnostics follow-up (no version change): the `Mutation testing` and `Patch N Linux golden trials` workflows now produce the same single artifact as the others (they had none, or only the bare Stryker JSON), every final artifact is named `<workflow>-<run id>` and contains `RUN-INFO.json`, and the failure brief always lists the run number next to the run id and URL. The first 1.3.10 matrix (run 43167151360) was red on all OS because `knip` ran before the build, so the tests' `dist` imports were unresolved and exports used only by tests were reported unused; `knip` now runs after the build. After that fix the 1.3.10 workflows are green on all OS: **Capabilities** [43167841716](https://github.com/ecooorg/reverse/actions/runs/43167841716) (commit `aee7343`; 6 environments darwin/linux/win32 × Node 22/24: 151 verified, 6 limitations confirmed, 0 drift, 0 failed on darwin and linux; 150/7/0/0 on win32), **Structure** [43167239605](https://github.com/ecooorg/reverse/actions/runs/43167239605) (commit `58ed786`), **Mutation testing** (manual Stryker run on Linux Node 22: **47.72 %**, 316 killed, 8 timed out, 355 survived of 679, identical to the local baseline; per module 67.95 / 22.27 / 65.09 / 31.07 %; floor 45 % held) and **Patch N Linux golden trials** (reported green by the maintainer; its log was not attached, so no run link is recorded). Structure and Capabilities ran on different commits of the same maintenance line.

### 1.3.9 — Windows persistent-helper protocol recovery (maintenance; no product patch)

- **Scope.** Correct the PowerShell helper source assembly to use actual line-feed characters, correct the stdout line framing to recognize LF/CRLF, and launch the persistent helper using PowerShell `-EncodedCommand` with UTF-16LE Base64 to avoid command-line quoting of multiline source. Add a platform-independent contract test for the encoded script and newline boundaries.
- **CI findings.** Capabilities run [43084133732](https://github.com/ecooorg/reverse/actions/runs/43084133732) identified the literal `\\n` sequence in the Windows helper source, which caused PowerShell parse errors and cascaded process/profiling/benchmark/MCP failures. The same run reported a Linux Node 22 timeout/cancellation result; the available failure brief does not identify its specific cause, so it remains open for the next `os: all` run and full log review.
- **Verification.** On Linux Node 22.16.0: `npm test` passes 124/124; direct capability suite passes 157/157; formatting (108 files), static quality, size, MCP docs, CI summary (12/12), and source/built structure checks pass. `npm ci` and the locked TypeScript 5.9.3 toolchain were not verified; the `npm run verify` wrapper did not finish within the local command window. Windows helper execution cannot be validated on this Linux host; R-19 Windows remains pending until the Windows matrix passes. No Patch O work is included.

### 1.3.8 — CI formatting recovery (maintenance; no product patch)

- **Scope.** Apply the repository TypeScript printer formatting to the ten files reported by Capabilities run [43079862360](https://github.com/ecooorg/reverse/actions/runs/43079862360). Change the manual summary job so it merges capability reports only when the capability matrix succeeded; when an upstream capability job fails before producing reports, the summary job records that reports are unavailable because the prerequisite failed, rather than generating a second misleading `No capability report found` failure.
- **Verification.** Local TypeScript printer check, size/quality/structure checks and CI summary tests are recorded in the delivery report. The locked npm toolchain and the required manual `os: all` rerun remain pending; no platform green is claimed.

### 1.3.7 — M/N cross-cutting audit increment (no new product patch)

- **Scope.** Extend the shared authorization/provenance gate to M/N calibration, execution-environment runs, works/fails matrices, behavior observation/capture/replay, preservation reports and migration advice; calibration manifests now reject embedded payloads and require hash/source/license for operator corpus entries; reports include authorization provenance; calibration reports include Brier score and five-bin expected calibration error alongside precision/recall.
- **Roadmap audit.** G-01…G-10 and H-03…H-10 are reconciled against actual M/N implementation. G-08 and the G-07 policy text are complete; H-05/H-10 enforcement is complete for current M/N APIs; the other requirements remain partial or open exactly as stated in the M/N capability matrix. No O functionality is started.
- **Verification.** Local Linux build and tests are recorded below; full `os: all` for 1.3.7 and Windows R-19 lifecycle verification remain pending.

### 1.3.6 — Post-N debt increment (no new product patch)

Closed the MCP documentation generation contract (R-07), implemented the persistent Windows PowerShell helper for CIM and benchmark sampling (R-19 Windows; Windows CI verification pending), Linux analysis untrusted-content wrapping with an adversarial ELF fixture (R-02 N portion), and golden Linux reference-trial expectations plus a manual workflow (R-15 N portion). Patch N remains historically closed at 1.3.5; Patch O has not started. Local Linux tests passed; Windows execution and the required manual `os: all` run remain pending.

### 1.3.5 — Patch N closed (old Linux compatibility) — 2026-11-11

- **Scope delivered.** Linux fields on the shared Target Profile; a.out and ELF32/64 inventory (PT_INTERP, DT_NEEDED, RPATH/RUNPATH, PIE/NX/RELRO hints); libc5/glibc/libstdc++ generation markers; calibration fixtures with a precision/recall harness; sourced libc, libstdc++, desktop and audio diagnosis tables; package metadata readers (RPM/DEB/makeself/gzip, static only); opt-in `readelf`, `objdump` and `lief` detect-only providers; qemu-user, chroot-rootfs and OSS-shim environments (unavailable when absent); behavior capture/replay helper on the shared sandbox; two reference trials on crafted lawful fixtures; verneed-oriented GLIBC/GLIBCXX summary; MCP `analyze_legacy_linux` behind the session authorization gate (61 tools).
- **Explicit limitations.** No old-Linux rootfs or licensed oracle bundled, so preservation stays L0 unless the operator supplies one; containers share the host kernel, so kernel-ABI faults need a VM; the verneed summary is a string-residue scan, not a full `SHT_GNU_verneed` structure walk; `goblin` is not wired; generation heuristics are calibrated only on crafted fixtures; Windows/macOS hard sandbox isolation is still not wired.
- **Carry-over as of the 1.3.5 close.** R-01 (Stryker), R-05 (linter, `knip`, `jscpd`), R-07 (MCP docs generated from one definition), R-19 Windows part (persistent helper) and `fast-check` property tests for the a.out/ELF/archive parsers (R-04) were open at 1.3.5. Post-N increments 1.3.6/1.3.7 subsequently close R-07 and implement R-19 Windows pending CI verification; R-01, R-05 and R-04 remain open. The closure date is unchanged (none may remain open past the exit of Q).
- **Verification.** `os: all` green on commit `b5ea3fa`:
  - Capabilities [43059743774](https://github.com/ecooorg/reverse/actions/runs/43059743774)
  - Structure [43059819947](https://github.com/ecooorg/reverse/actions/runs/43059819947)
  - Supply chain [43059851184](https://github.com/ecooorg/reverse/actions/runs/43059851184)
- **Version index.** 1.3.5 closes Patch N; next product patch is **O** (Classic Mac/early macOS) → 1.4.

### 1.2.0 — Patch M closed (Windows compatibility through 2010) — 2026-11-11

- **Scope delivered.** Target Profile + authorization gate; PE/NE/LE/LX/MZ detectors; sourced compatibility tables and diagnosis; calibration harness; Linux-first sandbox + Wine/DOSBox/QEMU adapters (detect-only when absent); behavior capture/replay; preservation L0–L3 (oracle rule); migration advisor; two reference trials on crafted lawful fixtures.
- **Explicit limitations.** No licensed Windows image/oracle bundled → preservation claims stay L0 unless the operator supplies an oracle; Windows/macOS hard isolation not implemented; some PE bound/out-of-window imports remain partial (CAPABILITIES).
- **Verification.** `os: all` green on commit `b66312e`:
  - Capabilities [43037232211](https://github.com/ecooorg/reverse/actions/runs/43037232211)
  - Structure [43037271948](https://github.com/ecooorg/reverse/actions/runs/43037271948)
  - Supply chain [43037302969](https://github.com/ecooorg/reverse/actions/runs/43037302969)
- **Version index.** 1.2.0 closes Patch M; next product patch is **N** (old Linux) → 1.3.



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
| 1.1.8 | Patch M Windows detector expansion | Patch M history |
| 1.2.0 | Patch M closed (Windows through 2010) | 2026-11-11; runs 43037232211 / 43037271948 / 43037302969 |
| 1.3.5 | Patch N closed (old Linux compatibility) | 2026-11-11; runs 43059743774 / 43059819947 / 43059851184 |
| 1.3.6 | Post-N debt increment: R-07, R-02 Linux, R-15 Linux, F-33/R-05 partial; R-19 Windows implemented pending CI | 2026-11-11; local Linux build/tests and structure gates; Windows CI and full `os: all` pending |
| 1.3.7 | M/N cross-cutting authorization, corpus policy, calibration metrics and roadmap audit | 2026-11-11; local Linux build/tests; full `os: all` and Windows R-19 verification pending |
| 1.3.8 | CI formatting recovery and capability-report aggregation guard | 2026-11-11; local format/quality/structure checks and 123 unit tests; locked toolchain and full `os: all` rerun pending |
| 1.3.9 | Windows persistent PowerShell helper protocol recovery | 2026-11-11; local helper-script contract test; Windows verified later by the matrix on `f85200e` |
| 1.3.10 | R-04, R-05, R-01, R-19 Windows, F-80–F-84 closure; documentation sync | 2026-11-12; final green matrix on `78a47fd`: Capabilities 43172993614, Structure 43173076031, Mutation 43173019792 (47.72 %), Golden 43173044415, Supply chain 43173096703 |
| 1.3.11 | O step 0: F-08 macOS + R-19 macOS (`ps -p` single-PID path, `pgrep -P` children; no native libproc) | 2026-11-12; format gate red on first matrix |
| 1.3.12 | O step 0 format fix; Status/docs aligned to 1.3.12 | 2026-11-12; Capabilities 43195327371 format green, docs checks updated |
| 1.3.13 | O step 1: Mac Target Profile fields + analyze_legacy_mac (Mach-O/PEF/AppleDouble) | 2026-11-12 |
| 1.3.14 | O steps 2–3 slice: Mac calibration, MacBinary/BinHex/HFS/archive, Info.plist, PIE, R-04 property tests | 2026-11-12 |
| 1.3.15 | Fix: unused cpuName, line-length in Mac tests/suite | 2026-11-12 |
| 1.3.16 | O step 4: sourced Mac diagnosis tables (G-01 Mac) | 2026-11-12 |
| 1.3.17 | O step 5 + residual step 3: Mac emulators detect-only; PEF/CODE/HFS depth; lint/mcp fixes | 2026-11-12 |
| 1.3.18 | Format gate: TypeScript printer on Mac/env sources; EngineKind split for line length | 2026-11-12 |
| 1.3.19 | Fix Mach-O endian (CIGAM=LE), MH_PIE flags, HFS signature size threshold |
| 1.3.20 | Docs/version sync; unique MCP legacy tool sentences; roadmap State as of |
| 1.3.21 | O step 6 slice: Mac behavior capture/replay; ROM fingerprint; AGENTS CI anti-regression |
| 1.3.22 | Residual O inventory: PEF loader strings; HFS catalog extent; dynamic Roadmap version check |
| 1.3.23 | Toolbox A-line trap detector; fix Mac tests using non-exported formatEvidence |
| 1.3.24 | O residual max: HFS B-tree walk, named traps, PEF imports, Mac reference trials, disk hash diff |
| 1.3.25 | Split legacy-mac parsers (size gate); Mac works/fails matrix (unsupported without ROM) |
| 1.4.0 | **Patch O closed** — Classic Mac / early macOS; residuals documented |
| 1.4.1 | Wire diffDiskImageHashes into tests (knip unused export) |
| 1.4.2 | ROADMAP status table O done; suite no longer expects O in progress |
| 1.5.0 | **Patch P start** — steps 0–1: `analyze_legacy_android`, Audit 27 debt register |
| 1.5.1 | P step 2: AXML minSdk/targetSdk hints; android calibration fixtures |
| 1.5.2 | P step 3: android-api-behavior / runtime diagnosis tables; lint useConst |
| 1.4 / 1.5 / 2.0 | Patches O / P / Q (planned) | — |

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


## Debt register (1.4.2 / Audit 27)

Authoritative narrative: **Audit 27**. Summary:

- **Open:** F-83 (observe), F-86 (dev npm audit), F-88 (record O `os: all` run ID), R-10/R-11/R-20 residuals, Linux verneed/goblin gaps, O-R1…O-R8, shared G/H partials.
- **Closed:** F-87 (CAPABILITIES header drift) in 1.5.0 docs; F-08/R-19 macOS; Patch O product scope at 1.4.0.
- **Backlog product:** Patch P (in progress), Patch Q (not started).
