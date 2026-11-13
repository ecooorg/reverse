# AGENTS.md — rules for AI assistants working on Reverse

Reverse is a compact, local-first analysis core (CLI plus MCP stdio server) that gives an AI research agent verifiable facts about programs and processes. Everything below applies to every assistant that changes this repository.

## 1. Start here: read `docs/ROADMAP.md` first

Before reading code or making any change:

1. Read `docs/ROADMAP.md` from the top. It opens with *Status at a glance* (current version, active patch, next step, what is unverified), then the delivery plan (patches A–L as the completed 1.0 foundation, then the single sequential product plan M–Q: Windows through 2010, old Linux, Classic Mac/early macOS, legacy Android, then newer generations plus unified compatibility intelligence), then *Active work* with the working checklist of the current patch (Patch M today) and the *Carry-over debt register*: find the patch you are working on, what it closes, what it depends on, and its status. Do not start work that belongs to a later patch, and do not skip a dependency. M–Q are the only future product patch units; do not invent parallel tracks, platform-wave sub-patches or cross-cutting patch families. Internal tasks are not roadmap patches.
2. Read the newest audit at the top of `docs/AUDIT.md`: findings addressed by your patch must be closed there (`Status: closed in <version>, <patch>`). Then read `docs/ARCHITECTURE.md` (what is implemented versus planned), `docs/CAPABILITIES.md` (what really works), `docs/MCP.md` and `docs/SECURITY.md`.
3. If the user's request is not covered by the roadmap, say so and ask whether to add it to the roadmap before building it.
4. Audit tasks are project tasks: the "Approved audit backlog" table in the roadmap lists every finding and recommendation with its patch. Work the rows of your patch, and close the matching findings in `docs/AUDIT.md`. A new audit is added at the top of `docs/AUDIT.md` and its IDs are appended to that table in the same change.
5. When a patch is done, update the roadmap in the same change: mark the patch (and the checklist items it closes) done, add its release section and its row in the version index, update *Status at a glance* and the debt register, and move the matching items in `ARCHITECTURE.md` from *planned* to *implemented*. After every delivered increment (not only at patch end) tick the checklist items it closes, so the roadmap always shows where the project stands. Use the roadmap's status vocabulary (done, in progress, not started, open, partial, pending verification) and never tick an item without code and a passing check.
6. Keep one source of truth: status lives in `docs/ROADMAP.md`; do not repeat a different status in README, CAPABILITIES or ARCHITECTURE. Documentation-only maintenance is not a product patch and gets an audit entry (new IDs appended to the backlog) but no patch letter.

## Version number after every delivered increment

The third numeric component of the product version tracks **delivered work steps**, not only public releases.

- Form: `MAJOR.MINOR.STEP` during an active product patch (example while Patch M is in progress: `1.1.0` → `1.1.1` → … → `1.1.5` after step 5).
- **Every** product increment that lands on `main` (each work-order step of M–Q, or any other shipped change set) MUST bump that step digit and update **all** of these in the same change:
  - `package.json` (`version`)
  - `src/core-version.ts` (`VERSION`)
  - `server.json` (`version` and any nested package version fields)
  - `package-lock.json` if it embeds the package version
  - `docs/ROADMAP.md` *Status at a glance* and the version index when the roadmap requires it
- Do **not** leave a stale prerelease label such as `1.1.0-beta.2` after later steps have been delivered; the version string is how the owner and the next assistant see progress at a glance.
- A finished product patch (M done → release **1.2.0**, etc.) advances MINOR (or MAJOR) per the roadmap release record; until then, keep incrementing the step digit.
- Capability check `Package / one version everywhere` must stay green after the bump.

## 2. Repository layout is flat — keep it flat

- At most **one level of folders**: `src/`, `tests/`, `docs/`, plus `.github/workflows/` as the single permitted exception. Never create nested folders anywhere else, and never add a new top-level folder without the user's approval.
- Source files are named `<area>-<name>.ts` (for example `analysis-binary.ts`, `process-tree.ts`) and are imported as `./area-name.js` (ESM with the `.js` suffix). Do not recreate subfolders.
- Run `node tests/check-structure.mjs` (and `--built` after a build). It checks the flat layout, Markdown links, the import graph and the `package.json` targets. It must pass.

## 3. Deliver work as a patch: only new and changed files, with their paths

- A patch is an archive (zip) that contains **only the files that are new or changed**, stored with their full repository-relative paths (`src/process-tree.ts`, `docs/ROADMAP.md`, `.github/workflows/capabilities.yml`). The user unpacks it over the repository.
- Do not include unchanged files, `node_modules/`, `dist/`, `dist-tests/`, temporary directories, or files that merely differ in line endings or formatting. Include `package-lock.json` only if dependencies or the package name/version changed.
- Build the file list by comparing the final tree with the pristine baseline you started from (for example `diff -rq`), and check that the archive lists exactly that set.
- Files that were deleted or renamed cannot travel inside an archive: list them explicitly in your reply ("delete: …").
- Name the archive after the work, for example `patch-a-defect-closure.zip`. One patch per roadmap patch letter; do not mix unrelated changes.
- Deliver the archive to the user as a file and describe it in two or three sentences: what changed, what was verified, what was not.

## 3.0 Owner environment (mandatory)

The repository **owner has only GitHub’s website on an Android tablet**. There is **no PC terminal**, no local Node/npm, and no way to run CLI checks on the owner’s side.

Consequences for every assistant:

1. **Do not** tell the owner to run `npm ci`, `npm test`, `npm run verify`, format/lint commands, or any other local shell steps as if they could execute them. Those commands are for CI and for assistants with a sandbox — not for the owner.
2. Patches are **uploaded by hand** into GitHub (web UI). Deliver a zip of only changed paths; the owner applies it and relies on **GitHub Actions**.
3. **All** verification that matters must be encoded in **tests and workflows** already in the tree (`npm test`, capability suite, format/size/lint gates, Nightly Full Verification). If a check is required for the patch to be safe, add or extend an automated test/workflow in the same change — do not leave it as an owner-side instruction.
4. When reporting status, cite **Actions run IDs** and what the workflows proved. “Run this locally” is not an acceptance path for the owner.
5. Optional: a short note “assistants with a sandbox should still run X before packing” is fine; never present it as something the owner must do.

## 3.1 Recurring CI failure modes (do not reintroduce)

These failed on real Capabilities runs during Patch O. Fix the product or the check; never weaken gates.

### Formatting and line length

- After **any** edit under `src/` or `tests/` that touches `.ts`, run the TypeScript **5.9.x printer** (the same one as `tests/format-check.mjs`) so the on-disk text matches `printer.printFile`. Hand-edited or partially merged files cause `TypeScript formatting drift`.
- Keep every line ≤ **140** characters **after** printing. Long union types must be split into intermediate aliases (see `WindowsEngineKind` / `MacEngineKind`); the printer will re-collapse a single long union.
- Do not put control characters in regex literals (`\x00…`); biome `noControlCharactersInRegex` fails the lint gate. Prefer `Buffer` index checks or string includes with real `\0` only if necessary, and keep regexes free of control escapes.

### Version single source

- When a product patch is **closed**, the M–Q status table row must say **done** (with the release), never `in progress`.
- The Roadmap consistency capability check must read the version **from `package.json`** (no hardcoded third digit in the suite regex). Bump **together** in one patch: `package.json`, `package-lock.json` (root entries), `server.json`, `src/core-version.ts`, `docs/ROADMAP.md` (`State as of **X.Y.Z**` and the status table), and any **hardcoded** `assert.equal(pkg.version, '…')` / `State as of` regex in `tests/capabilities-suite.ts`.
- Leaving suite hardcodes on an old third digit (e.g. still matching `1.3.14` after `1.3.20`) fails the Roadmap consistency check even when the product is fine.

### MCP tool docs uniqueness

- Capability docs checks reject **repeated full sentences** in `docs/MCP.md`. When two tools share a constraint (authorization, no execution), **rephrase** each row so the sentence is unique. Keep `tools/list` descriptions in `src/mcp-tools-*.ts` aligned with the same wording.
- After editing the tool switch in `mcp-server.ts`, verify every `case` remains inside the `switch` and that research tools were not left as bare string labels outside it.

### Mac / Mach-O / HFS detector rules

- `LegacyMacFinding` exposes evidence via **`structuralDetectors[].evidence`** and Target Profile fields. There is no public `formatEvidence` array on the finding — tests must not call `.join` on undefined fields.
- Read the first four bytes as **big-endian** for magic classification. **`MH_CIGAM` / `MH_CIGAM_64` means a little-endian object file**; `MH_MAGIC` / `MH_MAGIC_64` means big-endian. Flags and load commands use that same endian. Getting this inverted fails endian assertions and suppresses `mach-o-pie`.
- HFS/HFS+ signature checks need only **1024 + 2** bytes (`BD` / `H+` / `HX` at offset 1024). Do not require a full MDB before recognizing the volume kind; deeper fields stay optional.
- Crafted fixtures used by unit and calibration tests must stay consistent with these thresholds and endian rules. Prefer running `node --test dist-tests/legacy-mac*.js` (or the package test script) **before** push when Mac detectors change.

### Local loop before push

- Preferred: `npm ci`, `npm run build`, `npm test`, then `node tests/format-check.mjs` and the capability suite area you touched. If the environment cannot complete `npm ci`, at least run the TypeScript printer over every changed `.ts` and a pure-Node simulation of buffer fixtures for endian/signature logic.
- Do not claim a green full matrix without the manual `workflow_dispatch` / `os: all` run described in the definition of done.

## 4. Definition of done (the capability gate)

A change is finished only when all of these hold, and you have actually run them:

1. `npm ci`, `npm run build`, `npm test` — all pass.
2. `npm run verify` (the capability suite `tests/capabilities.check.ts`) — **no ❌ and no ⚠️ in the area you touched**. For every limitation (🚧) your change removes, rewrite that check so it asserts the new behavior and shows ✅. New capabilities get new checks. A check must be able to fail: prove it by showing it fails against the old code or a deliberate mutation.
3. `node tests/check-structure.mjs --built` passes.
4. MCP and CLI stay backward compatible: existing tool names, arguments and commands keep working. Tools listed in `docs/MCP.md` must match `tools/list` exactly.
5. Documentation is updated in the same change (`README.md`, `docs/*.md`, help text). The package version is bumped according to the roadmap, and `src/core-version.ts`, `package.json` and `package-lock.json` agree.
6. The workflow `.github/workflows/capabilities.yml` is green on Linux, macOS and Windows (Node 22 and 24). To save paid runner minutes, a push or pull request runs only one Linux job (Node 22); the full matrix and the package check are started by hand (Actions → Capabilities → Run workflow, `workflow_dispatch`). Before declaring a patch done, run that manual workflow with `os: all`. If you could only run Linux locally, say so explicitly; never claim macOS or Windows results you did not see.

Never weaken, skip or delete a test or a check to make a run pass. If a check is wrong, fix the check and explain why. If the product is wrong, fix the product.

## 5. Honesty rules (the most important section)

- Never describe a capability as implemented unless code and a passing check prove it. Planned work stays labeled *planned* in docs, help text, tool descriptions and `limitations` arrays.
- An external engine (Ghidra, Rizin, Frida, GDB, perf, eBPF, ETW, Instruments, Valgrind) is reported as available only when its executable and runtime are actually detected. Never fake output from a tool that is absent.
- Do not invent measurements, benchmarks, versions, hashes or sources. Every finding carries its source, time, coverage and limitations. Keep the four fact categories apart: measured, statically derived, AI hypothesis, confirmed optimization.
- Analogies, intuition and AI guesses are hypotheses. Never present one as a measured or static fact, never store one as evidence, and never raise a preservation level because of one. Code without an oracle stays at L0.
- Legacy product work (patches M–Q) is for open-source software or software with the full consent of its developers and rights holders. Do not add features that bundle third-party binaries or proprietary code, and do not upload targets or corpus lookups.
- Never claim a speedup from one lower mean, a smaller report or less data sent to the model. Improvements need repeated measurements, comparable environments and passing validation.
- When docs and behavior disagree, fix whichever is wrong in the same change and add a check so the drift cannot return.

## 6. Safety rules

- Commands are run without a shell (`spawn(command, args)`), always with a timeout, capped output and tree-wide termination. Never build a command line from untrusted strings.
- Reverse is observational by default: it must not patch binaries, inject into processes, or kill arbitrary processes. Anything that changes a target needs the explicit operating mode and permission planned in the roadmap (`READ_ONLY` is the default).
- Never upload target binaries or data anywhere. No telemetry. No network calls from the core.
- Never write secrets, tokens, private paths or user data into the repository, logs, tests or evidence. Tests use temporary directories and `REVERSE_HOME`, never the real home directory, and must clean up every child process they start.
- Do not commit private binaries or benchmark data. Do not run destructive commands (`rm -rf` outside your own temporary directories, `git reset --hard`, force-push) without the user's explicit request.

## 7. Engineering rules

- TypeScript `strict`, ESM, Node 22 or newer, **zero runtime dependencies**. Adding a dependency needs a written justification and the user's approval; devDependencies are acceptable when needed for build or tests.
- Own code stays compact (target 20–30 thousand lines, never above 50 thousand). Do not reimplement what a specialist tool does (disassembler, debugger, instrumentation); wrap it behind an `AnalyzerProvider`. Never remove evidence, validation or safety code just to save lines.
- Source size gate (`tests/size-gate.mjs`, run by the capability suite and CI): each file under `src/` is limited to **1000 lines**, the total of all `src/` files to **50 000 lines**, and every source or test line to **140 characters**. These limits are enforced; raise them only with an explicit roadmap decision when a parser or table legitimately needs more room.
- Every operation returns the `Result` envelope from `src/core-types.ts` with honest `status`, `coverage`, `limitations` and `errors`. Return `partial` instead of throwing for bad input files or an absent process; throw only for programmer errors such as an invalid PID.
- Cross-platform from the start: Linux, macOS and Windows. Do not add POSIX-only or Windows-only code without a branch for the other systems or a recorded limitation. Use `path`, never hard-coded separators.
- Keep functions small and readable. Do not add clever one-line code; the older dense files may be reformatted only when you are changing them anyway.
- Do not add tests that depend on timing luck. Prefer deterministic fixtures, generous timeouts, and polling with a deadline.

## 8. Naming

The product is **Reverse**. CLI command `reverse`, npm package `reverse-compact`, environment variables `REVERSE_*`, local store `~/.reverse`. MCP server name is `reverse`.

## 9. Working with the user

- Answer in the user's language; keep repository files (code, comments, docs, commit messages) in English.
- Say what you are going to do in one sentence, do it, then report briefly: what changed, how it was verified, what was not verified, the next natural step. Do not narrate every step.
- Ask a question only when the answer changes what you build and cannot be decided from the roadmap, the code or sensible defaults. Otherwise decide, and state the decision.
- If you discover a defect outside the current patch, do not silently fix it and do not hide it: report it, and propose where it belongs in the roadmap.
