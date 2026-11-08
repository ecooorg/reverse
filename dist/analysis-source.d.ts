export declare function analyzeSource(root: string): Promise<import("./core-types.js").Result<{
    fileCount: number;
    totalBytes: number;
    approximateLines: number;
    filesByExtension: Record<string, number>;
    externalImportReferences: [string, number][];
    packageManifest: Record<string, unknown>;
}>>;
