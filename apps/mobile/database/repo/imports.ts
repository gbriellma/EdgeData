import type { ValueMap } from '@/core/types';
import { nowIso, parseJson, tzOffsetMinutes, uuid, type Db } from '../db';
import type { ImportRecord } from '../models';
import { recordAudit } from './common';
import { getCurrentProtocol } from './experiments';
import { createObservation } from './observations';

export interface ImportRow {
  sampleId: string;
  collectedAt: string;
  data: ValueMap;
}

export interface ImportRequest {
  experimentId: string;
  fileName: string;
  sha256?: string | null;
  rowsTotal: number;
  rows: ImportRow[];
  /** Mapeamento usado (colunas, unidades, formato de data): fica registrado na proveniência */
  mapping: unknown;
  notes?: string;
}

/**
 * Importa observações anteriores numa sessão própria, já encerrada, marcada como
 * importação. As observações passam pela mesma validação e QC da coleta.
 */
export async function importObservations(db: Db, request: ImportRequest, actor: string): Promise<{ sessionId: string; imported: number }> {
  if (request.rows.length === 0) throw new Error('Nenhuma linha válida para importar');
  return db.transaction(async () => {
    const protocol = await getCurrentProtocol(db, request.experimentId);
    const count = await db.first<{ n: number }>("SELECT COUNT(*) AS n FROM sessions WHERE experiment_id = ? AND code LIKE 'IMP-%'", [request.experimentId]);
    let n = (count?.n ?? 0) + 1;
    let code = `IMP-${String(n).padStart(3, '0')}`;
    while (await db.first('SELECT id FROM sessions WHERE experiment_id = ? AND code = ?', [request.experimentId, code])) {
      n += 1;
      code = `IMP-${String(n).padStart(3, '0')}`;
    }
    const times = request.rows.map((r) => r.collectedAt).sort();
    const sessionId = uuid();
    const now = nowIso();
    const notes = [`Importado de ${request.fileName}${request.sha256 ? ` (SHA-256 ${request.sha256})` : ''}`, request.notes?.trim()].filter(Boolean).join('\n');
    await db.run(
      `INSERT INTO sessions (id, experiment_id, protocol_id, code, operator, status, started_at, ended_at, tz_offset_min, device_snapshot, notes, created_at)
       VALUES (?, ?, ?, ?, ?, 'closed', ?, ?, ?, '[]', ?, ?)`,
      [sessionId, request.experimentId, protocol.id, code, actor, times[0], times[times.length - 1], tzOffsetMinutes(), notes, now],
    );
    const autoVars = protocol.variables.filter((v) => v.scope === 'observation' && (v.type === 'auto_timestamp' || v.type === 'auto_uuid'));
    for (const row of request.rows) {
      const data: ValueMap = { ...row.data };
      for (const v of autoVars) {
        if (data[v.key] !== undefined) continue;
        data[v.key] = v.type === 'auto_timestamp' ? row.collectedAt : uuid();
      }
      await createObservation(db, { sessionId, sampleId: row.sampleId, data, source: 'import', collectedAt: row.collectedAt }, actor);
    }
    const importId = uuid();
    await db.run(
      `INSERT INTO imports (id, experiment_id, session_id, file_name, sha256, rows_total, rows_imported, mapping, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [importId, request.experimentId, sessionId, request.fileName, request.sha256 ?? null, request.rowsTotal, request.rows.length, JSON.stringify(request.mapping), actor, now],
    );
    await recordAudit(db, {
      actor,
      entity: 'session',
      entityId: sessionId,
      action: 'import',
      details: { code, file: request.fileName, sha256: request.sha256 ?? null, rows: request.rows.length, rowsTotal: request.rowsTotal },
    });
    await db.run('UPDATE experiments SET updated_at = ? WHERE id = ?', [now, request.experimentId]);
    return { sessionId, imported: request.rows.length };
  });
}

interface ImportRowDb {
  id: string;
  experiment_id: string;
  session_id: string;
  file_name: string;
  sha256: string | null;
  rows_total: number;
  rows_imported: number;
  mapping: string;
  created_by: string | null;
  created_at: string;
}

export async function listImports(db: Db, experimentId: string): Promise<ImportRecord[]> {
  const rows = await db.all<ImportRowDb>('SELECT * FROM imports WHERE experiment_id = ? ORDER BY created_at DESC', [experimentId]);
  return rows.map((r) => ({
    id: r.id,
    experimentId: r.experiment_id,
    sessionId: r.session_id,
    fileName: r.file_name,
    sha256: r.sha256,
    rowsTotal: r.rows_total,
    rowsImported: r.rows_imported,
    mapping: parseJson(r.mapping, null),
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));
}
