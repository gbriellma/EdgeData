import { nowIso, parseJson, tzOffsetMinutes, uuid, type Db } from '../db';
import type { DeviceSnapshotEntry, EventRecord, Session } from '../models';
import { recordAudit } from './common';
import { getCurrentProtocol } from './experiments';

interface SessionRow {
  id: string;
  experiment_id: string;
  protocol_id: string;
  code: string;
  operator: string | null;
  status: 'open' | 'closed';
  started_at: string;
  ended_at: string | null;
  tz_offset_min: number | null;
  device_snapshot: string | null;
  notes: string | null;
  created_at: string;
}

const toSession = (r: SessionRow): Session => ({
  id: r.id,
  experimentId: r.experiment_id,
  protocolId: r.protocol_id,
  code: r.code,
  operator: r.operator,
  status: r.status,
  startedAt: r.started_at,
  endedAt: r.ended_at,
  tzOffsetMin: r.tz_offset_min,
  deviceSnapshot: parseJson<DeviceSnapshotEntry[]>(r.device_snapshot, []),
  notes: r.notes,
  createdAt: r.created_at,
});

export async function listSessions(db: Db, experimentId: string): Promise<Session[]> {
  const rows = await db.all<SessionRow>('SELECT * FROM sessions WHERE experiment_id = ? ORDER BY started_at DESC', [experimentId]);
  return rows.map(toSession);
}

export async function getSession(db: Db, id: string): Promise<Session | null> {
  const row = await db.first<SessionRow>('SELECT * FROM sessions WHERE id = ?', [id]);
  return row ? toSession(row) : null;
}

export async function getOpenSession(db: Db, experimentId: string): Promise<Session | null> {
  const row = await db.first<SessionRow>("SELECT * FROM sessions WHERE experiment_id = ? AND status = 'open' ORDER BY started_at DESC LIMIT 1", [experimentId]);
  return row ? toSession(row) : null;
}

/**
 * Abre uma sessão usando a versão atual do protocolo. Só pode existir uma sessão
 * aberta por experimento; o snapshot guarda o estado dos dispositivos conectados.
 */
export async function openSession(
  db: Db,
  experimentId: string,
  options: { operator: string; notes?: string; devices?: DeviceSnapshotEntry[] },
): Promise<Session> {
  return db.transaction(async () => {
    const open = await getOpenSession(db, experimentId);
    if (open) return open;
    const protocol = await getCurrentProtocol(db, experimentId);
    const count = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM sessions WHERE experiment_id = ?', [experimentId]);
    let n = (count?.n ?? 0) + 1;
    let code = `S${String(n).padStart(3, '0')}`;
    while (await db.first('SELECT id FROM sessions WHERE experiment_id = ? AND code = ?', [experimentId, code])) {
      n += 1;
      code = `S${String(n).padStart(3, '0')}`;
    }
    const id = uuid();
    const now = nowIso();
    await db.run(
      `INSERT INTO sessions (id, experiment_id, protocol_id, code, operator, status, started_at, tz_offset_min, device_snapshot, notes, created_at)
       VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`,
      [id, experimentId, protocol.id, code, options.operator || null, now, tzOffsetMinutes(), JSON.stringify(options.devices ?? []), options.notes ?? null, now],
    );
    await recordAudit(db, { actor: options.operator, entity: 'session', entityId: id, action: 'open', details: { code, protocolVersion: protocol.version } });
    return (await getSession(db, id))!;
  });
}

export async function closeSession(db: Db, id: string, actor: string, notes?: string): Promise<void> {
  await db.transaction(async () => {
    const session = await getSession(db, id);
    if (!session || session.status === 'closed') return;
    const combinedNotes = [session.notes, notes].filter((n) => n && n.trim()).join('\n') || null;
    await db.run("UPDATE sessions SET status = 'closed', ended_at = ?, notes = ? WHERE id = ?", [nowIso(), combinedNotes, id]);
    await recordAudit(db, { actor, entity: 'session', entityId: id, action: 'close' });
  });
}

/** Acrescenta dispositivos conectados durante a sessão ao snapshot. */
export async function addDevicesToSnapshot(db: Db, id: string, devices: DeviceSnapshotEntry[]): Promise<void> {
  const session = await getSession(db, id);
  if (!session) return;
  const byId = new Map(session.deviceSnapshot.map((d) => [d.deviceId, d]));
  let changed = false;
  for (const d of devices) {
    if (!byId.has(d.deviceId)) {
      byId.set(d.deviceId, d);
      changed = true;
    }
  }
  if (changed) await db.run('UPDATE sessions SET device_snapshot = ? WHERE id = ?', [JSON.stringify([...byId.values()]), id]);
}

// ── Eventos ──────────────────────────────────────────────────────────────────

interface EventRow {
  id: string;
  experiment_id: string;
  session_id: string;
  occurred_at: string;
  label: string;
  kind: 'manual' | 'device';
  device_id: string | null;
  data: string | null;
  created_by: string | null;
  created_at: string;
  retracted_at: string | null;
  retraction_reason: string | null;
}

const toEvent = (r: EventRow): EventRecord => ({
  id: r.id,
  experimentId: r.experiment_id,
  sessionId: r.session_id,
  occurredAt: r.occurred_at,
  label: r.label,
  kind: r.kind,
  deviceId: r.device_id,
  data: parseJson(r.data, null),
  createdBy: r.created_by,
  createdAt: r.created_at,
  retractedAt: r.retracted_at,
  retractionReason: r.retraction_reason,
});

export async function recordEvent(
  db: Db,
  input: { experimentId: string; sessionId: string; label: string; kind?: 'manual' | 'device'; deviceId?: string; data?: unknown; occurredAt?: string },
  actor: string,
): Promise<string> {
  const label = input.label.trim();
  if (!label) throw new Error('Descreva o evento');
  const id = uuid();
  const now = nowIso();
  await db.run(
    `INSERT INTO events (id, experiment_id, session_id, occurred_at, label, kind, device_id, data, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.experimentId, input.sessionId, input.occurredAt ?? now, label, input.kind ?? 'manual', input.deviceId ?? null, input.data === undefined ? null : JSON.stringify(input.data), actor, now],
  );
  return id;
}

export async function listEvents(db: Db, filter: { experimentId?: string; sessionId?: string; includeRetracted?: boolean }): Promise<EventRecord[]> {
  const where: string[] = [];
  const params: string[] = [];
  if (filter.experimentId) {
    where.push('experiment_id = ?');
    params.push(filter.experimentId);
  }
  if (filter.sessionId) {
    where.push('session_id = ?');
    params.push(filter.sessionId);
  }
  if (!filter.includeRetracted) where.push('retracted_at IS NULL');
  const rows = await db.all<EventRow>(`SELECT * FROM events ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY occurred_at`, params);
  return rows.map(toEvent);
}

export async function retractEvent(db: Db, id: string, reason: string, actor: string): Promise<void> {
  if (!reason.trim()) throw new Error('Informe o motivo');
  await db.transaction(async () => {
    await db.run('UPDATE events SET retracted_at = ?, retraction_reason = ? WHERE id = ? AND retracted_at IS NULL', [nowIso(), reason.trim(), id]);
    await recordAudit(db, { actor, entity: 'event', entityId: id, action: 'retract', details: { reason } });
  });
}

export interface SessionCounts {
  observations: number;
  events: number;
  readings: number;
}

export async function sessionCounts(db: Db, experimentId: string): Promise<Map<string, SessionCounts>> {
  const rows = await db.all<{ id: string; observations: number; events: number; readings: number }>(
    `SELECT s.id,
       (SELECT COUNT(*) FROM observations o WHERE o.session_id = s.id AND o.superseded_by IS NULL AND o.retracted_at IS NULL) AS observations,
       (SELECT COUNT(*) FROM events e WHERE e.session_id = s.id AND e.retracted_at IS NULL) AS events,
       (SELECT COUNT(*) FROM readings r WHERE r.session_id = s.id) AS readings
     FROM sessions s WHERE s.experiment_id = ?`,
    [experimentId],
  );
  return new Map(rows.map((r) => [r.id, { observations: r.observations, events: r.events, readings: r.readings }]));
}

/** Amostras já observadas (versão vigente) numa sessão. */
export async function observedSampleIds(db: Db, sessionId: string): Promise<Set<string>> {
  const rows = await db.all<{ sample_id: string }>(
    'SELECT DISTINCT sample_id FROM observations WHERE session_id = ? AND superseded_by IS NULL AND retracted_at IS NULL',
    [sessionId],
  );
  return new Set(rows.map((r) => r.sample_id));
}
