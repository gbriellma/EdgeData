import type { DeviceManifest } from '@/core/device/manifest';
import { readingQcFlag } from '@/core/qc';
import type { QcFlag } from '@/core/types';
import { nowIso, parseJson, uuid, type Db } from '../db';
import type { DatasetRelease, Device, Reading, SensorBinding } from '../models';
import { recordAudit } from './common';

// ── Dispositivos ─────────────────────────────────────────────────────────────

interface DeviceRow {
  id: string;
  name: string;
  transport: string;
  address: string | null;
  manifest: string;
  first_seen_at: string;
  last_seen_at: string | null;
}

const toDevice = (r: DeviceRow): Device => ({
  id: r.id,
  name: r.name,
  transport: r.transport,
  address: r.address,
  manifest: parseJson<DeviceManifest>(r.manifest, { schema: 'edgedata.device-manifest/1', id: r.id, name: r.name, sensors: [] }),
  firstSeenAt: r.first_seen_at,
  lastSeenAt: r.last_seen_at,
});

export async function listDevices(db: Db): Promise<Device[]> {
  return (await db.all<DeviceRow>('SELECT * FROM devices ORDER BY name COLLATE NOCASE')).map(toDevice);
}

export async function getDevice(db: Db, id: string): Promise<Device | null> {
  const row = await db.first<DeviceRow>('SELECT * FROM devices WHERE id = ?', [id]);
  return row ? toDevice(row) : null;
}

/** Cadastra ou atualiza o dispositivo a partir do manifesto recebido. */
export async function upsertDevice(db: Db, manifest: DeviceManifest, transport: string, address: string | null, actor: string): Promise<Device> {
  return db.transaction(async () => {
    const existing = await getDevice(db, manifest.id);
    const now = nowIso();
    if (!existing) {
      await db.run(
        `INSERT INTO devices (id, name, transport, address, manifest, first_seen_at, last_seen_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [manifest.id, manifest.name, transport, address, JSON.stringify(manifest), now, now, now, now],
      );
      await recordAudit(db, { actor, entity: 'device', entityId: manifest.id, action: 'register', details: { name: manifest.name, firmware: manifest.firmware?.version ?? null } });
    } else {
      const manifestChanged = JSON.stringify(existing.manifest) !== JSON.stringify(manifest);
      await db.run('UPDATE devices SET name = ?, transport = ?, address = ?, manifest = ?, last_seen_at = ?, updated_at = ? WHERE id = ?', [
        manifest.name, transport, address, JSON.stringify(manifest), now, now, manifest.id,
      ]);
      if (manifestChanged) {
        await recordAudit(db, {
          actor,
          entity: 'device',
          entityId: manifest.id,
          action: 'manifest_changed',
          details: { firmware: [existing.manifest.firmware?.version ?? null, manifest.firmware?.version ?? null] },
        });
      }
    }
    return (await getDevice(db, manifest.id))!;
  });
}

// ── Vínculos sensor → variável ───────────────────────────────────────────────

interface BindingRow {
  id: string;
  experiment_id: string;
  variable_key: string;
  device_id: string;
  sensor_id: string;
  created_at: string;
}

const toBinding = (r: BindingRow): SensorBinding => ({
  id: r.id,
  experimentId: r.experiment_id,
  variableKey: r.variable_key,
  deviceId: r.device_id,
  sensorId: r.sensor_id,
  createdAt: r.created_at,
});

export async function listBindings(db: Db, experimentId: string): Promise<SensorBinding[]> {
  return (await db.all<BindingRow>('SELECT * FROM sensor_bindings WHERE experiment_id = ? ORDER BY variable_key', [experimentId])).map(toBinding);
}

export async function setBinding(db: Db, experimentId: string, variableKey: string, deviceId: string, sensorId: string, actor: string): Promise<void> {
  await db.transaction(async () => {
    await db.run(
      `INSERT INTO sensor_bindings (id, experiment_id, variable_key, device_id, sensor_id, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(experiment_id, variable_key) DO UPDATE SET device_id = excluded.device_id, sensor_id = excluded.sensor_id`,
      [uuid(), experimentId, variableKey, deviceId, sensorId, nowIso()],
    );
    await recordAudit(db, { actor, entity: 'experiment', entityId: experimentId, action: 'bind_sensor', details: { variableKey, deviceId, sensorId } });
  });
}

export async function removeBinding(db: Db, experimentId: string, variableKey: string, actor: string): Promise<void> {
  await db.transaction(async () => {
    await db.run('DELETE FROM sensor_bindings WHERE experiment_id = ? AND variable_key = ?', [experimentId, variableKey]);
    await recordAudit(db, { actor, entity: 'experiment', entityId: experimentId, action: 'unbind_sensor', details: { variableKey } });
  });
}

// ── Leituras ─────────────────────────────────────────────────────────────────

interface ReadingRow {
  id: string;
  experiment_id: string;
  session_id: string;
  device_id: string;
  sensor_id: string;
  value: number | null;
  value_text: string | null;
  unit: string | null;
  qc: QcFlag;
  seq: number | null;
  device_ms: number | null;
  device_utc: string | null;
  received_at: string;
  observation_id: string | null;
}

const toReading = (r: ReadingRow): Reading => ({
  id: r.id,
  experimentId: r.experiment_id,
  sessionId: r.session_id,
  deviceId: r.device_id,
  sensorId: r.sensor_id,
  value: r.value ?? r.value_text,
  unit: r.unit,
  qc: r.qc,
  seq: r.seq,
  deviceMs: r.device_ms,
  deviceUtc: r.device_utc,
  receivedAt: r.received_at,
  observationId: r.observation_id,
});

export interface IncomingReading {
  sensorId: string;
  value: number | string | boolean | null;
  seq?: number;
  deviceMs?: number;
  deviceUtcMs?: number;
  receivedAt?: string;
}

/** Grava as leituras de uma mensagem `obs` do dispositivo. Devolve os IDs criados. */
export async function recordReadings(
  db: Db,
  input: { experimentId: string; sessionId: string; device: Device; readings: IncomingReading[] },
): Promise<string[]> {
  const sensors = new Map(input.device.manifest.sensors.map((s) => [s.id, s]));
  return db.transaction(async () => {
    const ids: string[] = [];
    for (const r of input.readings) {
      const sensor = sensors.get(r.sensorId);
      const numeric = typeof r.value === 'number' ? r.value : typeof r.value === 'boolean' ? Number(r.value) : null;
      const qc = readingQcFlag(numeric ?? r.value, { range: sensor?.range });
      const id = uuid();
      await db.run(
        `INSERT INTO readings (id, experiment_id, session_id, device_id, sensor_id, value, value_text, unit, qc, seq, device_ms, device_utc, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, input.experimentId, input.sessionId, input.device.id, r.sensorId,
          numeric !== null && Number.isFinite(numeric) ? numeric : null,
          typeof r.value === 'string' ? r.value : null,
          sensor?.unit ?? null, qc, r.seq ?? null, r.deviceMs ?? null,
          r.deviceUtcMs ? new Date(r.deviceUtcMs).toISOString() : null,
          r.receivedAt ?? nowIso(),
        ],
      );
      ids.push(id);
    }
    await db.run('UPDATE devices SET last_seen_at = ? WHERE id = ?', [nowIso(), input.device.id]);
    return ids;
  });
}

export async function listReadings(db: Db, filter: { experimentId?: string; sessionId?: string; limit?: number }): Promise<Reading[]> {
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
  const limit = filter.limit ? `LIMIT ${Math.floor(filter.limit)}` : '';
  const rows = await db.all<ReadingRow>(`SELECT * FROM readings ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY received_at ${limit}`, params);
  return rows.map(toReading);
}

// ── Datasets e releases ──────────────────────────────────────────────────────

export async function ensureDataset(db: Db, experimentId: string, name: string): Promise<string> {
  const row = await db.first<{ id: string }>('SELECT id FROM datasets WHERE experiment_id = ? ORDER BY created_at LIMIT 1', [experimentId]);
  if (row) return row.id;
  const id = uuid();
  await db.run('INSERT INTO datasets (id, experiment_id, name, created_at) VALUES (?, ?, ?, ?)', [id, experimentId, name, nowIso()]);
  return id;
}

interface ReleaseRow {
  id: string;
  dataset_id: string;
  version: string;
  formats: string;
  checksums: string;
  file_count: number;
  total_bytes: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

const toRelease = (r: ReleaseRow): DatasetRelease => ({
  id: r.id,
  datasetId: r.dataset_id,
  version: r.version,
  formats: parseJson<string[]>(r.formats, []),
  checksums: r.checksums,
  fileCount: r.file_count,
  totalBytes: r.total_bytes,
  notes: r.notes,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

export async function listReleases(db: Db, experimentId: string): Promise<DatasetRelease[]> {
  const rows = await db.all<ReleaseRow>(
    `SELECT r.* FROM dataset_releases r JOIN datasets d ON d.id = r.dataset_id WHERE d.experiment_id = ? ORDER BY r.created_at DESC`,
    [experimentId],
  );
  return rows.map(toRelease);
}

export async function recordRelease(
  db: Db,
  input: { datasetId: string; version: string; formats: string[]; checksums: string; fileCount: number; totalBytes: number; notes?: string; createdAt: string },
  actor: string,
): Promise<string> {
  return db.transaction(async () => {
    const id = uuid();
    await db.run(
      `INSERT INTO dataset_releases (id, dataset_id, version, formats, checksums, file_count, total_bytes, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.datasetId, input.version, JSON.stringify(input.formats), input.checksums, input.fileCount, input.totalBytes, input.notes ?? null, actor, input.createdAt],
    );
    await recordAudit(db, { actor, entity: 'dataset', entityId: input.datasetId, action: 'release', details: { version: input.version, files: input.fileCount } });
    return id;
  });
}
