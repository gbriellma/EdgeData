import { normalizeCode } from '@/core/codes';
import type { PlannedSample } from '@/core/design';
import type { ValueMap } from '@/core/types';
import { nowIso, parseJson, uuid, type Db } from '../db';
import type { Sample } from '../models';
import { recordAudit, shallowDiff } from './common';

interface SampleRow {
  id: string;
  experiment_id: string;
  code: string;
  treatment: string | null;
  replicate: number | null;
  block: number | null;
  data: string;
  qr_generated: number;
  archived: number;
  created_at: string;
  updated_at: string;
}

const toSample = (r: SampleRow): Sample => ({
  id: r.id,
  experimentId: r.experiment_id,
  code: r.code,
  treatment: r.treatment,
  replicate: r.replicate,
  block: r.block,
  data: parseJson<ValueMap>(r.data, {}),
  qrGenerated: !!r.qr_generated,
  archived: !!r.archived,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function listSamples(db: Db, experimentId: string, options: { includeArchived?: boolean } = {}): Promise<Sample[]> {
  const rows = await db.all<SampleRow>(
    `SELECT * FROM samples WHERE experiment_id = ? ${options.includeArchived ? '' : 'AND archived = 0'} ORDER BY created_at, code`,
    [experimentId],
  );
  return rows.map(toSample);
}

export async function getSample(db: Db, id: string): Promise<Sample | null> {
  const row = await db.first<SampleRow>('SELECT * FROM samples WHERE id = ?', [id]);
  return row ? toSample(row) : null;
}

export async function findSampleByCode(db: Db, experimentId: string, code: string): Promise<Sample | null> {
  const row = await db.first<SampleRow>('SELECT * FROM samples WHERE experiment_id = ? AND UPPER(TRIM(code)) = ?', [experimentId, normalizeCode(code)]);
  return row ? toSample(row) : null;
}

export interface NewSample {
  code: string;
  treatment?: string | null;
  replicate?: number | null;
  block?: number | null;
  data?: ValueMap;
}

async function nextSampleCode(db: Db, experimentId: string): Promise<string> {
  const row = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM samples WHERE experiment_id = ?', [experimentId]);
  let n = (row?.n ?? 0) + 1;
  for (;;) {
    const code = `A${String(n).padStart(3, '0')}`;
    if (!(await db.first('SELECT id FROM samples WHERE experiment_id = ? AND code = ?', [experimentId, code]))) return code;
    n += 1;
  }
}

/** Cria várias amostras numa transação; códigos repetidos interrompem tudo. */
export async function createSamples(db: Db, experimentId: string, samples: NewSample[], actor: string, source = 'manual'): Promise<string[]> {
  if (samples.length === 0) return [];
  return db.transaction(async () => {
    const ids: string[] = [];
    const now = nowIso();
    const seen = new Set<string>();
    for (const sample of samples) {
      const code = sample.code.trim() || (await nextSampleCode(db, experimentId));
      const key = normalizeCode(code);
      if (seen.has(key)) throw new Error(`Código de amostra repetido: ${code}`);
      seen.add(key);
      const clash = await db.first('SELECT id FROM samples WHERE experiment_id = ? AND UPPER(TRIM(code)) = ?', [experimentId, key]);
      if (clash) throw new Error(`Já existe uma amostra com o código ${code}`);
      const id = uuid();
      await db.run(
        `INSERT INTO samples (id, experiment_id, code, treatment, replicate, block, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, experimentId, code, sample.treatment ?? null, sample.replicate ?? null, sample.block ?? null, JSON.stringify(sample.data ?? {}), now, now],
      );
      ids.push(id);
    }
    await recordAudit(db, { actor, entity: 'experiment', entityId: experimentId, action: 'create_samples', details: { count: ids.length, source } });
    return ids;
  });
}

export async function createSample(db: Db, experimentId: string, sample: NewSample, actor: string): Promise<string> {
  const [id] = await createSamples(db, experimentId, [sample], actor);
  return id;
}

/** Gera as amostras do plano do desenho experimental, ignorando códigos já existentes. */
export async function createSamplesFromPlan(db: Db, experimentId: string, plan: PlannedSample[], factorVariableKeys: string[], actor: string): Promise<{ created: number; skipped: number }> {
  const existing = new Set((await listSamples(db, experimentId, { includeArchived: true })).map((s) => normalizeCode(s.code)));
  const fresh = plan.filter((p) => !existing.has(normalizeCode(p.code)));
  await createSamples(
    db,
    experimentId,
    fresh.map((p) => ({
      code: p.code,
      treatment: p.treatment,
      replicate: p.replicate,
      block: p.block,
      // níveis dos fatores preenchem variáveis de amostra com a mesma chave
      data: Object.fromEntries(Object.entries(p.levels).filter(([k]) => factorVariableKeys.includes(k))),
    })),
    actor,
    'design_plan',
  );
  return { created: fresh.length, skipped: plan.length - fresh.length };
}

export async function updateSample(db: Db, id: string, changes: Partial<NewSample>, actor: string): Promise<void> {
  const current = await getSample(db, id);
  if (!current) throw new Error('Amostra não encontrada');
  const next = {
    code: changes.code?.trim() ?? current.code,
    treatment: changes.treatment === undefined ? current.treatment : changes.treatment,
    replicate: changes.replicate === undefined ? current.replicate : changes.replicate,
    block: changes.block === undefined ? current.block : changes.block,
    data: changes.data ?? current.data,
  };
  if (!next.code) throw new Error('O código da amostra é obrigatório');
  if (normalizeCode(next.code) !== normalizeCode(current.code)) {
    const clash = await findSampleByCode(db, current.experimentId, next.code);
    if (clash) throw new Error(`Já existe uma amostra com o código ${next.code}`);
  }
  const diff = shallowDiff(
    { code: current.code, treatment: current.treatment, replicate: current.replicate, block: current.block, ...current.data },
    { code: next.code, treatment: next.treatment, replicate: next.replicate, block: next.block, ...next.data },
  );
  if (Object.keys(diff).length === 0) return;
  await db.transaction(async () => {
    await db.run('UPDATE samples SET code = ?, treatment = ?, replicate = ?, block = ?, data = ?, updated_at = ? WHERE id = ?', [
      next.code, next.treatment, next.replicate, next.block, JSON.stringify(next.data), nowIso(), id,
    ]);
    await recordAudit(db, { actor, entity: 'sample', entityId: id, action: 'update', details: diff });
  });
}

export async function setSampleArchived(db: Db, id: string, archived: boolean, actor: string): Promise<void> {
  await db.transaction(async () => {
    await db.run('UPDATE samples SET archived = ?, updated_at = ? WHERE id = ?', [archived ? 1 : 0, nowIso(), id]);
    await recordAudit(db, { actor, entity: 'sample', entityId: id, action: archived ? 'archive' : 'unarchive' });
  });
}

/** Apaga amostra somente se ela nunca foi observada. */
export async function deleteSampleIfUnused(db: Db, id: string, actor: string): Promise<void> {
  const used = await db.first('SELECT id FROM observations WHERE sample_id = ? LIMIT 1', [id]);
  if (used) throw new Error('A amostra já tem observações: arquive em vez de excluir');
  await db.transaction(async () => {
    await db.run('DELETE FROM files WHERE sample_id = ? AND observation_id IS NULL', [id]);
    await db.run('DELETE FROM samples WHERE id = ?', [id]);
    await recordAudit(db, { actor, entity: 'sample', entityId: id, action: 'delete' });
  });
}

export async function markQrGenerated(db: Db, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.run(`UPDATE samples SET qr_generated = 1 WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
}

/** Quantas observações vigentes cada amostra tem (para mostrar progresso). */
export async function observationCountsBySample(db: Db, experimentId: string): Promise<Map<string, number>> {
  const rows = await db.all<{ sample_id: string; n: number }>(
    `SELECT sample_id, COUNT(*) AS n FROM observations
     WHERE experiment_id = ? AND superseded_by IS NULL AND retracted_at IS NULL GROUP BY sample_id`,
    [experimentId],
  );
  return new Map(rows.map((r) => [r.sample_id, r.n]));
}
