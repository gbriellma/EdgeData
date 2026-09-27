import { activeCalibration, fitCalibration, type CalibrationMethod, type CalibrationPoint } from '@/core/calibration';
import { nowIso, parseJson, uuid, type Db } from '../db';
import type { Calibration } from '../models';
import { recordAudit } from './common';

interface CalibrationRow {
  id: string;
  device_id: string;
  sensor_id: string;
  method: CalibrationMethod;
  points: string;
  coefficients: string;
  r2: number | null;
  rmse: number | null;
  unit: string | null;
  reference_instrument: string | null;
  certificate: string | null;
  valid_from: string;
  valid_until: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
}

const toCalibration = (r: CalibrationRow): Calibration => ({
  id: r.id,
  deviceId: r.device_id,
  sensorId: r.sensor_id,
  method: r.method,
  points: parseJson<CalibrationPoint[]>(r.points, []),
  coefficients: parseJson<number[]>(r.coefficients, [0, 1]),
  r2: r.r2,
  rmse: r.rmse,
  unit: r.unit,
  referenceInstrument: r.reference_instrument,
  certificate: r.certificate,
  validFrom: r.valid_from,
  validUntil: r.valid_until,
  notes: r.notes,
  createdBy: r.created_by,
  createdAt: r.created_at,
  revokedAt: r.revoked_at,
  revokedReason: r.revoked_reason,
});

export async function listCalibrations(db: Db, filter: { deviceId?: string; sensorId?: string; deviceIds?: string[] } = {}): Promise<Calibration[]> {
  const where: string[] = [];
  const params: string[] = [];
  if (filter.deviceId) {
    where.push('device_id = ?');
    params.push(filter.deviceId);
  }
  if (filter.sensorId) {
    where.push('sensor_id = ?');
    params.push(filter.sensorId);
  }
  if (filter.deviceIds) {
    if (filter.deviceIds.length === 0) return [];
    where.push(`device_id IN (${filter.deviceIds.map(() => '?').join(',')})`);
    params.push(...filter.deviceIds);
  }
  const rows = await db.all<CalibrationRow>(
    `SELECT * FROM calibrations ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY valid_from DESC, created_at DESC`,
    params,
  );
  return rows.map(toCalibration);
}

export interface NewCalibration {
  deviceId: string;
  sensorId: string;
  method: CalibrationMethod;
  points: CalibrationPoint[];
  unit?: string | null;
  referenceInstrument?: string;
  certificate?: string;
  validFrom: string;
  validUntil?: string | null;
  notes?: string;
}

/** Registra uma calibração. Os coeficientes são sempre recalculados a partir dos pontos. */
export async function createCalibration(db: Db, input: NewCalibration, actor: string): Promise<Calibration> {
  const fit = fitCalibration(input.points, input.method);
  if (input.validUntil && input.validUntil <= input.validFrom) throw new Error('A validade deve terminar depois do início');
  return db.transaction(async () => {
    const id = uuid();
    await db.run(
      `INSERT INTO calibrations (id, device_id, sensor_id, method, points, coefficients, r2, rmse, unit, reference_instrument, certificate,
         valid_from, valid_until, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, input.deviceId, input.sensorId, input.method, JSON.stringify(input.points), JSON.stringify(fit.coefficients), fit.r2, fit.rmse,
        input.unit ?? null, input.referenceInstrument?.trim() || null, input.certificate?.trim() || null, input.validFrom, input.validUntil ?? null,
        input.notes?.trim() || null, actor, nowIso(),
      ],
    );
    await recordAudit(db, {
      actor,
      entity: 'calibration',
      entityId: id,
      action: 'create',
      details: { deviceId: input.deviceId, sensorId: input.sensorId, method: input.method, coefficients: fit.coefficients, rmse: fit.rmse },
    });
    return toCalibration((await db.first<CalibrationRow>('SELECT * FROM calibrations WHERE id = ?', [id]))!);
  });
}

export async function revokeCalibration(db: Db, id: string, reason: string, actor: string): Promise<void> {
  if (!reason.trim()) throw new Error('Informe o motivo');
  await db.transaction(async () => {
    await db.run('UPDATE calibrations SET revoked_at = ?, revoked_reason = ? WHERE id = ?', [nowIso(), reason.trim(), id]);
    await recordAudit(db, { actor, entity: 'calibration', entityId: id, action: 'revoke', details: { reason: reason.trim() } });
  });
}

/** Calibração vigente de um sensor num instante (ou null). */
export async function findActiveCalibration(db: Db, deviceId: string, sensorId: string, at: string): Promise<Calibration | null> {
  return activeCalibration(await listCalibrations(db, { deviceId, sensorId }), at);
}
