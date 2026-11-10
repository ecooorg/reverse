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
test('legacy Windows detector extracts bounded PE imports and derives runtime compatibility evidence', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'reverse-legacy-imports-'));
    try {
        const file = path.join(dir, 'vb6.exe');
        const b = Buffer.alloc(1024);
        const pe = 128, optional = pe + 24, section = optional + 224, raw = 0x200;
        b.write('MZ', 0, 'ascii');
        b.writeUInt32LE(pe, 0x3c);
        b.write('PE\u0000\u0000', pe, 'ascii');
        b.writeUInt16LE(0x14c, pe + 4);
        b.writeUInt16LE(1, pe + 6);
        b.writeUInt16LE(224, pe + 20);
        b.writeUInt16LE(0x10b, optional);
        b.writeUInt32LE(0x1000, optional + 104);
        b.writeUInt32LE(40, optional + 108);
        b.writeUInt32LE(0x200, section + 8);
        b.writeUInt32LE(0x1000, section + 12);
        b.writeUInt32LE(0x200, section + 16);
        b.writeUInt32LE(raw, section + 20);
        b.writeUInt32LE(0x1050, raw);
        b.writeUInt32LE(0x1040, raw + 12);
        b.writeUInt32LE(0x1050, raw + 16);
        b.write('MSVBVM60.DLL\u0000', raw + 0x40, 'ascii');
        b.writeUInt32LE(0x1060, raw + 0x50);
        b.writeUInt32LE(0, raw + 0x54);
        b.writeUInt16LE(0, raw + 0x60);
        b.write('ThunRTMain\u0000', raw + 0x62, 'ascii');
        await writeFile(file, b);
        const r = await analyzeLegacyWindows(file);
        const finding = r.findings[0];
        assert.deepEqual(finding.importedLibraries, ['msvbvm60.dll']);
        assert.deepEqual(finding.importedFunctions, ['ThunRTMain']);
        assert.ok(finding.structuralDetectors.some(x => x.name === 'Visual Basic runtime import'));
        assert.ok(finding.compatibilityFindings.some(x => x.cause.includes('Visual Basic runtime')));
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('legacy Windows detector identifies Delphi form and RTTI-style signatures as static evidence', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'reverse-legacy-delphi-'));
    try {
        const file = path.join(dir, 'delphi.exe');
        const b = Buffer.alloc(256);
        b.write('MZ', 0, 'ascii');
        b.write('TPF0 TForm TApplication TComponent TControl', 64, 'ascii');
        await writeFile(file, b);
        const finding = (await analyzeLegacyWindows(file)).findings[0];
        assert.ok(finding.structuralDetectors.some(x => x.name.includes('form stream')));
        assert.ok(finding.structuralDetectors.some(x => x.name.includes('RTTI-style')));
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('legacy analysis result carries the declared authorization provenance', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'reverse-legacy-provenance-'));
    try {
        const file = path.join(dir, 'target.exe');
        const b = Buffer.alloc(64);
        b.write('MZ', 0, 'ascii');
        await writeFile(file, b);
        const authorization = {
            basis: 'written_consent' as const,
            licenseOrConsentReference: 'consent-2026-01',
            declaredBy: 'operator',
            declaredAt: '2026-11-10T00:00:00.000Z'
        };
        const finding = (await analyzeLegacyWindows(file, authorization)).findings[0];
        assert.deepEqual(finding.authorization, authorization);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
