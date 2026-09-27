import { describe, expect, it } from 'vitest';
import { codeFragment, describeDesign, emptyDesign, expandTreatments, expectedCounts, planSamples, validateDesign } from './design';
import type { ExperimentalDesign } from './types';

describe('desenho explícito com controle', () => {
  // Tratamento A, Tratamento B, Controle → 5 réplicas → 3 sessões
  const design: ExperimentalDesign = {
    ...emptyDesign(),
    treatmentMode: 'explicit',
    treatments: [{ code: 'A', label: 'Tratamento A' }, { code: 'B', label: 'Tratamento B' }],
    controls: [{ code: 'C', label: 'Controle' }],
    replicates: 5,
    sessionsExpected: 3,
    sessionDurationMin: 20,
    samplingRateHz: 10000,
  };

  it('calcula a estrutura esperada', () => {
    expect(expectedCounts(design)).toEqual({ treatments: 3, samples: 15, sessions: 3, observations: 45 });
    expect(describeDesign(design)).toBe('3 tratamentos × 5 réplicas × 3 sessões = 45 observações previstas');
  });

  it('gera códigos de amostra legíveis', () => {
    const plan = planSamples(design);
    expect(plan).toHaveLength(15);
    expect(plan[0]).toMatchObject({ code: 'A_R1', treatment: 'A', replicate: 1, block: null, isControl: false });
    expect(plan.at(-1)).toMatchObject({ code: 'C_R5', isControl: true });
  });
});

describe('desenho fatorial', () => {
  const design: ExperimentalDesign = {
    ...emptyDesign(),
    factors: [
      { key: 'variedade', label: 'Variedade', levels: ['T1', 'T2'] },
      { key: 'rega', label: 'Rega', levels: ['Controle', 'Déficit hídrico'] },
      { key: 'microrganismo', label: 'Microrganismo', levels: ['F1', 'F2', 'F3'] },
    ],
    replicates: 3,
    blocks: 3,
    sessionsExpected: 4,
  };

  it('combina todos os níveis', () => {
    const treatments = expandTreatments(design);
    expect(treatments).toHaveLength(12);
    expect(treatments[0]).toMatchObject({ code: 'T1_Controle_F1', label: 'T1 × Controle × F1' });
    expect(treatments[3].code).toBe('T1_Deficit-hidrico_F1');
  });

  it('distribui réplicas em blocos', () => {
    const plan = planSamples(design);
    expect(plan).toHaveLength(36);
    expect(plan.slice(0, 3).map((p) => p.block)).toEqual([1, 2, 3]);
    expect(new Set(plan.map((p) => p.code)).size).toBe(36);
  });

  it('valida problemas comuns', () => {
    expect(validateDesign(design)).toEqual([]);
    expect(validateDesign({ ...design, factors: [{ key: 'x', label: 'X', levels: [] }] })).toContain('Fator "X" sem níveis');
  });
});

describe('utilidades', () => {
  it('gera fragmentos seguros', () => {
    expect(codeFragment('Déficit hídrico')).toBe('Deficit-hidrico');
    expect(codeFragment('***')).toBe('X');
  });

  it('desenho vazio não tem tratamentos', () => {
    expect(describeDesign(emptyDesign())).toBe('Nenhum tratamento definido');
    expect(planSamples(emptyDesign())).toEqual([]);
  });

  it('desambigua códigos repetidos', () => {
    const plan = expandTreatments({ ...emptyDesign(), treatmentMode: 'explicit', treatments: [{ code: 'A' }, { code: 'A' }] });
    expect(plan.map((t) => t.code)).toEqual(['A', 'A-2']);
  });
});
