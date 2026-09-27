import { nowIso, uuid, type Db } from '../db';
import type { AuditEntry } from '../models';
import { parseJson } from '../db';

export interface AuditInput {
  actor: string;
  entity: string;
  entityId: string;
  action: string;
  details?: unknown;
}

/** Registra uma entrada na trilha de auditoria (append-only). */
export async function recordAudit(db: Db, entry: AuditInput): Promise<void> {
  await db.run(
    'INSERT INTO audit_log (id, at, actor, entity, entity_id, action, details) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [uuid(), nowIso(), entry.actor || 'desconhecido', entry.entity, entry.entityId, entry.action, entry.details === undefined ? null : JSON.stringify(entry.details)],
  );
}

interface AuditRow {
  id: string;
  at: string;
  actor: string;
  entity: string;
  entity_id: string;
  action: string;
  details: string | null;
}

const toAudit = (r: AuditRow): AuditEntry => ({
  id: r.id,
  at: r.at,
  actor: r.actor,
  entity: r.entity,
  entityId: r.entity_id,
  action: r.action,
  details: parseJson(r.details, null),
});

export async function listAudit(db: Db, filter: { entity?: string; entityId?: string; entityIds?: string[] } = {}): Promise<AuditEntry[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter.entity) {
    where.push('entity = ?');
    params.push(filter.entity);
  }
  if (filter.entityId) {
    where.push('entity_id = ?');
    params.push(filter.entityId);
  }
  if (filter.entityIds) {
    if (filter.entityIds.length === 0) return [];
    where.push(`entity_id IN (${filter.entityIds.map(() => '?').join(',')})`);
    params.push(...filter.entityIds);
  }
  const rows = await db.all<AuditRow>(
    `SELECT * FROM audit_log ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY at ASC`,
    params,
  );
  return rows.map(toAudit);
}

/** Diferença rasa entre dois objetos: { campo: [antes, depois] } */
export function shallowDiff(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, [unknown, unknown]> {
  const diff: Record<string, [unknown, unknown]> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) diff[key] = [before[key] ?? null, after[key] ?? null];
  }
  return diff;
}

// ── Configurações ────────────────────────────────────────────────────────────

export async function getSetting(db: Db, key: string): Promise<string | null> {
  const row = await db.first<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setSetting(db: Db, key: string, value: string): Promise<void> {
  await db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
}

export async function ensureWorkspace(db: Db): Promise<string> {
  const row = await db.first<{ id: string }>('SELECT id FROM workspaces ORDER BY created_at LIMIT 1');
  if (row) return row.id;
  const id = uuid();
  await db.run('INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)', [id, 'Meu espaço de trabalho', nowIso()]);
  return id;
}
