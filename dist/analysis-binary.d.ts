export interface BinaryFinding {
    format: string;
    architecture: string;
    bitness: number | null;
    endian: string | null;
    fileSize: number;
    entryPoint?: string;
    sections?: unknown[];
    imports?: string[];
}
export declare function analyzeBinary(file: string): Promise<import("./core-types.js").Result<BinaryFinding>>;
