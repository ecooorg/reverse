const providers = [];
export function registerProvider(p) { if (providers.some(x => x.name === p.name))
    throw new Error(`Provider already registered: ${p.name}`); providers.push(p); }
export function listProviders() { return [{ name: 'builtin-native-header', state: 'implemented', capabilities: ['ELF/PE/Mach-O header identification'] }, ...['ghidra', 'rizin', 'frida', 'gdb', 'perf', 'ebpf', 'etw', 'instruments'].map(name => ({ name, state: 'extension-point', capabilities: [] })), ...providers.map(p => ({ name: p.name, state: 'registered', capabilities: p.capabilities }))]; }
export async function getProviderStatus() { return Promise.all(providers.map(async (p) => ({ name: p.name, available: await p.available(), capabilities: p.capabilities }))); }
//# sourceMappingURL=providers-registry.js.map