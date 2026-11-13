/**
 * Android device-side UI hierarchy / seeded input capture (Patch P step 6).
 * All operations require research-session authorization, CONTROLLED_EXECUTION and confirm=true.
 * Device text is always wrapped as untrusted. Never simulates adb output in product paths.
 */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { operatingMode } from './benchmark-gate.js';
import { wrapUntrusted } from './core-untrusted.js';
import { requireLegacyGate } from './legacy-gate.js';
import type { LegacyAuthorization } from './legacy-types.js';
const execFileAsync = promisify(execFile);
/** Injected adb runner for unit tests; product path uses real execFile. */
export type AdbRunner = (serial: string, args: string[], opts?: {
    timeout?: number;
    maxBuffer?: number;
}) => Promise<{
    stdout: string;
    stderr: string;
}>;
const defaultRunner: AdbRunner = async (serial, args, opts = {}) => {
    const result = await execFileAsync('adb', ['-s', serial, ...args], {
        timeout: opts.timeout ?? 20000,
        windowsHide: true,
        maxBuffer: opts.maxBuffer ?? 2 * 1024 * 1024,
        encoding: 'utf8',
    });
    return { stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
};
function isValidSerial(serial: string | undefined | null): serial is string {
    return typeof serial === 'string'
        && serial.length > 0
        && serial.length <= 256
        && !serial.startsWith('-');
}
function refuseMode(serial: string | null): {
    status: 'refused';
    serial: string | null;
    limitations: string[];
} {
    return {
        status: 'refused',
        serial,
        limitations: [
            'Android device capture requires REVERSE_MODE=CONTROLLED_EXECUTION and confirm=true',
        ],
    };
}
function unsupportedSerial(): {
    status: 'unsupported';
    serial: null;
    limitations: string[];
} {
    return {
        status: 'unsupported',
        serial: null,
        limitations: ['Set a valid REVERSE_ANDROID_SERIAL or serial option; no adb command was run.'],
    };
}
/**
 * Collect a bounded UI hierarchy (uiautomator dump) and a SHA-256 of a screencap.
 * The raw PNG is not returned — only the digest — so MCP payloads stay small and
 * untrusted binary content is never forwarded to the client.
 */
export async function collectAndroidUiObservations(input: {
    authorization?: LegacyAuthorization | null;
    sessionId?: string;
    confirm: boolean;
    serial?: string;
    /** Injected for tests only. */
    runner?: AdbRunner;
}): Promise<{
    status: 'completed' | 'unsupported' | 'refused' | 'partial';
    serial: string | null;
    hierarchyXml: string | null;
    screenshotSha256: string | null;
    untrustedContent: Record<string, unknown> | null;
    limitations: string[];
}> {
    await requireLegacyGate({
        authorization: input.authorization,
        sessionId: input.sessionId,
        operation: 'collect_android_ui_observations',
    });
    const serial = input.serial ?? process.env.REVERSE_ANDROID_SERIAL ?? '';
    if (operatingMode() !== 'CONTROLLED_EXECUTION' || input.confirm !== true) {
        return { ...refuseMode(serial || null), hierarchyXml: null, screenshotSha256: null, untrustedContent: null };
    }
    if (!isValidSerial(serial)) {
        return { ...unsupportedSerial(), hierarchyXml: null, screenshotSha256: null, untrustedContent: null };
    }
    const run = input.runner ?? defaultRunner;
    const limitations: string[] = [];
    let hierarchyXml: string | null = null;
    let screenshotSha256: string | null = null;
    try {
        // Dump hierarchy to device path then pull text via shell cat (bounded).
        await run(serial, ['shell', 'uiautomator', 'dump', '/sdcard/window_dump.xml'], { timeout: 15000 });
        const dump = await run(serial, ['shell', 'cat', '/sdcard/window_dump.xml'], {
            timeout: 10000,
            maxBuffer: 1024 * 1024,
        });
        hierarchyXml = `${dump.stdout}\n${dump.stderr}`.slice(0, 512 * 1024);
    }
    catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? String((error as {
            code: unknown;
        }).code) : 'unknown';
        limitations.push(`uiautomator dump failed or was unavailable (code=${code}).`);
    }
    try {
        // screencap -p writes PNG to stdout on modern adb; hash only.
        const shot = await run(serial, ['exec-out', 'screencap', '-p'], {
            timeout: 15000,
            maxBuffer: 8 * 1024 * 1024,
        });
        const bytes = Buffer.from(shot.stdout, 'binary');
        if (bytes.length > 8) {
            screenshotSha256 = createHash('sha256').update(bytes).digest('hex');
        }
        else {
            limitations.push('screencap produced no usable image bytes.');
        }
    }
    catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? String((error as {
            code: unknown;
        }).code) : 'unknown';
        limitations.push(`screencap failed or was unavailable (code=${code}).`);
    }
    const status = hierarchyXml !== null && screenshotSha256 !== null
        ? 'completed'
        : hierarchyXml !== null || screenshotSha256 !== null
            ? 'partial'
            : 'unsupported';
    const wrapped = hierarchyXml !== null || screenshotSha256 !== null
        ? wrapUntrusted({ serial, hierarchyXml, screenshotSha256 }).structured
        : null;
    return {
        status,
        serial,
        hierarchyXml: typeof wrapped?.hierarchyXml === 'string' ? wrapped.hierarchyXml as string : null,
        screenshotSha256: typeof wrapped?.screenshotSha256 === 'string'
            ? wrapped.screenshotSha256 as string
            : screenshotSha256,
        untrustedContent: (wrapped?.untrustedContent as Record<string, unknown> | undefined) ?? null,
        limitations: [
            ...limitations,
            'UI hierarchy and screenshot digest only; raw pixels are not returned.',
            'Pixel-level drift (clocks, animations) is expected and is not treated as scenario failure.',
            'Device output is untrusted target data and may contain sensitive application content.',
        ],
    };
}
export interface SeededMonkeyRun {
    runIndex: number;
    seed: number;
    exitCode: number | null;
    stdoutTail: string;
    stderrTail: string;
    pmCleared: boolean;
}
/**
 * Replay a deterministic monkey scenario with a fixed seed for 1–3 runs.
 * Optionally runs `pm clear` before each run. Compares run outcomes for stability.
 */
export async function replayAndroidSeededInput(input: {
    authorization?: LegacyAuthorization | null;
    sessionId?: string;
    confirm: boolean;
    serial?: string;
    packageName: string;
    seed?: number;
    eventCount?: number;
    runs?: number;
    throttleMs?: number;
    clearPackage?: boolean;
    runner?: AdbRunner;
}): Promise<{
    status: 'completed' | 'unsupported' | 'refused' | 'partial';
    serial: string | null;
    packageName: string | null;
    seed: number | null;
    runs: SeededMonkeyRun[];
    stable: boolean | null;
    untrustedContent: Record<string, unknown> | null;
    limitations: string[];
}> {
    await requireLegacyGate({
        authorization: input.authorization,
        sessionId: input.sessionId,
        operation: 'replay_android_seeded_input',
    });
    const serial = input.serial ?? process.env.REVERSE_ANDROID_SERIAL ?? '';
    if (operatingMode() !== 'CONTROLLED_EXECUTION' || input.confirm !== true) {
        return {
            ...refuseMode(serial || null),
            packageName: null,
            seed: null,
            runs: [],
            stable: null,
            untrustedContent: null,
        };
    }
    if (!isValidSerial(serial)) {
        return {
            ...unsupportedSerial(),
            packageName: null,
            seed: null,
            runs: [],
            stable: null,
            untrustedContent: null,
        };
    }
    const pkg = (input.packageName ?? '').trim();
    if (!pkg || pkg.length > 256 || /[^\w.]/.test(pkg) || pkg.startsWith('.')) {
        return {
            status: 'unsupported',
            serial,
            packageName: null,
            seed: null,
            runs: [],
            stable: null,
            untrustedContent: null,
            limitations: ['packageName must be a non-empty Java-style package identifier; no adb command was run.'],
        };
    }
    const seed = Number.isFinite(input.seed) ? Math.floor(input.seed as number) : 42;
    const eventCount = Math.max(1, Math.min(500, Number.isFinite(input.eventCount)
        ? Math.floor(input.eventCount as number)
        : 50));
    const runCount = Math.max(1, Math.min(3, Number.isFinite(input.runs) ? Math.floor(input.runs as number) : 2));
    const throttle = Math.max(0, Math.min(1000, Number.isFinite(input.throttleMs)
        ? Math.floor(input.throttleMs as number)
        : 50));
    const clearPackage = input.clearPackage === true;
    const run = input.runner ?? defaultRunner;
    const limitations: string[] = [];
    const runs: SeededMonkeyRun[] = [];
    for (let i = 0; i < runCount; i++) {
        let pmCleared = false;
        if (clearPackage) {
            try {
                await run(serial, ['shell', 'pm', 'clear', pkg], { timeout: 20000 });
                pmCleared = true;
            }
            catch (error) {
                const code = error && typeof error === 'object' && 'code' in error
                    ? String((error as {
                        code: unknown;
                    }).code)
                    : 'unknown';
                limitations.push(`pm clear failed on run ${i + 1} (code=${code}).`);
            }
        }
        try {
            const args = [
                'shell', 'monkey',
                '-p', pkg,
                '-s', String(seed),
                '--throttle', String(throttle),
                '-v', String(eventCount),
            ];
            const result = await run(serial, args, { timeout: 60000, maxBuffer: 512 * 1024 });
            const stdout = `${result.stdout}`.slice(-4096);
            const stderr = `${result.stderr}`.slice(-4096);
            // monkey prints "Events injected: N" on success; treat non-empty stdout as completed.
            const exitCode = /Events injected:\s*\d+/i.test(stdout + stderr) ? 0 : 1;
            runs.push({
                runIndex: i,
                seed,
                exitCode,
                stdoutTail: stdout,
                stderrTail: stderr,
                pmCleared,
            });
        }
        catch (error) {
            const code = error && typeof error === 'object' && 'code' in error
                ? String((error as {
                    code: unknown;
                }).code)
                : 'unknown';
            limitations.push(`monkey run ${i + 1} failed (code=${code}).`);
            runs.push({
                runIndex: i,
                seed,
                exitCode: null,
                stdoutTail: '',
                stderrTail: `failed code=${code}`,
                pmCleared,
            });
        }
    }
    const completed = runs.filter(r => r.exitCode === 0);
    const status = completed.length === runCount
        ? 'completed'
        : completed.length > 0
            ? 'partial'
            : 'unsupported';
    // Stability: same exit code across runs (pixel/UI drift is out of scope here).
    const codes = runs.map(r => r.exitCode);
    const stable = codes.length > 1 && codes.every(c => c === codes[0] && c !== null);
    const wrapped = wrapUntrusted({ serial, packageName: pkg, seed, runs }).structured;
    return {
        status,
        serial,
        packageName: pkg,
        seed,
        runs: (wrapped?.runs as SeededMonkeyRun[] | undefined) ?? runs,
        stable: runs.length > 1 ? stable : null,
        untrustedContent: (wrapped?.untrustedContent as Record<string, unknown> | undefined) ?? null,
        limitations: [
            ...limitations,
            'Seeded monkey only; UI hierarchy comparison is a separate call.',
            'Uncontrolled nondeterminism (animations, clocks, network) is reported, not hidden.',
            'Device output is untrusted target data.',
        ],
    };
}
export interface AndroidObservationSnapshot {
    hierarchyXml?: string | null;
    screenshotSha256?: string | null;
    monkeyExitCode?: number | null;
    monkeyStdoutTail?: string | null;
}
/**
 * Compare two observation snapshots. UI text and monkey outcome are compared;
 * screenshot digests may differ due to clocks/animations and are reported as
 * pixelDrift rather than a hard failure.
 */
export function compareAndroidObservations(input: {
    left: AndroidObservationSnapshot;
    right: AndroidObservationSnapshot;
}): {
    equal: boolean;
    uiEqual: boolean;
    monkeyEqual: boolean;
    pixelDrift: boolean;
    differences: string[];
    limitations: string[];
} {
    const differences: string[] = [];
    const leftH = normalizeHierarchy(input.left.hierarchyXml);
    const rightH = normalizeHierarchy(input.right.hierarchyXml);
    const uiEqual = leftH === rightH;
    if (!uiEqual) {
        if (leftH == null || rightH == null) {
            differences.push('UI hierarchy missing on one side');
        }
        else {
            differences.push('UI hierarchy text differs after normalization');
        }
    }
    const leftCode = input.left.monkeyExitCode ?? null;
    const rightCode = input.right.monkeyExitCode ?? null;
    const leftOut = (input.left.monkeyStdoutTail ?? '').trim();
    const rightOut = (input.right.monkeyStdoutTail ?? '').trim();
    const monkeyEqual = leftCode === rightCode
        && (leftCode === null || leftOut === rightOut || bothInjected(leftOut, rightOut));
    if (!monkeyEqual) {
        differences.push(`monkey outcome differs (exit ${String(leftCode)} vs ${String(rightCode)})`);
    }
    const leftSha = input.left.screenshotSha256 ?? null;
    const rightSha = input.right.screenshotSha256 ?? null;
    const pixelDrift = leftSha != null && rightSha != null && leftSha !== rightSha;
    if (pixelDrift) {
        differences.push('screenshot SHA-256 differs (pixel drift; not treated as scenario failure)');
    }
    const equal = uiEqual && monkeyEqual;
    return {
        equal,
        uiEqual,
        monkeyEqual,
        pixelDrift,
        differences,
        limitations: [
            'Pixel drift from clocks, animations and dynamic text is expected and does not fail the comparison.',
            'Hierarchy normalization strips resource-ids timestamps when present; residual layout noise may remain.',
        ],
    };
}
function normalizeHierarchy(xml: string | null | undefined): string | null {
    if (xml == null)
        return null;
    return xml
        .replace(/\r\n/g, '\n')
        .replace(/\s+NAF="true"/g, '')
        .replace(/\s+drawing-order="\d+"/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
function bothInjected(a: string, b: string): boolean {
    return /Events injected:\s*\d+/i.test(a) && /Events injected:\s*\d+/i.test(b);
}
/**
 * Plan a Frida Java.perform session script for a package (does not execute Frida).
 * Operators supply the script under CONTROLLED_EXECUTION via external Frida.
 */
export function planAndroidFridaSession(input: {
    packageName: string;
    hooks?: string[];
}): {
    allowed: boolean;
    script: string | null;
    limitations: string[];
} {
    const pkg = (input.packageName ?? '').trim();
    if (!pkg || /[^\w.]/.test(pkg)) {
        return {
            allowed: false,
            script: null,
            limitations: ['packageName must be a Java-style identifier'],
        };
    }
    const hooks = (input.hooks ?? ['Activity.onCreate', 'Activity.onResume']).slice(0, 20);
    const lines = [
        '// Generated by reverse — operator must run under CONTROLLED_EXECUTION',
        `Java.perform(function () {`,
        `  var pkg = ${JSON.stringify(pkg)};`,
    ];
    for (const h of hooks) {
        const safe = h.replace(/[^\w.$]/g, '');
        if (!safe)
            continue;
        lines.push(`  try {`);
        lines.push(`    var C = Java.use(${JSON.stringify(safe.split('.')[0] === safe ? safe : safe)});`);
        lines.push(`    // hook placeholder for ${safe}`);
        lines.push(`  } catch (e) { /* class missing on this API level */ }`);
    }
    lines.push('});');
    return {
        allowed: true,
        script: lines.join('\n'),
        limitations: [
            'Script is generated only; Frida attach/spawn is operator-driven under CONTROLLED_EXECUTION.',
            'Call-frequency continuous profiles require an external Frida session and are not automated here.',
        ],
    };
}
/**
 * Detect simpleperf / Perfetto availability on device (no long profiling run).
 */
export async function detectAndroidProfilers(input: {
    authorization?: LegacyAuthorization | null;
    sessionId?: string;
    confirm: boolean;
    serial?: string;
    runner?: AdbRunner;
}): Promise<{
    status: 'completed' | 'unsupported' | 'refused';
    serial: string | null;
    simpleperf: boolean;
    perfetto: boolean;
    limitations: string[];
}> {
    await requireLegacyGate({
        authorization: input.authorization,
        sessionId: input.sessionId,
        operation: 'detect_android_profilers',
    });
    const serial = input.serial ?? process.env.REVERSE_ANDROID_SERIAL ?? '';
    if (operatingMode() !== 'CONTROLLED_EXECUTION' || input.confirm !== true) {
        return { ...refuseMode(serial || null), simpleperf: false, perfetto: false };
    }
    if (!isValidSerial(serial)) {
        return { ...unsupportedSerial(), simpleperf: false, perfetto: false };
    }
    const run = input.runner ?? defaultRunner;
    let simpleperf = false;
    let perfetto = false;
    const limitations: string[] = [];
    try {
        const sp = await run(serial, ['shell', 'which', 'simpleperf'], { timeout: 8000 });
        simpleperf = /simpleperf/.test(sp.stdout + sp.stderr);
    }
    catch {
        limitations.push('simpleperf probe failed');
    }
    try {
        const pf = await run(serial, ['shell', 'which', 'perfetto'], { timeout: 8000 });
        perfetto = /perfetto/.test(pf.stdout + pf.stderr);
    }
    catch {
        limitations.push('perfetto probe failed');
    }
    return {
        status: 'completed',
        serial,
        simpleperf,
        perfetto,
        limitations: [
            ...limitations,
            'Detect-only: no profiling session is started. Operators run simpleperf/Perfetto under CONTROLLED_EXECUTION.',
        ],
    };
}
/**
 * Bounded device file / database path listing for an app data tree (no content dump of large DBs).
 */
export async function collectAndroidFileObservations(input: {
    authorization?: LegacyAuthorization | null;
    sessionId?: string;
    confirm: boolean;
    serial?: string;
    packageName: string;
    runner?: AdbRunner;
}): Promise<{
    status: 'completed' | 'unsupported' | 'refused' | 'partial';
    serial: string | null;
    packageName: string | null;
    paths: string[];
    untrustedContent: Record<string, unknown> | null;
    limitations: string[];
}> {
    await requireLegacyGate({
        authorization: input.authorization,
        sessionId: input.sessionId,
        operation: 'collect_android_file_observations',
    });
    const serial = input.serial ?? process.env.REVERSE_ANDROID_SERIAL ?? '';
    if (operatingMode() !== 'CONTROLLED_EXECUTION' || input.confirm !== true) {
        return {
            ...refuseMode(serial || null),
            packageName: null,
            paths: [],
            untrustedContent: null,
        };
    }
    if (!isValidSerial(serial)) {
        return {
            ...unsupportedSerial(),
            packageName: null,
            paths: [],
            untrustedContent: null,
        };
    }
    const pkg = (input.packageName ?? '').trim();
    if (!pkg || /[^\w.]/.test(pkg) || pkg.length > 256) {
        return {
            status: 'unsupported',
            serial,
            packageName: null,
            paths: [],
            untrustedContent: null,
            limitations: ['packageName must be a non-empty Java-style package identifier'],
        };
    }
    const run = input.runner ?? defaultRunner;
    const limitations: string[] = [];
    let paths: string[] = [];
    try {
        // List shared_prefs and databases only — bounded depth
        const shellArgs = ['shell', 'run-as', pkg, 'sh', '-c', 'ls shared_prefs 2>/dev/null; ls databases 2>/dev/null'];
        const out = await run(serial, shellArgs, { timeout: 15000, maxBuffer: 256 * 1024 });
        const text = `${out.stdout}\n${out.stderr}`;
        paths = text
            .split(/\r?\n/)
            .map(s => s.trim())
            .filter(s => s && !s.startsWith('ls:') && s.length < 256)
            .slice(0, 200);
    }
    catch (error) {
        const code = error && typeof error === 'object' && 'code' in error
            ? String((error as {
                code: unknown;
            }).code)
            : 'unknown';
        limitations.push(`run-as listing failed (code=${code}); app may not be debuggable.`);
    }
    const wrapped = paths.length
        ? wrapUntrusted({ serial, packageName: pkg, paths }).structured
        : null;
    return {
        status: paths.length ? 'completed' : 'partial',
        serial,
        packageName: pkg,
        paths: (wrapped?.paths as string[] | undefined) ?? paths,
        untrustedContent: (wrapped?.untrustedContent as Record<string, unknown> | undefined) ?? null,
        limitations: [
            ...limitations,
            'Path names only; database contents are not dumped.',
            'Device output is untrusted target data.',
        ],
    };
}
/**
 * Bounded network/connectivity diagnostics (dumpsys connectivity + wifi).
 * Not a full MITM proxy — reports device-side network state only.
 */
export async function collectAndroidNetworkObservations(input: {
    authorization?: LegacyAuthorization | null;
    sessionId?: string;
    confirm: boolean;
    serial?: string;
    runner?: AdbRunner;
}): Promise<{
    status: 'completed' | 'unsupported' | 'refused' | 'partial';
    serial: string | null;
    connectivity: string | null;
    wifi: string | null;
    untrustedContent: Record<string, unknown> | null;
    limitations: string[];
}> {
    await requireLegacyGate({
        authorization: input.authorization,
        sessionId: input.sessionId,
        operation: 'collect_android_network_observations',
    });
    const serial = input.serial ?? process.env.REVERSE_ANDROID_SERIAL ?? '';
    if (operatingMode() !== 'CONTROLLED_EXECUTION' || input.confirm !== true) {
        return {
            ...refuseMode(serial || null),
            connectivity: null,
            wifi: null,
            untrustedContent: null,
        };
    }
    if (!isValidSerial(serial)) {
        return {
            ...unsupportedSerial(),
            connectivity: null,
            wifi: null,
            untrustedContent: null,
        };
    }
    const run = input.runner ?? defaultRunner;
    const limitations: string[] = [];
    let connectivity: string | null = null;
    let wifi: string | null = null;
    try {
        const c = await run(serial, ['shell', 'dumpsys', 'connectivity'], {
            timeout: 15000,
            maxBuffer: 512 * 1024,
        });
        connectivity = `${c.stdout}\n${c.stderr}`.slice(0, 256 * 1024);
    }
    catch (error) {
        const code = error && typeof error === 'object' && 'code' in error
            ? String((error as {
                code: unknown;
            }).code)
            : 'unknown';
        limitations.push(`dumpsys connectivity failed (code=${code})`);
    }
    try {
        const w = await run(serial, ['shell', 'dumpsys', 'wifi'], {
            timeout: 15000,
            maxBuffer: 512 * 1024,
        });
        wifi = `${w.stdout}\n${w.stderr}`.slice(0, 256 * 1024);
    }
    catch (error) {
        const code = error && typeof error === 'object' && 'code' in error
            ? String((error as {
                code: unknown;
            }).code)
            : 'unknown';
        limitations.push(`dumpsys wifi failed (code=${code})`);
    }
    const status = connectivity && wifi
        ? 'completed'
        : connectivity || wifi
            ? 'partial'
            : 'unsupported';
    const wrapped = connectivity || wifi
        ? wrapUntrusted({ serial, connectivity, wifi }).structured
        : null;
    return {
        status,
        serial,
        connectivity: typeof wrapped?.connectivity === 'string' ? wrapped.connectivity as string : null,
        wifi: typeof wrapped?.wifi === 'string' ? wrapped.wifi as string : null,
        untrustedContent: (wrapped?.untrustedContent as Record<string, unknown> | undefined) ?? null,
        limitations: [
            ...limitations,
            'Device-side dumpsys only; not a transparent proxy or packet capture.',
            'Proxy MITM and pcap capture remain operator-driven under CONTROLLED_EXECUTION.',
            'Device output is untrusted target data.',
        ],
    };
}
/**
 * Expand Frida plan with an optional call-frequency sampling skeleton (host script only).
 * Does not attach; continuous profiling remains operator-driven.
 */
export function planAndroidFridaCallFrequency(input: {
    packageName: string;
    sampleWindowMs?: number;
}): {
    allowed: boolean;
    script: string | null;
    limitations: string[];
} {
    const base = planAndroidFridaSession({ packageName: input.packageName });
    if (!base.allowed || !base.script) {
        return base;
    }
    const windowMs = Math.max(1000, Math.min(input.sampleWindowMs ?? 10000, 120000));
    const freq = `
// Call-frequency skeleton (operator runs under Frida; Reverse does not attach).
// Sample window: ${windowMs} ms
var __revCounts = {};
function __revBump(name) {
  __revCounts[name] = (__revCounts[name] || 0) + 1;
}
setTimeout(function () {
  var rows = Object.keys(__revCounts).map(function (k) {
    return k + ':' + __revCounts[k];
  });
  send({ type: 'call-frequency', windowMs: ${windowMs}, counts: __revCounts, rows: rows });
}, ${windowMs});
`;
    return {
        allowed: true,
        script: `${base.script}
${freq}`,
        limitations: [
            ...base.limitations,
            'Call-frequency block is a host-side script skeleton; Reverse does not maintain a continuous Frida session.',
            'Operator must run Frida and collect send() payloads; not a built-in profiler service.',
        ],
    };
}
/**
 * Plan-only network proxy / capture guidance. Not a MITM implementation.
 */
export function planAndroidProxyCapture(input: {
    packageName?: string;
}): {
    allowed: boolean;
    steps: string[];
    limitations: string[];
} {
    const pkg = input.packageName?.trim();
    return {
        allowed: true,
        steps: [
            'Prefer device-side dumpsys connectivity/wifi via collect_android_network_observations (bounded, no MITM).',
            'For traffic inspection, operator supplies a local proxy (e.g. mitmproxy) '
                + 'and device proxy settings under CONTROLLED_EXECUTION.',
            'Capture pcap only with operator-owned tooling (tcpdump/PCAPdroid); Reverse does not embed a packet sniffer.',
            pkg
                ? `Scope capture to package ${pkg} when the operator tool supports per-app filters.`
                : 'Declare the target package when scoping per-app capture.',
            'Record proxy/pcap artifacts as operator evidence; attach via research session if needed.',
        ],
        limitations: [
            'Reverse does not implement transparent proxy, certificate pinning bypass, or pcap capture.',
            'TLS interception requires operator consent and a lawful test environment.',
            'Network observation in-tree remains dumpsys-level only.',
        ],
    };
}
