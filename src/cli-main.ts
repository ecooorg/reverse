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
import { parseArgs } from 'node:util';
const parsed = parseArgs({ args: process.argv.slice(2), strict: false, allowPositionals: true, options: {
        arg: { type: 'string', multiple: true }, command: { type: 'string' }, cwd: { type: 'string' }, timeout: { type: 'string' }, repeat: { type: 'string' }, label: { type: 'string' }, expected: { type: 'string' }, duration: { type: 'string' }, interval: { type: 'string' }, limit: { type: 'string' }, json: { type: 'boolean' },
    } });
const [cmd, ...args] = parsed.positionals;
const value = (k: string, d?: string) => { const v = parsed.values[k.replace(/^--/, '')]; return typeof v === 'string' ? v : d; };
const num = (k: string, d: number) => Number(value(k, String(d)));
/** Every `--arg X` becomes one argument of the target command, in order. */
const commandArgs = (): string[] => { const v = parsed.values.arg; return (Array.isArray(v) ? v : v === undefined ? [] : [v]).filter((x): x is string => typeof x === 'string'); };
const positional = (usage: string) => {
    if (!args[0] || args[0].startsWith('--'))
        throw new Error(`Missing argument. Usage: reverse ${usage}`);
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
                                Run repeated benchmark (time, CPU, peak RAM)
  compare <before.json> <after.json>
  validate --command CMD [--arg A]... --expected FILE.json [--cwd DIR] [--timeout MS] [--repeat N]
  analyzers                     List adapters and extension points
  doctor                        Check local runtime and store readiness
  mcp                           Start the MCP stdio server

Output is always JSON on stdout; --json is accepted and has no effect. Errors go to stderr with exit code 1.
Environment: REVERSE_HOME (artifact directory), REVERSE_EXEC_TIMEOUT_MS (timeout for ps/tasklist/powershell helpers).
See docs/ for limitations and security.`;
async function main() {
    let out: any;
    switch (cmd) {
        case '--help':
        case '-h':
        case 'help':
        case undefined:
            console.log(HELP);
            return;
        case 'binary':
            out = await analyzeBinary(positional('binary <file>'));
            break;
        case 'source':
            out = await analyzeSource(positional('source <directory>'));
            break;
        case 'dependencies':
            out = await analyzeDependencies(positional('dependencies <directory>'));
            break;
        case 'processes':
            out = await listProcesses(num('--limit', 100));
            break;
        case 'process':
            out = await inspectProcess(Number(positional('process <pid>')));
            break;
        case 'profile':
            out = await profileProcess(Number(positional('profile <pid>')), num('--duration', 3000), num('--interval', 250));
            break;
        case 'benchmark':
            out = await runBenchmark({ command: value('--command') ?? '', args: commandArgs(), cwd: value('--cwd'), timeoutMs: num('--timeout', 30000), repetitions: num('--repeat', 3), label: value('--label') });
            break;
        case 'compare':
            out = await compareBenchmarks(await readJson(positional('compare <before.json> <after.json>')), await readJson(args[1] ?? ''));
            break;
        case 'validate': {
            const expected = await readJson(value('--expected') ?? '');
            out = await validateBehavior({ command: value('--command') ?? '', args: commandArgs(), cwd: value('--cwd'), timeoutMs: num('--timeout', 30000) }, expected, num('--repeat', 1));
            break;
        }
        case 'analyzers':
            out = listProviders();
            break;
        case 'doctor': {
            const { mkdir, access } = await import('node:fs/promises');
            const { storeDir } = await import('./core-util.js');
            const dir = storeDir();
            await mkdir(dir, { recursive: true });
            await access(dir);
            out = { operation: 'doctor', status: 'completed', node: process.version, requiredNode: '>=22', platform: process.platform, storeDir: dir, storeWritable: true, providers: listProviders() };
            break;
        }
        case 'mcp':
            await import('./mcp-server.js');
            return;
        default: throw new Error(`Unknown command: ${cmd}. Run reverse --help.`);
    }
    console.log(JSON.stringify(out, null, 2));
}
main().catch(e => { console.error(`Reverse: ${e instanceof Error ? e.message : String(e)}`); process.exitCode = 1; });
