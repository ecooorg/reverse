import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from './core-util.js';
export interface McpResource {
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
}
/** List local evidence and session artifacts as MCP resources. */
export async function listResources(): Promise<{
    resources: McpResource[];
}> {
    const resources: McpResource[] = [];
    const root = storeDir();
    for (const kind of ['evidence', 'sessions', 'validations', 'reports', 'workspaces']) {
        const dir = path.join(root, kind);
        let names: string[] = [];
        try {
            names = await readdir(dir);
        }
        catch {
            continue;
        }
        for (const n of names.filter(x => x.endsWith('.json')).slice(0, 200)) {
            const id = n.replace(/\.json$/, '');
            resources.push({
                uri: `reverse://${kind}/${id}`,
                name: `${kind}/${id}`,
                description: `Local ${kind} artifact`,
                mimeType: 'application/json'
            });
        }
    }
    return { resources };
}
export async function readResource(uri: string) {
    const m = uri.match(/^reverse:\/\/(evidence|sessions|validations|reports|workspaces)\/([A-Za-z0-9_-]+)$/);
    if (!m)
        throw new Error(`Unsupported resource URI: ${uri}`);
    const file = path.join(storeDir(), m[1], `${m[2]}.json`);
    const text = await readFile(file, 'utf8');
    return {
        contents: [{
                uri,
                mimeType: 'application/json',
                text
            }]
    };
}
