import assert from 'node:assert/strict';
import test from 'node:test';
import { closeWindowsHelper, windowsHelperRequest, windowsHelperStartCount } from '../dist/process-windows-helper.js';
test('persistent Windows helper is platform-gated and returns process JSON on Windows', async () => {
    if (process.platform !== 'win32') {
        await assert.rejects(windowsHelperRequest('list'), /only on Windows/i);
        return;
    }
    try {
        const startsBefore = windowsHelperStartCount();
        const raw = await windowsHelperRequest('list', undefined, 20000);
        const rows = JSON.parse(raw);
        assert.ok(Array.isArray(rows));
        assert.ok(rows.every((row: any) => Number.isInteger(Number(row.ProcessId))));
        await windowsHelperRequest('tree', undefined, 20000);
        const sampleRaw = await windowsHelperRequest('sample', process.pid, 5000);
        const sample = JSON.parse(sampleRaw);
        const metrics = Array.isArray(sample) ? sample[0] : sample;
        assert.ok(Number.isFinite(Number(metrics?.cpuMs)));
        assert.ok(Number.isFinite(Number(metrics?.rss)));
        assert.equal(windowsHelperStartCount() - startsBefore, 1, 'multiple requests must reuse one PowerShell process');
    }
    finally {
        closeWindowsHelper();
    }
});
