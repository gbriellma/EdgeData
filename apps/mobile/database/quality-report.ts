import { buildQualityReport, type QualityReport } from '@/core/quality';
import { analyzeReadings, type StreamReport } from '@/core/readings-qc';
import type { ProtocolVariable } from '@/core/types';
import type { Db } from './db';
import { listDevices, listReadings } from './repo/devices';
import { listProtocols } from './repo/experiments';
import { listObservations } from './repo/observations';
import { listQcReviews } from './repo/quality';
import { listSamples } from './repo/samples';
import { listSessions } from './repo/sessions';

/** Variáveis de todas as versões do protocolo; a versão mais recente define o rótulo. */
export function mergeProtocolVariables(protocols: { version: number; variables: ProtocolVariable[] }[]): ProtocolVariable[] {
  const byKey = new Map<string, ProtocolVariable>();
  for (const p of [...protocols].sort((a, b) => a.version - b.version)) for (const v of p.variables) byKey.set(v.key, v);
  return [...byKey.values()];
}

export interface QualityData {
  report: QualityReport;
  variables: ProtocolVariable[];
  streams: StreamReport[];
  deviceNames: Map<string, string>;
  sessionCodes: Map<string, string>;
}

export async function loadQualityReport(db: Db, experimentId: string): Promise<QualityData> {
  const [protocols, samples, sessions, observations, reviews, readings, devices] = await Promise.all([
    listProtocols(db, experimentId),
    listSamples(db, experimentId),
    listSessions(db, experimentId),
    listObservations(db, { experimentId, order: 'asc' }),
    listQcReviews(db, experimentId),
    listReadings(db, { experimentId }),
    listDevices(db),
  ]);
  const variables = mergeProtocolVariables(protocols);
  const report = buildQualityReport({ variables, samples, sessions, observations, reviews });
  return {
    report,
    variables,
    streams: analyzeReadings(readings),
    deviceNames: new Map(devices.map((d) => [d.id, d.name])),
    sessionCodes: new Map(sessions.map((s) => [s.id, s.code])),
  };
}
