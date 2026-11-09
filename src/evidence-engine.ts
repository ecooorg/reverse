import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { storeDir, now, atomicWriteJson } from './core-util.js';
import type { EvidenceRef } from './core-types.js';
export type EvidenceType = 'Process' | 'Memory' | 'CPU' | 'I/O' | 'Binary' | 'Benchmark' | 'Validation';
export interface EvidenceRecord {
    evidence_id: string;
    target_id: string;
    type: EvidenceType;
    source: string;
    timestamp: string;
    measurement: unknown;
    confidence: number;
    limitations: string[];
    hash: string;
}
export type HypothesisStatus = 'open' | 'supported' | 'refuted' | 'retired';
export interface HypothesisRecord {
    kind: 'hypothesis';
    hypothesis_id: string;
    target_id: string;
    statement: string;
    provenance: string[];
    confidence: number;
    status: HypothesisStatus;
    promotionEvidenceId?: string;
    createdAt: string;
    updatedAt: string;
}
export interface SessionEntry {
    sequence: number;
    previousHash: string;
    hash: string;
    kind: 'event' | 'hypothesis' | 'evidence';
    at: string;
    payload: unknown;
}
export interface ResearchSession {
    session_id: string;
    target_id: string;
    createdAt: string;
    updatedAt: string;
    entries: SessionEntry[];
    hypotheses: HypothesisRecord[];
    evidence: EvidenceRecord[];
    links: Record<string, string[]>;
    integrity?: {
        valid: boolean;
        checkedEntries: number;
        errors: string[];
    };
}
const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const idPattern = /^[a-zA-Z0-9_-]{1,128}$/;
export class EvidenceEngine {
    async record(kind: string, source: string, details: Record<string, unknown> = {}, sha256?: string): Promise<EvidenceRef> {
        const ref: EvidenceRef = { id: randomUUID(), kind, source, observedAt: now(), ...(sha256 ? { sha256 } : {}), details };
        await this.persist(ref);
        return ref;
    }
    async persist(record: unknown): Promise<string> {
        const id = (record as any)?.id;
        const safeId = typeof id === 'string' && idPattern.test(id) ? id : randomUUID();
        const file = path.join(storeDir(), 'evidence', `${safeId}.json`);
        await atomicWriteJson(file, record);
        return file;
    }
    async get(id: string): Promise<string | undefined> {
        if (!idPattern.test(id))
            return undefined;
        const file = path.join(storeDir(), 'evidence', `${id}.json`);
        try {
            await readFile(file);
            return file;
        }
        catch {
            return undefined;
        }
    }
    async createResearchSession(targetId: string): Promise<ResearchSession> {
        if (!targetId.trim())
            throw new Error('targetId is required.');
        const at = now();
        const session: ResearchSession = { session_id: randomUUID(), target_id: targetId, createdAt: at, updatedAt: at, entries: [], hypotheses: [], evidence: [], links: {} };
        await this.appendEntry(session, 'event', { event: 'session_created', target_id: targetId });
        await this.saveSession(session);
        return session;
    }
    async addSessionEvent(sessionId: string, event: string, payload: unknown = {}): Promise<ResearchSession> {
        const s = await this.requireSession(sessionId);
        await this.appendEntry(s, 'event', { event, payload });
        await this.saveSession(s);
        return s;
    }
    async addEvidence(sessionId: string, input: Omit<EvidenceRecord, 'evidence_id' | 'timestamp' | 'hash' | 'target_id'> & {
        target_id?: string;
    }): Promise<EvidenceRecord> {
        if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)
            throw new Error('confidence must be between 0 and 1.');
        const s = await this.requireSession(sessionId);
        const record: EvidenceRecord = { ...input, target_id: input.target_id ?? s.target_id, evidence_id: randomUUID(), timestamp: now(), hash: '' };
        record.hash = digest({ ...record, hash: undefined });
        s.evidence.push(record);
        await this.appendEntry(s, 'evidence', record);
        await this.saveSession(s);
        return record;
    }
    async addHypothesis(sessionId: string, input: Omit<HypothesisRecord, 'kind' | 'hypothesis_id' | 'createdAt' | 'updatedAt' | 'status' | 'target_id'> & {
        status?: HypothesisStatus;
    }): Promise<HypothesisRecord> {
        if (!input.statement.trim())
            throw new Error('Hypothesis statement is required.');
        if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)
            throw new Error('confidence must be between 0 and 1.');
        const s = await this.requireSession(sessionId), at = now();
        const h: HypothesisRecord = { ...input, target_id: s.target_id, kind: 'hypothesis', hypothesis_id: randomUUID(), status: input.status ?? 'open', createdAt: at, updatedAt: at };
        s.hypotheses.push(h);
        await this.appendEntry(s, 'hypothesis', h);
        await this.saveSession(s);
        return h;
    }
    async updateHypothesis(sessionId: string, hypothesisId: string, status: HypothesisStatus, evidenceId?: string): Promise<HypothesisRecord> {
        const s = await this.requireSession(sessionId), h = s.hypotheses.find(x => x.hypothesis_id === hypothesisId);
        if (!h)
            throw new Error(`Hypothesis not found: ${hypothesisId}`);
        if (status === 'supported' && (!evidenceId || !s.evidence.some(e => e.evidence_id === evidenceId && (e.type === 'Validation' || e.type === 'Benchmark')))) {
            throw new Error('A hypothesis can be promoted only by referencing Validation or Benchmark evidence in this session.');
        }
        h.status = status;
        h.updatedAt = now();
        if (status === 'supported')
            h.promotionEvidenceId = evidenceId;
        await this.appendEntry(s, 'hypothesis', h);
        await this.saveSession(s);
        return h;
    }
    async link(sessionId: string, relation: string, ids: string[]): Promise<ResearchSession> {
        const s = await this.requireSession(sessionId);
        s.links[relation] = [...new Set([...(s.links[relation] ?? []), ...ids])];
        await this.appendEntry(s, 'event', { event: 'link', relation, ids });
        await this.saveSession(s);
        return s;
    }
    async getResearchSession(sessionId: string): Promise<ResearchSession | undefined> {
        if (!idPattern.test(sessionId))
            return undefined;
        try {
            const session = JSON.parse(await readFile(this.sessionPath(sessionId), 'utf8')) as ResearchSession;
            session.integrity = this.verifyResearchSession(session);
            return session;
        }
        catch {
            return undefined;
        }
    }
    verifyResearchSession(session: ResearchSession) {
        const errors: string[] = [];
        let previous = '0'.repeat(64);
        const latest = new Map<string, unknown>();
        for (let i = 0; i < session.entries.length; i++) {
            const entry = session.entries[i];
            const { hash, ...base } = entry;
            if (entry.sequence !== i + 1 || entry.previousHash !== previous || digest(base) !== hash)
                errors.push(`Entry ${i + 1} hash or chain link is invalid.`);
            if (entry.kind === 'evidence' && (entry.payload as any)?.evidence_id)
                latest.set(`evidence:${(entry.payload as any).evidence_id}`, entry.payload);
            if (entry.kind === 'hypothesis' && (entry.payload as any)?.hypothesis_id)
                latest.set(`hypothesis:${(entry.payload as any).hypothesis_id}`, entry.payload);
            previous = hash;
        }
        for (const evidence of session.evidence) {
            const { hash, ...base } = evidence;
            if (digest(base) !== hash || JSON.stringify(latest.get(`evidence:${evidence.evidence_id}`)) !== JSON.stringify(evidence))
                errors.push(`Evidence ${evidence.evidence_id} does not match its hash-chained entry.`);
        }
        for (const hypothesis of session.hypotheses) {
            if (JSON.stringify(latest.get(`hypothesis:${hypothesis.hypothesis_id}`)) !== JSON.stringify(hypothesis))
                errors.push(`Hypothesis ${hypothesis.hypothesis_id} does not match its latest hash-chained entry.`);
        }
        return { valid: errors.length === 0, checkedEntries: session.entries.length, errors };
    }
    private sessionPath(id: string) { return path.join(storeDir(), 'sessions', `${id}.json`); }
    private async requireSession(id: string) {
        const s = await this.getResearchSession(id);
        if (!s)
            throw new Error(`Research session not found: ${id}`);
        return s;
    }
    private async saveSession(s: ResearchSession) { s.updatedAt = now(); await atomicWriteJson(this.sessionPath(s.session_id), s); }
    private async appendEntry(s: ResearchSession, kind: SessionEntry['kind'], payload: unknown) {
        const previousHash = s.entries.at(-1)?.hash ?? '0'.repeat(64);
        const base = { sequence: s.entries.length + 1, previousHash, kind, at: now(), payload };
        s.entries.push({ ...base, hash: digest(base) });
    }
}
