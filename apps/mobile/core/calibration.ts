/**
 * Calibração de sensores: pontos de referência (valor bruto x valor do padrão),
 * ajuste por mínimos quadrados e aplicação da curva. O valor bruto nunca é
 * alterado; o corrigido é sempre derivado de uma calibração identificada.
 */

export type CalibrationMethod = 'offset' | 'linear' | 'quadratic';

export interface CalibrationPoint {
  /** Valor lido pelo sensor */
  raw: number;
  /** Valor do padrão/equipamento de referência */
  reference: number;
  note?: string;
}

export interface CalibrationFit {
  method: CalibrationMethod;
  /** corrigido = c0 + c1·bruto + c2·bruto² */
  coefficients: number[];
  r2: number | null;
  rmse: number;
  residuals: number[];
}

export const METHOD_INFO: Record<CalibrationMethod, { label: string; minPoints: number; description: string }> = {
  offset: { label: 'Deslocamento', minPoints: 1, description: 'Soma uma constante (zero do sensor)' },
  linear: { label: 'Linear', minPoints: 2, description: 'Ganho e deslocamento: a + b·x' },
  quadratic: { label: 'Quadrática', minPoints: 3, description: 'Curva de 2º grau: a + b·x + c·x²' },
};

export class CalibrationError extends Error {}

/** Resolve um sistema linear pequeno por eliminação de Gauss com pivotamento. */
function solve(matrix: number[][], vector: number[]): number[] {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-12) throw new CalibrationError('Pontos insuficientes ou repetidos para este ajuste');
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = a[r][col] / a[col][col];
      for (let c = col; c <= n; c++) a[r][c] -= factor * a[col][c];
    }
  }
  return a.map((row, i) => row[n] / row[i]);
}

export function applyCalibration(coefficients: readonly number[], raw: number): number {
  let value = 0;
  let power = 1;
  for (const c of coefficients) {
    value += c * power;
    power *= raw;
  }
  return value;
}

/** Ajusta a curva aos pontos por mínimos quadrados. */
export function fitCalibration(points: readonly CalibrationPoint[], method: CalibrationMethod): CalibrationFit {
  const valid = points.filter((p) => Number.isFinite(p.raw) && Number.isFinite(p.reference));
  const { minPoints, label } = METHOD_INFO[method];
  if (valid.length < minPoints) throw new CalibrationError(`${label} precisa de pelo menos ${minPoints} ponto(s)`);

  let coefficients: number[];
  if (method === 'offset') {
    const offset = valid.reduce((sum, p) => sum + (p.reference - p.raw), 0) / valid.length;
    coefficients = [offset, 1];
  } else {
    const degree = method === 'linear' ? 1 : 2;
    const size = degree + 1;
    const ata = Array.from({ length: size }, () => new Array<number>(size).fill(0));
    const aty = new Array<number>(size).fill(0);
    for (const p of valid) {
      const powers = Array.from({ length: size }, (_, k) => p.raw ** k);
      for (let i = 0; i < size; i++) {
        aty[i] += powers[i] * p.reference;
        for (let j = 0; j < size; j++) ata[i][j] += powers[i] * powers[j];
      }
    }
    coefficients = solve(ata, aty);
  }

  const residuals = valid.map((p) => p.reference - applyCalibration(coefficients, p.raw));
  const sse = residuals.reduce((sum, r) => sum + r * r, 0);
  const mean = valid.reduce((sum, p) => sum + p.reference, 0) / valid.length;
  const sst = valid.reduce((sum, p) => sum + (p.reference - mean) ** 2, 0);
  return {
    method,
    coefficients: coefficients.map((c) => (Math.abs(c) < 1e-15 ? 0 : c)),
    r2: sst > 0 ? 1 - sse / sst : null,
    rmse: Math.sqrt(sse / valid.length),
    residuals,
  };
}

/** Equação legível: "y = 0,98·x + 0,12". */
export function formatEquation(coefficients: readonly number[], digits = 4): string {
  const fmt = (v: number) => Number(v.toPrecision(digits)).toLocaleString('pt-BR', { maximumFractionDigits: 8 });
  const terms: string[] = [];
  const [c0 = 0, c1 = 0, c2 = 0] = coefficients;
  if (c2) terms.push(`${fmt(c2)}·x²`);
  if (c1) terms.push(`${fmt(c1)}·x`);
  if (c0 || terms.length === 0) terms.push(fmt(c0));
  return `y = ${terms.join(' + ').replace(/\+ -/g, '- ')}`;
}

export interface CalibrationRecord {
  id: string;
  coefficients: number[];
  validFrom: string;
  validUntil: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export function isCalibrationValidAt(calibration: CalibrationRecord, at: string): boolean {
  if (calibration.revokedAt && calibration.revokedAt <= at) return false;
  if (calibration.validFrom > at) return false;
  if (calibration.validUntil && calibration.validUntil < at) return false;
  return true;
}

/** Calibração vigente num instante: a mais recente entre as válidas. */
export function activeCalibration<T extends CalibrationRecord>(calibrations: readonly T[], at: string): T | null {
  const valid = calibrations.filter((c) => isCalibrationValidAt(c, at));
  valid.sort((a, b) => (a.validFrom === b.validFrom ? b.createdAt.localeCompare(a.createdAt) : b.validFrom.localeCompare(a.validFrom)));
  return valid[0] ?? null;
}

/** Situação da calibração para painéis: vigente, vence em breve ou vencida. */
export function calibrationStatus(calibration: CalibrationRecord, now: string, warnDays = 30): 'valid' | 'expiring' | 'expired' | 'revoked' | 'future' {
  if (calibration.revokedAt) return 'revoked';
  if (calibration.validFrom > now) return 'future';
  if (calibration.validUntil) {
    if (calibration.validUntil < now) return 'expired';
    const days = (Date.parse(calibration.validUntil) - Date.parse(now)) / 86_400_000;
    if (days <= warnDays) return 'expiring';
  }
  return 'valid';
}
