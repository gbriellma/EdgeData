import { describe, expect, it } from 'vitest';
import { convertLegacyValue, importLegacy, isLegacyDatabase, legacyTimestamp, summarizeLegacy } from './legacy-import';
import { getCurrentProtocol, listExperiments } from './repo/experiments';
import { getSample } from './repo/samples';
import { listObservations } from './repo/observations';
import { listAudit } from './repo/common';
import { createMigratedDb, createNodeDb } from './testing/node-db';

// Schema do banco da versão anterior do app
const LEGACY_SCHEMA = `
  CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT,
    subject_schema TEXT NOT NULL DEFAULT '{"fields":[]}', collection_schema TEXT NOT NULL DEFAULT '{"fields":[]}',
    backup_config TEXT, archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE subjects (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}', qr_generated INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE collections (id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, project_id TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}',
    latitude REAL, longitude REAL, collected_at TEXT NOT NULL DEFAULT (datetime('now')), modified_at TEXT);
  CREATE TABLE images (id TEXT PRIMARY KEY, collection_id TEXT NOT NULL, field_name TEXT NOT NULL, file_path TEXT NOT NULL,
    file_size INTEGER, width INTEGER, height INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
`;

const SUBJECT_SCHEMA = { fields: [
  { name: 'nome', label: 'Nome', type: 'short_text', required: true, order: 0, config: {} },
  { name: 'variedade', label: 'Variedade', type: 'category', required: true, order: 1, config: { options: ['T1', 'T2'] } },
] };
const COLLECTION_SCHEMA = { fields: [
  { name: 'data', label: 'Data', type: 'date', required: true, order: 0, config: {} },
  { name: 'altura_cm', label: 'Altura (cm)', type: 'decimal', required: true, order: 1, config: { min: 0, max: 200, decimals: 1, unit: 'cm' } },
  { name: 'foto', label: 'Foto', type: 'image', required: false, order: 2, config: {} },
  { name: 'gps', label: 'GPS', type: 'auto_gps', required: false, order: 3, config: { source: 'gps' } },
] };

async function legacyDb() {
  const db = createNodeDb();
  await db.exec(LEGACY_SCHEMA);
  await db.run('INSERT INTO projects (id, name, description, subject_schema, collection_schema, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
    'p1', '[Demo] Feijão', 'Projeto antigo', JSON.stringify(SUBJECT_SCHEMA), JSON.stringify(COLLECTION_SCHEMA), '2026-03-04 01:05:51',
  ]);
  const subjects = [
    ['71b75a4c-d089-499f-8df2-b46d5d8e432c', { nome: 'T1_C_F1_R1', variedade: 'T1' }],
    ['a65e6729-b958-4571-812f-27364676fe7a', { nome: 'T1_C_F1_R2', variedade: 'T1' }],
  ] as const;
  for (const [id, data] of subjects) await db.run('INSERT INTO subjects (id, project_id, data, created_at) VALUES (?, ?, ?, ?)', [id, 'p1', JSON.stringify(data), '2026-03-04 01:05:51']);
  await db.run('INSERT INTO collections (id, subject_id, project_id, data, latitude, longitude, collected_at, modified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
    'c1', subjects[0][0], 'p1', JSON.stringify({ data: '15/02/2026', altura_cm: '18.5', foto: 'file:///old/images/c1/foto.jpg', gps: '-8.05,-34.9' }), -8.05, -34.9, '2026-02-15 10:00:00', null,
  ]);
  await db.run('INSERT INTO collections (id, subject_id, project_id, data, collected_at, modified_at) VALUES (?, ?, ?, ?, ?, ?)', [
    'c2', subjects[1][0], 'p1', JSON.stringify({ data: '15/02/2026', altura_cm: '250' }), '2026-02-15 10:05:00', '2026-02-16 09:00:00',
  ]);
  await db.run("INSERT INTO images (id, collection_id, field_name, file_path, file_size, created_at) VALUES ('i1', 'c1', 'foto', 'file:///old/images/c1/foto.jpg', 1234, '2026-02-15 10:00:01')");
  return db;
}

describe('importação da versão anterior', () => {
  it('converte valores antigos', () => {
    const date = { scope: 'observation' as const, key: 'd', label: 'D', type: 'date' as const, required: false, order: 1, config: {} };
    expect(convertLegacyValue(date, '15/02/2026')).toBe('2026-02-15');
    expect(convertLegacyValue({ ...date, type: 'auto_gps' }, '-8.05,-34.9')).toEqual({ latitude: -8.05, longitude: -34.9, crs: 'EPSG:4326' });
    expect(convertLegacyValue({ ...date, type: 'decimal' }, '18.5')).toBe(18.5);
    expect(legacyTimestamp('2026-03-04 01:05:51')).toBe('2026-03-04T01:05:51.000Z');
  });

  it('migra projetos, sujeitos e coletas preservando UUIDs', async () => {
    const source = await legacyDb();
    const target = await createMigratedDb();
    expect(await isLegacyDatabase(source)).toBe(true);
    expect(await isLegacyDatabase(target)).toBe(false);
    expect(await summarizeLegacy(source)).toEqual({ projects: 1, subjects: 2, collections: 2 });

    const result = await importLegacy(source, target, 'Gabriel', 'antigo.db');
    expect(result).toEqual({ experiments: 1, samples: 2, observations: 2, skippedProjects: 0 });

    const [experiment] = await listExperiments(target);
    expect(experiment.projectName).toBe('Importado da versão anterior');
    const protocol = await getCurrentProtocol(target, experiment.id);
    expect(protocol.variables.find((v) => v.key === 'altura_cm')?.unit).toBe('cm');

    // A etiqueta QR antiga (UUID do sujeito) continua encontrando a amostra
    const sample = await getSample(target, '71b75a4c-d089-499f-8df2-b46d5d8e432c');
    expect(sample?.code).toBe('T1_C_F1_R1');

    const observations = await listObservations(target, { experimentId: experiment.id, order: 'asc' });
    expect(observations.map((o) => o.id)).toEqual(['c1', 'c2']);
    expect(observations[0]).toMatchObject({ source: 'import', collectedAt: '2026-02-15T10:00:00.000Z', data: { data: '2026-02-15', altura_cm: 18.5 } });
    expect(observations[0].data.gps).toMatchObject({ latitude: -8.05 });
    expect(observations[1].qc.altura_cm).toBe('GOOD'); // sem faixa esperada no formato antigo

    const actions = (await listAudit(target, { entity: 'experiment', entityId: experiment.id })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['import_legacy', 'import_note']));

    // Rodar de novo não duplica
    expect(await importLegacy(source, target, 'Gabriel', 'antigo.db')).toMatchObject({ experiments: 0, skippedProjects: 1 });
  });
});
