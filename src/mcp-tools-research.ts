/** Benchmark, baseline, evidence and research-session MCP tools (the order is part of tools/list). */
export const researchTools: any[] = [
    {
        name: 'capture_baseline',
        description: 'Capture a named baseline by running a command repeatedly and persisting the benchmark artifact.',
        inputSchema: {
            type: 'object', properties: {
                command: {
                    type: 'string'
                }, args: {
                    type: 'array', items: {
                        type: 'string'
                    }
                }, cwd: {
                    type: 'string'
                }, timeoutMs: {
                    type: 'number'
                }, repetitions: {
                    type: 'number'
                }, warmupRuns: {
                    type: 'number'
                }, label: {
                    type: 'string'
                }
            }, required: ['command']
        }
    },
    {
        name: 'run_benchmark',
        description: 'Run a command repeatedly without a shell and measure wall-clock duration, CPU time, peak RAM (direct '
            + 'child; sampled) and binary size.',
        inputSchema: {
            type: 'object', properties: {
                command: {
                    type: 'string'
                }, args: {
                    type: 'array', items: {
                        type: 'string'
                    }
                }, cwd: {
                    type: 'string'
                }, timeoutMs: {
                    type: 'number'
                }, repetitions: {
                    type: 'number'
                }, warmupRuns: {
                    type: 'number'
                }, label: {
                    type: 'string'
                }
            }, required: ['command']
        }
    },
    {
        name: 'compare_results', description: 'Compare two Reverse benchmark result objects.', inputSchema: {
            type: 'object', properties: {
                before: {
                    type: 'object'
                }, after: {
                    type: 'object'
                }
            }, required: [
                'before', 'after'
            ]
        }
    },
    {
        name: 'validate_changes', description: 'Check caller-provided expected stdout/stderr and exit code for a command.', inputSchema: {
            type: 'object', properties: {
                command: {
                    type: 'string'
                }, args: {
                    type: 'array', items: {
                        type: 'string'
                    }
                }, cwd: {
                    type: 'string'
                }, timeoutMs: {
                    type: 'number'
                }, expected: {
                    type: 'object'
                }, normalize: {
                    type: 'object',
                    properties: {
                        whitespace: { type: 'boolean' },
                        timestamps: { type: 'boolean' },
                        sortLines: { type: 'boolean' }
                    }
                }, repetitions: {
                    type: 'number'
                }
            }, required: [
                'command', 'expected'
            ]
        }
    },
    {
        name: 'get_environment_fingerprint',
        description: 'Report the non-secret environment fingerprint (OS, CPU, memory, Node.js, Reverse version) used to judge '
            + 'benchmark comparability.',
        inputSchema: {
            type: 'object', properties: {}
        }
    },
    {
        name: 'get_evidence', description: 'Find a persisted evidence record by ID.', inputSchema: {
            type: 'object', properties: {
                id: {
                    type: 'string'
                }
            }, required: ['id']
        }
    },
    {
        name: 'list_analyzers', description: 'List built-in analyzers, registered external adapters and extension points.', inputSchema: {
            type: 'object', properties: {}
        }
    },
    {
        name: 'run_provider',
        description: 'Run a registered external provider (ghidra, rizin, jadx, apktool). Returns unsupported if the tool is not installed.',
        inputSchema: {
            type: 'object', properties: {
                name: { type: 'string' },
                target: { type: 'string' },
                timeoutMs: { type: 'number' }
            }, required: ['name', 'target']
        }
    },
    {
        name: 'create_benchmark_suite', description: 'Create an interleaved benchmark suite with two or more named cases.', inputSchema: {
            type: 'object', properties: {
                name: {
                    type: 'string'
                }, cases: {
                    type: 'array', items: {
                        type: 'object', properties: {
                            name: {
                                type: 'string'
                            }, command: {
                                type: 'string'
                            }, args: {
                                type: 'array', items: {
                                    type: 'string'
                                }
                            }, cwd: {
                                type: 'string'
                            }, timeoutMs: {
                                type: 'number'
                            }
                        }, required: [
                            'name', 'command'
                        ]
                    }
                }, repetitions: {
                    type: 'number'
                }, warmupRuns: {
                    type: 'number'
                }
            }, required: ['cases']
        }
    },
    {
        name: 'run_benchmark_suite', description: 'Run a previously created benchmark suite in round-robin order.', inputSchema: {
            type: 'object', properties: {
                id: {
                    type: 'string'
                }
            }, required: ['id']
        }
    },
    {
        name: 'compare_benchmarks', description: 'Compare two interleaved benchmark suite results by matching case name.', inputSchema: {
            type: 'object', properties: {
                before: {
                    type: 'object'
                }, after: {
                    type: 'object'
                }
            }, required: [
                'before', 'after'
            ]
        }
    },
    {
        name: 'compare_baselines',
        description: 'Compare two stored baseline IDs and return the statistical benchmark report.',
        inputSchema: {
            type: 'object', properties: {
                before_id: {
                    type: 'string'
                }, after_id: {
                    type: 'string'
                }
            }, required: [
                'before_id', 'after_id'
            ]
        }
    },
    {
        name: 'get_research_session',
        description: 'Retrieve a complete research session, hash-chained event ledger, evidence and hypotheses.',
        inputSchema: {
            type: 'object', properties: {
                id: {
                    type: 'string'
                }
            }, required: ['id']
        }
    },
    {
        name: 'create_research_session', description: 'Create a local research session for a target.', inputSchema: {
            type: 'object', properties: {
                target_id: {
                    type: 'string'
                }
            }, required: ['target_id']
        }
    },
    {
        name: 'add_research_hypothesis',
        description: 'Record an AI hypothesis separately from measured and static evidence.',
        inputSchema: {
            type: 'object', properties: {
                session_id: {
                    type: 'string'
                }, statement: {
                    type: 'string'
                }, provenance: {
                    type: 'array', items: {
                        type: 'string'
                    }
                }, confidence: {
                    type: 'number'
                }
            }, required: [
                'session_id', 'statement', 'provenance', 'confidence'
            ]
        }
    },
    {
        name: 'promote_research_hypothesis',
        description: 'Promote a hypothesis only by referencing Validation or Benchmark evidence in the same session, or mark it '
            + 'refuted/retired.',
        inputSchema: {
            type: 'object', properties: {
                session_id: {
                    type: 'string'
                }, hypothesis_id: {
                    type: 'string'
                }, status: {
                    type: 'string', enum: [
                        'supported', 'refuted', 'retired'
                    ]
                }, evidence_id: {
                    type: 'string'
                }
            }, required: [
                'session_id', 'hypothesis_id', 'status'
            ]
        }
    },
    {
        name: 'add_research_event', description: 'Append a typed research-cycle event and artifact links to a session.', inputSchema: {
            type: 'object', properties: {
                session_id: {
                    type: 'string'
                }, event: {
                    type: 'string'
                }, payload: {
                    type: 'object'
                }
            }, required: [
                'session_id', 'event'
            ]
        }
    },
    {
        name: 'add_research_evidence',
        description: 'Attach typed measured evidence with source, confidence and limitations to a research session.',
        inputSchema: {
            type: 'object', properties: {
                session_id: {
                    type: 'string'
                }, type: {
                    type: 'string', enum: [
                        'Process', 'Memory', 'CPU', 'I/O', 'Binary', 'Benchmark', 'Validation'
                    ]
                }, source: {
                    type: 'string'
                }, measurement: {}, confidence: {
                    type: 'number'
                }, limitations: {
                    type: 'array', items: {
                        type: 'string'
                    }
                }
            }, required: [
                'session_id', 'type', 'source', 'measurement', 'confidence', 'limitations'
            ]
        }
    },
    {
        name: 'link_research_artifacts',
        description: 'Link target, observations, profile, baseline, optimization, benchmark, comparison, validation or final '
            + 'report artifacts in a research session.',
        inputSchema: {
            type: 'object', properties: {
                session_id: {
                    type: 'string'
                }, relation: {
                    type: 'string'
                }, ids: {
                    type: 'array', items: {
                        type: 'string'
                    }
                }
            }, required: [
                'session_id', 'relation', 'ids'
            ]
        }
    },
    {
        name: 'generate_change_report',
        description: 'Before/after change report with validation, metrics, residual risks and next steps.',
        inputSchema: {
            type: 'object',
            properties: {
                target: { type: 'string' },
                before: {},
                after: {},
                validation: { type: 'object' },
                metrics: { type: 'object' },
                findings: { type: 'array', items: { type: 'string' } },
                residualRisks: { type: 'array', items: { type: 'string' } },
                nextSteps: { type: 'array', items: { type: 'string' } }
            },
            required: ['target']
        }
    },
    {
        name: 'verify_evidence_integrity',
        description: 'Verify research session hash chain and optional HMAC signature (REVERSE_EVIDENCE_KEY).',
        inputSchema: {
            type: 'object',
            properties: {
                session: { type: 'object' },
                session_id: { type: 'string' }
            }
        }
    },
    {
        name: 'run_validation_fixtures',
        description: 'Run JSON validation fixtures from a directory (command/expected/normalize).',
        inputSchema: {
            type: 'object',
            properties: {
                directory: { type: 'string' }
            },
            required: ['directory']
        }
    }
];
researchTools.push({
    name: 'declare_legacy_authorization',
    description: 'Declare the operator-reported legal basis for legacy analysis; this is not legal verification.',
    inputSchema: { type: 'object', properties: {
            session_id: { type: 'string' },
            basis: { type: 'string', enum: ['open_source', 'written_consent'] },
            license_or_consent_reference: { type: 'string' },
            declared_by: { type: 'string' }
        }, required: ['session_id', 'basis', 'license_or_consent_reference', 'declared_by'] }
});
researchTools.push({
    name: 'analyze_legacy_windows',
    description: 'Statically inspect DOS/Windows headers, PE imports and framework signatures. '
        + 'Includes session authorization; never executes the target.',
    inputSchema: {
        type: 'object',
        properties: { file: { type: 'string' }, session_id: { type: 'string' } },
        required: ['file', 'session_id']
    }
});
