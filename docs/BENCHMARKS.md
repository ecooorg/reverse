# Benchmark methodology

Reverse measures wall-clock duration for fresh child-process executions. It records command, arguments, working directory, repetition count, per-run duration, exit status, signal, timeout flag, and stdout/stderr bounded to 1 MiB (bytes) per stream (a `stdoutTruncated`/`stderrTruncated` flag marks dropped output). A timeout terminates the whole process tree.

## Recommended protocol

1. Use identical input files and arguments for baseline and candidate.
2. Record executable version, build identifier, host, OS, architecture, power mode, and background load outside Reverse.
3. Use at least 5-10 repetitions for exploratory comparisons; increase repetitions for noisy workloads.
4. Use `warmupRuns` for warm-up (recorded, excluded from statistics); Reverse labels first-start and later runs as cold/warm without flushing the OS cache.
5. Prefer `create_benchmark_suite` / `run_benchmark_suite`: cases execute in round-robin order by round, with warm-ups excluded, to reduce time-dependent drift.
6. Compare medians and distributions, not a single run.
7. Repeat on the same hardware and under comparable system load.
8. Run functional checks separately and retain their expected fixtures.

The median of an even number of runs is the mean of the two middle values.

A negative `changePercent` is descriptive only. `compare_results` uses successful per-run samples, Mann–Whitney U, a deterministic bootstrap interval of the median shift and a five-run minimum before returning a supported verdict. Environment fingerprints include load average and, where available, CPU governor and thermal sensor; high load is flagged, not corrected. Profiling overhead and external system load can materially affect results.

## Resources, cold/warm and binary size (0.2.0-beta.6)

Every run carries `cpuTimeMs`, `peakRssBytes` and `resources` (method, sample count). The benchmark summarizes them as `medianCpuTimeMs`, `meanCpuTimeMs`, `maxCpuTimeMs`, `medianPeakRssBytes` and `maxPeakRssBytes`, and `resourceMetrics` says whether any data exists (`method`: `proc`, `ps` or `powershell`).

- **Linux:** `/proc/<pid>/stat` (user + system + waited-for children CPU time, clock ticks from `getconf CLK_TCK`) and the kernel's peak resident set `VmHWM`, sampled every 5 ms.
- **macOS and other POSIX systems:** `ps -o rss=,time=` every 25 ms; peak RAM is the largest sampled RSS, CPU time has 10 ms resolution.
- **Windows:** PowerShell `Get-Process` samples `TotalProcessorTime` and peak working set. The helper starts separately for each sample (0.5-1.5 s on a hosted runner, AUDIT R-19), so a run shorter than that ends before its first sample and reports `resources.available: false` with a reason; the sampling overhead is higher than on Linux. Timeouts are reported only after the tree kill has finished, so `processesTerminated` is final.
- Values describe the direct child and are **lower bounds**: sampling can miss what happens after the last sample, and a run shorter than one sample interval may have no data (then the fields are `null`, never zero).
- `temperature`: the first process started by one benchmark call is `cold`, all later runs `warm` (`coldDurationMs`, `coldPhase`, `warmMedianDurationMs`). The operating system file cache is not dropped, so `cold` means first start in this call.
- `binaryPath` and `binarySizeBytes`: the resolved command file (for `node` that is the interpreter, not the script).
- `compare_results` adds `metrics`: median change of CPU time and peak RAM with their own verdicts (same test and the same 5-run minimum; `null` when a side has no samples) and the plain size difference. The headline `verdict` still refers to wall-clock time.

## Statistics and verdicts (0.2.0-beta.6)

Per benchmark: mean, median, min, max, P95 (nearest rank), sample standard deviation, MAD, outliers (modified z-score above 3.5) and a 95% Student-t interval of the mean. Failed runs (error, timeout, non-zero exit) are excluded. `compare_results` reports a verdict from the per-run durations: two-sided Mann-Whitney test (alpha 0.05, tie-corrected normal approximation) and a deterministic bootstrap interval of the median shift that must exclude zero; also the Hodges-Lehmann shift and Cohen's d. Fewer than 5 successful runs on either side gives `insufficient_evidence`; a lower mean alone never gives `improved`. Different environment fingerprints add a comparability warning and make the comparison `partial`.
