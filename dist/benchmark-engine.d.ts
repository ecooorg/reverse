export interface RunSpec {
    command: string;
    args?: string[];
    cwd?: string;
    timeoutMs?: number;
    repetitions?: number;
    label?: string;
}
export declare function runBenchmark(spec: RunSpec): Promise<{
    findings: {
        artifactPath: string;
        label: string;
        command: string;
        args: string[];
        cwd: string;
        repetitionsRequested: number;
        repetitionsCompleted: number;
        meanDurationMs: number;
        medianDurationMs: any;
        minDurationMs: number | null;
        maxDurationMs: number | null;
        runs: any[];
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
export declare function compareBenchmarks(before: any, after: any): Promise<import("./core-types.js").Result<{
    beforeMeanMs: number;
    afterMeanMs: number;
    deltaMs: number;
    changePercent: number;
    improved: boolean;
    interpretation: string;
}>>;
