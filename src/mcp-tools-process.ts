/** File-analysis, process, profiling and resource-control MCP tools (the order is part of tools/list). */
export const processTools: any[] = [
    {
        name: 'inspect_target',
        description: 'Inspect a file or source directory and return its basic classification and metadata.',
        inputSchema: {
            type: 'object', properties: {
                target: {
                    type: 'string'
                }
            }, required: ['target']
        }
    },
    {
        name: 'analyze_binary', description: 'Inspect ELF, PE or Mach-O headers. This is not disassembly or decompilation.', inputSchema: {
            type: 'object', properties: {
                file: {
                    type: 'string'
                }
            }, required: ['file']
        }
    },
    {
        name: 'analyze_source', description: 'Inventory source files and textual external imports in a directory.', inputSchema: {
            type: 'object', properties: {
                directory: {
                    type: 'string'
                }
            }, required: ['directory']
        }
    },
    {
        name: 'analyze_dependencies', description: 'Read direct dependencies from a package.json manifest.', inputSchema: {
            type: 'object', properties: {
                directory: {
                    type: 'string'
                }
            }, required: ['directory']
        }
    },
    {
        name: 'get_inventory', description: 'List visible local processes.', inputSchema: {
            type: 'object', properties: {
                limit: {
                    type: 'number'
                }, offset: {
                    type: 'number'
                }
            }
        }
    },
    {
        name: 'inspect_process', description: 'Inspect one process visible to the current user.', inputSchema: {
            type: 'object', properties: {
                pid: {
                    type: 'number'
                }
            }, required: ['pid']
        }
    },
    {
        name: 'profile_process', description: 'Sample process CPU/RSS over a bounded interval.', inputSchema: {
            type: 'object', properties: {
                pid: {
                    type: 'number'
                }, durationMs: {
                    type: 'number'
                }, intervalMs: {
                    type: 'number'
                }
            }, required: ['pid']
        }
    },
    {
        name: 'list_processes', description: 'List visible processes with OS-provided resource metadata.', inputSchema: {
            type: 'object', properties: {
                limit: {
                    type: 'number'
                }, offset: {
                    type: 'number'
                }
            }
        }
    },
    {
        name: 'monitor_process', description: 'Observe process metrics over a bounded interval and persist a time series.', inputSchema: {
            type: 'object', properties: {
                pid: {
                    type: 'number'
                }, durationMs: {
                    type: 'number'
                }, intervalMs: {
                    type: 'number'
                }, mode: {
                    type: 'string', enum: [
                        'Snapshot', 'Monitor', 'Diagnostic', 'Compare'
                    ]
                }
            }, required: ['pid']
        }
    },
    {
        name: 'get_process_metrics', description: 'Get current process resource metrics.', inputSchema: {
            type: 'object', properties: {
                pid: {
                    type: 'number'
                }
            }, required: ['pid']
        }
    },
    {
        name: 'get_process_tree', description: 'Get the visible descendant process tree.', inputSchema: {
            type: 'object', properties: {
                pid: {
                    type: 'number'
                }
            }, required: ['pid']
        }
    },
    {
        name: 'analyze_memory', description: 'Return current process memory metrics.', inputSchema: {
            type: 'object', properties: {
                pid: {
                    type: 'number'
                }
            }, required: ['pid']
        }
    },
    {
        name: 'analyze_cpu', description: 'Return current process CPU metrics.', inputSchema: {
            type: 'object', properties: {
                pid: {
                    type: 'number'
                }
            }, required: ['pid']
        }
    },
    {
        name: 'analyze_io', description: 'Return current process disk I/O counters where available.', inputSchema: {
            type: 'object', properties: {
                pid: {
                    type: 'number'
                }
            }, required: ['pid']
        }
    },
    {
        name: 'detect_resource_anomalies', description: 'Detect high CPU and growing memory in supplied profile series.', inputSchema: {
            type: 'object', properties: {
                series: {
                    type: 'array', items: {
                        type: 'object'
                    }
                }
            }, required: ['series']
        }
    },
    {
        name: 'get_resource_control_status',
        description: 'Report whether enforceable OS resource controls are available; does not change a process.',
        inputSchema: {
            type: 'object', properties: {}
        }
    }
];
