import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { analyzeLegacyLinux } from '../dist/legacy-linux.js';
import type { LegacyAuthorization } from '../dist/legacy-types.js';
import { LegacyAuthorizationError } from '../dist/legacy-gate.js';
const auth: LegacyAuthorization = {
    basis: 'open_source',
    licenseOrConsentReference: 'test-fixture',
    declaredBy: 'legacy-linux.test',
    declaredAt: new Date().toISOString()
};
function craftMinimalElf64Le(): Buffer {
    // Minimal 64-bit LE ELF header + one PT_INTERP + empty PT_DYNAMIC
    const b = Buffer.alloc(256);
    b[0] = 0x7f;
    b.write('ELF', 1, 'ascii');
    b[4] = 2; // ELFCLASS64
    b[5] = 1; // ELFDATA2LSB
    b[6] = 1; // EV_CURRENT
    b.writeUInt16LE(3, 16); // ET_DYN (PIE)
    b.writeUInt16LE(62, 18); // EM_X86_64
    b.writeUInt32LE(1, 20); // EV_CURRENT
    b.writeBigUInt64LE(0n, 24); // entry
    b.writeBigUInt64LE(64n, 32); // phoff
    b.writeBigUInt64LE(0n, 40); // shoff
    b.writeUInt16LE(64, 52); // ehsize
    b.writeUInt16LE(56, 54); // phentsize
    b.writeUInt16LE(2, 56); // phnum: INTERP + DYNAMIC
    // Phdr 0: PT_INTERP
    const interp = '/lib64/ld-linux-x86-64.so.2';
    const interpOff = 200;
    b.write(interp, interpOff, 'ascii');
    b.writeUInt32LE(3, 64); // PT_INTERP
    b.writeUInt32LE(4, 68); // PF_R
    b.writeBigUInt64LE(BigInt(interpOff), 72); // p_offset
    b.writeBigUInt64LE(BigInt(interpOff), 80); // p_vaddr
    b.writeBigUInt64LE(BigInt(interp.length + 1), 96); // p_filesz
    b.writeBigUInt64LE(BigInt(interp.length + 1), 104);
    // Phdr 1: PT_DYNAMIC pointing at empty dyn (DT_NULL only)
    const dynOff = 240;
    b.writeUInt32LE(2, 64 + 56); // PT_DYNAMIC
    b.writeUInt32LE(6, 64 + 56 + 4); // PF_R|PF_W
    b.writeBigUInt64LE(BigInt(dynOff), 64 + 56 + 8);
    b.writeBigUInt64LE(BigInt(dynOff), 64 + 56 + 16);
    b.writeBigUInt64LE(16n, 64 + 56 + 32); // one dyn entry size
    // DT_NULL
    b.writeBigInt64LE(0n, dynOff);
    b.writeBigUInt64LE(0n, dynOff + 8);
    return b;
}
function craftAoutZmagic(): Buffer {
    const b = Buffer.alloc(64);
    b.writeUInt32LE(0x0000010b, 0); // ZMAGIC
    return b;
}
test('analyzeLegacyLinux refuses without authorization', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'll-'));
    try {
        const f = join(dir, 'x');
        await writeFile(f, craftMinimalElf64Le());
        await assert.rejects(() => analyzeLegacyLinux(f, null), (e: unknown) => e instanceof LegacyAuthorizationError);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('ELF64 pie binary: format, interpreter, Linux profile fields', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'll-'));
    try {
        const f = join(dir, 'pie');
        await writeFile(f, craftMinimalElf64Le());
        const r = await analyzeLegacyLinux(f, auth);
        const finding = r.findings[0];
        assert.equal(finding.format, 'ELF');
        assert.equal(finding.bitness, 64);
        assert.equal(finding.architecture, 'x86-64');
        assert.ok(finding.interpreter?.includes('ld-linux'));
        assert.equal(finding.targetProfile.osAndEra.value.family, 'Linux');
        assert.ok(finding.targetProfile.dynamicInterpreter?.value?.includes('ld-linux'));
        assert.equal(finding.hardening.pie, true);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('a.out ZMAGIC is detected as 32-bit x86', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'll-'));
    try {
        const f = join(dir, 'aout');
        await writeFile(f, craftAoutZmagic());
        const r = await analyzeLegacyLinux(f, auth);
        const finding = r.findings[0];
        assert.equal(finding.format, 'a.out');
        assert.equal(finding.bitness, 32);
        assert.equal(finding.architecture, 'x86');
        assert.match(finding.targetProfile.osAndEra.value.era ?? '', /a\.out|libc5/i);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test('glibc and libstdc++ soname markers surface in profile', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'll-'));
    try {
        const f = join(dir, 'markers');
        const body = Buffer.alloc(512);
        body[0] = 0x7f;
        body.write('ELF', 1, 'ascii');
        body[4] = 1;
        body[5] = 1;
        body[6] = 1;
        body.writeUInt16LE(2, 16); // ET_EXEC
        body.writeUInt16LE(3, 18); // EM_386
        body.write('libc.so.6 libstdc++.so.6 GLIBC_2.3 GLIBCXX_3.4', 100, 'ascii');
        await writeFile(f, body);
        const r = await analyzeLegacyLinux(f, auth);
        const finding = r.findings[0];
        assert.equal(finding.format, 'ELF');
        const tools = finding.targetProfile.toolchainRuntimeFramework.value.join(' ');
        // string markers may fire even without full DT_NEEDED
        const joined = tools + ' ' + finding.libcMarkers.join(' ');
        const hasMarkers = finding.libcMarkers.length + finding.compilerMarkers.length > 0 ||
            /glibc|libstdc|GLIBC|GLIBCXX/i.test(joined);
        assert.ok(hasMarkers, 'expected libc/compiler markers');
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
