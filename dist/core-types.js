import { hostname, platform } from 'node:os';
import { randomUUID } from 'node:crypto';
export function result(target, operation, findings, options = {}) {
    return { schemaVersion: '1.0', id: randomUUID(), target, operation, status: options.status ?? 'completed', generatedAt: new Date().toISOString(), host: { hostname: hostname(), platform: platform(), arch: process.arch }, findings, evidence: options.evidence ?? [], limitations: options.limitations ?? [], errors: options.errors ?? [], coverage: options.coverage ?? { examined: true, complete: true, notes: [] } };
}
//# sourceMappingURL=core-types.js.map