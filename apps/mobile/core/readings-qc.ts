import type { QcFlag } from './types';

/**
 * QC das séries de sensores: lacunas de tempo, sensor travado, relógio voltando,
 * pacotes perdidos ou duplicados e valores saturados, por sensor e sessão.
 */

export interface QcReading {
  deviceId: string;
  sensorId: string;
  sessionId: string;
  value: number | string | null;
  qc: QcFlag;
  seq: number | null;
  deviceMs: number | null;
  deviceUtc: string | null;
  receivedAt: string;
}

export interface StreamReport {
  deviceId: string;
  sensorId: string;
  sessionId: string;
  count: number;
  medianIntervalMs: number | null;
  gaps: number;
  maxGapMs: number;
  frozenRuns: number;
  longestFrozen: number;
  clockBackwards: number;
  restarts: number;
  duplicates: number;
  lostPackets: number;
  saturated: number;
  bad: number;
  missing: number;
}

export function streamProblems(r: StreamReport): string[] {
  const out: string[] = [];
  if (r.gaps > 0) out.push(`${r.gaps} lacuna(s) de tempo (maior: ${Math.round(r.maxGapMs / 1000)} s)`);
  if (r.frozenRuns > 0) out.push(`valor repetido ${r.longestFrozen} vezes seguidas: sensor pode estar travado`);
  if (r.clockBackwards > 0) out.push(`${r.clockBackwards} volta(s) no relógio do dispositivo`);
  if (r.restarts > 0) out.push(`${r.restarts} reinício(s) do dispositivo`);
  if (r.lostPackets > 0) out.push(`${r.lostPackets} pacote(s) perdido(s)`);
  if (r.duplicates > 0) out.push(`${r.duplicates} leitura(s) duplicada(s)`);
  if (r.saturated > 0) out.push(`${r.saturated} no limite do sensor (saturado)`);
  if (r.bad > 0) out.push(`${r.bad} fora da faixa física do sensor`);
  if (r.missing > 0) out.push(`${r.missing} sem valor`);
  return out;
}

export function analyzeReadings(readings: readonly QcReading[], options: { gapFactor?: number; frozenMin?: number } = {}): StreamReport[] {
  const gapFactor = options.gapFactor ?? 3;
  const frozenMin = options.frozenMin ?? 10;
  const streams = new Map<string, QcReading[]>();
  for (const r of readings) {
    const key = `${r.deviceId}|${r.sensorId}|${r.sessionId}`;
    const list = streams.get(key) ?? [];
    list.push(r);
    streams.set(key, list);
  }
  const reports: StreamReport[] = [];
  for (const list of streams.values()) {
    const sorted = [...list].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
    const times = sorted.map((r) => Date.parse(r.receivedAt));
    const intervals = times.slice(1).map((t, i) => t - times[i]).filter((d) => d > 0);
    const median = intervals.length >= 4 ? [...intervals].sort((a, b) => a - b)[Math.floor(intervals.length / 2)] : null;

    let gaps = 0;
    let maxGap = 0;
    if (median) {
      for (const d of intervals) {
        if (d > gapFactor * median) {
          gaps += 1;
          maxGap = Math.max(maxGap, d);
        }
      }
    }

    let frozenRuns = 0;
    let longest = 0;
    let run = 1;
    for (let i = 1; i <= sorted.length; i++) {
      const same = i < sorted.length && typeof sorted[i].value === 'number' && sorted[i].value === sorted[i - 1].value;
      if (same) run += 1;
      else {
        if (run >= frozenMin) {
          frozenRuns += 1;
          longest = Math.max(longest, run);
        }
        run = 1;
      }
    }

    let clockBackwards = 0;
    let restarts = 0;
    let duplicates = 0;
    let lost = 0;
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1];
      const b = sorted[i];
      if (a.deviceUtc && b.deviceUtc && b.deviceUtc < a.deviceUtc) clockBackwards += 1;
      if (a.deviceMs !== null && b.deviceMs !== null && b.deviceMs < a.deviceMs) restarts += 1;
      if (a.seq !== null && b.seq !== null) {
        if (b.seq === a.seq) duplicates += 1;
        else if (b.seq > a.seq + 1) lost += b.seq - a.seq - 1;
      }
    }

    const first = sorted[0];
    reports.push({
      deviceId: first.deviceId,
      sensorId: first.sensorId,
      sessionId: first.sessionId,
      count: sorted.length,
      medianIntervalMs: median,
      gaps,
      maxGapMs: maxGap,
      frozenRuns,
      longestFrozen: longest,
      clockBackwards,
      restarts,
      duplicates,
      lostPackets: lost,
      saturated: sorted.filter((r) => r.qc === 'SATURATED').length,
      bad: sorted.filter((r) => r.qc === 'BAD').length,
      missing: sorted.filter((r) => r.qc === 'MISSING').length,
    });
  }
  return reports.sort((a, b) => streamProblems(b).length - streamProblems(a).length);
}
