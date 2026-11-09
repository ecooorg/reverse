# AGENTS.md — rules for AI assistants working on Reverse

Reverse is a compact, local-first analysis core (CLI plus MCP stdio server) that gives an AI research agent verifiable facts about programs and processes. Everything below applies to every assistant that changes this repository.

## 1. Start here: read `docs/ROADMAP.md` first

Before reading code or making any change:

1. Read `docs/ROADMAP.md` from the top. Its first section is the delivery plan (patches A–K, then L and the legacy track M–P after 1.0; the track follows the platform-wave order: Windows up to 2010, old Linux, old Mac, old Android, then the newer generations): find the patch you are working on, what it closes, what it depends on, and its status. Do not start work that belongs to a later patch, and do not skip a dependency.
2. Read the newest audit at the top of `docs/AUDIT.md`: findings addressed by your patch must be closed there (`Status: closed in <version>, <patch>`). Then read `docs/ARCHITECTURE.md` (what is implemented versus planned), `docs/CAPABILITIES.md` (what really works), `docs/MCP.md` and `docs/SECURITY.md`.
3. If the user's request is not covered by the roadmap, say so and ask whether to add it to the roadmap before building it.
4. Audit tasks are project tasks: the "Approved audit backlog" table in the roadmap lists every finding and recommendation with its patch. Work the rows of your patch, and close the matching findings in `docs/AUDIT.md`. A new audit is added at the top of `docs/AUDIT.md` and its IDs are appended to that table in the same change.
5. When a patch is done, update the roadmap in the same change: mark the patch (and the checklist items it closes) done, add its release section, and move the matching items in `ARCHITECTURE.md` from *planned* to *implemented*.

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
- Legacy-track work (patches M–P) is for open-source software or software with the full consent of its developers and rights holders. Do not add features that bundle third-party binaries or proprietary code, and do not upload targets or corpus lookups.
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
- Every operation returns the `Result` envelope from `src/core-types.ts` with honest `status`, `coverage`, `limitations` and `errors`. Return `partial` instead of throwing for bad input files or an absent process; throw only for programmer errors such as an invalid PID.
- Cross-platform from the start: Linux, macOS and Windows. Do not add POSIX-only or Windows-only code without a branch for the other systems or a recorded limitation. Use `path`, never hard-coded separators.
- Keep functions small and readable. Do not add clever one-line code; the older dense files may be reformatted only when you are changing them anyway.
- Do not add tests that depend on timing luck. Prefer deterministic fixtures, generous timeouts, and polling with a deadline.

## 8. Naming

The product is **Reverse**. CLI command `reverse`, npm package `reverse-compact`, environment variables `REVERSE_*`, local store `~/.reverse`. Never reintroduce the former name or its old identifiers anywhere in code, docs, tests or workflows. MCP server name is `reverse`.

## 9. Working with the user

- Answer in the user's language; keep repository files (code, comments, docs, commit messages) in English.
- Say what you are going to do in one sentence, do it, then report briefly: what changed, how it was verified, what was not verified, the next natural step. Do not narrate every step.
- Ask a question only when the answer changes what you build and cannot be decided from the roadmap, the code or sensible defaults. Otherwise decide, and state the decision.
- If you discover a defect outside the current patch, do not silently fix it and do not hide it: report it, and propose where it belongs in the roadmap (or add a check that records it as ⚠️ drift).
