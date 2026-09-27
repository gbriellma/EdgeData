import type { VariableDefinition } from '@/core/types';
import { unitSymbol } from '@/core/units';
import { isGeoPoint } from '@/core/validation';
import { formatGeoPoint } from './location';

/** Valor de uma variável pronto para exibir (com unidade). */
export function formatValue(variable: VariableDefinition, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'object' && v ? ((v as { angle?: string }).angle ?? '') : String(v))).join(', ');
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (isGeoPoint(value)) return formatGeoPoint(value);
  if (variable.type === 'date' && typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  }
  const unit = variable.unit && variable.unit !== '{score}' ? ` ${unitSymbol(variable.unit)}` : '';
  return `${String(value)}${unit}`;
}
