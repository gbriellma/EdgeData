import { computeQcFlags } from '@/core/qc';
import type { GeoPoint, ProtocolVariable, QcFlags, ValueMap } from '@/core/types';
import { normalizeValues, validateValues } from '@/core/validation';
import { nowIso, parseJson, tzOffsetMinutes, uuid, type Db } from '../db';
import type { FileRecord, Observation, ObservationStatus } from '../models';
import { recordAudit, shallowDiff } from './common';
import { getProtocol } from './experiments';
import { getSession } from './sessions';

interface ObservationRow {
  id: string;
  experiment_id: string;
  session_id: string;
  sample_id: string;
  protocol_id: string;
  data: string;
  qc: string;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  gps_accuracy: number | null;
  collected_at: string;
  tz_offset_min: number | null;
  source: 'manual' | 'device' | 'import';
  revision: number;
  supersedes_id: string | null;
  superseded_by: string | null;
  superseded_at: string | null;
  retracted_at: string | null;
  retraction_reason: string | null;
  created_by: string | null;
  created_at: string;
}

function statusOf(r: Pick<ObservationRow, 'retracted_at' | 'superseded_by'>): ObservationStatus {
  if (r.retracted_at) return 'retracted';
  if (r.superseded_by) return 'superseded';
  return 'current';
}

const toObservation = (r: ObservationRow): Observation => ({
  id: r.id,
  experimentId: r.experiment_id,
  sessionId: r.session_id,
  sampleId: r.sample_id,
  protocolId: r.protocol_id,
  data: parseJson<ValueMap>(r.data, {}),
  qc: parseJson<QcFlags>(r.qc, {}),
  location:
    r.latitude !== null && r.longitude !== null
      ? { latitude: r.latitude, longitude: r.longitude, altitude: r.altitude, accuracy: r.gps_accuracy, crs: 'EPSG:4326' }
      : null,
  collectedAt: r.collected_at,
  tzOffsetMin: r.tz_offset_min,
  source: r.source,
  revision: r.revision,
  supersedesId: r.supersedes_id,
  supersededBy: r.superseded_by,
  supersededAt: r.superseded_at,
  retractedAt: r.retracted_at,
  retractionReason: r.retraction_reason,
  createdBy: r.created_by,
  createdAt: r.created_at,
  status: statusOf(r),
});

export interface NewFile {
  variableKey: string;
  path: string;
  kind?: string;
  mimeType?: string | null;
  bytes?: number | null;
  sha256?: string | null;
  width?: number | null;
  height?: number | null;
}

export class ObservationValidationError extends Error {
  constructor(public readonly errors: { field: string; message: string }[]) {
    super(errors.map((e) => e.message).join('\n'));
    this.name = 'ObservationValidationError';
  }
}

function observationVariables(variables: ProtocolVariable[]): ProtocolVariable[] {
  return variables.filter((v) => v.scope === 'observation');
}

async function insertFiles(db: Db, experimentId: string, observationId: string, sampleId: string, files: NewFile[]): Promise<void> {
  const now = nowIso();
  for (const f of files) {
    await db.run(
      `INSERT INTO files (id, experiment_id, observation_id, sample_id, variable_key, kind, path, mime_type, bytes, sha256, width, height, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), experimentId, observationId, sampleId, f.variableKey, f.kind ?? 'image', f.path, f.mimeType ?? null, f.bytes ?? null, f.sha256 ?? null, f.width ?? null, f.height ?? null, now],
    );
  }
}

export interface NewObservation {
  sessionId: string;
  sampleId: string;
  data: ValueMap;
  location?: GeoPoint | null;
  source?: 'manual' | 'device' | 'import';
  files?: NewFile[];
  /** Leituras de sensores usadas para preencher o formulário */
  readingIds?: string[];
  collectedAt?: string;
}

/** Registra uma observação (dado bruto) numa sessão aberta. */
export async function createObservation(db: Db, input: NewObservation, actor: string): Promise<Observation> {
  return db.transaction(async () => {
    const session = await getSession(db, input.sessionId);
    if (!session) throw new Error('Sessão não encontrada');
    if (session.status !== 'open' && input.source !== 'import') throw new Error('A sessão está encerrada');
    const sample = await db.first<{ experiment_id: string; archived: number }>('SELECT experiment_id, archived FROM samples WHERE id = ?', [input.sampleId]);
    if (!sample || sample.experiment_id !== session.experimentId) throw new Error('A amostra não pertence a este experimento');
    const protocol = await getProtocol(db, session.protocolId);
    if (!protocol) throw new Error('Protocolo da sessão não encontrado');

    const variables = observationVariables(protocol.variables);
    const errors = validateValues(variables, input.data);
    if (errors.length > 0) throw new ObservationValidationError(errors);
    const data = normalizeValues(variables, input.data);
    const qc = computeQcFlags(variables, data);

    const id = uuid();
    const now = nowIso();
    const loc = input.location ?? null;
    await db.run(
      `INSERT INTO observations (id, experiment_id, session_id, sample_id, protocol_id, data, qc, latitude, longitude, altitude, gps_accuracy,
         collected_at, tz_offset_min, source, revision, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        id, session.experimentId, session.id, input.sampleId, protocol.id, JSON.stringify(data), JSON.stringify(qc),
        loc?.latitude ?? null, loc?.longitude ?? null, loc?.altitude ?? null, loc?.accuracy ?? null,
        input.collectedAt ?? now, tzOffsetMinutes(), input.source ?? 'manual', actor, now,
      ],
    );
    await insertFiles(db, session.experimentId, id, input.sampleId, input.files ?? []);
    for (const readingId of input.readingIds ?? []) {
      await db.run('UPDATE readings SET observation_id = ? WHERE id = ? AND observation_id IS NULL', [id, readingId]);
    }
    await db.run('UPDATE experiments SET updated_at = ? WHERE id = ?', [now, session.experimentId]);
    return (await getObservation(db, id))!;
  });
}

/**
 * Corrige uma observação sem apagar o original: cria a revisão N+1 e marca a
 * anterior como substituída. O motivo e a diferença vão para a auditoria.
 */
export async function reviseObservation(
  db: Db,
  id: string,
  changes: { data: ValueMap; location?: GeoPoint | null; files?: NewFile[]; reason: string },
  actor: string,
): Promise<Observation> {
  if (!changes.reason.trim()) throw new Error('Informe o motivo da correção');
  return db.transaction(async () => {
    const original = await getObservation(db, id);
    if (!original) throw new Error('Observação não encontrada');
    if (original.status !== 'current') throw new Error('Só a versão vigente pode ser corrigida');
    const protocol = await getProtocol(db, original.protocolId);
    if (!protocol) throw new Error('Protocolo não encontrado');

    const variables = observationVariables(protocol.variables);
    const errors = validateValues(variables, changes.data);
    if (errors.length > 0) throw new ObservationValidationError(errors);
    const data = normalizeValues(variables, changes.data);
    const qc = computeQcFlags(variables, data);
    const diff = shallowDiff(original.data, data);
    const loc = changes.location === undefined ? original.location : changes.location;
    if (Object.keys(diff).length === 0 && JSON.stringify(loc) === JSON.stringify(original.location) && !(changes.files?.length)) {
      return original;
    }

    const newId = uuid();
    const now = nowIso();
    await db.run(
      `INSERT INTO observations (id, experiment_id, session_id, sample_id, protocol_id, data, qc, latitude, longitude, altitude, gps_accuracy,
         collected_at, tz_offset_min, source, revision, supersedes_id, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId, original.experimentId, original.sessionId, original.sampleId, original.protocolId, JSON.stringify(data), JSON.stringify(qc),
        loc?.latitude ?? null, loc?.longitude ?? null, loc?.altitude ?? null, loc?.accuracy ?? null,
        original.collectedAt, original.tzOffsetMin, original.source, original.revision + 1, original.id, actor, now,
      ],
    );
    await db.run('UPDATE observations SET superseded_by = ?, superseded_at = ? WHERE id = ?', [newId, now, original.id]);
    await insertFiles(db, original.experimentId, newId, original.sampleId, changes.files ?? []);
    await recordAudit(db, { actor, entity: 'observation', entityId: original.id, action: 'revise', details: { reason: changes.reason.trim(), revision: newId, diff } });
    return (await getObservation(db, newId))!;
  });
}

/** Retrata (invalida) uma observação com motivo; o registro continua no histórico. */
export async function retractObservation(db: Db, id: string, reason: string, actor: string): Promise<void> {
  if (!reason.trim()) throw new Error('Informe o motivo da retratação');
  await db.transaction(async () => {
    const obs = await getObservation(db, id);
    if (!obs) throw new Error('Observação não encontrada');
    if (obs.status !== 'current') throw new Error('Só a versão vigente pode ser retratada');
    await db.run('UPDATE observations SET retracted_at = ?, retraction_reason = ? WHERE id = ?', [nowIso(), reason.trim(), id]);
    await recordAudit(db, { actor, entity: 'observation', entityId: id, action: 'retract', details: { reason: reason.trim() } });
  });
}

export async function getObservation(db: Db, id: string): Promise<Observation | null> {
  const row = await db.first<ObservationRow>('SELECT * FROM observations WHERE id = ?', [id]);
  return row ? toObservation(row) : null;
}

/** Todas as versões de uma observação, da original à vigente. */
export async function getObservationHistory(db: Db, id: string): Promise<Observation[]> {
  const start = await getObservation(db, id);
  if (!start) return [];
  const chain: Observation[] = [start];
  let cursor = start;
  while (cursor.supersedesId) {
    const prev = await getObservation(db, cursor.supersedesId);
    if (!prev) break;
    chain.unshift(prev);
    cursor = prev;
  }
  cursor = start;
  while (cursor.supersededBy) {
    const next = await getObservation(db, cursor.supersededBy);
    if (!next) break;
    chain.push(next);
    cursor = next;
  }
  return chain;
}

export interface ObservationFilter {
  experimentId: string;
  sessionId?: string;
  sampleId?: string;
  /** 'current' (padrão), 'all' ou 'retracted' */
  status?: 'current' | 'all' | 'retracted';
  limit?: number;
  /** 'desc' (padrão, mais recentes primeiro) ou 'asc' (cronológica, para exportação) */
  order?: 'asc' | 'desc';
}

export async function listObservations(db: Db, filter: ObservationFilter): Promise<Observation[]> {
  const where = ['experiment_id = ?'];
  const params: (string | number)[] = [filter.experimentId];
  if (filter.sessionId) {
    where.push('session_id = ?');
    params.push(filter.sessionId);
  }
  if (filter.sampleId) {
    where.push('sample_id = ?');
    params.push(filter.sampleId);
  }
  const status = filter.status ?? 'current';
  if (status === 'current') where.push('superseded_by IS NULL AND retracted_at IS NULL');
  if (status === 'retracted') where.push('retracted_at IS NOT NULL');
  const limit = filter.limit ? `LIMIT ${Math.floor(filter.limit)}` : '';
  const rows = await db.all<ObservationRow>(`SELECT * FROM observations WHERE ${where.join(' AND ')} ORDER BY ${filter.order === 'asc' ? 'collected_at ASC, revision ASC, rowid ASC' : 'collected_at DESC, revision DESC, rowid DESC'} ${limit}`, params);
  return rows.map(toObservation);
}

// ── Arquivos ─────────────────────────────────────────────────────────────────

interface FileRow {
  id: string;
  experiment_id: string;
  observation_id: string | null;
  sample_id: string | null;
  variable_key: string | null;
  kind: string;
  path: string;
  mime_type: string | null;
  bytes: number | null;
  sha256: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

const toFile = (r: FileRow): FileRecord => ({
  id: r.id,
  experimentId: r.experiment_id,
  observationId: r.observation_id,
  sampleId: r.sample_id,
  variableKey: r.variable_key,
  kind: r.kind,
  path: r.path,
  mimeType: r.mime_type,
  bytes: r.bytes,
  sha256: r.sha256,
  width: r.width,
  height: r.height,
  createdAt: r.created_at,
});

export async function listFiles(db: Db, filter: { experimentId?: string; observationId?: string }): Promise<FileRecord[]> {
  if (filter.observationId) {
    return (await db.all<FileRow>('SELECT * FROM files WHERE observation_id = ? ORDER BY created_at', [filter.observationId])).map(toFile);
  }
  if (filter.experimentId) {
    return (await db.all<FileRow>('SELECT * FROM files WHERE experiment_id = ? ORDER BY created_at', [filter.experimentId])).map(toFile);
  }
  return [];
}

export async function registerSampleFile(db: Db, experimentId: string, sampleId: string, file: NewFile): Promise<void> {
  await db.run(
    `INSERT INTO files (id, experiment_id, sample_id, variable_key, kind, path, mime_type, bytes, sha256, width, height, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), experimentId, sampleId, file.variableKey, file.kind ?? 'image', file.path, file.mimeType ?? null, file.bytes ?? null, file.sha256 ?? null, file.width ?? null, file.height ?? null, nowIso()],
  );
}
