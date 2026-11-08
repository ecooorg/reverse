export declare const now: () => string;
export declare const sha256: (data: Buffer | string) => string;
export declare const storeDir: () => string;
export declare function saveJson(kind: string, value: unknown): Promise<string>;
export declare function readJson(file: string): Promise<any>;
export declare function fileEvidence(file: string): Promise<{
    details: {
        artifactPath: string;
        sizeBytes: number;
        mtime: string;
    };
    sha256?: string | undefined;
    id: `${string}-${string}-${string}-${string}-${string}`;
    kind: string;
    source: string;
    observedAt: string;
}>;
export declare function safeNumber(n: unknown): number | undefined;
