import { createHmac, timingSafeEqual } from 'node:crypto';
import { result } from './core-types.js';
import { EvidenceEngine, type ResearchSession } from './evidence-engine.js';
const GENESIS = '0'.repeat(64);
/** Recompute and verify the hash chain via EvidenceEngine rules. */
export function verifyHashChain(session: ResearchSession) {
    return new EvidenceEngine().verifyResearchSession(session);
}
/** HMAC-SHA256 signature over the terminal chain hash using REVERSE_EVIDENCE_KEY. */
export function signSession(session: ResearchSession, key = process.env.REVERSE_EVIDENCE_KEY): ResearchSession {
    const chain = verifyHashChain(session);
    const terminal = session.entries?.length
        ? session.entries[session.entries.length - 1].hash
        : GENESIS;
    if (!key) {
        return {
            ...session,
            integrity: {
                valid: chain.valid,
                checkedEntries: chain.checkedEntries,
                errors: [
                    ...chain.errors,
                    'No REVERSE_EVIDENCE_KEY set; signature omitted.'
                ]
            }
        };
    }
    const sig = createHmac('sha256', key).update(terminal).digest('hex');
    return {
        ...session,
        integrity: {
            valid: chain.valid,
            checkedEntries: chain.checkedEntries,
            errors: chain.errors,
            // extended fields for optional HMAC
            ...({
                signature: sig,
                algorithm: 'hmac-sha256',
                terminalHash: terminal
            } as any)
        }
    };
}
export function verifySessionSignature(session: ResearchSession, key = process.env.REVERSE_EVIDENCE_KEY) {
    const chain = verifyHashChain(session);
    const integrity: any = session.integrity ?? {};
    if (!key) {
        return result(session.session_id, 'verify_evidence_integrity', [{
                chainValid: chain.valid,
                signatureValid: false,
                signed: false
            }], {
            status: 'partial',
            limitations: [
                'REVERSE_EVIDENCE_KEY not set; cannot verify signature.',
                ...chain.errors
            ],
            coverage: {
                examined: true,
                complete: false,
                notes: [`checkedEntries=${chain.checkedEntries}`]
            }
        });
    }
    const terminal = integrity.terminalHash
        ?? (session.entries?.length
            ? session.entries[session.entries.length - 1].hash
            : GENESIS);
    const expect = createHmac('sha256', key).update(terminal).digest('hex');
    const actual = integrity.signature as string | undefined;
    let signatureValid = false;
    if (actual && actual.length === expect.length) {
        try {
            signatureValid = timingSafeEqual(Buffer.from(actual, 'utf8'), Buffer.from(expect, 'utf8'));
        }
        catch {
            signatureValid = false;
        }
    }
    return result(session.session_id, 'verify_evidence_integrity', [{
            chainValid: chain.valid,
            signatureValid,
            signed: !!actual,
            algorithm: integrity.algorithm ?? 'hmac-sha256'
        }], {
        status: chain.valid && signatureValid ? 'completed' : 'partial',
        limitations: [
            ...(signatureValid ? [] : ['Signature missing or mismatch.']),
            ...chain.errors
        ],
        coverage: {
            examined: true,
            complete: chain.valid && signatureValid,
            notes: [`checkedEntries=${chain.checkedEntries}`]
        }
    });
}
