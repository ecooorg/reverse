export const optimizationTools: any[] = [
    {
        name: 'create_change_workspace',
        description: 'Copy target into isolated workspace (CONTROLLED_EXECUTION + confirm:true).',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string' },
                confirm: { type: 'boolean' }
            },
            required: ['path', 'confirm']
        }
    },
    {
        name: 'apply_change',
        description: 'Apply change only inside workspace workPath.',
        inputSchema: {
            type: 'object',
            properties: {
                workspace_id: { type: 'string' },
                changeType: { type: 'string' },
                relativePath: { type: 'string' },
                contents: { type: 'string' },
                dependency: { type: 'object' },
                runtimeFlag: { type: 'object' },
                confirm: { type: 'boolean' }
            },
            required: ['workspace_id', 'changeType', 'relativePath', 'confirm']
        }
    },
    {
        name: 'rollback_change',
        description: 'Restore workspace workPath from the original copy.',
        inputSchema: {
            type: 'object',
            properties: {
                workspace_id: { type: 'string' },
                confirm: { type: 'boolean' }
            },
            required: ['workspace_id', 'confirm']
        }
    },
    {
        name: 'accept_change',
        description: 'Mark workspace accepted without writing originalPath.',
        inputSchema: {
            type: 'object',
            properties: {
                workspace_id: { type: 'string' },
                confirm: { type: 'boolean' }
            },
            required: ['workspace_id', 'confirm']
        }
    },
    {
        name: 'decide_optimization',
        description: 'Deterministic accept/roll_back/need_more_data/reject from evidence.',
        inputSchema: {
            type: 'object',
            properties: {
                performanceVerdict: { type: 'string' },
                validationPassed: { type: 'boolean' },
                behaviorBroken: { type: 'boolean' },
                notes: { type: 'array', items: { type: 'string' } }
            }
        }
    },
    {
        name: 'run_apk_pipeline',
        description: 'Controlled APK decode/build/align/sign on a workDir copy.',
        inputSchema: {
            type: 'object',
            properties: {
                apkPath: { type: 'string' },
                workDir: { type: 'string' },
                confirm: { type: 'boolean' },
                skipDecode: { type: 'boolean' },
                timeoutMs: { type: 'number' }
            },
            required: ['apkPath', 'workDir', 'confirm']
        }
    },
    {
        name: 'create_git_worktree',
        description: 'Create a git worktree workspace for changes.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string' },
                confirm: { type: 'boolean' },
                branchName: { type: 'string' }
            },
            required: ['path', 'confirm']
        }
    },
    {
        name: 'remove_git_worktree',
        description: 'Remove a git worktree workspace.',
        inputSchema: {
            type: 'object',
            properties: {
                workspace_id: { type: 'string' },
                confirm: { type: 'boolean' }
            },
            required: ['workspace_id', 'confirm']
        }
    },
    {
        name: 'adb_install',
        description: 'Install APK via adb on a test device/AVD.',
        inputSchema: {
            type: 'object',
            properties: {
                apkPath: { type: 'string' },
                confirm: { type: 'boolean' },
                serial: { type: 'string' },
                replace: { type: 'boolean' }
            },
            required: ['apkPath', 'confirm']
        }
    },
    {
        name: 'adb_pm_clear',
        description: 'pm clear package on device before benchmark.',
        inputSchema: {
            type: 'object',
            properties: {
                packageName: { type: 'string' },
                confirm: { type: 'boolean' },
                serial: { type: 'string' }
            },
            required: ['packageName', 'confirm']
        }
    },
    {
        name: 'adb_emu_snapshot_load',
        description: 'Load AVD snapshot via adb emu (emulator only).',
        inputSchema: {
            type: 'object',
            properties: {
                snapshotName: { type: 'string' },
                confirm: { type: 'boolean' },
                serial: { type: 'string' }
            },
            required: ['snapshotName', 'confirm']
        }
    },
    {
        name: 'run_optimization_trial',
        description: 'E2E trial for shape small_source|deps_source|closed_binary.',
        inputSchema: {
            type: 'object',
            properties: {
                shape: { type: 'string' },
                confirm: { type: 'boolean' }
            },
            required: ['shape', 'confirm']
        }
    },
    {
        name: 'run_all_reference_trials',
        description: 'Run optimization trials for all three reference shapes.',
        inputSchema: {
            type: 'object',
            properties: {
                confirm: { type: 'boolean' }
            },
            required: ['confirm']
        }
    }
];
