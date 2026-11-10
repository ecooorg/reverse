import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { parsePsCpuTime, parsePsRow, parseProcStatCpu, parseProcStatusPeak, describeExecutable } from '../dist/benchmark-resources.js';
test('ps CPU time formats', () => {
    assert.equal(parsePsCpuTime('0:00.04'), 40);
    assert.equal(parsePsCpuTime('  1:02.50 '), 62500);
    assert.equal(parsePsCpuTime('1:02:03'), 3723000);
    assert.equal(parsePsCpuTime('2-01:00:00'), 176400000);
    assert.equal(parsePsCpuTime('0:00,07'), 70);
    assert.equal(parsePsCpuTime('abc'), undefined);
    assert.equal(parsePsCpuTime(''), undefined);
});
test('ps row: RSS in KiB and CPU time', () => {
    assert.deepEqual(parsePsRow('  20480   0:00.12\n'), { rssBytes: 20480 * 1024, cpuTimeMs: 120 });
    assert.equal(parsePsRow(''), undefined);
    assert.equal(parsePsRow('20480'), undefined);
    assert.equal(parsePsRow('x 0:00.12'), undefined);
});
test('/proc/<pid>/stat CPU time includes children and survives a ")" in the process name', () => {
    // fields after the name: state ppid pgrp session tty tpgid flags minflt cminflt majflt cmajflt utime stime cutime cstime ...
    const raw = '4242 (we) ird) S 1 4242 4242 0 -1 4194304 100 0 0 0 30 20 5 5 20 0 1 0 100 1000 200';
    assert.equal(parseProcStatCpu(raw, 100), 600);
    assert.equal(parseProcStatCpu(raw, 1000), 60);
    assert.equal(parseProcStatCpu('garbage', 100), undefined);
});
test('/proc status peak: VmHWM wins over VmRSS', () => {
    assert.equal(parseProcStatusPeak('Name:\tx\nVmHWM:\t  2048 kB\nVmRSS:\t  1024 kB\n'), 2048 * 1024);
    assert.equal(parseProcStatusPeak('VmRSS:\t  1024 kB\n'), 1024 * 1024);
    assert.equal(parseProcStatusPeak('nothing'), undefined);
});
test('executable size is resolved from an absolute path and from PATH', async () => {
    const abs = await describeExecutable(process.execPath);
    assert.ok(abs && abs.sizeBytes > 1000 && path.resolve(abs.path) === path.resolve(process.execPath));
    const viaPath = await describeExecutable(path.basename(process.execPath), process.cwd(), {
        PATH: path.dirname(process.execPath),
        PATHEXT: '.EXE'
    });
    assert.ok(viaPath && viaPath.sizeBytes === abs.sizeBytes);
    assert.equal(await describeExecutable('definitely-not-a-real-command-xyz'), null);
});
