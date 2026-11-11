import assert from 'node:assert/strict';
import test from 'node:test';
import * as execEnv from '../dist/execution-environment.js';
import { diagnoseLinuxFromTables } from '../dist/legacy-linux-tables.js';
test('linux environments register qemu-user, chroot-rootfs, oss-shim', () => {
    execEnv.bootstrapExecutionEnvironments();
    const names = execEnv.listExecutionEnvironments().map(e => e.name);
    assert.ok(names.includes('qemu-user'));
    assert.ok(names.includes('chroot-rootfs'));
    assert.ok(names.includes('oss-shim'));
});
test('chroot-rootfs is unavailable without REVERSE_LINUX_ROOTFS', async () => {
    const prev = process.env.REVERSE_LINUX_ROOTFS;
    delete process.env.REVERSE_LINUX_ROOTFS;
    try {
        const env = execEnv.createChrootEnvironment();
        assert.equal(await env.available(), false);
        const d = await env.detail();
        assert.match(d, /ROOTFS|rootfs/i);
    }
    finally {
        if (prev === undefined)
            delete process.env.REVERSE_LINUX_ROOTFS;
        else
            process.env.REVERSE_LINUX_ROOTFS = prev;
    }
});
test('qemu-user and oss-shim report not installed when PATH is empty', async () => {
    const prev = process.env.PATH;
    process.env.PATH = '/nonexistent-reverse-path';
    try {
        assert.equal(await execEnv.createQemuUserEnvironment().available(), false);
        assert.equal(await execEnv.createOssShimEnvironment().available(), false);
    }
    finally {
        process.env.PATH = prev;
    }
});
test('desktop/audio table diagnoses libX11 and OSS markers', () => {
    const d = diagnoseLinuxFromTables({
        format: 'ELF',
        neededLibraries: ['libX11.so.6', 'libgtk-1.2.so.0'],
        interpreter: null,
        libcMarkers: [],
        compilerMarkers: []
    });
    assert.ok(d.some(x => x.tableEntryIds.includes('linux-libx11')));
    assert.ok(d.some(x => x.tableEntryIds.includes('linux-gtk1')));
});
