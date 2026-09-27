/** Estatística descritiva e comparação de grupos, sem dependências externas. */

export interface Summary {
  n: number;
  mean: number;
  sd: number | null;
  se: number | null;
  cv: number | null;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  iqr: number;
}

/** Quantil com interpolação linear (tipo 7, padrão do R e do NumPy). */
export function quantile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

export function summarize(values: readonly number[]): Summary | null {
  const data = values.filter((v) => Number.isFinite(v));
  const n = data.length;
  if (n === 0) return null;
  const sorted = [...data].sort((a, b) => a - b);
  const mean = data.reduce((s, v) => s + v, 0) / n;
  const variance = n > 1 ? data.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : null;
  const sd = variance === null ? null : Math.sqrt(variance);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  return {
    n,
    mean,
    sd,
    se: sd === null ? null : sd / Math.sqrt(n),
    cv: sd === null || mean === 0 ? null : (100 * sd) / Math.abs(mean),
    min: sorted[0],
    q1,
    median: quantile(sorted, 0.5),
    q3,
    max: sorted[n - 1],
    iqr: q3 - q1,
  };
}

/** Limites de Tukey: fora de [Q1 - k·IQR, Q3 + k·IQR] é atípico (k = 1,5) ou extremo (k = 3). */
export function tukeyFences(values: readonly number[], k = 1.5): { lower: number; upper: number } | null {
  const s = summarize(values);
  if (!s || s.n < 4) return null;
  return { lower: s.q1 - k * s.iqr, upper: s.q3 + k * s.iqr };
}

// ── Distribuição F (para ANOVA) ──────────────────────────────────────────────

function logGamma(x: number): number {
  // Aproximação de Lanczos (g = 7)
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Fração contínua da beta incompleta (Numerical Recipes, betacf). */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const EPS = 3e-14;
  const FPMIN = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPS) break;
  }
  return h;
}

/** Beta incompleta regularizada I_x(a, b). */
export function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(a, b, x)) / a;
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** P(F > f) para F(d1, d2). */
export function fDistributionUpperTail(f: number, d1: number, d2: number): number {
  if (!(f > 0)) return 1;
  return regularizedBeta(d2 / (d2 + d1 * f), d2 / 2, d1 / 2);
}

export interface AnovaResult {
  f: number;
  dfBetween: number;
  dfWithin: number;
  p: number;
  ssBetween: number;
  ssWithin: number;
  /** Proporção da variância explicada pelos grupos (eta²) */
  etaSquared: number;
}

/** ANOVA de um fator. Exige ao menos 2 grupos com dados e resíduo com grau de liberdade. */
export function oneWayAnova(groups: readonly (readonly number[])[]): AnovaResult | null {
  const clean = groups.map((g) => g.filter((v) => Number.isFinite(v))).filter((g) => g.length > 0);
  const k = clean.length;
  const n = clean.reduce((s, g) => s + g.length, 0);
  if (k < 2 || n - k < 1) return null;
  const grand = clean.reduce((s, g) => s + g.reduce((a, v) => a + v, 0), 0) / n;
  let ssBetween = 0;
  let ssWithin = 0;
  for (const g of clean) {
    const mean = g.reduce((a, v) => a + v, 0) / g.length;
    ssBetween += g.length * (mean - grand) ** 2;
    for (const v of g) ssWithin += (v - mean) ** 2;
  }
  const dfBetween = k - 1;
  const dfWithin = n - k;
  if (ssWithin === 0) return { f: Infinity, dfBetween, dfWithin, p: ssBetween > 0 ? 0 : 1, ssBetween, ssWithin, etaSquared: ssBetween > 0 ? 1 : 0 };
  const f = ssBetween / dfBetween / (ssWithin / dfWithin);
  return { f, dfBetween, dfWithin, p: fDistributionUpperTail(f, dfBetween, dfWithin), ssBetween, ssWithin, etaSquared: ssBetween / (ssBetween + ssWithin) };
}

/** Correlação de Pearson entre pares (ignora pares incompletos). */
export function pearson(xs: readonly number[], ys: readonly number[]): { r: number; n: number } | null {
  const pairs = xs.map((x, i) => [x, ys[i]] as const).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const n = pairs.length;
  if (n < 3) return null;
  const mx = pairs.reduce((s, [x]) => s + x, 0) / n;
  const my = pairs.reduce((s, [, y]) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return { r: sxy / Math.sqrt(sxx * syy), n };
}

// ── Séries temporais por grupo ───────────────────────────────────────────────

export interface TimePoint {
  /** Início do intervalo (ISO) */
  at: string;
  mean: number;
  se: number | null;
  n: number;
}

/**
 * Agrega valores por grupo e por dia (ou hora) no fuso informado, com média e
 * erro padrão, para o gráfico de evolução temporal.
 */
export function timeSeriesByGroup(
  points: readonly { group: string; at: string; value: number }[],
  options: { bucket?: 'day' | 'hour'; tzOffsetMin?: number } = {},
): Map<string, TimePoint[]> {
  const bucketMs = options.bucket === 'hour' ? 3_600_000 : 86_400_000;
  const offset = (options.tzOffsetMin ?? 0) * 60_000;
  const byGroup = new Map<string, Map<number, number[]>>();
  for (const p of points) {
    if (!Number.isFinite(p.value)) continue;
    const t = Date.parse(p.at);
    if (!Number.isFinite(t)) continue;
    const bucket = Math.floor((t + offset) / bucketMs) * bucketMs - offset;
    const groups = byGroup.get(p.group) ?? new Map<number, number[]>();
    const list = groups.get(bucket) ?? [];
    list.push(p.value);
    groups.set(bucket, list);
    byGroup.set(p.group, groups);
  }
  const result = new Map<string, TimePoint[]>();
  for (const [group, buckets] of byGroup) {
    const series = [...buckets.entries()]
      .sort(([a], [b]) => a - b)
      .map(([bucket, values]) => {
        const s = summarize(values)!;
        return { at: new Date(bucket).toISOString(), mean: s.mean, se: s.se, n: s.n };
      });
    result.set(group, series);
  }
  return result;
}
