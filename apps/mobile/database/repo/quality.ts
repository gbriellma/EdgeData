import type { QcFlag } from '@/core/types';
import { nowIso, uuid, type Db } from '../db';
import type { QcReview } from '../models';
import { recordAudit } from './common';

interface QcReviewRow {
  id: string;
  experiment_id: string;
  observation_id: string;
  variable_key: string;
  flag: QcFlag;
  decision: 'accepted';
  note: string | null;
  created_by: string | null;
  created_at: string;
}

const toReview = (r: QcReviewRow): QcReview => ({
  id: r.id,
  experimentId: r.experiment_id,
  observationId: r.observation_id,
  variableKey: r.variable_key,
  flag: r.flag,
  decision: r.decision,
  note: r.note,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

/**
 * Registra que um valor sinalizado foi conferido e aceito como está. O valor e a
 * flag originais não mudam; a revisão fica ao lado, com autor e justificativa.
 */
export async function acceptFlaggedValue(
  db: Db,
  input: { observationId: string; variableKey: string; flag: QcFlag; note?: string },
  actor: string,
): Promise<void> {
  await db.transaction(async () => {
    const obs = await db.first<{ experiment_id: string }>('SELECT experiment_id FROM observations WHERE id = ?', [input.observationId]);
    if (!obs) throw new Error('Observação não encontrada');
    const id = uuid();
    await db.run(
      `INSERT INTO qc_reviews (id, experiment_id, observation_id, variable_key, flag, decision, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, 'accepted', ?, ?, ?)`,
      [id, obs.experiment_id, input.observationId, input.variableKey, input.flag, input.note?.trim() || null, actor, nowIso()],
    );
    await recordAudit(db, {
      actor,
      entity: 'observation',
      entityId: input.observationId,
      action: 'qc_accept',
      details: { variable: input.variableKey, flag: input.flag, note: input.note?.trim() || null },
    });
  });
}

export async function listQcReviews(db: Db, experimentId: string): Promise<QcReview[]> {
  const rows = await db.all<QcReviewRow>('SELECT * FROM qc_reviews WHERE experiment_id = ? ORDER BY created_at', [experimentId]);
  return rows.map(toReview);
}
