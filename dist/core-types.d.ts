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
}
export declare function result<T>(target: string, operation: string, findings: T[], options?: Partial<Pick<Result<T>, 'status' | 'evidence' | 'limitations' | 'errors' | 'coverage'>>): Result<T>;
