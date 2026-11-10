import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { analyzeLegacyWindows } from '../dist/legacy-windows.js';
import { EvidenceEngine } from '../dist/evidence-engine.js';
test('legacy Windows detector recognizes DOS MZ and 16-bit NE', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'reverse-legacy-'));
    try {
        const file = path.join(dir, 'old.exe');
        const b = Buffer.alloc(256);
        b.write('MZ', 0, 'ascii');
        b.writeUInt32LE(128, 0x3c);
        b.write('NE', 128, 'ascii');
        await writeFile(file, b);
        const r = await analyzeLegacyWindows(file);
        assert.equal(r.findings[0].format, 'Windows NE');
        assert.equal(r.findings[0].bitness, 16);
        assert.equal(r.findings[0].compatibilityFindings[0].needsExecutionEnvironment, true);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('legacy Windows detector reads PE subsystem when the optional header contains it', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'reverse-legacy-pe-'));
    try {
        const file = path.join(dir, 'pe.exe');
        const b = Buffer.alloc(256);
        const pe = 128;
        b.write('MZ', 0, 'ascii');
        b.writeUInt32LE(pe, 0x3c);
        b.write('PE\u0000\u0000', pe, 'ascii');
        b.writeUInt16LE(0x14c, pe + 4);
        b.writeUInt16LE(224, pe + 20);
        b.writeUInt16LE(0x10b, pe + 24);
        b.writeUInt16LE(3, pe + 24 + 68);
        await writeFile(file, b);
        const r = await analyzeLegacyWindows(file);
        assert.equal(r.findings[0].format, 'Windows PE');
        assert.equal(r.findings[0].architecture, 'x86');
        assert.equal(r.findings[0].subsystem, 'Windows console');
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('legacy Windows detector leaves PE subsystem unknown when the optional header is truncated', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'reverse-legacy-pe-short-'));
    try {
        const file = path.join(dir, 'short-pe.exe');
        const b = Buffer.alloc(180);
        const pe = 128;
        b.write('MZ', 0, 'ascii');
        b.writeUInt32LE(pe, 0x3c);
        b.write('PE\u0000\u0000', pe, 'ascii');
        b.writeUInt16LE(0x14c, pe + 4);
        b.writeUInt16LE(0x10b, pe + 24);
        await writeFile(file, b);
        const r = await analyzeLegacyWindows(file);
        assert.equal(r.findings[0].format, 'Windows PE');
        assert.equal(r.findings[0].subsystem, null);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('legacy analysis requires a declared authorization record', async () => {
    const previous = process.env.REVERSE_HOME;
    const dir = await mkdtemp(path.join(os.tmpdir(), 'reverse-auth-'));
    process.env.REVERSE_HOME = dir;
    try {
        const engine = new EvidenceEngine();
        const session = await engine.createResearchSession('legacy-target');
        const authorizationCheck = engine.requireLegacyAuthorization(session.session_id);
        await assert.rejects(authorizationCheck, /requires an open-source license or written rights-holder consent/);
        const authorized = await engine.declareAuthorization(session.session_id, {
            basis: 'open_source', licenseOrConsentReference: 'LICENSE.txt', declaredBy: 'operator'
        });
        assert.equal(authorized.authorization?.basis, 'open_source');
        assert.equal((await engine.requireLegacyAuthorization(session.session_id)).session_id, session.session_id);
    }
    finally {
        if (previous === undefined)
            delete process.env.REVERSE_HOME;
        else
            process.env.REVERSE_HOME = previous;
        await rm(dir, { recursive: true, force: true });
    }
});
