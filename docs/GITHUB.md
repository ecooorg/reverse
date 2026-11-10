# Publish Reverse to GitHub

1. Create an empty repository named `reverse` under your GitHub account or organization. Do not initialize it with a README, license, or `.gitignore` because this project already contains them.
2. From the project directory, install dependencies and verify the build:

   ```bash
   npm install
   npm test
   ```

3. Initialize and commit:

   ```bash
   git init
   git add .
   git commit -m "Initial Reverse compact analysis core"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/reverse.git
   git push -u origin main
   ```

4. In GitHub, review repository visibility, description, topics (`typescript`, `nodejs`, `mcp`, `benchmarking`, `reverse-engineering`, `performance-analysis`), and security settings.
5. Replace `YOUR-USERNAME` references in README and documentation with the real owner/repository.
6. CI is already provided by `.github/workflows/capabilities.yml` (Node.js 22/24 on Linux, macOS and Windows) and `.github/workflows/structure.yml`. Add a release workflow, issue templates, and CODEOWNERS before tagging a public release.
7. Create a version tag only after tests pass: `git tag v0.1.0 && git push origin v0.1.0`.

Never commit private binaries, benchmark data containing sensitive paths, credentials, `.env` files, or local `.reverse` evidence. Review `git diff --cached` before committing.

## Saving GitHub Actions minutes

Linux minutes count 1x, Windows 2x and macOS 10x; public repositories are not charged, private ones get a monthly allowance. The workflows are tuned for that:

- **Triggers.** Pushes run only on `main` and `develop`; every other branch is checked through its pull request. Changes that touch only documentation no check reads (`README.md`, `AGENTS.md`, `docs/BENCHMARKS.md`, `docs/GITHUB.md`, `docs/SECURITY.md`, `.gitignore`) skip `capabilities.yml`. `docs/MCP.md`, `docs/CAPABILITIES.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md` and `docs/AUDIT.md` are deliberately not skipped because the capability suite compares them with the real tool list, the provider list and the delivered state of patches A–D. `structure.yml` has no path filter, so Markdown links are still checked on documentation-only changes. If a branch protection rule requires `capabilities` checks, a skipped workflow stays "pending"; either do not require them or remove `paths-ignore`.
- **Automatic runs are minimal.** A push to `main`/`develop` or a pull request starts one Linux job on Node 22 (unit tests, capability suite, report). `structure.yml` adds a few seconds of Linux. Nothing runs on macOS or Windows by itself, and there is no scheduled run.
- **Extended runs are manual.** Open Actions → Capabilities → Run workflow and choose `os`: `all` runs Linux, macOS and Windows on Node 22/24, then the package check (Linux and Windows) and the merged capability matrix; `ubuntu-latest`, `windows-latest` or `macos-latest` limits it to one system. Run `all` before tagging a release or declaring a patch done; run a single system when only that platform is in question.
- **Cancellation.** `concurrency` cancels a superseded run of the same workflow, event type and ref, so a manual run is never cancelled by a later push.
- **Time limits.** Every job has a `timeout-minutes` limit instead of the 6-hour default.
- **Caching and duplicate work.** `actions/setup-node` caches npm; `npm ci --ignore-scripts` avoids a second TypeScript build from the `prepare` hook; the old `ci.yml` was merged into the Linux cells because it installed and built the same code again.
- **Skip a run.** Put `[skip ci]` in a commit message for changes that need no verification.

## Diagnostics in the workflows

Every workflow (`Capabilities`, `Structure`, and `Supply chain`) publishes two downloadable artifacts on success or failure:

- **`<workflow>-detailed-logs` / merged workflow log artifact** — GitHub stores the uploaded artifact as a ZIP download. It contains captured command output, per-step exit markers, job summaries, and workflow-specific reports where available. Retention is 14 days.
- **`<workflow>-ai-debug-summary`** — a standalone `AI-DEBUG-SUMMARY.md` artifact. It records the workflow/run/commit/runner identity, the step log inventory, recorded failures and matching error-like lines, plus instructions for an AI assistant to identify the earliest failure and request only a specific missing log if needed. It can be pasted directly into a chat without uploading the full archive.

`tests/ci-ai-summary.mjs` creates the standalone summary from `ci-logs/`; run it locally with `npm run ci:summary` after producing CI-style logs. Run `npm run ci:summary:test` to execute the deterministic regression suite; each workflow runs that test in a separate always-run step before generating the report, so a regression-test failure does not suppress the diagnostic artifact. The report distinguishes explicit exit code 0, recorded non-zero exits, invalid markers and missing exit markers (which may mean success or a skipped step; they are not silently treated as confirmed successes). Classification gives concrete TypeScript/runtime/assertion/TAP evidence precedence over incidental words such as “formatting” in a test description. Failed TAP test names, commands, file/line references, stack frames, capability JSON failures/drift and JUnit failures are included when present. When multiple sources describe the same failure, use the exact check/test names and details to correlate them rather than treating every annotation or report row as a separate root cause. Common token/secret patterns are redacted; empty logs and unfamiliar error formats are handled safely. The summary is a diagnostic evidence digest, not a substitute for raw logs or actual test results. Do not put secrets or target data in CI output.


- Every capability job writes a **job summary** (stored in that artifact, not shown on the run page) (runner facts, totals, failed checks, the ten slowest checks, limitations and drift of that platform), emits an annotation for each failed check and for any check slower than 60 s, and keeps the capability JSON plus the JUnit XML (per-check durations) inside the single per-workflow artifact. A single check that hangs is reported by name after 240 s instead of ending the job at its timeout.
- `structure.yml` keeps the checker output in the single per-workflow artifact and in the job summary, and prints warnings (never failures) for CRLF files, tracked build output, archives, possible secret files and folders deeper than the layout allows. A manual run can choose one OS or all three.
- Actions are pinned to major versions that run on Node 24 (`checkout@v5`, `setup-node@v5`, `upload-artifact@v6`, `download-artifact@v7`); the Node 20 deprecation warning seen in older logs came from `checkout@v4`.

- **Quiet console and downloadable diagnostics.** Command output is captured under `ci-logs/`; per-workflow upload steps run with `if: always()` so failures still produce diagnostics. `Capabilities` and `Structure` merge job parts into one detailed-log artifact; `Supply chain` uploads its detailed logs directly. Each also publishes `AI-DEBUG-SUMMARY.md` as a separate artifact. The artifact download is a ZIP; the summary is a plain Markdown file. Re-run `node tests/ci-quiet.mjs .github/workflows/*.yml` after adding a step to an unwrapped workflow and ensure it is captured.
