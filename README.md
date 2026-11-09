# Reverse

Reverse is a compact, local-first analysis core for software investigation and optimization experiments. It provides a CLI and a standalone Model Context Protocol (MCP) stdio server. It focuses on deterministic observations, repeatable wall-clock benchmarks, behavior checks, and evidence rather than embedding an AI planner or reimplementing specialist reverse-engineering tools.

> **MVP status:** this is an independently implemented starter release. Capabilities marked as extension points are not implemented integrations. Read [CAPABILITIES.md](docs/CAPABILITIES.md) before relying on a result.

## Requirements

- Node.js 20.11 or newer
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

# Start the MCP server
reverse mcp
```

Reverse stores evidence and benchmark artifacts under `~/.reverse` by default. Set `REVERSE_HOME` to choose another local storage directory.

## MCP connection

Reverse implements the MCP JSON-RPC stdio transport and exposes tools including `inspect_target`, `analyze_binary`, `analyze_source`, `analyze_dependencies`, `get_inventory`, `inspect_process`, `profile_process`, `run_benchmark`, `compare_results`, `validate_changes`, `get_evidence`, and `list_analyzers`.

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
5. Mutating operations are out of scope for this MVP. Benchmark/validation commands do execute user-supplied commands under the current user's permissions.
6. A timing improvement is not proof of semantic equivalence.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Capabilities and limitations](docs/CAPABILITIES.md)
- [Security model](docs/SECURITY.md)
- [MCP tool contract](docs/MCP.md)
- [Benchmark methodology](docs/BENCHMARKS.md)
- [GitHub publishing guide](docs/GITHUB.md)
- [Roadmap](docs/ROADMAP.md)
