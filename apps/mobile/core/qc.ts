import type { QcFlag, QcFlags, ValueMap, VariableDefinition } from './types';
import { parseNumber } from './validation';
import { fieldTypeInfo, isVisible } from './variables';

export const QC_FLAG_INFO: Record<QcFlag, { label: string; description: string; severity: 0 | 1 | 2 }> = {
  GOOD: { label: 'Bom', description: 'Sem problemas detectados', severity: 0 },
  SUSPECT: { label: 'Suspeito', description: 'Valor plausível, mas merece atenção', severity: 1 },
  BAD: { label: 'Ruim', description: 'Valor considerado inválido', severity: 2 },
  MISSING: { label: 'Ausente', description: 'Valor não registrado', severity: 1 },
  OUT_OF_RANGE: { label: 'Fora da faixa', description: 'Fora da faixa esperada', severity: 1 },
  SATURATED: { label: 'Saturado', description: 'No limite de medição do sensor', severity: 2 },
  CALIBRATION: { label: 'Calibração', description: 'Registro de calibração', severity: 0 },
  OUTLIER: { label: 'Outlier', description: 'Estatisticamente atípico', severity: 1 },
  MANUAL_REVIEW: { label: 'Revisão manual', description: 'Marcado para revisão', severity: 1 },
};

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

/**
 * Flags automáticas atribuídas no momento da coleta. Nunca bloqueiam o registro:
 * servem para que problemas fiquem visíveis na análise em vez de serem apagados.
 */
export function computeQcFlags(variables: readonly VariableDefinition[], values: ValueMap): QcFlags {
  const flags: QcFlags = {};
  for (const variable of variables) {
    if (fieldTypeInfo(variable.type).automatic) continue;
    if (!isVisible(variable, values, variables)) continue;
    const value = values[variable.key];
    if (isBlank(value)) {
      flags[variable.key] = 'MISSING';
      continue;
    }
    const numeric = ['integer', 'decimal', 'scale'].includes(variable.type) ? parseNumber(value) : null;
    if (
      numeric !== null &&
      ((variable.expectedMin !== undefined && numeric < variable.expectedMin) ||
        (variable.expectedMax !== undefined && numeric > variable.expectedMax))
    ) {
      flags[variable.key] = 'OUT_OF_RANGE';
      continue;
    }
    flags[variable.key] = 'GOOD';
  }
  return flags;
}

export interface SensorLimits {
  range?: [number, number];
}

/** Flag de uma leitura de sensor segundo a faixa declarada no manifesto. */
export function readingQcFlag(value: unknown, sensor: SensorLimits): QcFlag {
  if (value === null || value === undefined) return 'MISSING';
  if (typeof value !== 'number' || !Number.isFinite(value)) return typeof value === 'number' ? 'BAD' : 'GOOD';
  if (sensor.range) {
    const [lo, hi] = sensor.range;
    if (value === lo || value === hi) return 'SATURATED';
    if (value < lo || value > hi) return 'BAD';
  }
  return 'GOOD';
}

/** Resumo de flags para painéis: quantas de cada tipo. */
export function summarizeFlags(flagSets: readonly QcFlags[]): Partial<Record<QcFlag, number>> {
  const summary: Partial<Record<QcFlag, number>> = {};
  for (const flags of flagSets) {
    for (const flag of Object.values(flags)) summary[flag] = (summary[flag] ?? 0) + 1;
  }
  return summary;
}

/** Pior flag de um conjunto (para colorir um registro na lista). */
export function worstFlag(flags: QcFlags): QcFlag {
  let worst: QcFlag = 'GOOD';
  for (const flag of Object.values(flags)) {
    if (QC_FLAG_INFO[flag].severity > QC_FLAG_INFO[worst].severity) worst = flag;
  }
  return worst;
}
