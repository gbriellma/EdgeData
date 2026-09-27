import { describe, expect, it } from 'vitest';
import { analyzeVariable, describeAnova, groupingOptions } from './analysis';
import { emptyDesign } from './design';
import type { ExperimentalDesign } from './types';

const design: ExperimentalDesign = {
  ...emptyDesign(),
  factors: [
    { key: 'cultivar', label: 'Cultivar', levels: ['A', 'B'] },
    { key: 'agua', label: 'Água', levels: ['Plena', 'Deficit'] },
  ],
  replicates: 2,
};
const samples = [
  { id: 's1', treatment: 'A_Plena' },
  { id: 's2', treatment: 'A_Plena' },
  { id: 's3', treatment: 'B_Deficit' },
  { id: 's4', treatment: 'B_Deficit' },
];
const obs = (id: string, sampleId: string, sessionId: string, at: string, altura: number) => ({ id, sampleId, sessionId, collectedAt: at, data: { altura } });
const observations = [
  obs('o1', 's1', 'S1', '2026-01-01T12:00:00Z', 10),
  obs('o2', 's2', 'S1', '2026-01-01T12:00:00Z', 12),
  obs('o3', 's3', 'S1', '2026-01-01T12:00:00Z', 8),
  obs('o4', 's4', 'S1', '2026-01-01T12:00:00Z', 9),
  obs('o5', 's1', 'S2', '2026-01-08T12:00:00Z', 20),
  obs('o6', 's2', 'S2', '2026-01-08T12:00:00Z', 22),
  obs('o7', 's3', 'S2', '2026-01-08T12:00:00Z', 11),
];

describe('análise por variável', () => {
  it('oferece agrupamento por fator no desenho fatorial', () => {
    expect(groupingOptions(design).map((o) => o.key)).toEqual(['treatment', 'cultivar', 'agua']);
  });

  it('compara a última medida de cada amostra e monta a série temporal', () => {
    const r = analyzeVariable('altura', observations, samples, design);
    const t1 = r.groups.find((g) => g.key === 'A_Plena')!;
    const t2 = r.groups.find((g) => g.key === 'B_Deficit')!;
    expect(t1.values).toEqual([20, 22]);
    expect(t2.values.sort()).toEqual([11, 9]);
    expect(t1.series.map((p) => p.mean)).toEqual([11, 21]);
    // a cor segue a posição do tratamento no desenho (B_DEFICIT é o 4º)
    expect([t1.colorIndex, t2.colorIndex]).toEqual([0, 3]);
    expect(r.anova).not.toBeNull();
  });

  it('filtra por sessão e agrupa por fator', () => {
    const r = analyzeVariable('altura', observations, samples, design, { scope: { sessionId: 'S1' }, grouping: 'cultivar' });
    expect(r.groups.map((g) => [g.key, g.values])).toEqual([
      ['A', [10, 12]],
      ['B', [8, 9]],
    ]);
  });

  it('descreve a ANOVA em linguagem simples', () => {
    expect(describeAnova(null)).toMatch(/indisponível/);
    expect(describeAnova({ f: 9.26, dfBetween: 2, dfWithin: 15, p: 0.0024, ssBetween: 1, ssWithin: 1, etaSquared: 0.55 })).toBe(
      'ANOVA de um fator: F(2, 15) = 9,26; p = 0,002; η² = 0,55. Há diferença entre as médias de ao menos dois grupos (α = 0,05).',
    );
  });
});
