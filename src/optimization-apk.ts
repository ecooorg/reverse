import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { mkdir, cp } from 'node:fs/promises';
import { result } from './core-types.js';
import { findExecutable, COMMON_BIN_DIRS } from './providers-discover.js';
import { requireChangePermission, type ChangePermission } from './optimization-workspace.js';
const execFileAsync = promisify(execFile);
export interface ApkPipelineSpec {
    /** Path to original APK (read-only source). */
    apkPath: string;
    /** Working directory; created if missing. */
    workDir: string;
    permission: ChangePermission;
    /** Optional smali/resource relative edit already applied under decoded/. */
    skipDecode?: boolean;
    timeoutMs?: number;
}
/**
 * Controlled APK pipeline on a copy:
 * apktool d → (caller edits) → apktool b → zipalign → apksigner (test key if present).
 * Install via adb is optional and only listed when adb exists — never forced.
 */
export async function runApkPipeline(spec: ApkPipelineSpec) {
    const gate = requireChangePermission(spec.permission);
    if (gate) {
        return result(spec.apkPath, 'run_apk_pipeline', [], {
            status: 'unsupported',
            limitations: [gate],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    const apktool = await findExecutable(['apktool'], COMMON_BIN_DIRS, ['-version']);
    if (!apktool) {
        return result(spec.apkPath, 'run_apk_pipeline', [], {
            status: 'unsupported',
            limitations: [
                'apktool not found on PATH.',
                'Results are never fabricated when the tool is absent.'
            ],
            coverage: { examined: false, complete: false, notes: [] }
        });
    }
    const workDir = path.resolve(spec.workDir);
    const decoded = path.join(workDir, 'decoded');
    const built = path.join(workDir, 'built.apk');
    const aligned = path.join(workDir, 'aligned.apk');
    const signed = path.join(workDir, 'signed.apk');
    const steps: {
        step: string;
        ok: boolean;
        detail?: string;
    }[] = [];
    const timeout = spec.timeoutMs ?? 180000;
    try {
        await mkdir(workDir, { recursive: true });
        // Always copy APK into workDir — never modify caller path in place.
        const apkCopy = path.join(workDir, 'source.apk');
        await cp(path.resolve(spec.apkPath), apkCopy);
        if (!spec.skipDecode) {
            await execFileAsync(apktool.path, ['d', '-f', '-o', decoded, apkCopy], { timeout, maxBuffer: 8 * 1024 * 1024 });
            steps.push({ step: 'apktool_decode', ok: true });
        }
        else {
            steps.push({ step: 'apktool_decode', ok: true, detail: 'skipped' });
        }
        await execFileAsync(apktool.path, ['b', '-o', built, decoded], { timeout, maxBuffer: 8 * 1024 * 1024 });
        steps.push({ step: 'apktool_build', ok: true });
        const zipalign = await findExecutable(['zipalign'], COMMON_BIN_DIRS, ['-h']);
        if (zipalign) {
            await execFileAsync(zipalign.path, ['-f', '4', built, aligned], { timeout: 60000 });
            steps.push({ step: 'zipalign', ok: true });
        }
        else {
            await cp(built, aligned);
            steps.push({
                step: 'zipalign',
                ok: false,
                detail: 'zipalign missing; copied unaligned'
            });
        }
        const apksigner = await findExecutable(['apksigner'], COMMON_BIN_DIRS, ['--help']);
        const keystore = process.env.REVERSE_APK_KEYSTORE;
        if (apksigner && keystore) {
            await execFileAsync(apksigner.path, [
                'sign',
                '--ks',
                keystore,
                '--ks-pass',
                `pass:${process.env.REVERSE_APK_KEYSTORE_PASS ?? 'android'}`,
                '--out',
                signed,
                aligned
            ], { timeout: 60000 });
            steps.push({ step: 'apksigner', ok: true });
        }
        else {
            await cp(aligned, signed);
            steps.push({
                step: 'apksigner',
                ok: false,
                detail: 'apksigner or REVERSE_APK_KEYSTORE missing; unsigned copy kept'
            });
        }
        const adb = await findExecutable(['adb'], COMMON_BIN_DIRS, ['version']);
        return result(spec.apkPath, 'run_apk_pipeline', [{
                workDir,
                decoded,
                signedApk: signed,
                steps,
                adbAvailable: !!adb,
                installHint: adb
                    ? `adb install -r ${signed} (run only on a dedicated test device/AVD)`
                    : 'adb not found; install step not available'
            }], {
            status: steps.every(s => s.ok || s.detail)
                ? 'partial'
                : 'completed',
            limitations: [
                'Pipeline operates only under workDir; original APK is copied, not modified.',
                'Install/pm clear/emulator snapshot are operator steps — not auto-run.',
                'Test-key signing requires REVERSE_APK_KEYSTORE.'
            ],
            coverage: {
                examined: true,
                complete: steps.some(s => s.step === 'apktool_build' && s.ok),
                notes: steps.map(s => `${s.step}:${s.ok}${s.detail ? '(' + s.detail + ')' : ''}`)
            }
        });
    }
    catch (e: any) {
        return result(spec.apkPath, 'run_apk_pipeline', [{ steps }], {
            status: 'failed',
            limitations: [e?.message ?? String(e)],
            errors: [String(e?.message ?? e)],
            coverage: {
                examined: true,
                complete: false,
                notes: steps.map(s => s.step)
            }
        });
    }
}
