import type { ValueMap } from '@/core/types';
import { nowIso, parseJson, uuid, type Db } from '../db';
import type { Draft } from '../models';

/**
 * Rascunho do formulário de coleta: um por experimento, sobrescrito a cada
 * alteração e apagado ao salvar. Não faz parte do dataset nem da auditoria.
 */

interface DraftRow {
  experiment_id: string;
  session_id: string | null;
  sample_id: string | null;
  data: string;
  extra: string | null;
  updated_at: string;
}

export async function saveDraft(
  db: Db,
  input: { experimentId: string; sessionId: string | null; sampleId: string | null; data: ValueMap; extra?: Record<string, unknown> },
): Promise<void> {
  await db.run(
    `INSERT INTO drafts (id, experiment_id, kind, session_id, sample_id, data, extra, updated_at) VALUES (?, ?, 'observation', ?, ?, ?, ?, ?)
     ON CONFLICT(experiment_id, kind) DO UPDATE SET session_id = excluded.session_id, sample_id = excluded.sample_id,
       data = excluded.data, extra = excluded.extra, updated_at = excluded.updated_at`,
    [uuid(), input.experimentId, input.sessionId, input.sampleId, JSON.stringify(input.data), JSON.stringify(input.extra ?? {}), nowIso()],
  );
}

export async function getDraft(db: Db, experimentId: string): Promise<Draft | null> {
  const row = await db.first<DraftRow>("SELECT * FROM drafts WHERE experiment_id = ? AND kind = 'observation'", [experimentId]);
  if (!row) return null;
  return {
    experimentId: row.experiment_id,
    sessionId: row.session_id,
    sampleId: row.sample_id,
    data: parseJson<ValueMap>(row.data, {}),
    extra: parseJson<Record<string, unknown>>(row.extra, {}),
    updatedAt: row.updated_at,
  };
}

export async function clearDraft(db: Db, experimentId: string): Promise<void> {
  await db.run("DELETE FROM drafts WHERE experiment_id = ? AND kind = 'observation'", [experimentId]);
}

export async function countDrafts(db: Db, experimentId: string): Promise<number> {
  const row = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM drafts WHERE experiment_id = ?', [experimentId]);
  return row?.n ?? 0;
}
