import { registerProvider } from './providers-registry.js';
import { createGhidraProvider } from './providers-ghidra.js';
import { createGhidraSimilarityProvider } from './providers-ghidra.js';
import { createRizinProvider } from './providers-rizin.js';
import { createJadxProvider } from './providers-android-tools.js';
import { createApktoolProvider } from './providers-android-tools.js';
import { createFridaProvider } from './providers-frida.js';
import { createGdbProvider } from './providers-gdb.js';
import { createPerfProvider } from './providers-native-profile.js';
import { createEbpfProvider } from './providers-native-profile.js';
import { createEtwProvider } from './providers-native-profile.js';
import { createInstrumentsProvider } from './providers-native-profile.js';
import { createValgrindProvider } from './providers-native-profile.js';
import { createSimpleperfProvider } from './providers-native-profile.js';
import { createJavascriptProvider } from './providers-runtime.js';
import { createDotnetProvider } from './providers-runtime.js';
import { createWasmProvider } from './providers-runtime.js';
import { createDiecProvider, createYaraXProvider, createCapaProvider } from './providers-detect-tools.js';
let done = false;
/** Register opt-in external adapters once. Safe to call multiple times. */
export function bootstrapExternalProviders(): void {
    if (done)
        return;
    done = true;
    bootstrapExecutionEnvironments();
    for (const p of [
        createGhidraProvider(),
        createGhidraSimilarityProvider(),
        createRizinProvider(),
        createJadxProvider(),
        createApktoolProvider(),
        createFridaProvider(),
        createGdbProvider(),
        createPerfProvider(),
        createEbpfProvider(),
        createEtwProvider(),
        createInstrumentsProvider(),
        createValgrindProvider(),
        createSimpleperfProvider(),
        createJavascriptProvider(),
        createDotnetProvider(),
        createWasmProvider(),
        createDiecProvider(),
        createYaraXProvider(),
        createCapaProvider()
    ]) {
        try {
            registerProvider(p);
        }
        catch {
            // already registered in tests
        }
    }
}
bootstrapExternalProviders();
