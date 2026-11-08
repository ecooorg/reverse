# Architecture

## Layers

- **Analysis Core:** bounded file/header inspection, source inventory, direct manifest dependency inventory.
- **Process Core:** point-in-time process inventory and selected-process inspection.
- **Measurement Core:** bounded OS process sampling and repeated wall-clock command benchmarks.
- **Validation Core:** exact caller-supplied stdout/stderr/exit-code checks. This is not semantic equivalence checking.
- **Evidence Core:** timestamped, source-linked evidence records and local JSON artifacts.
- **AI Interface:** CLI and an independent MCP stdio server over the same TypeScript functions.
- **Provider boundary:** optional specialist engines can be registered behind `AnalyzerProvider`.

## Data flow

`CLI or MCP -> domain function -> structured Result -> evidence/artifact persistence`

The Result envelope contains `schemaVersion`, `id`, `target`, `operation`, `status`, `generatedAt`, `host`, `findings`, `evidence`, `limitations`, `errors`, and `coverage`.

## Extension contract

Implement `AnalyzerProvider` from `src/providers/registry.ts`, declare concrete capabilities, check availability without side effects, and return structured observations with explicit coverage and limitations. Never report `available: true` unless the executable and required runtime are actually detected. Provider registration is in-process; dynamic plugin loading is a future task.

