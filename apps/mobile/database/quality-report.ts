import { buildQualityReport, type QualityReport } from '@/core/quality';
import type { ProtocolVariable } from '@/core/types';
import type { Db } from './db';
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

export async function loadQualityReport(db: Db, experimentId: string): Promise<{ report: QualityReport; variables: ProtocolVariable[] }> {
  const [protocols, samples, sessions, observations, reviews] = await Promise.all([
    listProtocols(db, experimentId),
    listSamples(db, experimentId),
    listSessions(db, experimentId),
    listObservations(db, { experimentId, order: 'asc' }),
    listQcReviews(db, experimentId),
  ]);
  const variables = mergeProtocolVariables(protocols);
  const report = buildQualityReport({ variables, samples, sessions, observations, reviews });
  return { report, variables };
}
