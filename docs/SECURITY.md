# Security model and safe use

Reverse is a local inspection tool, not a sandbox. It runs with the permissions of the current user.

## Safe defaults

- Binary and source inspection are read-only.
- Process inspection is observational and limited to data exposed by the OS.
- No target is uploaded to an external service.
- Benchmark and validation commands are explicitly supplied by the caller and run without a shell (`spawn(command, args)`).
- Command duration is bounded; output capture is capped at exactly 1 MiB per stream (excess output is dropped and the run is flagged `stdoutTruncated` / `stderrTruncated`).
- Reverse does not patch binaries, change target configuration, inject into processes, or kill arbitrary target processes.

## Operator responsibilities

Only inspect software and processes you own or are authorized to examine. Treat binaries and their output as untrusted. Run benchmarks in a disposable working directory or OS sandbox where practical. Do not pass untrusted command strings or arguments. A timeout terminates the spawned child and every process it started (the process tree is snapshotted first; on Windows `taskkill /T /F` is used), but a process that escapes its parent before the snapshot cannot be found. CPU/RAM quotas are not enforced. Avoid elevated privileges.

## Known security gaps

- No OS-level sandbox, resource cgroup/job object, network isolation, or filesystem allowlist. Monitoring is read-only; no process termination or control operation is exposed.
- Process listing and sampling are subject to host permissions and race conditions.
- MCP stdio assumes a trusted local client. There is no authentication layer.
- Evidence JSON is not signed or tamper-evident.
- Path allowlists and explicit approval gates for experiments are planned, not implemented.

Report vulnerabilities privately to the repository maintainer. Do not publish exploit details before a fix is available.
