# Benchmark methodology

Reverse measures wall-clock duration for fresh child-process executions. It records command, arguments, working directory, repetition count, per-run duration, exit status, signal, timeout flag, and stdout/stderr bounded to 1 MiB (bytes) per stream (a `stdoutTruncated`/`stderrTruncated` flag marks dropped output). A timeout terminates the whole process tree.

## Recommended protocol

1. Use identical input files and arguments for baseline and candidate.
2. Record executable version, build identifier, host, OS, architecture, power mode, and background load outside Reverse.
3. Use at least 5-10 repetitions for exploratory comparisons; increase repetitions for noisy workloads.
4. Separate cold-start and warmed-up experiments manually; this release does not classify them.
5. Alternate baseline/candidate runs where practical to reduce drift.
6. Compare medians and distributions, not a single run.
7. Repeat on the same hardware and under comparable system load.
8. Run functional checks separately and retain their expected fixtures.

The median of an even number of runs is the mean of the two middle values.

A negative `changePercent` means the candidate had lower mean wall-clock time. This is an observation, not proof of causal improvement. The current comparator does not calculate confidence intervals or reject noisy samples. Profiling overhead and external system load can materially affect results.
