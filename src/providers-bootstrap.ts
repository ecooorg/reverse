import { registerProvider } from './providers-registry.js';
import { createGhidraProvider, createGhidraSimilarityProvider } from './providers-ghidra.js';
import { createRizinProvider } from './providers-rizin.js';
import { createJadxProvider, createApktoolProvider } from './providers-android-tools.js';

let done = false;

/** Register opt-in external adapters once. Safe to call multiple times. */
export function bootstrapExternalProviders(): void {
    if (done) return;
    done = true;
    for (const p of [
        createGhidraProvider(),
        createGhidraSimilarityProvider(),
        createRizinProvider(),
        createJadxProvider(),
        createApktoolProvider()
    ]) {
        try {
            registerProvider(p);
        } catch {
            // already registered in tests
        }
    }
}

// Auto-register on import so CLI/MCP see them.
bootstrapExternalProviders();
