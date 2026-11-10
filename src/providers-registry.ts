import { result, type Result } from './core-types.js';
/** Core analyzer provider contract (Patch F). */
export interface AnalyzerProvider {
    name: string;
    capabilities: string[];
    /** Cheap availability probe: no analysis, no network, bounded time. */
    available(): Promise<boolean>;
    /** Optional human-readable install path / version from last probe. */
    detail?: () => Promise<string | undefined>;
    /** Run analysis. Must reject or return partial if the tool is not usable. */
    analyze(target: string, opts?: ProviderRunOptions): Promise<Result<unknown>>;
    /** Optional clean shutdown (kill lingering children, temp dirs). */
    shutdown?: () => Promise<void>;
}
export interface ProviderRunOptions {
    timeoutMs?: number;
    signal?: AbortSignal;
}
/** Similarity on top of AnalyzerProvider (H-03). No bundled corpus. */
export interface SimilarityProvider extends AnalyzerProvider {
    kind: 'similarity';
    compareFunctions?(a: string, b: string, opts?: ProviderRunOptions): Promise<Result<SimilarityHit>>;
}
export interface SimilarityHit {
    score: number;
    confidence: number;
    method: string;
    notes?: string[];
}
export type ProviderState = 'implemented' | 'available' | 'registered' | 'extension-point' | 'unavailable';
export interface ProviderListEntry {
    name: string;
    state: ProviderState;
    capabilities: string[];
    detail?: string;
}
const providers: AnalyzerProvider[] = [];
const builtIn: ProviderListEntry[] = [
    {
        name: 'builtin-native-header',
        state: 'implemented',
        capabilities: ['ELF/PE/Mach-O structure', 'sections', 'symbols', 'imports']
    },
    {
        name: 'builtin-source',
        state: 'implemented',
        capabilities: ['source inventory', 'comment-aware imports']
    },
    {
        name: 'builtin-dependencies',
        state: 'implemented',
        capabilities: ['lockfile resolution']
    },
    {
        name: 'builtin-android-zip',
        state: 'implemented',
        capabilities: ['APK/AAB zip inventory']
    }
];
/** Reserved for future extension-point labels (none after G/H). */
const FUTURE_EXTENSIONS = [] as const; // G/H: frida/gdb/perf/ebpf/etw/instruments are registered adapters
export function registerProvider(p: AnalyzerProvider) {
    if (providers.some(x => x.name === p.name) || builtIn.some(x => x.name === p.name)) {
        throw new Error(`Provider already registered: ${p.name}`);
    }
    providers.push(p);
}
export function getRegisteredProviders(): readonly AnalyzerProvider[] {
    return providers;
}
export function listProviders(): ProviderListEntry[] {
    const reg = providers.map(p => ({
        name: p.name,
        state: 'registered' as ProviderState,
        capabilities: p.capabilities
    }));
    const future = FUTURE_EXTENSIONS.map(name => ({
        name,
        state: 'extension-point' as ProviderState,
        capabilities: [] as string[]
    }));
    return [...builtIn, ...reg, ...future];
}
/** Probe registered providers (and optionally mark available vs unavailable). */
export async function listProvidersProbed(): Promise<ProviderListEntry[]> {
    const base = listProviders();
    const out: ProviderListEntry[] = [];
    for (const entry of base) {
        const p = providers.find(x => x.name === entry.name);
        if (!p) {
            out.push(entry);
            continue;
        }
        let available = false;
        castDetail: try {
            available = await Promise.race([
                p.available(),
                new Promise<boolean>(resolve => setTimeout(() => resolve(false), 8000))
            ]);
        }
        catch {
            available = false;
        }
        let detail: string | undefined;
        if (p.detail) {
            try {
                detail = await p.detail();
            }
            catch { /* ignore */ }
        }
        out.push({
            name: p.name,
            state: available ? 'available' : 'unavailable',
            capabilities: p.capabilities,
            detail
        });
    }
    return out;
}
export async function getProviderStatus() {
    return Promise.all(providers.map(async (p) => {
        let available = false;
        try {
            available = await p.available();
        }
        catch {
            available = false;
        }
        let detail: string | undefined;
        if (p.detail) {
            try {
                detail = await p.detail();
            }
            catch { /* ignore */ }
        }
        return { name: p.name, available, capabilities: p.capabilities, detail };
    }));
}
export async function shutdownAllProviders(): Promise<void> {
    for (const p of providers) {
        if (p.shutdown) {
            try {
                await p.shutdown();
            }
            catch { /* best effort */ }
        }
    }
}
/** Run a named registered provider or return a structured partial Result. */
export async function runProvider(name: string, target: string, opts?: ProviderRunOptions): Promise<Result<unknown>> {
    const p = providers.find(x => x.name === name);
    if (!p) {
        return result(target, 'provider_analyze', [], {
            status: 'unsupported',
            limitations: [`No provider registered with name "${name}".`],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    const ok = await p.available().catch(() => false);
    if (!ok) {
        return result(target, 'provider_analyze', [], {
            status: 'unsupported',
            limitations: [
                `Provider "${name}" is registered but not available on this host (tool not installed or not executable).`,
                'Results are never fabricated when the external engine is absent.'
            ],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    return p.analyze(target, opts);
}
