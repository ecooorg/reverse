import type { AnalyzerProvider } from './providers-registry.js';
import { analyzeJavascript } from './analysis-javascript.js';
import { analyzeDotnet } from './analysis-dotnet.js';
import { analyzeWasm } from './analysis-wasm.js';
export function createJavascriptProvider(): AnalyzerProvider {
    return {
        name: 'javascript',
        capabilities: ['js-inventory', 'electron-detect', 'import-scan'],
        async available() {
            return true;
        },
        async detail() {
            return 'built-in JS/TS/Electron static inventory';
        },
        async analyze(target: string) {
            return analyzeJavascript(target);
        }
    };
}
export function createDotnetProvider(): AnalyzerProvider {
    return {
        name: 'dotnet',
        capabilities: ['cli-header-detect', 'pe-dotnet'],
        async available() {
            return true;
        },
        async detail() {
            return 'built-in PE CLI directory detection';
        },
        async analyze(target: string) {
            return analyzeDotnet(target);
        }
    };
}
export function createWasmProvider(): AnalyzerProvider {
    return {
        name: 'wasm',
        capabilities: ['wasm-sections'],
        async available() {
            return true;
        },
        async detail() {
            return 'built-in WebAssembly section inventory';
        },
        async analyze(target: string) {
            return analyzeWasm(target);
        }
    };
}
