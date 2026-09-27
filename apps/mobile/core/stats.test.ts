import { describe, expect, it } from 'vitest';
import { fDistributionUpperTail, oneWayAnova, pearson, summarize, timeSeriesByGroup, tukeyFences } from './stats';

describe('estatística descritiva', () => {
  it('resume uma amostra', () => {
    const s = summarize([1, 2, 3, 4, 10])!;
    expect(s.n).toBe(5);
    expect(s.mean).toBe(4);
    expect([s.q1, s.median, s.q3]).toEqual([2, 3, 4]);
    expect(s.sd).toBeCloseTo(3.5355339, 6);
    expect(s.se).toBeCloseTo(3.5355339 / Math.sqrt(5), 6);
    expect(summarize([])).toBeNull();
    expect(summarize([7])!.sd).toBeNull();
  });

  it('identifica atípicos por Tukey', () => {
    const fences = tukeyFences([1, 2, 3, 4, 10])!;
    expect(fences).toEqual({ lower: -1, upper: 7 });
  });
});

describe('comparação de grupos', () => {
  it('ANOVA de um fator bate com o SciPy', () => {
    const r = oneWayAnova([[6, 8, 4, 5, 3, 4], [8, 12, 9, 11, 6, 8], [13, 9, 11, 8, 7, 12]])!;
    expect(r.f).toBeCloseTo(9.264705882352942, 10);
    expect(r.p).toBeCloseTo(0.0023987773293929083, 8);
    expect([r.dfBetween, r.dfWithin]).toEqual([2, 15]);
  });

  it('cauda superior da F', () => {
    expect(fDistributionUpperTail(2.5, 3, 20)).toBeCloseTo(0.08884375193768917, 8);
  });

  it('exige dois grupos e resíduo', () => {
    expect(oneWayAnova([[1, 2, 3]])).toBeNull();
    expect(oneWayAnova([[1], [2]])).toBeNull();
  });

  it('correlação de Pearson', () => {
    expect(pearson([1, 2, 3, 4, 5], [2, 4, 5, 4, 5])!.r).toBeCloseTo(0.7745966692414835, 10);
  });
});

describe('séries temporais', () => {
  it('agrega por dia no fuso local', () => {
    const series = timeSeriesByGroup(
      [
        { group: 'T1', at: '2026-09-01T12:00:00Z', value: 2 },
        { group: 'T1', at: '2026-09-01T20:00:00Z', value: 4 },
        { group: 'T1', at: '2026-09-02T02:00:00Z', value: 6 }, // 01/09 23h em Recife
        { group: 'T1', at: '2026-09-02T12:00:00Z', value: 10 },
      ],
      { tzOffsetMin: -180 },
    ).get('T1')!;
    expect(series.map((p) => [p.at, p.mean, p.n])).toEqual([
      ['2026-09-01T03:00:00.000Z', 4, 3],
      ['2026-09-02T03:00:00.000Z', 10, 1],
    ]);
  });
});
