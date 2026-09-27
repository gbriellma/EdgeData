import type { ExperimentalDesign, Factor } from './types';

export interface Treatment {
  code: string;
  label: string;
  /** Nível de cada fator (chave do fator → nível) */
  levels: Record<string, string>;
  isControl: boolean;
}

export interface PlannedSample {
  code: string;
  treatment: string;
  replicate: number;
  /** Bloco (1..n) ou null quando o desenho não usa blocos */
  block: number | null;
  levels: Record<string, string>;
  isControl: boolean;
}

export interface ExpectedCounts {
  treatments: number;
  samples: number;
  sessions: number;
  observations: number;
}

export function emptyDesign(): ExperimentalDesign {
  return {
    factors: [],
    treatmentMode: 'factorial',
    treatments: [],
    controls: [],
    replicates: 1,
    blocks: 0,
    sessionsExpected: 1,
  };
}

/** Código curto e seguro para arquivos/etiquetas: "Déficit hídrico" → "Deficit-hidrico" */
export function codeFragment(text: string): string {
  const cleaned = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'X';
}

function cartesian(factors: readonly Factor[]): Record<string, string>[] {
  const usable = factors.filter((f) => f.levels.length > 0);
  if (usable.length === 0) return [];
  return usable.reduce<Record<string, string>[]>(
    (combos, factor) => combos.flatMap((combo) => factor.levels.map((level) => ({ ...combo, [factor.key]: level }))),
    [{}],
  );
}

/** Lista de tratamentos do desenho, incluindo controles. */
export function expandTreatments(design: ExperimentalDesign): Treatment[] {
  const treatments: Treatment[] = [];

  if (design.treatmentMode === 'factorial') {
    for (const levels of cartesian(design.factors)) {
      const parts = design.factors.filter((f) => levels[f.key] !== undefined).map((f) => levels[f.key]);
      treatments.push({
        code: parts.map(codeFragment).join('_'),
        label: parts.join(' × '),
        levels,
        isControl: false,
      });
    }
  } else {
    for (const t of design.treatments) {
      if (!t.code.trim()) continue;
      treatments.push({
        code: codeFragment(t.code),
        label: t.label?.trim() || t.code,
        levels: t.levels ?? {},
        isControl: false,
      });
    }
  }

  for (const c of design.controls) {
    if (!c.code.trim()) continue;
    treatments.push({ code: codeFragment(c.code), label: c.label?.trim() || c.code, levels: {}, isControl: true });
  }

  // Códigos repetidos recebem sufixo para continuar únicos
  const seen = new Map<string, number>();
  return treatments.map((t) => {
    const count = seen.get(t.code) ?? 0;
    seen.set(t.code, count + 1);
    return count === 0 ? t : { ...t, code: `${t.code}-${count + 1}` };
  });
}

/**
 * Gera o plano de amostras: cada tratamento × réplica. Com blocos (DBC), cada bloco
 * recebe uma réplica de cada tratamento, distribuídas em rodízio.
 */
export function planSamples(design: ExperimentalDesign): PlannedSample[] {
  const replicates = Math.max(1, Math.floor(design.replicates || 1));
  const blocks = Math.max(0, Math.floor(design.blocks || 0));
  const plan: PlannedSample[] = [];
  for (const treatment of expandTreatments(design)) {
    for (let r = 1; r <= replicates; r++) {
      plan.push({
        code: `${treatment.code}_R${r}`,
        treatment: treatment.code,
        replicate: r,
        block: blocks > 1 ? ((r - 1) % blocks) + 1 : null,
        levels: treatment.levels,
        isControl: treatment.isControl,
      });
    }
  }
  return plan;
}

export function expectedCounts(design: ExperimentalDesign): ExpectedCounts {
  const treatments = expandTreatments(design).length;
  const samples = treatments * Math.max(1, Math.floor(design.replicates || 1));
  const sessions = Math.max(1, Math.floor(design.sessionsExpected || 1));
  return { treatments, samples, sessions, observations: samples * sessions };
}

/** Texto curto do desenho, ex.: "3 tratamentos × 5 réplicas × 3 sessões = 45 observações" */
export function describeDesign(design: ExperimentalDesign): string {
  const c = expectedCounts(design);
  if (c.treatments === 0) return 'Nenhum tratamento definido';
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return [
    plural(c.treatments, 'tratamento', 'tratamentos'),
    plural(Math.max(1, design.replicates), 'réplica', 'réplicas'),
    plural(c.sessions, 'sessão', 'sessões'),
  ].join(' × ') + ` = ${plural(c.observations, 'observação prevista', 'observações previstas')}`;
}

/** Problemas que impedem gerar o plano. */
export function validateDesign(design: ExperimentalDesign): string[] {
  const problems: string[] = [];
  if (design.replicates < 1) problems.push('Informe ao menos 1 réplica');
  if (design.sessionsExpected < 1) problems.push('Informe ao menos 1 sessão prevista');
  if (design.treatmentMode === 'factorial') {
    for (const f of design.factors) {
      if (!f.label.trim()) problems.push('Há fator sem nome');
      if (f.levels.length === 0) problems.push(`Fator "${f.label}" sem níveis`);
      if (new Set(f.levels).size !== f.levels.length) problems.push(`Fator "${f.label}" tem níveis repetidos`);
    }
    const keys = design.factors.map((f) => f.key);
    if (new Set(keys).size !== keys.length) problems.push('Fatores com IDs repetidos');
  }
  const total = expectedCounts(design).samples;
  if (total > 10000) problems.push(`O plano gera ${total} amostras — acima do limite de 10.000`);
  return problems;
}
