import { expandTreatments } from './design';
import { oneWayAnova, summarize, timeSeriesByGroup, type AnovaResult, type Summary, type TimePoint } from './stats';
import type { ExperimentalDesign, ValueMap } from './types';
import { parseNumber } from './validation';

/**
 * Prepara os dados de uma variável para os gráficos e tabelas: agrupa por
 * tratamento (ou por um fator do desenho) e separa o recorte da comparação
 * do recorte temporal.
 */

export interface AnalysisObservation {
  id: string;
  sampleId: string;
  sessionId: string;
  data: ValueMap;
  collectedAt: string;
}

export interface AnalysisSample {
  id: string;
  treatment: string | null;
}

/** 'treatment' ou a chave de um fator do desenho fatorial */
export type Grouping = string;

/**
 * Recorte da comparação: 'latest' usa a última medida de cada amostra (evita
 * contar a mesma unidade várias vezes); um ID de sessão usa só aquela sessão.
 */
export type ComparisonScope = 'latest' | { sessionId: string };

export interface GroupResult {
  key: string;
  label: string;
  /** Índice estável de cor: posição do grupo no desenho, não na lista filtrada */
  colorIndex: number;
  values: number[];
  summary: Summary | null;
  series: TimePoint[];
}

export interface AnalysisResult {
  groups: GroupResult[];
  anova: AnovaResult | null;
  total: number;
}

export function groupingOptions(design: ExperimentalDesign): { key: Grouping; label: string }[] {
  const options = [{ key: 'treatment', label: 'Tratamento' }];
  if (design.treatmentMode === 'factorial' && design.factors.length > 1) {
    for (const f of design.factors) options.push({ key: f.key, label: f.label });
  }
  return options;
}

export function analyzeVariable(
  variableKey: string,
  observations: readonly AnalysisObservation[],
  samples: readonly AnalysisSample[],
  design: ExperimentalDesign,
  options: { grouping?: Grouping; scope?: ComparisonScope; tzOffsetMin?: number; exclude?: ReadonlySet<string> } = {},
): AnalysisResult {
  const grouping = options.grouping ?? 'treatment';
  const treatments = expandTreatments(design);
  const byCode = new Map(treatments.map((t) => [t.code, t]));
  const sampleGroup = new Map<string, { key: string; label: string }>();
  const order: { key: string; label: string }[] = [];
  const pushOrder = (g: { key: string; label: string }) => {
    if (!order.some((o) => o.key === g.key)) order.push(g);
  };

  if (grouping === 'treatment') treatments.forEach((t) => pushOrder({ key: t.code, label: t.label }));
  else design.factors.find((f) => f.key === grouping)?.levels.forEach((l) => pushOrder({ key: l, label: l }));

  for (const s of samples) {
    const t = s.treatment ? byCode.get(s.treatment) : undefined;
    let g: { key: string; label: string };
    if (grouping === 'treatment') g = t ? { key: t.code, label: t.label } : { key: s.treatment ?? '-', label: s.treatment ?? 'Sem tratamento' };
    else {
      const level = t?.levels[grouping];
      g = level ? { key: level, label: level } : { key: t?.isControl ? t.code : '-', label: t?.isControl ? t.label : 'Sem nível' };
    }
    sampleGroup.set(s.id, g);
    pushOrder(g);
  }

  const points = observations
    .map((o) => ({ o, value: parseNumber(o.data[variableKey]) }))
    .filter((p): p is { o: AnalysisObservation; value: number } => p.value !== null && sampleGroup.has(p.o.sampleId));

  // Recorte da comparação
  const scope = options.scope ?? 'latest';
  let comparison: typeof points;
  if (scope === 'latest') {
    const latest = new Map<string, (typeof points)[number]>();
    for (const p of points) {
      const current = latest.get(p.o.sampleId);
      if (!current || p.o.collectedAt > current.o.collectedAt) latest.set(p.o.sampleId, p);
    }
    comparison = [...latest.values()];
  } else comparison = points.filter((p) => p.o.sessionId === scope.sessionId);

  const series = timeSeriesByGroup(
    points.map((p) => ({ group: sampleGroup.get(p.o.sampleId)!.key, at: p.o.collectedAt, value: p.value })),
    { tzOffsetMin: options.tzOffsetMin },
  );

  const groups: GroupResult[] = order
    .map((g, colorIndex) => {
      const values = comparison.filter((p) => sampleGroup.get(p.o.sampleId)!.key === g.key).map((p) => p.value);
      return { key: g.key, label: g.label, colorIndex, values, summary: summarize(values), series: series.get(g.key) ?? [] };
    })
    .filter((g) => (g.values.length > 0 || g.series.length > 0) && !options.exclude?.has(g.key));

  return { groups, anova: oneWayAnova(groups.map((g) => g.values)), total: comparison.length };
}

/** Texto em linguagem simples para o resultado da ANOVA. */
export function describeAnova(anova: AnovaResult | null, alpha = 0.05): string {
  if (!anova) return 'Comparação indisponível: são necessários ao menos 2 grupos e mais de uma medida por grupo.';
  const p = anova.p < 0.001 ? 'p < 0,001' : `p = ${anova.p.toFixed(3).replace('.', ',')}`;
  const f = Number.isFinite(anova.f) ? anova.f.toFixed(2).replace('.', ',') : '∞';
  const head = `ANOVA de um fator: F(${anova.dfBetween}, ${anova.dfWithin}) = ${f}; ${p}; η² = ${anova.etaSquared.toFixed(2).replace('.', ',')}.`;
  return anova.p < alpha
    ? `${head} Há diferença entre as médias de ao menos dois grupos (α = ${String(alpha).replace('.', ',')}).`
    : `${head} Sem evidência de diferença entre as médias (α = ${String(alpha).replace('.', ',')}).`;
}
