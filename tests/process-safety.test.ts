import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createResourceLimiter, type CgroupDeps } from '../dist/process-safety.js';
// Success path and cleanup of the cgroup limiter against a fake cgroup tree in a temporary directory. The real cgroup file
// system is exercised by the capability check "Safety - resource limits are enforced in a real cgroup" where it is delegated.
const root = await mkdtemp(path.join(os.tmpdir(), 'reverse-cgroup-'));
const children: ChildProcess[] = [];
const MIB = 1024 * 1024;
after(async () => {
    for (const c of children)
        c.kill();
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
const linuxOnly = { skip: process.platform !== 'linux' ? 'the limiter is Linux-only' : false };
const sleeper = () => {
    const c = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
    children.push(c);
    return c.pid!;
};
function fakeDeps(log: string[], overrides: Partial<CgroupDeps> = {}): CgroupDeps {
    return {
        root,
        readProcCgroup: async () => '12:memory:/ignored\n0::/unit/slice\n',
        access: file => stat(file).then(() => undefined),
        mkdir: async (dir) => { log.push(`mkdir ${path.basename(dir).replace(/-[0-9a-f-]{36}$/, '-<uuid>')}`); await mkdir(dir); },
        writeFile: async (file, value) => { log.push(`write ${path.basename(file)}=${value}`); await writeFile(file, value); },
        rmdir: async (dir) => { log.push('rmdir'); await rm(dir, { recursive: true }); },
        ...overrides
    };
}
// The target lives in unit/slice; the limited cgroup is created next to it, under unit (the "no internal processes" rule).
const targetDir = path.join(root, 'unit', 'slice');
const siblings = path.join(root, 'unit');
await mkdir(targetDir, { recursive: true });
await writeFile(path.join(siblings, 'cgroup.controllers'), 'cpu memory\n');
test('refusals happen before any file is touched', linuxOnly, async () => {
    const log: string[] = [];
    const limit = createResourceLimiter(fakeDeps(log));
    const pid = sleeper();
    const op = async () => 1;
    const mem = { memoryMaxBytes: 64 * MIB };
    await assert.rejects(limit(pid, mem, 'READ_ONLY', true, op), /CONTROLLED_EXECUTION/);
    await assert.rejects(limit(pid, mem, 'OBSERVE', true, op), /CONTROLLED_EXECUTION/);
    await assert.rejects(limit(pid, mem, 'CONTROLLED_EXECUTION', false, op), /confirm=true/);
    await assert.rejects(limit(0, mem, 'CONTROLLED_EXECUTION', true, op), /positive integer/);
    await assert.rejects(limit(pid, {}, 'CONTROLLED_EXECUTION', true, op), /At least one/);
    await assert.rejects(limit(pid, { memoryMaxBytes: 1024 }, 'CONTROLLED_EXECUTION', true, op), /16 MiB/);
    await assert.rejects(limit(pid, { cpuQuotaPercent: 0 }, 'CONTROLLED_EXECUTION', true, op), /cpuQuotaPercent/);
    await assert.rejects(limit(pid, { cpuQuotaPercent: 10001 }, 'CONTROLLED_EXECUTION', true, op), /cpuQuotaPercent/);
    assert.deepEqual(log, []);
});
test('success path: limits written, process moved in, result returned, then moved back and removed', linuxOnly, async () => {
    const log: string[] = [];
    const limit = createResourceLimiter(fakeDeps(log));
    const pid = sleeper();
    let insideDir = '';
    const value = await limit(pid, { memoryMaxBytes: 64 * MIB, cpuQuotaPercent: 50 }, 'CONTROLLED_EXECUTION', true, async () => {
        const [dir] = (await readdir(siblings)).filter(n => n.startsWith(`reverse-${pid}-`));
        insideDir = path.join(siblings, dir);
        assert.equal(await readFile(path.join(insideDir, 'memory.max'), 'utf8'), String(64 * MIB));
        assert.equal(await readFile(path.join(insideDir, 'cpu.max'), 'utf8'), '50000 100000');
        assert.equal(await readFile(path.join(insideDir, 'cgroup.procs'), 'utf8'), String(pid));
        return 'operation-result';
    });
    assert.equal(value, 'operation-result');
    assert.deepEqual(log, [
        `mkdir reverse-${pid}-<uuid>`, `write memory.max=${64 * MIB}`, 'write cpu.max=50000 100000', `write cgroup.procs=${pid}`,
        `write cgroup.procs=${pid}`, 'rmdir'
    ]);
    assert.equal(await readFile(path.join(targetDir, 'cgroup.procs'), 'utf8'), String(pid), 'moved back to the original cgroup');
    await assert.rejects(stat(insideDir), /ENOENT/);
});
test('only the requested limits are written', linuxOnly, async () => {
    const log: string[] = [];
    await createResourceLimiter(fakeDeps(log))(sleeper(), { cpuQuotaPercent: 200 }, 'CONTROLLED_EXECUTION', true, async () => 0);
    assert.ok(log.some(l => l === 'write cpu.max=200000 100000'));
    assert.ok(!log.some(l => l.startsWith('write memory.max')));
});
test('a failing operation still moves the process back and removes the cgroup', linuxOnly, async () => {
    const log: string[] = [];
    const pid = sleeper();
    const limit = createResourceLimiter(fakeDeps(log));
    await assert.rejects(limit(pid, { memoryMaxBytes: 32 * MIB }, 'CONTROLLED_EXECUTION', true, async () => {
        throw new Error('operation failed');
    }), /operation failed/);
    assert.deepEqual(log.slice(-2), [`write cgroup.procs=${pid}`, 'rmdir']);
    assert.deepEqual((await readdir(siblings)).filter(n => n.startsWith(`reverse-${pid}-`)), []);
});
test('a limit that cannot be written fails loudly, runs no operation and removes the cgroup', linuxOnly, async () => {
    const log: string[] = [];
    let ran = false;
    const limit = createResourceLimiter(fakeDeps(log, {
        writeFile: async (file, value) => {
            log.push(`write ${path.basename(file)}`);
            if (path.basename(file) === 'memory.max')
                throw Object.assign(new Error('EACCES: not delegated'), { code: 'EACCES' });
            await writeFile(file, value);
        }
    }));
    const operation = async () => { ran = true; };
    await assert.rejects(limit(sleeper(), { memoryMaxBytes: 32 * MIB }, 'CONTROLLED_EXECUTION', true, operation), /EACCES/);
    assert.equal(ran, false);
    assert.ok(!log.includes('write cgroup.procs'), 'the process was never moved');
    assert.equal(log.at(-1), 'rmdir');
});
test('a target that is not in a unified cgroup v2 hierarchy is refused', linuxOnly, async () => {
    const limit = createResourceLimiter(fakeDeps([], { readProcCgroup: async () => '1:name=systemd:/\n' }));
    await assert.rejects(limit(sleeper(), { memoryMaxBytes: 32 * MIB }, 'CONTROLLED_EXECUTION', true, async () => 1), /unified cgroup v2/);
});
test('a vanished process is refused (no ownership or identity)', linuxOnly, async () => {
    const limit = createResourceLimiter(fakeDeps([]));
    await assert.rejects(limit(2 ** 22 + 12345, { memoryMaxBytes: 32 * MIB }, 'CONTROLLED_EXECUTION', true, async () => 1), /ownership/);
});
test('a parent that is not a cgroup v2 node (cgroup v1 or plain tmpfs) is refused before anything is created', linuxOnly, async () => {
    const log: string[] = [];
    const plain = path.join(root, 'v1-like');
    await mkdir(plain, { recursive: true });
    const limit = createResourceLimiter(fakeDeps(log, { readProcCgroup: async () => '0::/v1-like\n' }));
    await assert.rejects(limit(sleeper(), { memoryMaxBytes: 32 * MIB }, 'CONTROLLED_EXECUTION', true, async () => 1), /not available/);
    assert.deepEqual(log, []);
    assert.deepEqual((await readdir(root)).filter(n => n.startsWith('reverse-')), []);
});
test('a controller that is not enabled in the parent gives an actionable error and the cgroup is removed', linuxOnly, async () => {
    const log: string[] = [];
    const limit = createResourceLimiter(fakeDeps(log, {
        writeFile: async (file, value) => {
            if (path.basename(file) === 'memory.max')
                throw Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
            await writeFile(file, value);
        }
    }));
    const operation = async () => 1;
    const run = limit(sleeper(), { memoryMaxBytes: 32 * MIB }, 'CONTROLLED_EXECUTION', true, operation);
    await assert.rejects(run, /cgroup\.subtree_control/);
    assert.equal(log.at(-1), 'rmdir');
});
