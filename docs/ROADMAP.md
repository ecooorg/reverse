# Roadmap

## 0.1.0 — compact MVP

- [x] Standalone TypeScript project, CLI, MCP stdio server
- [x] ELF/PE/Mach-O header recognition
- [x] Source and npm manifest inventory
- [x] Basic process inventory and CPU/RSS sampling
- [x] Repeated wall-clock benchmark and comparison
- [x] Exact output/exit-code validation
- [x] Local JSON evidence/artifacts
- [x] Explicit extension-point registry and capability matrix

## 0.2 — measurement quality and process safety

- [ ] Process ownership verification, process-tree observation, cancellation and cleanup
- [ ] Linux `/proc` metrics with clear units and per-process CPU deltas
- [ ] Windows performance counters and macOS sampling adapter
- [ ] Resource limits and OS sandbox integration
- [ ] Benchmark warmup, alternating runs, percentiles, variance and confidence intervals
- [ ] Baseline metadata and hardware/environment fingerprints

## 0.3 — static analysis and providers

- [ ] Parse ELF program/section headers and symbol tables
- [ ] PE sections/imports/exports and Mach-O load commands
- [ ] Dependency lockfile parsers and transitive graphs
- [ ] Provider contract tests and executable discovery
- [ ] Real, opt-in Ghidra/Rizin/GDB/Frida adapters with integration tests

## 0.4 — validation and evidence

- [ ] Test suite adapters and build verification
- [ ] Structured behavior fixtures and normalization rules
- [ ] Evidence manifest integrity and optional signing
- [ ] Before/after report generation with uncertainty and limitations

## Later

- [ ] Function hotspots via real external profilers
- [ ] Disk/network I/O providers
- [ ] JS/Electron, .NET and WASM analyzers
- [ ] Plugin loading and provider lifecycle
- [ ] HTTP MCP transport only if a concrete deployment need exists
