import assert from 'node:assert/strict';
import test from 'node:test';
import { adviseMigration, assertLevelRespectsOracle, computePreservationLevel, type OracleSpec } from '../dist/preservation-migration.js';
import type { ReplayComparison } from '../dist/behavior-capture.js';
const auth = {
    basis: 'open_source' as const,
    licenseOrConsentReference: 'test-license',
    declaredBy: 'preservation-migration.test',
    declaredAt: '2026-11-11T00:00:00.000Z'
};
const equalCmp = (id: string): ReplayComparison => ({
    scenarioId: id,
    captureAuthorization: auth,
    replayAuthorization: auth,
    equal: true,
    differences: [],
    limitations: [],
    expected: {
        exitCode: 0, signal: null, stdout: 'ok', stderr: '',
        outputFiles: {}, durationMs: 1, limitations: []
    },
    actual: {
        exitCode: 0, signal: null, stdout: 'ok', stderr: '',
        outputFiles: {}, durationMs: 1, limitations: []
    }
});
test('without oracle preservation level is L0 and cannot be raised', () => {
    const report = computePreservationLevel({
        oracle: null,
        comparisons: [equalCmp('a'), equalCmp('b')],
        environments: ['wine'],
        authorization: auth
    });
    assert.equal(report.level, 'L0');
    assert.equal(assertLevelRespectsOracle(report).length, 0);
    assert.ok(report.residualRisk.length > 0);
});
test('unavailable oracle still forces L0', () => {
    const oracle: OracleSpec = {
        description: 'licensed Win7 image',
        provenance: 'operator-supplied',
        available: false
    };
    const report = computePreservationLevel({
        oracle,
        comparisons: [equalCmp('a')],
        authorization: auth
    });
    assert.equal(report.level, 'L0');
});
test('available oracle with matching scenarios can reach L2/L3', () => {
    const oracle: OracleSpec = {
        description: 'fixture oracle',
        provenance: 'lawful fixture',
        available: true
    };
    const one = computePreservationLevel({
        oracle,
        comparisons: [equalCmp('a')],
        authorization: auth
    });
    assert.ok(one.level === 'L2' || one.level === 'L1');
    const many = computePreservationLevel({
        oracle,
        comparisons: [equalCmp('a'), equalCmp('b')],
        authorization: auth
    });
    assert.equal(many.level, 'L3');
});
test('preservation report and migration advisor require authorization', () => {
    assert.throws(
        () => computePreservationLevel({ oracle: null, comparisons: [] } as never),
        /authorization/i
    );
    assert.throws(
        () => adviseMigration({
            targetSummary: 'unauthorized',
            findings: [],
            authorization: null as never
        }),
        /authorization/i
    );
});
test('migration advisor only emits options with evidence', () => {
    const advice = adviseMigration({
        authorization: auth,
        targetSummary: 'legacy VB6 tool',
        findings: [{
                cause: 'May depend on the Visual Basic 6 runtime.',
                evidence: 'msvbvm60.dll [table:vb6-runtime-msvbvm60]',
                needsExecutionEnvironment: true
            }],
        preservation: computePreservationLevel({ oracle: null, comparisons: [], authorization: auth })
    });
    assert.ok(advice.options.length >= 1);
    assert.ok(advice.options.every(o => o.evidence.length > 0));
    assert.ok(advice.limitations.some(l => /L0/.test(l)));
});
