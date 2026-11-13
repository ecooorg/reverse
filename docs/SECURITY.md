# Security model and safe use

Reverse is a local inspection tool, not a sandbox. It runs with the permissions of the current user.

## Safe defaults

- Binary and source inspection are read-only.
- Process inspection is observational and limited to data exposed by the OS.
- No target is uploaded to an external service.
- Benchmark and validation commands are explicitly supplied by the caller and run without a shell (`spawn(command, args)`).
- Threat model: the AI agent that calls MCP tools is an **untrusted caller**, and data from targets (output, file names, strings) may contain prompt injection. Command-running MCP tools are therefore off unless the operator sets `REVERSE_MODE=CONTROLLED_EXECUTION` with `REVERSE_COMMAND_ALLOWLIST` (optional `REVERSE_CWD_ROOT`); children get an allowlisted environment, so tokens of the parent are not passed on. Dynamic attach (Frida/GDB) and profiler sampling require `CONTROLLED_EXECUTION` (patches G–H). Linux bwrap/unshare sandbox for executed targets is available when present (R-20 partial); Windows/macOS hard isolation remains open. Since 0.2.0-beta.5 every MCP result carries an `untrustedContent` marker (notice, string cap, count of truncated strings) and strings longer than 4096 characters are cut; tool descriptions never contain target data. This reduces, but cannot eliminate, prompt-injection risk: the client must still treat result text as data.
- Command duration is bounded; output capture is capped at exactly 1 MiB (bytes) per stream (excess output is dropped and the run is flagged `stdoutTruncated` / `stderrTruncated`).
- Reverse does not patch binaries, change target configuration, inject into processes, or kill arbitrary target processes.
- `REVERSE_MODE=OBSERVE` restricts process sampling to targets whose ownership is verified; it does not enable command execution (only `CONTROLLED_EXECUTION` does).
- A hypothesis is promoted only by evidence whose content supports it (passed validation or an `improved` benchmark verdict, sufficient confidence, intact hash); an agent cannot promote by attaching arbitrary evidence.

## Operator responsibilities

Only inspect software and processes you own or are authorized to examine. Treat binaries and their output as untrusted. Run benchmarks in a disposable working directory or OS sandbox where practical. Do not pass untrusted command strings or arguments. A timeout terminates the spawned child and every process it started (the process tree is snapshotted first; on Windows `taskkill /T /F` is used), but a process that escapes its parent before the snapshot cannot be found. CPU/RAM quotas are not enforced. Avoid elevated privileges.

## Authorized use and scope (M/N enforcement; future platform operations inherit the same gate)

The purpose of the legacy track is to help developers and rights holders restore old programs that no longer work. Reverse is therefore to be used only with:

1. **open-source software**, in accordance with its license; or
2. **software whose developers and rights holders have given full consent** to the analysis and to any resulting repair, repackaging or rework.

Anything else is outside the intended use. The operator declares the basis; Reverse records the declaration in the research session and in reports and cannot verify legal status. The general rule for the core, to inspect only software you own or are authorized to examine, still applies to everything else.

Further rules:

- Reverse reports copy protection, dongles and license checks as facts and does not defeat them.
- Operating-system images and commercial tools are supplied by the user under their own licenses and are never bundled.
- **Corpus policy:** Reverse bundles no third-party binaries or proprietary code. Calibration manifests reference local files; operator entries require SHA-256, source and license, and reject embedded payload fields. Similarity corpora hold only hashes and signatures of open-source or consented material, with source and license per entry, and are queried locally. Nothing is uploaded.
- **Generated code:** code produced by generative reconstruction carries a provenance record and must be compatible with the license or consent of the analyzed target.
- **Prompt injection:** strings, resources and metadata taken from a target are untrusted input to any model, including hypothesis and similarity results (R-02).

M/N legacy APIs now require a declared basis for Windows/Linux static analysis, calibration, execution-environment runs, works/fails matrices, behavior observation/capture/replay, preservation reports and migration advice. The authorization record is included in the corresponding result. This is a declaration only; Reverse does not validate the document, license compatibility, identity, or legal status. Patches O–Q must extend the same gate to every new legacy operation; no platform receives a weaker policy.

## Known security gaps

- Linux bwrap/unshare sandbox for executed targets when the binary is present (R-20 partial); no general network isolation or filesystem allowlist on Windows/macOS. Linux cgroup v2 CPU/memory limits are available only through the explicit scoped `withProcessResourceLimits` API on delegated hierarchies; no Windows Job Object or macOS hard-quota adapter exists.
- Process listing and sampling remain subject to host permissions and unavoidable races between OS reads and subsequent operations. Start-time identity checks reduce, but cannot mathematically eliminate, PID-reuse races. Linux/macOS ownership is checked by UID; Windows ownership is currently unknown.
- MCP stdio assumes a trusted local client. There is no authentication layer on stdio. The optional HTTP transport (patch K) is gated by a Bearer token (`REVERSE_MCP_TOKEN`) and binds to `127.0.0.1` by default; it is not full MCP Streamable HTTP and has no OAuth.
- Evidence JSON is hash-chained per research session (detects in-place chain edits). Optional HMAC-SHA256 over the terminal chain hash is available when `REVERSE_EVIDENCE_KEY` is set (`signSession` / `verify_evidence_integrity`, patch I). Without the key, anyone who can write the store can rewrite a whole session consistently. Public-key detached signatures and Merkle roots are not implemented. Evidence added through `add_research_evidence` is supplied by the caller; only evidence created through `session_id` on a measurement tool comes from a Reverse result.
- The cgroup resource-control API requires `CONTROLLED_EXECUTION` and an explicit `confirm: true`; it is scoped to a callback and attempts to restore the original cgroup on exit. Path allowlists and broader approval gates for experiments remain planned.

Report vulnerabilities privately to the repository maintainer. Do not publish exploit details before a fix is available.

## Patch P (legacy Android) — security review note (1.5.22)

- All Android device operations require `CONTROLLED_EXECUTION`, explicit `confirm` where mutating, research-session authorization, and a real serial/AVD when talking to a device. Output from the device is marked untrusted and capped (R-02).
- Binary parsers (AXML/ARSC/DEX/signatures) are pure TypeScript Buffer walks with hostile-input property tests; they must not throw on malformed input.
- Frida scripts and proxy/pcap steps are **operator-run**. Reverse generates skeletons and plans only; it does not attach, intercept TLS, or capture packets.
- Certificate CN hints from v1 PKCS#7 are best-effort DER scans, not chain validation or trust-store decisions.
- No bundled system images, no Google components, no DRM/license bypass. Authorization basis is an operator declaration, not legal verification.
- Residual risk: operator-supplied Frida/proxy tooling and device trust remain outside Reverse’s process boundary.

## Patch Q / 2.0.0

Unified and newer-generation APIs inherit the same authorization gate and untrusted-input rules as M–P. Inventory helpers do not execute targets. Knowledge-base facts are non-normative summaries with source labels. Optional external providers remain operator-supplied.

## Command-gated MCP tools (2.0.6)

`EXEC_TOOLS` includes measurement and trial runners that may invoke operator commands or providers: `capture_baseline`, `run_benchmark`, `validate_changes`, `run_benchmark_suite`, `run_validation_fixtures`, `run_optimization_trial`, `run_all_reference_trials`, `run_apk_pipeline`, `run_provider`, `trace_execution`. These require the controlled-execution command gate (`checkCommandGate`), not only a UI `confirm` flag.

