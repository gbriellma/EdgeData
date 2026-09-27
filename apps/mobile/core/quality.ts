import { QC_FLAG_INFO } from './qc';
import { tukeyFences } from './stats';
import type { ProtocolVariable, QcFlag, QcFlags, ValueMap } from './types';
import { parseNumber } from './validation';

/**
 * Painel de pendências e qualidade: o que falta coletar, o que ficou em branco
 * e o que parece estranho, sempre apontando para o registro de origem.
 */

export interface QualitySample {
  id: string;
  code: string;
  treatment: string | null;
  archived?: boolean;
}

export interface QualitySession {
  id: string;
  code: string;
  status: 'open' | 'closed';
  startedAt: string;
}

export interface QualityObservation {
  id: string;
  sampleId: string;
  sessionId: string;
  data: ValueMap;
  qc: QcFlags;
  collectedAt: string;
}

export interface QualityInput {
  /** Variáveis de todas as versões do protocolo (a mais recente prevalece no rótulo) */
  variables: readonly ProtocolVariable[];
  samples: readonly QualitySample[];
  sessions: readonly QualitySession[];
  /** Somente observações vigentes */
  observations: readonly QualityObservation[];
  /** Valores já conferidos e aceitos (observação + variável + flag) */
  reviews: readonly { observationId: string; variableKey: string; flag: QcFlag }[];
}

export interface SessionPending {
  sessionId: string;
  code: string;
  status: 'open' | 'closed';
  observed: number;
  pending: QualitySample[];
}

export interface ValueIssue {
  observationId: string;
  sampleId: string;
  sampleCode: string;
  sessionCode: string;
  variableKey: string;
  label: string;
  flag: QcFlag;
  value: unknown;
  /** Explicação curta (ex.: "acima de 1,5×IQR do tratamento T1") */
  reason: string;
}

export interface QualityReport {
  pendingBySession: SessionPending[];
  neverObserved: QualitySample[];
  missing: ValueIssue[];
  flagged: ValueIssue[];
  outliers: ValueIssue[];
  missingByVariable: { key: string; label: string; count: number }[];
}

const REVIEWABLE: QcFlag[] = ['SUSPECT', 'BAD', 'OUT_OF_RANGE', 'SATURATED', 'MANUAL_REVIEW'];

export function buildQualityReport(input: QualityInput): QualityReport {
  const labels = new Map<string, ProtocolVariable>();
  for (const v of input.variables) labels.set(v.key, v);
  const samples = new Map(input.samples.map((s) => [s.id, s]));
  const sessions = new Map(input.sessions.map((s) => [s.id, s]));
  const reviewed = new Set(input.reviews.map((r) => `${r.observationId}|${r.variableKey}|${r.flag}`));
  const active = input.samples.filter((s) => !s.archived);

  const issue = (o: QualityObservation, key: string, flag: QcFlag, reason: string): ValueIssue => ({
    observationId: o.id,
    sampleId: o.sampleId,
    sampleCode: samples.get(o.sampleId)?.code ?? '?',
    sessionCode: sessions.get(o.sessionId)?.code ?? '?',
    variableKey: key,
    label: labels.get(key)?.label ?? key,
    flag,
    value: o.data[key],
    reason,
  });

  // Pendências por sessão (sessões de importação não têm expectativa de cobertura)
  const observedBySession = new Map<string, Set<string>>();
  for (const o of input.observations) {
    const set = observedBySession.get(o.sessionId) ?? new Set<string>();
    set.add(o.sampleId);
    observedBySession.set(o.sessionId, set);
  }
  const pendingBySession = [...input.sessions]
    .filter((s) => !s.code.startsWith('IMP-'))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map((s) => {
      const observed = observedBySession.get(s.id) ?? new Set<string>();
      return { sessionId: s.id, code: s.code, status: s.status, observed: observed.size, pending: active.filter((x) => !observed.has(x.id)) };
    });

  const everObserved = new Set(input.observations.map((o) => o.sampleId));
  const neverObserved = active.filter((s) => !everObserved.has(s.id));

  const missing: ValueIssue[] = [];
  const flagged: ValueIssue[] = [];
  for (const o of input.observations) {
    for (const [key, flag] of Object.entries(o.qc)) {
      if (flag === 'MISSING') missing.push(issue(o, key, flag, 'Campo não preenchido'));
      else if (REVIEWABLE.includes(flag) && !reviewed.has(`${o.id}|${key}|${flag}`)) {
        const v = labels.get(key);
        const range = v?.expectedMin !== undefined || v?.expectedMax !== undefined ? ` (esperado ${v?.expectedMin ?? '…'} a ${v?.expectedMax ?? '…'})` : '';
        flagged.push(issue(o, key, flag, `${QC_FLAG_INFO[flag].description}${flag === 'OUT_OF_RANGE' ? range : ''}`));
      }
    }
  }

  // Atípicos estatísticos por variável numérica e tratamento (Tukey 1,5×IQR, n ≥ 5)
  const outliers: ValueIssue[] = [];
  const numericKeys = [...labels.values()].filter((v) => v.scope === 'observation' && ['integer', 'decimal'].includes(v.type)).map((v) => v.key);
  for (const key of numericKeys) {
    const groups = new Map<string, { o: QualityObservation; value: number }[]>();
    for (const o of input.observations) {
      const value = parseNumber(o.data[key]);
      if (value === null) continue;
      const group = samples.get(o.sampleId)?.treatment ?? '(sem tratamento)';
      const list = groups.get(group) ?? [];
      list.push({ o, value });
      groups.set(group, list);
    }
    for (const [group, list] of groups) {
      if (list.length < 5) continue;
      const fences = tukeyFences(list.map((x) => x.value));
      if (!fences) continue;
      for (const { o, value } of list) {
        if (value >= fences.lower && value <= fences.upper) continue;
        if (reviewed.has(`${o.id}|${key}|OUTLIER`)) continue;
        const side = value > fences.upper ? 'acima' : 'abaixo';
        outliers.push(issue(o, key, 'OUTLIER', `Muito ${side} dos demais em ${group} (limites de Tukey)`));
      }
    }
  }

  const missingCounts = new Map<string, number>();
  for (const m of missing) missingCounts.set(m.variableKey, (missingCounts.get(m.variableKey) ?? 0) + 1);
  const missingByVariable = [...missingCounts.entries()]
    .map(([key, count]) => ({ key, label: labels.get(key)?.label ?? key, count }))
    .sort((a, b) => b.count - a.count);

  return { pendingBySession, neverObserved, missing, flagged, outliers, missingByVariable };
}
