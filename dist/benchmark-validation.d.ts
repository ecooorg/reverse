import { type RunSpec } from './benchmark-engine.js';
export declare function validateBehavior(spec: RunSpec, expected: {
    exitCode?: number;
    stdout?: string;
    stderr?: string;
}, repetitions?: number): Promise<{
    findings: {
        artifactPath: string;
        passed: boolean;
        checks: any[];
        benchmarkId: string;
    }[];
    schemaVersion: "1.0";
    id: string;
    target: string;
    operation: string;
    status: import("./core-types.js").Status;
    generatedAt: string;
    host: {
        hostname: string;
        platform: string;
        arch: string;
    };
    evidence: import("./core-types.js").EvidenceRef[];
    limitations: string[];
    errors: string[];
    coverage: import("./core-types.js").Coverage;
}>;
