import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { result } from './core-types.js';
/**
 * Optional HTTP JSON-RPC transport for MCP-like tool calls.
 * Enabled only when REVERSE_MCP_HTTP=1 and REVERSE_MCP_TOKEN is set.
 * Not a full MCP Streamable HTTP implementation — authenticated POST /rpc only.
 */
export function startHttpMcp(handler: (name: string, args: any) => Promise<unknown>, opts?: {
    host?: string;
    port?: number;
}) {
    if (process.env.REVERSE_MCP_HTTP !== '1') {
        return result('http-mcp', 'start_http_mcp', [], {
            status: 'unsupported',
            limitations: [
                'Set REVERSE_MCP_HTTP=1 and REVERSE_MCP_TOKEN to enable HTTP transport.'
            ],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    const token = process.env.REVERSE_MCP_TOKEN;
    if (!token || token.length < 8) {
        return result('http-mcp', 'start_http_mcp', [], {
            status: 'unsupported',
            limitations: [
                'REVERSE_MCP_TOKEN must be set (min 8 chars) before HTTP MCP starts.'
            ],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    const host = opts?.host ?? process.env.REVERSE_MCP_HTTP_HOST ?? '127.0.0.1';
    const port = opts?.port
        ?? Number(process.env.REVERSE_MCP_HTTP_PORT ?? 7331);
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method === 'GET' && req.url === '/health') {
            res.end(JSON.stringify({ ok: true }));
            return;
        }
        if (req.method !== 'POST' || req.url !== '/rpc') {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'not found' }));
            return;
        }
        const auth = req.headers.authorization ?? '';
        if (auth !== `Bearer ${token}`) {
            res.statusCode = 401;
            res.end(JSON.stringify({ error: 'unauthorized' }));
            return;
        }
        const chunks: Buffer[] = [];
        for await (const c of req)
            chunks.push(c as Buffer);
        let body: any;
        try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        }
        catch {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'invalid json' }));
            return;
        }
        const name = body.method ?? body.name;
        const args = body.params ?? body.arguments ?? {};
        if (typeof name !== 'string') {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'method required' }));
            return;
        }
        try {
            const out = await handler(name, args);
            res.end(JSON.stringify({ ok: true, result: out }));
        }
        catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({
                ok: false,
                error: e?.message ?? String(e)
            }));
        }
    });
    server.listen(port, host);
    return result('http-mcp', 'start_http_mcp', [{
            host,
            port,
            path: '/rpc',
            auth: 'Bearer REVERSE_MCP_TOKEN'
        }], {
        status: 'completed',
        limitations: [
            'Authenticated POST /rpc only; not full MCP Streamable HTTP.',
            'Bind to localhost unless you intentionally expose the port.'
        ],
        coverage: {
            examined: true,
            complete: true,
            notes: [`listening ${host}:${port}`]
        }
    });
}
