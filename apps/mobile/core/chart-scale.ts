/** Escalas e marcas de eixo para os gráficos (sem dependências de UI). */

/** Marcas "redondas" (1, 2, 2,5, 5 × 10^n) cobrindo [min, max]. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const rawStep = (max - min) / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rawStep) ?? 10 * magnitude;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

export function linearScale(domain: [number, number], range: [number, number]): (v: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}

/** Marcas de tempo por dia, espaçadas para caber (no máximo `count`). */
export function timeTicks(minMs: number, maxMs: number, count = 4): number[] {
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) return [];
  if (minMs === maxMs) return [minMs];
  const day = 86_400_000;
  const days = Math.max(1, Math.ceil((maxMs - minMs) / day / Math.max(1, count - 1)));
  const ticks: number[] = [];
  for (let t = minMs; t <= maxMs + 1; t += days * day) ticks.push(t);
  return ticks;
}

/** Número curto para eixo e rótulos: 1.284 / 12,9 mil / 4,2 mi. */
export function formatAxisNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e6) return `${(value / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1e4) return `${(value / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return value.toLocaleString('pt-BR', { maximumFractionDigits: abs < 1 ? 3 : abs < 100 ? 2 : 0 });
}

/**
 * Paleta categórica em ordem fixa (validada para daltonismo em pares adjacentes).
 * A cor segue o tratamento, nunca a posição: quem chama passa o índice estável.
 */
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'] as const;

export function seriesColor(index: number): string {
  return SERIES_COLORS[index] ?? '#8a8985';
}
