# Security model and safe use

Reverse is a local inspection tool, not a sandbox. It runs with the permissions of the current user.

## Safe defaults

- Binary and source inspection are read-only.
- Process inspection is observational and limited to data exposed by the OS.
- No target is uploaded to an external service.
- Benchmark and validation commands are explicitly supplied by the caller and run without a shell (`spawn(command, args)`).
- Threat model: the AI agent that calls MCP tools is an **untrusted caller**, and data from targets (output, file names, strings) may contain prompt injection. Command-running MCP tools are therefore off unless the operator sets `REVERSE_MODE=CONTROLLED_EXECUTION` with `REVERSE_COMMAND_ALLOWLIST` (optional `REVERSE_CWD_ROOT`); children get an allowlisted environment, so tokens of the parent are not passed on. Still open: sandboxing of executed targets (patch G). Since 0.2.0-beta.5 every MCP result carries an `untrustedContent` marker (notice, string cap, count of truncated strings) and strings longer than 4096 characters are cut; tool descriptions never contain target data. This reduces, but cannot eliminate, prompt-injection risk: the client must still treat result text as data.
- Command duration is bounded; output capture is capped at exactly 1 MiB (bytes) per stream (excess output is dropped and the run is flagged `stdoutTruncated` / `stderrTruncated`).
- Reverse does not patch binaries, change target configuration, inject into processes, or kill arbitrary target processes.

## Operator responsibilities

Only inspect software and processes you own or are authorized to examine. Treat binaries and their output as untrusted. Run benchmarks in a disposable working directory or OS sandbox where practical. Do not pass untrusted command strings or arguments. A timeout terminates the spawned child and every process it started (the process tree is snapshotted first; on Windows `taskkill /T /F` is used), but a process that escapes its parent before the snapshot cannot be found. CPU/RAM quotas are not enforced. Avoid elevated privileges.

## Authorized use and scope (policy binding now; enforcement planned in patch M)

The purpose of the legacy track is to help developers and rights holders restore old programs that no longer work. Reverse is therefore to be used only with:

1. **open-source software**, in accordance with its license; or
2. **software whose developers and rights holders have given full consent** to the analysis and to any resulting repair, repackaging or rework.

Anything else is outside the intended use. The operator declares the basis; Reverse records the declaration in the research session and in reports (patch M, H-05, H-10) and cannot verify legal status. The general rule for the core, to inspect only software you own or are authorized to examine, still applies to everything else.

Further rules:

- Reverse reports copy protection, dongles and license checks as facts and does not defeat them.
- Operating-system images and commercial tools are supplied by the user under their own licenses and are never bundled.
- **Corpus policy:** Reverse bundles no third-party binaries or proprietary code. A similarity corpus holds only hashes and signatures of open-source or consented material, with source and license per entry, and is queried locally. Nothing is uploaded.
- **Generated code:** code produced by generative reconstruction carries a provenance record and must be compatible with the license or consent of the analyzed target.
- **Prompt injection:** strings, resources and metadata taken from a target are untrusted input to any model, including hypothesis and similarity results (R-02).

Until patch M implements the authorization record, this section is the binding summary and nothing in it is enforced by code.

## Known security gaps

- No general OS sandbox, network isolation, or filesystem allowlist. Linux cgroup v2 CPU/memory limits are available only through the explicit scoped `withProcessResourceLimits` API on delegated hierarchies; no Windows Job Object or macOS hard-quota adapter exists.
- Process listing and sampling remain subject to host permissions and unavoidable races between OS reads and subsequent operations. Start-time identity checks reduce, but cannot mathematically eliminate, PID-reuse races. Linux/macOS ownership is checked by UID; Windows ownership is currently unknown.
- MCP stdio assumes a trusted local client. There is no authentication layer.
- Evidence JSON is not signed or tamper-evident.
- The cgroup resource-control API requires `CONTROLLED_EXECUTION` and an explicit `confirm: true`; it is scoped to a callback and attempts to restore the original cgroup on exit. Path allowlists and broader approval gates for experiments remain planned.

Report vulnerabilities privately to the repository maintainer. Do not publish exploit details before a fix is available.
