import { describe, expect, it } from 'vitest';
import { activeCalibration, applyCalibration, CalibrationError, calibrationStatus, fitCalibration, formatEquation } from './calibration';

describe('calibração', () => {
  it('ajusta reta exata e aplica', () => {
    const fit = fitCalibration([{ raw: 0, reference: 1 }, { raw: 10, reference: 21 }, { raw: 5, reference: 11 }], 'linear');
    expect(fit.coefficients[0]).toBeCloseTo(1, 10);
    expect(fit.coefficients[1]).toBeCloseTo(2, 10);
    expect(fit.r2).toBeCloseTo(1, 10);
    expect(fit.rmse).toBeCloseTo(0, 10);
    expect(applyCalibration(fit.coefficients, 7)).toBeCloseTo(15, 10);
  });

  it('calcula deslocamento médio', () => {
    const fit = fitCalibration([{ raw: 20, reference: 20.5 }, { raw: 30, reference: 30.3 }], 'offset');
    expect(fit.coefficients[0]).toBeCloseTo(0.4, 10);
    expect(fit.coefficients[1]).toBe(1);
    expect(fit.rmse).toBeCloseTo(0.1, 10);
  });

  it('ajusta curva quadrática', () => {
    const pts = [0, 1, 2, 3, 4].map((x) => ({ raw: x, reference: 2 + 0.5 * x + 0.25 * x * x }));
    const fit = fitCalibration(pts, 'quadratic');
    expect(fit.coefficients.map((c) => Number(c.toFixed(6)))).toEqual([2, 0.5, 0.25]);
  });

  it('recusa pontos insuficientes ou degenerados', () => {
    expect(() => fitCalibration([{ raw: 1, reference: 2 }], 'linear')).toThrow(CalibrationError);
    expect(() => fitCalibration([{ raw: 1, reference: 2 }, { raw: 1, reference: 3 }], 'linear')).toThrow(CalibrationError);
  });

  it('formata a equação', () => {
    expect(formatEquation([0.12, 0.98])).toBe('y = 0,98·x + 0,12');
    expect(formatEquation([-1, 2])).toBe('y = 2·x - 1');
  });

  it('escolhe a calibração vigente e informa validade', () => {
    const base = { coefficients: [0, 1], revokedAt: null, createdAt: '2026-01-01T00:00:00Z' };
    const a = { ...base, id: 'a', validFrom: '2026-01-01T00:00:00Z', validUntil: '2026-06-30T00:00:00Z' };
    const b = { ...base, id: 'b', validFrom: '2026-03-01T00:00:00Z', validUntil: null };
    const revoked = { ...base, id: 'c', validFrom: '2026-04-01T00:00:00Z', validUntil: null, revokedAt: '2026-04-02T00:00:00Z' };
    expect(activeCalibration([a, b, revoked], '2026-02-01T00:00:00Z')?.id).toBe('a');
    expect(activeCalibration([a, b, revoked], '2026-05-01T00:00:00Z')?.id).toBe('b');
    expect(activeCalibration([a], '2027-01-01T00:00:00Z')).toBeNull();
    expect(calibrationStatus(a, '2026-06-15T00:00:00Z')).toBe('expiring');
    expect(calibrationStatus(a, '2026-07-15T00:00:00Z')).toBe('expired');
    expect(calibrationStatus(revoked, '2026-07-15T00:00:00Z')).toBe('revoked');
  });
});
