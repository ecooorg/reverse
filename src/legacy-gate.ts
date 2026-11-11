/**
 * Reusable authorization and provenance gate for every legacy operation (Patch M step 1).
 * Analysis, execution, capture, replay and migration must call this before doing work (H-05, F-64, G-07).
 * The declaration is operator-reported; Reverse does not verify legal rights.
 */
import type { LegacyAuthorization } from './legacy-types.js';
import { EvidenceEngine } from './evidence-engine.js';
export class LegacyAuthorizationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LegacyAuthorizationError';
    }
}
/**
 * Require a valid authorization for a legacy operation.
 *
 * - When `sessionId` is provided, load the research session and require a stored declaration.
 * - When only an explicit `authorization` object is provided (library / unit-test path), validate it.
 * - When neither is present, refuse.
 *
 * Returns the authorization record that must be embedded in the result as provenance.
 */
export async function requireLegacyGate(options: {
    sessionId?: string;
    authorization?: LegacyAuthorization | null;
    operation: string;
}): Promise<LegacyAuthorization> {
    const { sessionId, authorization, operation } = options;
    if (sessionId) {
        const engine = new EvidenceEngine();
        const session = await engine.requireLegacyAuthorization(sessionId);
        if (!session.authorization) {
            throw new LegacyAuthorizationError(`Legacy operation "${operation}" requires an open-source license ` +
                `or written rights-holder consent declaration in the research session.`);
        }
        return session.authorization;
    }
    if (authorization && isValidAuthorization(authorization))
        return authorization;
    throw new LegacyAuthorizationError(`Legacy operation "${operation}" requires a declared authorization ` +
        `(basis open_source|written_consent, license/consent reference, declarant). ` +
        `Call declare_legacy_authorization on a research session, ` +
        `or pass a valid authorization object.`);
}
function isValidAuthorization(a: LegacyAuthorization): boolean {
    if (!a || typeof a !== 'object')
        return false;
    if (a.basis !== 'open_source' && a.basis !== 'written_consent')
        return false;
    if (!a.licenseOrConsentReference?.trim() || !a.declaredBy?.trim())
        return false;
    if (!a.declaredAt || Number.isNaN(Date.parse(a.declaredAt)))
        return false;
    return true;
}
/** Synchronous check used by pure validators and tests. */
type AuthOrMissing = LegacyAuthorization | null | undefined;
export function assertAuthorizationPresent(authorization: AuthOrMissing, operation: string): asserts authorization is LegacyAuthorization {
    if (!authorization || !isValidAuthorization(authorization)) {
        const msg = `Legacy operation "${operation}" refused: `
            + 'no valid authorization declaration.';
        throw new LegacyAuthorizationError(msg);
    }
}
