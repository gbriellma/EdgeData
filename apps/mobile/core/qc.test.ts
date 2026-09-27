import { describe, expect, it } from 'vitest';
import type { VariableDefinition } from './types';
import { computeQcFlags, readingQcFlag, worstFlag } from './qc';

const v = (partial: Partial<VariableDefinition> & Pick<VariableDefinition, 'key' | 'type'>): VariableDefinition => ({
  label: partial.key,
  required: false,
  order: 0,
  config: {},
  ...partial,
});

// Formulário do exemplo "Há doença? → Qual? → Severidade? → Foto"
const diseaseForm: VariableDefinition[] = [
  v({ key: 'altura', type: 'decimal', unit: 'cm', order: 1, required: true, expectedMin: 5, expectedMax: 120, config: { min: 0, decimals: 1 } }),
  v({ key: 'ha_doenca', type: 'boolean', order: 2 }),
  v({ key: 'doenca', type: 'category', order: 3, required: true, config: { options: ['Ferrugem', 'Mancha angular'] }, showIf: { variable: 'ha_doenca', op: 'truthy' } }),
  v({ key: 'severidade', type: 'scale', order: 4, required: true, config: { min: 0, max: 9 }, showIf: { variable: 'doenca', op: 'truthy' } }),
];

describe('QC', () => {
  it('marca ausente e fora da faixa sem bloquear', () => {
    const flags = computeQcFlags(diseaseForm, { altura: 500, ha_doenca: true });
    expect(flags).toEqual({ altura: 'OUT_OF_RANGE', ha_doenca: 'GOOD', doenca: 'MISSING' });
    expect(worstFlag(flags)).toBe('OUT_OF_RANGE');
  });

  it('classifica leituras de sensor', () => {
    expect(readingQcFlag(null, {})).toBe('MISSING');
    expect(readingQcFlag(85, { range: [-10, 85] })).toBe('SATURATED');
    expect(readingQcFlag(347, { range: [-10, 85] })).toBe('BAD');
    expect(readingQcFlag(23.4, { range: [-10, 85] })).toBe('GOOD');
  });
});
