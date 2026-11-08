export interface AnalyzerProvider {
    name: string;
    capabilities: string[];
    available(): Promise<boolean>;
    analyze(target: string): Promise<unknown>;
}
export declare function registerProvider(p: AnalyzerProvider): void;
export declare function listProviders(): {
    name: string;
    state: string;
    capabilities: string[];
}[];
export declare function getProviderStatus(): Promise<{
    name: string;
    available: boolean;
    capabilities: string[];
}[]>;
