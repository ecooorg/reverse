# Reverse

Reverse is a compact, local-first analysis core for software investigation and optimization experiments. It provides a CLI and a standalone Model Context Protocol (MCP) stdio server. It focuses on deterministic observations, repeatable interleaved benchmarks, behavior checks, and typed, hash-chained research evidence rather than embedding an AI planner or reimplementing specialist reverse-engineering tools.

> **MVP status:** this is an independently implemented starter release. Capabilities marked as extension points are not implemented integrations. Read [CAPABILITIES.md](docs/CAPABILITIES.md) before relying on a result.

## Requirements

- Node.js 22 or newer
- npm
- Optional: `ps` on Unix-like systems for process inventory and sampling

No Ghidra, Frida, Rizin, GDB, perf, eBPF, ETW, Instruments, or native compiler is required for the built-in features.

## Install from source

```bash
git clone https://github.com/YOUR-USERNAME/reverse.git
cd reverse
npm install
npm run build
npm test
npm link
reverse --help
```

Run without linking: `node dist/cli-main.js --help`.

## Quick start

```bash
# Inspect a native executable header (ELF, PE, Mach-O)
reverse binary ./path/to/program --json

# Inventory source files and textual imports
reverse source ./my-project --json

# Read direct npm dependencies
reverse dependencies ./my-project --json

# List visible processes
reverse processes --limit 100 --json

# Sample one process for 3 seconds
reverse profile 1234 --duration 3000 --interval 250 --json

# Benchmark a command (no shell; use --arg once per argument)
reverse benchmark --command node --arg ./script.js --repeat 5 --timeout 30000 --json

# Check a command's exact output (arguments via --arg, expected values in a JSON file)
reverse validate --command node --arg ./script.js --expected ./expected.json

# Check local runtime and storage readiness
reverse doctor

# Start the MCP server
reverse mcp
```

Output is always JSON; `--json` is accepted and has no effect. Reverse stores evidence and benchmark artifacts under `~/.reverse` by default. Set `REVERSE_HOME` to choose another local storage directory, and `REVERSE_EXEC_TIMEOUT_MS` to change the timeout of the helper executables (`ps`, `tasklist`, `powershell`).

## CI diagnostics

All GitHub Actions workflows publish a ZIP artifact with detailed logs and a separate `AI-DEBUG-SUMMARY.md` artifact, including on failed runs. The summary prioritizes concrete compiler/runtime/assertion evidence over incidental keywords, lists TAP test names, command lines, file/line references, stack context, capability JSON failures/drift and JUnit failures, and distinguishes confirmed exit codes from missing markers. Duplicate evidence is intended to be correlated across logs and reports; recognized secret-like values are redacted. Paste it into an AI chat to diagnose most CI failures without attaching the full archive. See [GITHUB.md](docs/GITHUB.md) for artifact contents and limitations.

## MCP connection

Reverse implements the MCP JSON-RPC stdio transport and exposes 61 tools, including process inspection, interleaved benchmark suites, stored baselines, typed evidence, hash-chained research sessions, hypothesis promotion and artifact linking, static analysis and provider tools, the controlled optimization loop, runtime analyzers and the initial legacy Windows analysis (the exact list is in [MCP.md](docs/MCP.md)). MCP prompts and resources are served too, and an optional token-gated HTTP transport exists (see MCP.md). Command-running tools require `REVERSE_MODE=CONTROLLED_EXECUTION` and a command allowlist. Process inventory supports offset pagination; tool results are capped at 1 MiB.

Example client configuration:

```json
{
  "mcpServers": {
    "reverse": {
      "command": "node",
      "args": ["/absolute/path/to/reverse/dist/mcp-server.js"]
    }
  }
}
```

The server writes protocol messages to stdout. Do not add logging to stdout; diagnostics belong on stderr.

## Design principles

1. The model proposes hypotheses; Reverse reports observations and measurements.
2. Findings carry status, timestamp, host, coverage, limitations, and evidence references.
3. External analysis engines are providers, never silently simulated.
4. Commands execute locally. Reverse does not upload inspected binaries.
5. Reverse never modifies the original target: changes are applied only to isolated workspace copies, under `CONTROLLED_EXECUTION` with an explicit `confirm: true` (patch J). Benchmark/validation commands do execute user-supplied commands under the current user's permissions; over MCP they are off unless `REVERSE_MODE=CONTROLLED_EXECUTION` and `REVERSE_COMMAND_ALLOWLIST` are set (see docs/MCP.md).
6. A timing improvement is not proof of semantic equivalence.
7. Analogies and AI guesses are hypotheses, kept apart from facts and promoted only by same-session Validation or Benchmark evidence.
8. The legacy track is for open-source software or software whose developers and rights holders consent; see [SECURITY.md](docs/SECURITY.md).

## Project status

- **Done:** patches **A–L** are the 1.0 baseline, **M** (Windows, 1.2.0), **N** (old Linux, 1.3.5), and **O** (Classic Mac / early macOS, 1.4.0).
- **In progress:** **Patch P** (legacy Android), version **1.5.10**. Bounded read-only device observations are now available through MCP.
- **Not started:** **Patch Q** (newer generations and unified compatibility intelligence).

**Verification:** In the 1.5.10 environment (Linux, Node 22.23, TypeScript 6.0.3 standing in for the locked 5.9 printer, `@types/node` 26; `npm ci` was not possible offline) the package build, the unit suite (160 tests; the two `fast-check` property files could not run), the capability suite (183 checks: 177 verified, 6 documented limitations, 0 drift, 0 failed), MCP docs, source and built structure, size and static-quality checks passed, and the printer reported no drift in 124 files. Nightly Full Verification #3 (run 43302140821, commit de40f11) showed on Windows Node 24 all 182 capability checks passing; on Windows Node 22 129 checks passed and the file hit the old 90 s limit, which 1.5.10 replaces; the supply-chain and mutation jobs of that run passed (mutation score 47.72 %, floor 45 %). The Windows Node 22 re-run of 1.5.10 is pending verification. Biome lint, `jscpd`, `knip`, the property tests, coverage, macOS and the manual `os: all` run were not run here. The 1.4.2 matrix is historical evidence for Patch O only.

| Question | Answer |
|---|---|
| What is the product version? | **1.5.10** (Patch P step 6 — CI repair: capability suite timeout on Windows) |
| What is finished? | The 1.0 foundation (**patches A–L**), **Patch M** (Windows, **1.2.0**), **Patch N** (old Linux, **1.3.5**), and **Patch O** (Classic Mac / early macOS, **1.4.0**). |
| What is being built? | **Patch P** in progress through **1.5.10**: L0 reference trials and bounded device-side logcat/activity observation via MCP. |
| What has not started? | **Patch Q** (newer generations and unified compatibility intelligence). |

- **Where to start (people and AI assistants):** read [AGENTS.md](AGENTS.md), then the *Status at a glance* section of [docs/ROADMAP.md](docs/ROADMAP.md). See also [docs/CAPABILITIES.md](docs/CAPABILITIES.md), [docs/SECURITY.md](docs/SECURITY.md) and [docs/AUDIT.md](docs/AUDIT.md).

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Capabilities and limitations](docs/CAPABILITIES.md)
- [Security model](docs/SECURITY.md)
- [MCP tool contract](docs/MCP.md)
- [Benchmark methodology](docs/BENCHMARKS.md)
- [GitHub publishing guide](docs/GITHUB.md)
- [Roadmap](docs/ROADMAP.md)
- [Audit log](docs/AUDIT.md) (newest audit first)
