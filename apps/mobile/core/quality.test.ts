import { describe, expect, it } from 'vitest';
import { buildQualityReport, type QualityObservation } from './quality';
import { reviewBeforeExport } from './review';
import type { ProtocolVariable } from './types';

const variables: ProtocolVariable[] = [
  { key: 'altura', label: 'Altura', type: 'decimal', unit: 'cm', required: true, order: 1, expectedMin: 1, expectedMax: 100, config: {}, scope: 'observation' },
  { key: 'obs', label: 'Notas', type: 'long_text', required: false, order: 2, config: {}, scope: 'observation' },
];
const samples = ['A', 'B', 'C', 'D', 'E', 'F'].map((c, i) => ({ id: `s${i}`, code: c, treatment: 'T1' }));
const sessions = [
  { id: 'x1', code: 'S001', status: 'closed' as const, startedAt: '2026-01-01T00:00:00Z' },
  { id: 'x2', code: 'S002', status: 'open' as const, startedAt: '2026-01-08T00:00:00Z' },
  { id: 'imp', code: 'IMP-001', status: 'closed' as const, startedAt: '2025-01-01T00:00:00Z' },
];
const alturas = [10, 11, 12, 11, 10, 95];
const observations: QualityObservation[] = alturas.map((altura, i) => ({
  id: `o${i}`,
  sampleId: `s${i}`,
  sessionId: 'x1',
  data: { altura },
  qc: { altura: 'GOOD', obs: 'MISSING' },
  collectedAt: '2026-01-01T10:00:00Z',
}));
observations.push({ id: 'o9', sampleId: 's0', sessionId: 'x2', data: { altura: 150 }, qc: { altura: 'OUT_OF_RANGE', obs: 'GOOD' }, collectedAt: '2026-01-08T10:00:00Z' });

describe('painel de qualidade', () => {
  const report = buildQualityReport({ variables, samples, sessions, observations, reviews: [] });

  it('lista pendências por sessão, sem sessões de importação', () => {
    expect(report.pendingBySession.map((s) => [s.code, s.observed, s.pending.length])).toEqual([
      ['S002', 1, 5],
      ['S001', 6, 0],
    ]);
    expect(report.neverObserved).toEqual([]);
  });

  it('aponta campos ausentes, flags e atípicos', () => {
    expect(report.missing).toHaveLength(6);
    expect(report.missingByVariable).toEqual([{ key: 'obs', label: 'Notas', count: 6 }]);
    expect(report.flagged.map((f) => [f.sampleCode, f.flag])).toEqual([['A', 'OUT_OF_RANGE']]);
    expect(report.flagged[0].reason).toMatch(/esperado 1 a 100/);
    // 95 fica dentro dos limites porque o próprio 150 alarga o IQR (Tukey é robusto, não mágico)
    expect(report.outliers.map((o) => [o.sampleCode, o.value])).toEqual([['A', 150]]);
  });

  it('esconde o que já foi revisado', () => {
    const again = buildQualityReport({ variables, samples, sessions, observations, reviews: [{ observationId: 'o9', variableKey: 'altura', flag: 'OUT_OF_RANGE' }] });
    expect(again.flagged).toEqual([]);
  });

  it('revisão antes de exportar ordena por gravidade', () => {
    const issues = reviewBeforeExport({
      metadata: { name: 'X', code: 'X', team: [{ name: 'Gabriel' }] },
      variables: [...variables, { ...variables[0], key: 'massa', label: 'Massa', unit: undefined }],
      samples: 6,
      observations: 0,
      openSessions: ['S002'],
      drafts: 1,
      quality: report,
      missingMedia: 2,
    });
    expect(issues[0].id).toBe('no-data');
    expect(issues.map((i) => i.id)).toEqual(expect.arrayContaining(['meta-core', 'orcid', 'open-sessions', 'drafts', 'flagged', 'media', 'units']));
    expect(issues.find((i) => i.id === 'units')?.detail).toBe('Massa');
  });
});
