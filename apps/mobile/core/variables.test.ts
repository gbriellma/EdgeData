import { describe, expect, it } from 'vitest';
import type { VariableDefinition } from './types';
import { normalizeValues, parseNumber, validateValues } from './validation';
import {
  createVariable,
  definitionsEqual,
  evaluateCondition,
  isVisible,
  slugifyKey,
  uniqueKey,
  validateDefinitions,
  visibleVariables,
} from './variables';

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

describe('chaves', () => {
  it('gera snake_case sem acentos', () => {
    expect(slugifyKey('Temperatura do Solo (°C)')).toBe('temperatura_do_solo_c');
    expect(slugifyKey('3 folhas')).toBe('v_3_folhas');
    expect(slugifyKey('***')).toBe('variavel');
  });

  it('evita colisões', () => {
    expect(uniqueKey('altura', ['altura', 'altura_2'])).toBe('altura_3');
  });
});

describe('campos condicionais', () => {
  it('avalia operadores', () => {
    expect(evaluateCondition({ variable: 'x', op: 'equals', value: 'A' }, { x: 'A' })).toBe(true);
    expect(evaluateCondition({ variable: 'x', op: 'in', value: ['A', 'B'] }, { x: 'C' })).toBe(false);
    expect(evaluateCondition({ variable: 'x', op: 'gt', value: 30 }, { x: '31,5' })).toBe(true);
    expect(evaluateCondition({ variable: 'x', op: 'gt', value: 30 }, { x: '' })).toBe(false);
    expect(evaluateCondition({ variable: 'x', op: 'gt', value: 30 }, { x: 31.5 })).toBe(true);
    expect(evaluateCondition({ variable: 'x', op: 'equals', value: 'A' }, { x: ['A', 'B'] })).toBe(true);
    expect(evaluateCondition({ variable: 'x', op: 'falsy' }, {})).toBe(true);
  });

  it('esconde a cadeia inteira quando a raiz é falsa', () => {
    const values = { ha_doenca: false, doenca: 'Ferrugem' };
    expect(isVisible(diseaseForm[3], values, diseaseForm)).toBe(false);
    expect(visibleVariables(diseaseForm, values).map((x) => x.key)).toEqual(['altura', 'ha_doenca']);
  });

  it('exibe a cadeia quando a raiz é verdadeira', () => {
    const values = { ha_doenca: true, doenca: 'Ferrugem' };
    expect(visibleVariables(diseaseForm, values).map((x) => x.key)).toEqual(['altura', 'ha_doenca', 'doenca', 'severidade']);
  });
});

describe('validação de valores', () => {
  it('ignora obrigatórios ocultos', () => {
    expect(validateValues(diseaseForm, { altura: '37,4', ha_doenca: false })).toEqual([]);
  });

  it('exige obrigatórios visíveis', () => {
    const errors = validateValues(diseaseForm, { altura: 37, ha_doenca: true });
    expect(errors.map((e) => e.field)).toEqual(['doenca']);
  });

  it('bloqueia limites rígidos, mas não a faixa esperada', () => {
    expect(validateValues(diseaseForm, { altura: -1 }).map((e) => e.field)).toEqual(['altura']);
    expect(validateValues(diseaseForm, { altura: 500 })).toEqual([]);
  });

  it('valida data, hora e GPS', () => {
    const vars = [
      v({ key: 'd', type: 'date' }),
      v({ key: 't', type: 'time' }),
      v({ key: 'g', type: 'gps' }),
    ];
    expect(validateValues(vars, { d: '15/02/2026', t: '25:00', g: { latitude: 100, longitude: 0 } }).map((e) => e.field)).toEqual(['d', 't', 'g']);
    expect(validateValues(vars, { d: '2026-02-15', t: '10:30', g: { latitude: -8.05, longitude: -34.9, accuracy: 4 } })).toEqual([]);
  });

  it('normaliza números com vírgula e remove ocultos', () => {
    expect(parseNumber('37,4')).toBe(37.4);
    expect(normalizeValues(diseaseForm, { altura: '37,44', ha_doenca: false, doenca: 'Ferrugem' })).toEqual({
      altura: 37.4,
      ha_doenca: false,
    });
  });
});

describe('definições', () => {
  it('detecta problemas', () => {
    const issues = validateDefinitions([
      v({ key: 'Altura', type: 'decimal' }),
      v({ key: 'x', type: 'category' }),
      v({ key: 'y', type: 'decimal', unit: 'furlong' }),
      v({ key: 'a', type: 'boolean', showIf: { variable: 'b', op: 'truthy' } }),
      v({ key: 'b', type: 'boolean', showIf: { variable: 'a', op: 'truthy' } }),
    ]);
    const text = issues.map((i) => i.message).join(' | ');
    expect(text).toMatch(/inválido/);
    expect(text).toMatch(/sem opções/);
    expect(text).toMatch(/não reconhecida/);
    expect(text).toMatch(/ciclo/);
  });

  it('aceita o formulário de exemplo', () => {
    expect(validateDefinitions(diseaseForm)).toEqual([]);
  });

  it('cria variáveis com padrões por tipo', () => {
    const scale = createVariable('scale', 'Severidade', [], 1);
    expect(scale.key).toBe('severidade');
    expect(scale.config).toMatchObject({ min: 0, max: 9 });
  });

  it('compara definições independentemente da ordem das chaves', () => {
    const a = [v({ key: 'x', type: 'decimal', unit: 'cm' })];
    const b = [{ unit: 'cm', ...v({ key: 'x', type: 'decimal' }) }];
    expect(definitionsEqual(a, b)).toBe(true);
    expect(definitionsEqual(a, [v({ key: 'x', type: 'decimal', unit: 'mm' })])).toBe(false);
  });
});
