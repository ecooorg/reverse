import type { EvidenceRef } from './core-types.js';
export declare class EvidenceEngine {
    record(kind: string, source: string, details?: Record<string, unknown>, sha256?: string): Promise<EvidenceRef>;
    persist(record: unknown): Promise<string>;
    get(id: string): Promise<string | undefined>;
}
