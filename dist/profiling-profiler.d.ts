export declare function profileProcess(pid: number, durationMs?: number, intervalMs?: number): Promise<import("./core-types.js").Result<{
    pid: number;
    durationMs: number;
    sampleCount: number;
    averageCpuPercent: number | null;
    peakCpuPercent: number | null;
    averageRssKb: number | null;
    peakRssKb: number | null;
    samples: {
        at: string;
        cpuPercent?: number;
        rssKb?: number;
        state?: string;
    }[];
}>>;
