import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { analyzeLegacyMac } from '../dist/legacy-mac.js';
import type { LegacyAuthorization } from '../dist/legacy-types.js';
const AUTH: LegacyAuthorization = {
    basis: 'open_source',
    licenseOrConsentReference: 'test-fixture',
    declaredBy: 'unit-test',
    declaredAt: new Date().toISOString(),
};
function machO32LeHeader(cpu = 7): Buffer {
    // MH_MAGIC little-endian 32-bit, minimal header, 0 load commands
    const b = Buffer.alloc(28);
    b.writeUInt32LE(0xfeedface, 0);
    b.writeUInt32LE(cpu, 4); // cputype
    b.writeUInt32LE(0, 8); // cpusubtype
    b.writeUInt32LE(2, 12); // filetype MH_EXECUTE
    b.writeUInt32LE(0, 16); // ncmds
    b.writeUInt32LE(0, 20); // sizeofcmds
    b.writeUInt32LE(0, 24); // flags
    return b;
}
function pefHeader(arch = 'pwpc'): Buffer {
    const b = Buffer.alloc(40);
    b.writeUInt32BE(0x4a6f7921, 0); // Joy!
    Buffer.from(arch.padEnd(4, '\0')).copy(b, 4);
    return b;
}
function appleDoubleWithFinder(): Buffer {
    // magic, version, filler, entry count = 1, entry id=9 (Finder), offset=38, length=8
    const b = Buffer.alloc(46);
    b.writeUInt32BE(0x00051607, 0);
    b.writeUInt32BE(0x00020000, 4);
    b.writeUInt16BE(1, 24);
    b.writeUInt32BE(9, 26);
    b.writeUInt32BE(38, 30);
    b.writeUInt32BE(8, 34);
    b.write('APPL', 38); // type
    b.write('ttxt', 42); // creator
    return b;
}
test('analyzeLegacyMac refuses without authorization', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mac-auth-'));
    try {
        const f = path.join(dir, 'x.bin');
        await writeFile(f, machO32LeHeader());
        await assert.rejects(() => analyzeLegacyMac(f, null), /authorization/i);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('analyzeLegacyMac recognizes little-endian Mach-O 32-bit x86', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mac-macho-'));
    try {
        const f = path.join(dir, 'a.out');
        await writeFile(f, machO32LeHeader(7));
        const r: any = await analyzeLegacyMac(f, AUTH);
        assert.equal(r.status, 'completed');
        const finding = r.findings[0];
        assert.equal(finding.format, 'mach-o');
        assert.equal(finding.bitness, 32);
        assert.equal(finding.endian, 'little');
        assert.equal(finding.targetProfile.codeModel.value, 'mach-o');
        assert.equal(finding.targetProfile.endianness.value, 'little');
        assert.ok(finding.authorization.basis === 'open_source');
        assert.ok(finding.sha256);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('analyzeLegacyMac recognizes PEF PowerPC', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mac-pef-'));
    try {
        const f = path.join(dir, 'app.pef');
        await writeFile(f, pefHeader('pwpc'));
        const r: any = await analyzeLegacyMac(f, AUTH);
        assert.equal(r.status, 'completed');
        const finding = r.findings[0];
        assert.equal(finding.format, 'pef-cfm');
        assert.match(finding.architecture, /PowerPC/i);
        assert.equal(finding.targetProfile.codeModel.value, 'pef-cfm');
        assert.ok(finding.targetProfile.rosettaOr32BitDependence.value.length >= 1);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('analyzeLegacyMac reads AppleDouble Finder type/creator', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mac-ad-'));
    try {
        const f = path.join(dir, '._doc');
        await writeFile(f, appleDoubleWithFinder());
        const r: any = await analyzeLegacyMac(f, AUTH);
        assert.equal(r.status, 'completed');
        const finding = r.findings[0];
        assert.ok(finding.format === 'appledouble' || finding.format === '68k-code' || finding.format === 'pef-cfm');
        assert.ok(finding.creatorType);
        assert.equal(finding.creatorType.type, 'APPL');
        assert.equal(finding.creatorType.creator, 'ttxt');
        assert.equal(finding.targetProfile.creatorType.value?.type, 'APPL');
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('analyzeLegacyMac unknown bytes yield partial', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mac-unk-'));
    try {
        const f = path.join(dir, 'noise.bin');
        await writeFile(f, Buffer.from('not a mac binary at all'));
        const r: any = await analyzeLegacyMac(f, AUTH);
        assert.equal(r.status, 'partial');
        assert.equal(r.findings[0].format, 'unknown');
        assert.equal(r.findings[0].targetProfile.codeModel.value, null);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('analyzeLegacyMac recognizes MacBinary II and HFS+ volume header', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mac-more-'));
    try {
        const mb = Buffer.alloc(128);
        mb[0] = 0;
        mb[1] = 5;
        mb.write('Hello', 2);
        mb.write('TEXT', 65);
        mb.write('ttxt', 69);
        mb[122] = 129;
        const mf = path.join(dir, 'x.bin');
        await writeFile(mf, mb);
        const r1: any = await analyzeLegacyMac(mf, AUTH);
        assert.equal(r1.findings[0].format, 'macbinary');
        assert.equal(r1.findings[0].creatorType?.type, 'TEXT');
        const hfs = Buffer.alloc(1024 + 4);
        hfs.write('H+', 1024);
        const hf = path.join(dir, 'vol.bin');
        await writeFile(hf, hfs);
        const r2: any = await analyzeLegacyMac(hf, AUTH);
        assert.equal(r2.findings[0].format, 'hfs-volume');
        const pl = path.join(dir, 'Info.plist');
        const plist = [
            '<?xml version="1.0"?><plist><dict>',
            '<key>CFBundleIdentifier</key><string>a.b</string>',
            '<key>LSMinimumSystemVersion</key><string>10.5</string>',
            '</dict></plist>',
        ].join('');
        await writeFile(pl, plist);
        const r3: any = await analyzeLegacyMac(pl, AUTH);
        assert.ok(r3.findings[0].bundleSummary?.includes('id=a.b'));
        assert.equal(r3.findings[0].targetProfile.bundleLayout.value?.includes('id=a.b'), true);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('analyzeLegacyMac PEF yields sourced PEF/Classic diagnosis', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mac-diag-'));
    try {
        const f = path.join(dir, 'app.pef');
        const b = Buffer.alloc(40);
        b.writeUInt32BE(0x4a6f7921, 0);
        b.write('pwpc', 4);
        await writeFile(f, b);
        const r: any = await analyzeLegacyMac(f, AUTH);
        const findings = r.findings[0].compatibilityFindings;
        assert.ok(Array.isArray(findings) && findings.length > 0);
        assert.ok(findings.some((c: any) => c.tableEntryIds.includes('mac-pef-cfm-needs-classic-or-carbon')));
        assert.ok(findings.every((c: any) => /\[table:/.test(c.evidence)));
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('Mac builtin tables validate', async () => {
    const { assertBuiltinMacTablesValid } = await import('../dist/legacy-mac-tables.js');
    assert.deepEqual(assertBuiltinMacTablesValid(), []);
});
test('Mac execution environments register and report absence', async () => {
    const { bootstrapExecutionEnvironments, listExecutionEnvironments, } = await import('../dist/execution-environment.js');
    bootstrapExecutionEnvironments();
    const names = listExecutionEnvironments().map(e => e.name);
    for (const n of ['basiliskii', 'minivmac', 'sheepshaver', 'qemu-ppc'])
        assert.ok(names.includes(n), n);
    const basilisk = listExecutionEnvironments().find(e => e.name === 'basiliskii')!;
    const available = await basilisk.available();
    // CI hosts normally lack Basilisk II → must not throw and must fingerprint.
    const fp = await basilisk.fingerprint();
    assert.equal(fp.engine, 'basiliskii');
    assert.equal(typeof available, 'boolean');
});
test('PEF section count is reported when header is complete', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mac-pef2-'));
    try {
        const f = path.join(dir, 'x.pef');
        const b = Buffer.alloc(40 + 28);
        b.writeUInt32BE(0x4a6f7921, 0);
        b.write('pwpc', 4);
        b.writeUInt16BE(1, 32); // sectionCount
        await writeFile(f, b);
        const r: any = await analyzeLegacyMac(f, AUTH);
        assert.equal(r.findings[0].format, 'pef-cfm');
        assert.ok(r.findings[0].structuralDetectors.some((d: any) => d.name === 'pef-cfm'));
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('Mac behavior round-trip reuses capture/replay under CONTROLLED_EXECUTION', async () => {
    const prev = process.env.REVERSE_MODE;
    process.env.REVERSE_MODE = 'CONTROLLED_EXECUTION';
    try {
        const { runMacBehaviorRoundTrip } = await import('../dist/legacy-mac-behavior.js');
        const r = await runMacBehaviorRoundTrip(undefined, AUTH);
        assert.equal(r.equal, true);
        assert.ok(r.record);
        assert.ok(r.environments.length >= 4);
        assert.ok(r.limitations.some((l: string) => /emulator|PATH|licensing/i.test(l)));
    }
    finally {
        if (prev === undefined)
            delete process.env.REVERSE_MODE;
        else
            process.env.REVERSE_MODE = prev;
    }
});
test('fingerprintMacRoms reports missing paths as limitations', async () => {
    const { fingerprintMacRoms } = await import('../dist/legacy-mac-behavior.js');
    const r = await fingerprintMacRoms(['/no/such/rom.bin']);
    assert.equal(r.length, 1);
    assert.equal(r[0].sha256, null);
    assert.ok(r[0].limitation);
});
test('HFS MDB reports catalog first extent when present', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mac-hfs-cat-'));
    try {
        const hfs = Buffer.alloc(1024 + 0x70);
        hfs.write('BD', 1024);
        hfs.writeUInt32BE(512, 1024 + 20); // alBlkSiz
        hfs[1024 + 36] = 4;
        hfs.write('Test', 1024 + 37);
        hfs.writeUInt16BE(10, 1024 + 0x5e); // startBlock
        hfs.writeUInt16BE(3, 1024 + 0x5e + 2); // blockCount
        const f = path.join(dir, 'vol.hfs');
        await writeFile(f, hfs);
        const r: any = await analyzeLegacyMac(f, AUTH);
        assert.equal(r.findings[0].format, 'hfs-volume');
        assert.ok(r.findings[0].structuralDetectors.some((d: any) => d.name === 'hfs-catalog-extent'));
        const hfsEv = r.findings[0].structuralDetectors
            .flatMap((d: any) => d.evidence)
            .join(' ');
        assert.match(hfsEv, /volumeName=Test|catalogExtent|startBlock=10|blockCount=3/);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('PEF loader string window is scanned for printable names', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mac-pef-str-'));
    try {
        const b = Buffer.alloc(40 + 28 + 32);
        b.writeUInt32BE(0x4a6f7921, 0);
        b.write('pwpc', 4);
        b.writeUInt16BE(1, 32);
        // section[0] nameOff points into post-header window
        b.writeUInt32BE(0, 40); // nameOff relative 0 → tableBase
        b.write('Code', 40 + 28);
        b[40 + 28 + 4] = 0;
        const f = path.join(dir, 'x.pef');
        await writeFile(f, b);
        const r: any = await analyzeLegacyMac(f, AUTH);
        assert.equal(r.findings[0].format, 'pef-cfm');
        const ev = JSON.stringify(r.findings[0].structuralDetectors);
        assert.ok(/Code|loaderStrings|section\[/i.test(ev));
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('A-line Toolbox trap words surface as toolbox-traps detector', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mac-trap-'));
    try {
        // Big-endian 0xA000-class words (classic Toolbox traps)
        const b = Buffer.alloc(32);
        for (let i = 0; i < 8; i++)
            b.writeUInt16BE(0xa000 + i, i * 2);
        const f = path.join(dir, 'code.bin');
        await writeFile(f, b);
        const r: any = await analyzeLegacyMac(f, AUTH);
        assert.ok(r.findings[0].structuralDetectors.some((d: any) => d.name === 'toolbox-traps'));
        assert.equal(r.findings[0].format, '68k-code');
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
