import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { result } from './core-types.js';
import { findExecutable, COMMON_BIN_DIRS } from './providers-discover.js';
import { requireChangePermission, type ChangePermission } from './optimization-workspace.js';
const execFileAsync = promisify(execFile);
async function adbBin() {
    return findExecutable(['adb'], COMMON_BIN_DIRS, ['version']);
}
/**
 * Install APK on a connected device/emulator. Never targets production by policy:
 * requires CONTROLLED_EXECUTION + confirm and documents test-device use.
 */
export async function adbInstall(apkPath: string, perm: ChangePermission, opts?: {
    serial?: string;
    replace?: boolean;
}) {
    const gate = requireChangePermission(perm);
    if (gate) {
        return result(apkPath, 'adb_install', [], {
            status: 'unsupported',
            limitations: [gate],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    const adb = await adbBin();
    if (!adb) {
        return result(apkPath, 'adb_install', [], {
            status: 'unsupported',
            limitations: ['adb not found on PATH.'],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    const args = [
        ...(opts?.serial ? ['-s', opts.serial] : []),
        'install',
        ...(opts?.replace === false ? [] : ['-r']),
        apkPath
    ];
    try {
        const { stdout, stderr } = await execFileAsync(adb.path, args, {
            timeout: 120000,
            maxBuffer: 2 * 1024 * 1024
        });
        return result(apkPath, 'adb_install', [{
                serial: opts?.serial ?? null,
                log: `${stdout}\n${stderr}`.slice(0, 4000)
            }], {
            status: /Success/i.test(stdout + stderr) ? 'completed' : 'partial',
            limitations: [
                'Use only on a dedicated AVD or test device.',
                'Reverse does not select or lock the device serial for you.'
            ],
            coverage: {
                examined: true,
                complete: /Success/i.test(stdout + stderr),
                notes: []
            }
        });
    }
    catch (e: any) {
        return result(apkPath, 'adb_install', [], {
            status: 'failed',
            limitations: [e?.message ?? String(e)],
            errors: [String(e?.message ?? e)],
            coverage: { examined: true, complete: false, notes: [] }
        });
    }
}
/** pm clear <package> on device — resets app state before a benchmark. */
export async function adbPmClear(packageName: string, perm: ChangePermission, opts?: {
    serial?: string;
}) {
    const gate = requireChangePermission(perm);
    if (gate) {
        return result(packageName, 'adb_pm_clear', [], {
            status: 'unsupported',
            limitations: [gate],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    const adb = await adbBin();
    if (!adb) {
        return result(packageName, 'adb_pm_clear', [], {
            status: 'unsupported',
            limitations: ['adb not found on PATH.'],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    if (!/^[A-Za-z0-9_.]+$/.test(packageName)) {
        return result(packageName, 'adb_pm_clear', [], {
            status: 'failed',
            limitations: ['packageName must be alphanumeric / underscore / dot.'],
            errors: ['invalid package name'],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    const args = [
        ...(opts?.serial ? ['-s', opts.serial] : []),
        'shell',
        'pm',
        'clear',
        packageName
    ];
    try {
        const { stdout, stderr } = await execFileAsync(adb.path, args, {
            timeout: 30000
        });
        return result(packageName, 'adb_pm_clear', [{
                log: `${stdout}\n${stderr}`.slice(0, 2000)
            }], {
            status: /Success/i.test(stdout + stderr) ? 'completed' : 'partial',
            limitations: [
                'Resets app data on the connected device; confirm the serial first.'
            ],
            coverage: {
                examined: true,
                complete: /Success/i.test(stdout + stderr),
                notes: []
            }
        });
    }
    catch (e: any) {
        return result(packageName, 'adb_pm_clear', [], {
            status: 'failed',
            limitations: [e?.message ?? String(e)],
            errors: [String(e?.message ?? e)],
            coverage: { examined: true, complete: false, notes: [] }
        });
    }
}
/**
 * Emulator snapshot restore via adb emu (works on Android emulator console).
 * Host-side AVD snapshot APIs differ; this uses `adb emu avd snapshot load` when available.
 */
export async function adbEmuSnapshotLoad(snapshotName: string, perm: ChangePermission, opts?: {
    serial?: string;
}) {
    const gate = requireChangePermission(perm);
    if (gate) {
        return result(snapshotName, 'adb_emu_snapshot_load', [], {
            status: 'unsupported',
            limitations: [gate],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    const adb = await adbBin();
    if (!adb) {
        return result(snapshotName, 'adb_emu_snapshot_load', [], {
            status: 'unsupported',
            limitations: ['adb not found on PATH.'],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    if (!/^[A-Za-z0-9_.-]+$/.test(snapshotName)) {
        return result(snapshotName, 'adb_emu_snapshot_load', [], {
            status: 'failed',
            limitations: ['Invalid snapshot name.'],
            errors: ['invalid name'],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    const args = [
        ...(opts?.serial ? ['-s', opts.serial] : []),
        'emu',
        'avd',
        'snapshot',
        'load',
        snapshotName
    ];
    try {
        const { stdout, stderr } = await execFileAsync(adb.path, args, {
            timeout: 60000
        });
        return result(snapshotName, 'adb_emu_snapshot_load', [{
                log: `${stdout}\n${stderr}`.slice(0, 2000)
            }], {
            status: 'partial',
            limitations: [
                'Requires Android emulator with console; physical devices unsupported.',
                'Snapshot must already exist on the AVD.'
            ],
            coverage: {
                examined: true,
                complete: false,
                notes: ['emu snapshot load invoked']
            }
        });
    }
    catch (e: any) {
        return result(snapshotName, 'adb_emu_snapshot_load', [], {
            status: 'failed',
            limitations: [e?.message ?? String(e)],
            errors: [String(e?.message ?? e)],
            coverage: { examined: true, complete: false, notes: [] }
        });
    }
}
