import { mkdir, readFile, writeFile, copyFile, access } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { result } from './core-types.js';
import { fileURLToPath } from 'node:url';
const AGENTS = ['cursor', 'claude', 'codex', 'vscode'] as const;
type Agent = (typeof AGENTS)[number];
function mcpServerBlock(reverseBin: string) {
    return {
        command: reverseBin,
        args: ['mcp'],
        env: {}
    };
}
function configPath(agent: Agent): string {
    const h = homedir();
    switch (agent) {
        case 'cursor':
            return path.join(h, '.cursor', 'mcp.json');
        case 'claude':
            return path.join(h, '.config', 'claude', 'mcp.json');
        case 'codex':
            return path.join(h, '.codex', 'config.toml');
        case 'vscode':
            return path.join(h, '.vscode', 'mcp.json');
        default:
            return path.join(h, '.reverse', 'mcp.json');
    }
}
/**
 * Register Reverse MCP in a supported agent config.
 * Dry-run by default; write only when confirm=true. Backs up existing files.
 */
export async function setupAgent(opts: {
    agent: string;
    dryRun?: boolean;
    confirm?: boolean;
    reverseBin?: string;
}) {
    const agent = opts.agent.toLowerCase() as Agent;
    if (!AGENTS.includes(agent)) {
        return result(opts.agent, 'setup', [], {
            status: 'failed',
            limitations: [`Unknown agent. Supported: ${AGENTS.join(', ')}`],
            errors: ['unknown agent'],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    const reverseBin = opts.reverseBin ?? 'reverse';
    const cfg = configPath(agent);
    const dryRun = opts.dryRun !== false && !opts.confirm;
    const block = mcpServerBlock(reverseBin);
    let before: string | null = null;
    try {
        before = await readFile(cfg, 'utf8');
    }
    catch { /* none */ }
    let after: string;
    if (agent === 'codex') {
        const snippet = [
            '',
            '[mcp_servers.reverse]',
            `command = "${reverseBin}"`,
            'args = ["mcp"]',
            ''
        ].join('\n');
        after = before?.includes('[mcp_servers.reverse]')
            ? before
            : (before ?? '') + snippet;
    }
    else {
        let json: any = { mcpServers: {} };
        if (before) {
            try {
                json = JSON.parse(before);
            }
            catch {
                json = { mcpServers: {} };
            }
        }
        json.mcpServers = json.mcpServers ?? {};
        json.mcpServers.reverse = block;
        after = JSON.stringify(json, null, 2) + '\n';
    }
    const skillSrc = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'skill-investigation.md');
    const skillDest = path.join(homedir(), '.reverse', 'skill-investigation.md');
    if (dryRun) {
        return result(agent, 'setup', [{
                agent,
                configPath: cfg,
                dryRun: true,
                wouldWrite: after !== before,
                skillDest,
                diffPreview: after.slice(0, 2000)
            }], {
            status: 'completed',
            limitations: [
                'Dry-run only. Pass confirm:true to write (with backup).'
            ],
            coverage: {
                examined: true,
                complete: true,
                notes: ['dry-run']
            }
        });
    }
    await mkdir(path.dirname(cfg), { recursive: true });
    if (before !== null) {
        await copyFile(cfg, `${cfg}.reverse-backup`);
    }
    await writeFile(cfg, after, 'utf8');
    try {
        await access(skillSrc);
        await mkdir(path.dirname(skillDest), { recursive: true });
        await copyFile(skillSrc, skillDest);
    }
    catch {
        // skill optional if docs not packaged next to dist
    }
    return result(agent, 'setup', [{
            agent,
            configPath: cfg,
            dryRun: false,
            backup: before !== null ? `${cfg}.reverse-backup` : null,
            skillDest
        }], {
        status: 'completed',
        limitations: [
            'Review the agent UI after install; paths may differ per product version.'
        ],
        coverage: {
            examined: true,
            complete: true,
            notes: ['written']
        }
    });
}
