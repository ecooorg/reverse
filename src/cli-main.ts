#!/usr/bin/env node
import { analyzeBinary } from './analysis-binary.js';
import { analyzeSource } from './analysis-source.js';
import { analyzeDependencies } from './analysis-dependencies.js';
import { analyzeAndroid } from './analysis-android.js';
import { listProcesses, inspectProcess } from './process-inspector.js';
import { profileProcess } from './profiling-profiler.js';
import { runBenchmark, compareBenchmarks } from './benchmark-engine.js';
import { validateBehavior } from './benchmark-validation.js';
import { readJson } from './core-util.js';
import { listProviders } from './providers-registry.js';
import { VERSION } from './core-version.js';
import { parseArgs } from 'node:util';
import './providers-bootstrap.js';
const parsed = parseArgs({
    args: process.argv.slice(2), strict: false, allowPositionals: true, options: {
        arg: {
            type: 'string', multiple: true
        }, command: {
            type: 'string'
        }, cwd: {
            type: 'string'
        }, timeout: {
            type: 'string'
        }, repeat: {
            type: 'string'
        }, label: {
            type: 'string'
        }, expected: {
            type: 'string'
        }, duration: {
            type: 'string'
        }, interval: {
            type: 'string'
        }, limit: {
            type: 'string'
        }, json: {
            type: 'boolean'
        },
    }
});
const [cmd, ...args] = parsed.positionals;
const value = (k: string, d?: string) => { const v = parsed.values[k.replace(/^--/, '')]; return typeof v === 'string' ? v : d; };
const num = (k: string, d: number) => Number(value(k, String(d)));
/** Every `--arg X` becomes one argument of the target command, in order. */
const commandArgs = (): string[] => {
    const v = parsed.values.arg;
    const list = Array.isArray(v) ? v : v === undefined ? [] : [v];
    return list.filter((x): x is string => typeof x === 'string');
};
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
  dependencies <directory>      Resolve lockfile / package dependencies
  android <apk-or-aab>          APK/AAB static inventory (dex, so, ABI)
  processes [--limit N]         List visible processes
  process <pid>                 Inspect one process
  profile <pid> [--duration MS] [--interval MS]   Sample CPU/RSS
  benchmark --command CMD [--arg A]... [--cwd DIR] [--timeout MS] [--repeat N] [--label L]
                                Run repeated benchmark (time, CPU, peak RAM)
  compare <before.json> <after.json>
  validate --command CMD [--arg A]... --expected FILE.json [--cwd DIR] [--timeout MS] [--repeat N]
  hotspots <pid> [--duration MS] Function hotspots (perf/sample when available)
  fixtures <dir>                Run JSON validation fixtures from a directory
  workspace <path> --confirm true   Create change workspace (CONTROLLED_EXECUTION)
  decide --verdict V [--validation true|false]  Optimization decision from evidence
  javascript <path>             JS/TS/Electron static inventory
  dotnet <file>                 Detect .NET CLI header in PE
  wasm <file>                   WebAssembly section inventory
  mcp-http                      Optional HTTP MCP (REVERSE_MCP_HTTP=1 + TOKEN)
  setup <agent> [--confirm true] Register MCP in cursor|claude|codex|vscode (dry-run default)
  analyzers                     List adapters and providers
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
        case 'android':
            out = await analyzeAndroid(positional('android <apk-or-aab>'));
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
            out = await runBenchmark({
                command: value('--command') ?? '',
                args: commandArgs(),
                cwd: value('--cwd'),
                timeoutMs: num('--timeout', 30000),
                repetitions: num('--repeat', 3),
                label: value('--label')
            });
            break;
        case 'compare':
            out = await compareBenchmarks(await readJson(positional('compare <before.json> <after.json>')), await readJson(args[1] ?? ''));
            break;
        case 'validate': {
            const expected = await readJson(value('--expected') ?? '');
            out = await validateBehavior({
                command: value('--command') ?? '', args: commandArgs(), cwd: value('--cwd'), timeoutMs: num('--timeout', 30000)
            }, expected, num('--repeat', 1));
            break;
        }
        case 'hotspots': {
            const { getHotspots } = await import('./profiling-hotspots.js');
            out = await getHotspots(Number(positional('hotspots <pid>')), {
                durationMs: num('duration', 1000)
            });
            break;
        }
        case 'fixtures': {
            const { runValidationFixtures } = await import('./benchmark-validation.js');
            out = await runValidationFixtures(positional('fixtures <dir>'));
            break;
        }
        case 'workspace': {
            const { createChangeWorkspace } = await import('./optimization-workspace.js');
            out = await createChangeWorkspace(positional('workspace <path>'), {
                confirm: value('confirm', 'false') === 'true'
            });
            break;
        }
        case 'decide': {
            const { decideOptimization } = await import('./optimization-decision.js');
            out = decideOptimization({
                performanceVerdict: value('verdict'),
                validationPassed: value('validation') === 'true'
                    ? true
                    : value('validation') === 'false' ? false : null
            });
            break;
        }
        case 'javascript': {
            const { analyzeJavascript } = await import('./analysis-javascript.js');
            out = await analyzeJavascript(positional('javascript <path>'));
            break;
        }
        case 'dotnet': {
            const { analyzeDotnet } = await import('./analysis-dotnet.js');
            out = await analyzeDotnet(positional('dotnet <file>'));
            break;
        }
        case 'wasm': {
            const { analyzeWasm } = await import('./analysis-wasm.js');
            out = await analyzeWasm(positional('wasm <file>'));
            break;
        }
        case 'mcp-http': {
            const { startHttpMcp } = await import('./mcp-http.js');
            // Wire a minimal tool dispatcher via dynamic import of server logic
            const { analyzeBinary } = await import('./analysis-binary.js');
            const { analyzeJavascript } = await import('./analysis-javascript.js');
            const { analyzeDotnet } = await import('./analysis-dotnet.js');
            const { analyzeWasm } = await import('./analysis-wasm.js');
            const { listProviders } = await import('./providers-registry.js');
            out = startHttpMcp(async (name, args) => {
                if (name === 'analyze_binary')
                    return analyzeBinary(args.file);
                if (name === 'analyze_javascript')
                    return analyzeJavascript(args.path);
                if (name === 'analyze_dotnet')
                    return analyzeDotnet(args.file);
                if (name === 'analyze_wasm')
                    return analyzeWasm(args.file);
                if (name === 'list_analyzers')
                    return { providers: listProviders() };
                throw new Error('Tool not exposed over HTTP in this build: ' + name);
            });
            if ((out as any).status === 'completed') {
                console.error('HTTP MCP listening (see JSON result). Ctrl+C to stop.');
                await new Promise(() => { });
            }
            break;
        }
        case 'setup': {
            const { setupAgent } = await import('./cli-setup.js');
            out = await setupAgent({
                agent: positional('setup <agent>'),
                dryRun: value('confirm', 'false') !== 'true',
                confirm: value('confirm', 'false') === 'true',
                reverseBin: value('bin', 'reverse')
            });
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
            out = {
                operation: 'doctor',
                status: 'completed',
                node: process.version,
                requiredNode: '>=22',
                platform: process.platform,
                storeDir: dir,
                storeWritable: true,
                providers: listProviders()
            };
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
