import { hostname, platform } from 'node:os';
import { randomUUID } from 'node:crypto';
export type Status = 'completed' | 'partial' | 'unsupported' | 'failed';
export interface EvidenceRef {
    id: string;
    kind: string;
    source: string;
    observedAt: string;
    sha256?: string;
    details?: Record<string, unknown>;
}
export interface Coverage {
    examined: boolean;
    complete: boolean;
    notes: string[];
}
export interface Pagination {
    offset: number;
    limit: number;
    total: number;
    nextOffset: number | null;
}
export interface Result<T> {
    schemaVersion: '1.0';
    id: string;
    target: string;
    operation: string;
    status: Status;
    generatedAt: string;
    host: {
        hostname: string;
        platform: string;
        arch: string;
    };
    findings: T[];
    evidence: EvidenceRef[];
    limitations: string[];
    errors: string[];
    coverage: Coverage;
    pagination?: Pagination;
}
type ResultOptions<T> = Partial<Pick<Result<T>, 'status' | 'evidence' | 'limitations' | 'errors' | 'coverage' | 'pagination'>>;
export function result<T>(target: string, operation: string, findings: T[], options: ResultOptions<T> = {}): Result<T> {
    return {
        schemaVersion: '1.0',
        id: randomUUID(),
        target,
        operation,
        status: options.status ?? 'completed',
        generatedAt: new Date().toISOString(),
        host: {
            hostname: hostname(), platform: platform(), arch: process.arch
        },
        findings,
        evidence: options.evidence ?? [],
        limitations: options.limitations ?? [],
        errors: options.errors ?? [],
        coverage: options.coverage ?? {
            examined: true, complete: true, notes: []
        }, ...(options.pagination ? {
            pagination: options.pagination
        } : {})
    };
}
