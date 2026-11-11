import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const buildDir = process.env.REVERSE_MCP_BUILD_DIR || '../dist';
const modulePath = resolve(fileURLToPath(new URL('.', import.meta.url)), buildDir, 'mcp-tools.js');
const { tools } = await import(pathToFileURL(modulePath).href);

const path = new URL('../docs/MCP.md', import.meta.url);
const source = await readFile(path, 'utf8');
const start = source.indexOf('| Tool | Required arguments | Purpose |');
if (start < 0) throw new Error('MCP tool table header not found.');
const end = source.indexOf('\n\n', start);
if (end < 0) throw new Error('MCP tool table terminator not found.');

const escape = value => String(value ?? '').replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();
const rows = tools.map(tool => {
    const required = Array.isArray(tool.inputSchema?.required) ? tool.inputSchema.required : [];
    const purpose = tool.description || tool.title || tool.name;
    return `| \`${escape(tool.name)}\` | ${required.length ? required.map(x => `\`${escape(x)}\``).join(', ') : 'none'} | ${escape(purpose)} |`;
});
const table = [
    '| Tool | Required arguments | Purpose |',
    '|---|---|---|',
    ...rows
].join('\n');
const updated = source.slice(0, start) + table + source.slice(end);
const countUpdated = updated.replace(/\*\*\d+ tools\*\*/, `**${tools.length} tools**`);
if (process.argv.includes('--write')) {
    await writeFile(path, countUpdated);
} else if (countUpdated !== source) {
    throw new Error('docs/MCP.md is stale; run `npm run docs:mcp:write` after building.');
}
