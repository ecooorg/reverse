# Security model and safe use

Reverse is a local inspection tool, not a sandbox. It runs with the permissions of the current user.

## Safe defaults

- Binary and source inspection are read-only.
- Process inspection is observational and limited to data exposed by the OS.
- No target is uploaded to an external service.
- Benchmark and validation commands are explicitly supplied by the caller and run without a shell (`spawn(command, args)`).
- Command duration is bounded; output capture is capped at exactly 1 MiB (bytes) per stream (excess output is dropped and the run is flagged `stdoutTruncated` / `stderrTruncated`).
- Reverse does not patch binaries, change target configuration, inject into processes, or kill arbitrary target processes.

## Operator responsibilities

Only inspect software and processes you own or are authorized to examine. Treat binaries and their output as untrusted. Run benchmarks in a disposable working directory or OS sandbox where practical. Do not pass untrusted command strings or arguments. A timeout terminates the spawned child and every process it started (the process tree is snapshotted first; on Windows `taskkill /T /F` is used), but a process that escapes its parent before the snapshot cannot be found. CPU/RAM quotas are not enforced. Avoid elevated privileges.

## Authorized use and scope (planned, first item of patch M)

The legacy track will analyze old programs, some with copy protection, dongles or license checks. Reverse reports such mechanisms as facts and does not defeat them. Operating-system images and commercial tools are supplied by the user under their own licenses and are never bundled. Until the policy is written out in full in patch M, treat this paragraph as the binding summary.

## Known security gaps

- No general OS sandbox, network isolation, or filesystem allowlist. Linux cgroup v2 CPU/memory limits are available only through the explicit scoped `withProcessResourceLimits` API on delegated hierarchies; no Windows Job Object or macOS hard-quota adapter exists.
- Process listing and sampling remain subject to host permissions and unavoidable races between OS reads and subsequent operations. Start-time identity checks reduce, but cannot mathematically eliminate, PID-reuse races. Linux/macOS ownership is checked by UID; Windows ownership is currently unknown.
- MCP stdio assumes a trusted local client. There is no authentication layer.
- Evidence JSON is not signed or tamper-evident.
- The cgroup resource-control API requires `CONTROLLED_EXECUTION` and an explicit `confirm: true`; it is scoped to a callback and attempts to restore the original cgroup on exit. Path allowlists and broader approval gates for experiments remain planned.

Report vulnerabilities privately to the repository maintainer. Do not publish exploit details before a fix is available.
