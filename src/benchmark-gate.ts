import path from 'node:path';
export type GateEnv = Record<string, string | undefined>;
/** Mode selected by the operator through REVERSE_MODE; anything unknown falls back to READ_ONLY. */
export function operatingMode(env: GateEnv = process.env): 'READ_ONLY' | 'OBSERVE' | 'CONTROLLED_EXECUTION' {
    const m = (env.REVERSE_MODE ?? '').toUpperCase();
    return m === 'CONTROLLED_EXECUTION' || m === 'OBSERVE' ? m : 'READ_ONLY';
}
const list = (v?: string) => (v ?? '').split(',').map(s => s.trim()).filter(Boolean);
const inside = (root: string, dir: string) => {
    const r = path.relative(path.resolve(root), path.resolve(dir));
    return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
};
/**
 * Gate for MCP tools that run a command (AUDIT F-01). Returns an error message, or null when the call may proceed.
 * Needs REVERSE_MODE=CONTROLLED_EXECUTION and a command allowlist (REVERSE_COMMAND_ALLOWLIST: names or absolute paths,
 * separated by ","; "*" allows any command and must be chosen on purpose). REVERSE_CWD_ROOT, when set, confines cwd.
 */
export function checkCommandGate(spec: {
    command?: string;
    cwd?: string;
}, env: GateEnv = process.env): string | null {
    if (operatingMode(env) !== 'CONTROLLED_EXECUTION')
        return 'Command execution is disabled: the operator must start Reverse with REVERSE_MODE=CONTROLLED_EXECUTION '
            + 'and REVERSE_COMMAND_ALLOWLIST.';
    const allow = list(env.REVERSE_COMMAND_ALLOWLIST);
    if (!allow.length)
        return 'Command execution needs REVERSE_COMMAND_ALLOWLIST (command names or absolute paths; "*" to allow any).';
    const command = spec.command ?? '';
    if (!allow.includes('*') && !allow.some(a => (path.isAbsolute(a) ? path.resolve(a) === path.resolve(command) : a === command)))
        return `Command is not on REVERSE_COMMAND_ALLOWLIST: ${path.basename(command)}`;
    if (env.REVERSE_CWD_ROOT && !inside(env.REVERSE_CWD_ROOT, spec.cwd ?? process.cwd()))
        return 'cwd is outside REVERSE_CWD_ROOT.';
    return null;
}
