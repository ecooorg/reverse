#!/usr/bin/env node
import { analyzeBinary } from './analysis-binary.js';
import { analyzeSource } from './analysis-source.js';
import { analyzeDependencies } from './analysis-dependencies.js';
import { listProcesses, inspectProcess } from './process-inspector.js';
import { profileProcess } from './profiling-profiler.js';
import { runBenchmark, compareBenchmarks } from './benchmark-engine.js';
import { validateBehavior } from './benchmark-validation.js';
import { readJson } from './core-util.js';
import { listProviders } from './providers-registry.js';
import { VERSION } from './core-version.js';

const [cmd, ...args] = process.argv.slice(2);
const value = (k: string, d?: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const num = (k: string, d: number) => Number(value(k, String(d)));
/** Every `--arg X` becomes one argument of the target command, in order. */
const commandArgs = () => args.flatMap((x, i) => (x === '--arg' && args[i + 1] !== undefined ? [args[i + 1]] : []));
const positional = (usage: string) => {
  if (!args[0] || args[0].startsWith('--')) throw new Error(`Missing argument. Usage: reverse ${usage}`);
  return args[0];
};

const HELP = `Reverse ${VERSION}

Usage: reverse <command> [options]

Commands:
  binary <file>                 Analyze ELF/PE/Mach-O/Java-class headers
  source <directory>            Inventory source files
  dependencies <directory>      Read package.json dependencies
  processes [--limit N]         List visible processes
  process <pid>                 Inspect one process
  profile <pid> [--duration MS] [--interval MS]   Sample CPU/RSS
  benchmark --command CMD [--arg A]... [--cwd DIR] [--timeout MS] [--repeat N] [--label L]
                                Run repeated wall-clock benchmark
  compare <before.json> <after.json>
  validate --command CMD [--arg A]... --expected FILE.json [--cwd DIR] [--timeout MS] [--repeat N]
  analyzers                     List adapters and extension points
  mcp                           Start the MCP stdio server

Output is always JSON on stdout; --json is accepted and has no effect. Errors go to stderr with exit code 1.
Environment: REVERSE_HOME (artifact directory), REVERSE_EXEC_TIMEOUT_MS (timeout for ps/tasklist/powershell helpers).
See docs/ for limitations and security.`;

async function main() {
  let out: any;
  switch (cmd) {
    case '--help': case '-h': case 'help': case undefined: console.log(HELP); return;
    case 'binary': out = await analyzeBinary(positional('binary <file>')); break;
    case 'source': out = await analyzeSource(positional('source <directory>')); break;
    case 'dependencies': out = await analyzeDependencies(positional('dependencies <directory>')); break;
    case 'processes': out = await listProcesses(num('--limit', 100)); break;
    case 'process': out = await inspectProcess(Number(positional('process <pid>'))); break;
    case 'profile': out = await profileProcess(Number(positional('profile <pid>')), num('--duration', 3000), num('--interval', 250)); break;
    case 'benchmark':
      out = await runBenchmark({ command: value('--command') ?? '', args: commandArgs(), cwd: value('--cwd'), timeoutMs: num('--timeout', 30000), repetitions: num('--repeat', 3), label: value('--label') });
      break;
    case 'compare': out = await compareBenchmarks(await readJson(positional('compare <before.json> <after.json>')), await readJson(args[1] ?? '')); break;
    case 'validate': {
      const expected = await readJson(value('--expected') ?? '');
      out = await validateBehavior({ command: value('--command') ?? '', args: commandArgs(), cwd: value('--cwd'), timeoutMs: num('--timeout', 30000) }, expected, num('--repeat', 1));
      break;
    }
    case 'analyzers': out = listProviders(); break;
    case 'mcp': await import('./mcp-server.js'); return;
    default: throw new Error(`Unknown command: ${cmd}. Run reverse --help.`);
  }
  console.log(JSON.stringify(out, null, 2));
}
main().catch(e => { console.error(`Reverse: ${e instanceof Error ? e.message : String(e)}`); process.exitCode = 1; });
