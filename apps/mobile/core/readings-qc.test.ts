import { describe, expect, it } from 'vitest';
import { analyzeReadings, streamProblems, type QcReading } from './readings-qc';

const at = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString();
const reading = (i: number, patch: Partial<QcReading> = {}): QcReading => ({
  deviceId: 'd', sensorId: 't', sessionId: 's', value: 20 + (i % 3), qc: 'GOOD', seq: i, deviceMs: i * 1000, deviceUtc: at(i), receivedAt: at(i), ...patch,
});

describe('QC das séries de sensores', () => {
  it('série limpa não tem problemas', () => {
    const [r] = analyzeReadings(Array.from({ length: 20 }, (_, i) => reading(i)));
    expect(r.medianIntervalMs).toBe(1000);
    expect(streamProblems(r)).toEqual([]);
  });

  it('detecta lacuna, travamento, reinício, perda, duplicata e saturação', () => {
    const list: QcReading[] = Array.from({ length: 12 }, (_, i) => reading(i, { value: 25 }));
    list.push(reading(40, { seq: 15 })); // lacuna de 29 s e 3 pacotes perdidos
    list.push(reading(41, { seq: 15, deviceMs: 10, qc: 'SATURATED' })); // duplicata + reinício
    const [r] = analyzeReadings(list);
    expect(r.gaps).toBe(1);
    expect(r.maxGapMs).toBe(29000);
    expect(r.frozenRuns).toBe(1);
    expect(r.longestFrozen).toBe(12);
    expect(r.lostPackets).toBe(3);
    expect(r.duplicates).toBe(1);
    expect(r.restarts).toBe(1);
    expect(r.saturated).toBe(1);
    expect(streamProblems(r)).toHaveLength(6);
  });
});
