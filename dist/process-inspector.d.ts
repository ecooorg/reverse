export interface ProcessInfo {
    pid: number;
    ppid?: number;
    name: string;
    command?: string;
}
export declare function listProcesses(limit?: number): Promise<import("./core-types.js").Result<ProcessInfo>>;
export declare function inspectProcess(pid: number): Promise<import("./core-types.js").Result<ProcessInfo>>;
