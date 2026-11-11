/**
 * Opt-in detect-only providers: diec, yara-x, capa (Patch M step 3 / R-10 subset).
 * Never simulate results when the tool is absent — report unavailable.
 */
import { spawn } from 'node:child_process';
import { result, type Result } from './core-types.js';
import type { AnalyzerProvider, ProviderRunOptions } from './providers-registry.js';
function which(cmd: string, timeoutMs = 3000): Promise<string | null> {
    return new Promise(resolve => {
        const child = spawn(process.platform === 'win32' ? 'where' : 'which', [cmd], {
            stdio: ['ignore', 'pipe', 'ignore']
        });
        let out = '';
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            resolve(null);
        }, timeoutMs);
        child.stdout?.on('data', (c: Buffer) => {
            out += c.toString('utf8');
        });
        child.on('error', () => {
            clearTimeout(timer);
            resolve(null);
        });
        child.on('close', code => {
            clearTimeout(timer);
            if (code !== 0 || !out.trim())
                resolve(null);
            else
                resolve(out.trim().split(/\r?\n/)[0] ?? null);
        });
    });
}
function runTool(cmd: string, args: string[], timeoutMs: number): Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
}> {
    return new Promise(resolve => {
        const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            resolve({ code: null, stdout, stderr: stderr + '\ntimeout' });
        }, timeoutMs);
        child.stdout?.on('data', (c: Buffer) => {
            stdout += c.toString('utf8');
            if (stdout.length > 256000)
                stdout = stdout.slice(0, 256000);
        });
        child.stderr?.on('data', (c: Buffer) => {
            stderr += c.toString('utf8');
            if (stderr.length > 64000)
                stderr = stderr.slice(0, 64000);
        });
        child.on('error', err => {
            clearTimeout(timer);
            resolve({ code: null, stdout, stderr: String(err) });
        });
        child.on('close', code => {
            clearTimeout(timer);
            resolve({ code, stdout, stderr });
        });
    });
}
type DetectOnlySpec = {
    name: string;
    binaryNames: string[];
    buildArgs: (target: string) => string[];
    capabilities: string[];
};
function detectOnlyProvider(spec: DetectOnlySpec): AnalyzerProvider {
    const { name, binaryNames, buildArgs, capabilities } = spec;
    let resolved: string | null | undefined;
    return {
        name,
        capabilities,
        async available() {
            for (const bin of binaryNames) {
                const path = await which(bin);
                if (path) {
                    resolved = path;
                    return true;
                }
            }
            resolved = null;
            return false;
        },
        async detail() {
            if (resolved === undefined)
                await this.available();
            return resolved ?? `${binaryNames.join('/')} not found on PATH`;
        },
        async analyze(target: string, opts?: ProviderRunOptions): Promise<Result<unknown>> {
            if (!(await this.available()) || !resolved) {
                return result(target, name, [], {
                    status: 'unsupported',
                    limitations: [
                        `${name} is not installed; install the tool and ensure it is on PATH. ` +
                            'Reverse never simulates detect-only provider output.'
                    ]
                });
            }
            const timeoutMs = opts?.timeoutMs ?? 30000;
            const ran = await runTool(resolved, buildArgs(target), timeoutMs);
            if (ran.code === null || ran.code !== 0) {
                return result(target, name, [], {
                    status: 'partial',
                    limitations: [`${name} exited ${ran.code}`, ran.stderr.slice(0, 500)],
                    errors: ran.code === null ? ['timeout or spawn failure'] : []
                });
            }
            return result(target, name, [{
                    tool: name,
                    binary: resolved,
                    output: ran.stdout.slice(0, 64000)
                }], {
                status: 'completed',
                limitations: [
                    `${name} is detect-only; output is passed through without interpretation.`,
                    'Not a substitute for built-in deterministic packer heuristics.'
                ]
            });
        }
    };
}
/** Detect It Easy CLI (diec) — packer/compiler identification. */
export function createDiecProvider(): AnalyzerProvider {
    return detectOnlyProvider({
        name: 'diec',
        binaryNames: ['diec', 'die'],
        buildArgs: target => ['-j', target],
        capabilities: ['packer detection', 'compiler detection']
    });
}
/** YARA-X CLI — rule-based pattern matching (operator supplies rules). */
export function createYaraXProvider(): AnalyzerProvider {
    // Without operator rules we only probe; analyze returns partial.
    return detectOnlyProvider({
        name: 'yara-x',
        binaryNames: ['yr', 'yara-x'],
        buildArgs: (_target: string) => ['--version'],
        capabilities: ['pattern matching', 'rule scan']
    });
}
/** capa — capability/behavior surface detection. */
export function createCapaProvider(): AnalyzerProvider {
    return detectOnlyProvider({
        name: 'capa',
        binaryNames: ['capa'],
        buildArgs: target => ['-j', target],
        capabilities: ['capability detection', 'behavior surface']
    });
}
export function registerDetectOnlyProviders(register: (p: AnalyzerProvider) => void): void {
    for (const p of [
        createDiecProvider(),
        createYaraXProvider(),
        createCapaProvider()
    ]) {
        try {
            register(p);
        }
        catch {
            // already registered in tests/re-entry
        }
    }
}
/** GNU readelf — ELF headers and dynamic section (detect-only). */
export function createReadelfProvider(): AnalyzerProvider {
    return detectOnlyProvider({
        name: 'readelf',
        binaryNames: ['readelf'],
        buildArgs: (target) => ['-d', '-h', '-l', target],
        capabilities: ['elf-headers', 'dynamic-section', 'detect-only']
    });
}
/** GNU objdump — section headers / disassembly summary (detect-only). */
export function createObjdumpProvider(): AnalyzerProvider {
    return detectOnlyProvider({
        name: 'objdump',
        binaryNames: ['objdump'],
        buildArgs: (target) => ['-x', '-T', target],
        capabilities: ['elf-headers', 'symbols', 'detect-only']
    });
}
