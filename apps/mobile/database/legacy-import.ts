import { emptyDesign } from '@/core/design';
import { computeQcFlags } from '@/core/qc';
import { legacySchemaFields } from '@/core/templates';
import type { GeoPoint, ProtocolVariable, ValueMap } from '@/core/types';
import { normalizeValue } from '@/core/validation';
import { nowIso, parseJson, uuid, type Db } from './db';
import { recordAudit } from './repo/common';
import { createExperiment, createProject, listProjects, suggestExperimentCode } from './repo/experiments';

/**
 * Importa dados do banco da versão anterior do app (projetos → sujeitos → coletas).
 *
 * - Cada projeto antigo vira um experimento com protocolo v1 (schemas convertidos
 *   em variáveis com unidades UCUM quando reconhecidas).
 * - Sujeitos viram amostras COM O MESMO UUID: etiquetas QR já impressas continuam valendo.
 * - Coletas viram observações de uma sessão "importada" (origem = import), também com o
 *   mesmo UUID. O banco antigo não guardava o valor original de coletas editadas; isso é
 *   registrado na auditoria.
 */

export interface LegacySummary {
  projects: number;
  subjects: number;
  collections: number;
}

interface LegacyProject {
  id: string;
  name: string;
  description: string | null;
  subject_schema: string;
  collection_schema: string;
  archived: number;
  created_at: string;
}

interface LegacySubject {
  id: string;
  project_id: string;
  data: string;
  created_at: string;
}

interface LegacyCollection {
  id: string;
  subject_id: string;
  project_id: string;
  data: string;
  latitude: number | null;
  longitude: number | null;
  collected_at: string;
  modified_at: string | null;
}

interface LegacyImage {
  collection_id: string;
  field_name: string;
  file_path: string;
  file_size: number | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

export async function isLegacyDatabase(source: Db): Promise<boolean> {
  const tables = await source.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('projects', 'subjects', 'collections', 'images')",
  );
  if (tables.length < 3) return false;
  const columns = await source.all<{ name: string }>("SELECT name FROM pragma_table_info('projects')");
  return columns.some((c) => c.name === 'subject_schema');
}

export async function summarizeLegacy(source: Db): Promise<LegacySummary> {
  const row = await source.first<LegacySummary>(
    'SELECT (SELECT COUNT(*) FROM projects) AS projects, (SELECT COUNT(*) FROM subjects) AS subjects, (SELECT COUNT(*) FROM collections) AS collections',
  );
  return row ?? { projects: 0, subjects: 0, collections: 0 };
}

/** "2026-03-04 01:05:51" (UTC, sem fuso) → "2026-03-04T01:05:51.000Z" */
export function legacyTimestamp(value: string | null | undefined): string {
  if (!value) return nowIso();
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(' ', 'T')}Z` : value;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? nowIso() : date.toISOString();
}

/** Converte valores do formato antigo: datas DD/MM/AAAA, GPS "lat,lon", números em texto. */
export function convertLegacyValue(variable: ProtocolVariable, value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (variable.type === 'date' && typeof value === 'string') {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
    return m ? `${m[3]}-${m[2]}-${m[1]}` : value;
  }
  if ((variable.type === 'auto_gps' || variable.type === 'gps') && typeof value === 'string') {
    const [lat, lon] = value.split(',').map((p) => Number(p.trim()));
    return Number.isFinite(lat) && Number.isFinite(lon) ? ({ latitude: lat, longitude: lon, crs: 'EPSG:4326' } satisfies GeoPoint) : value;
  }
  return normalizeValue(variable, value);
}

function convertData(fields: { legacyName: string; variable: ProtocolVariable }[], raw: string): ValueMap {
  const data = parseJson<Record<string, unknown>>(raw, {});
  const result: ValueMap = {};
  for (const { legacyName, variable } of fields) {
    const converted = convertLegacyValue(variable, data[legacyName]);
    if (converted !== undefined) result[variable.key] = converted;
  }
  return result;
}

/** Código legível para a amostra a partir dos dados antigos (campo "nome" ou valores de texto). */
function sampleCode(fields: { legacyName: string; variable: ProtocolVariable }[], raw: string, fallback: string): string {
  const data = parseJson<Record<string, unknown>>(raw, {});
  const named = data.nome ?? data.name ?? data.identificador ?? data.codigo;
  if (typeof named === 'string' && named.trim()) return named.trim();
  const parts = fields
    .map((f) => data[f.legacyName])
    .filter((v): v is string | number => (typeof v === 'string' && v.trim() !== '') || typeof v === 'number')
    .map((v) => String(v).trim())
    .slice(0, 5);
  return parts.length > 0 ? parts.join('_') : fallback;
}

export interface LegacyImportResult {
  experiments: number;
  samples: number;
  observations: number;
  skippedProjects: number;
}

export async function importLegacy(source: Db, target: Db, actor: string, sourceName: string): Promise<LegacyImportResult> {
  if (!(await isLegacyDatabase(source))) throw new Error('Este banco não é da versão anterior do app');
  const projects = await source.all<LegacyProject>('SELECT * FROM projects ORDER BY created_at');
  const result: LegacyImportResult = { experiments: 0, samples: 0, observations: 0, skippedProjects: 0 };

  const existingProject = (await listProjects(target)).find((p) => p.name === 'Importado da versão anterior');
  const projectId = existingProject?.id ?? (projects.length > 0 ? await createProject(target, 'Importado da versão anterior', `Dados migrados de ${sourceName}`, actor) : null);
  if (!projectId) return result;

  for (const project of projects) {
    const subjects = await source.all<LegacySubject>('SELECT * FROM subjects WHERE project_id = ? ORDER BY created_at', [project.id]);
    // Já importado? (amostras mantêm o UUID do sujeito)
    const probe = subjects[0] ? await target.first('SELECT id FROM samples WHERE id = ?', [subjects[0].id]) : null;
    if (probe) {
      result.skippedProjects += 1;
      continue;
    }
    const collections = await source.all<LegacyCollection>('SELECT * FROM collections WHERE project_id = ? ORDER BY collected_at', [project.id]);
    const images = await source.all<LegacyImage>(
      'SELECT i.* FROM images i JOIN collections c ON c.id = i.collection_id WHERE c.project_id = ?',
      [project.id],
    );

    const sampleFields = legacySchemaFields(parseJson(project.subject_schema, {}), 'sample');
    const observationFields = legacySchemaFields(parseJson(project.collection_schema, {}), 'observation');
    const variables = [...sampleFields, ...observationFields].map((f) => f.variable);

    await target.transaction(async () => {
      const code = await suggestExperimentCode(target, projectId, project.name);
      const experimentId = await createExperiment(
        target,
        {
          projectId,
          metadata: {
            name: project.name,
            code,
            description: project.description ?? undefined,
            team: [],
            notes: `Importado da versão anterior do aplicativo (${sourceName}).`,
          },
          design: { ...emptyDesign(), sessionsExpected: 1 },
          variables,
        },
        actor,
      );
      if (project.archived) await target.run('UPDATE experiments SET archived = 1 WHERE id = ?', [experimentId]);
      const protocol = await target.first<{ id: string }>('SELECT current_protocol_id AS id FROM experiments WHERE id = ?', [experimentId]);

      const usedCodes = new Set<string>();
      for (const subject of subjects) {
        let codeValue = sampleCode(sampleFields, subject.data, subject.id.slice(0, 8));
        let n = 2;
        const base = codeValue;
        while (usedCodes.has(codeValue.toUpperCase())) codeValue = `${base}-${n++}`;
        usedCodes.add(codeValue.toUpperCase());
        const created = legacyTimestamp(subject.created_at);
        await target.run(
          'INSERT INTO samples (id, experiment_id, code, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          [subject.id, experimentId, codeValue, JSON.stringify(convertData(sampleFields, subject.data)), created, created],
        );
        result.samples += 1;
      }

      if (collections.length > 0) {
        const sessionId = uuid();
        const started = legacyTimestamp(collections[0].collected_at);
        const ended = legacyTimestamp(collections[collections.length - 1].collected_at);
        await target.run(
          `INSERT INTO sessions (id, experiment_id, protocol_id, code, operator, status, started_at, ended_at, notes, created_at)
           VALUES (?, ?, ?, 'IMP', NULL, 'closed', ?, ?, ?, ?)`,
          [sessionId, experimentId, protocol!.id, started, ended, 'Coletas importadas da versão anterior do aplicativo', nowIso()],
        );
        const obsVars = observationFields.map((f) => f.variable);
        const edited: string[] = [];
        for (const c of collections) {
          const data = convertData(observationFields, c.data);
          const qc = computeQcFlags(obsVars, data);
          await target.run(
            `INSERT INTO observations (id, experiment_id, session_id, sample_id, protocol_id, data, qc, latitude, longitude, collected_at, source, revision, created_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'import', 1, ?, ?)`,
            [c.id, experimentId, sessionId, c.subject_id, protocol!.id, JSON.stringify(data), JSON.stringify(qc), c.latitude, c.longitude, legacyTimestamp(c.collected_at), actor, nowIso()],
          );
          if (c.modified_at) edited.push(c.id);
          result.observations += 1;
        }
        for (const img of images) {
          const key = observationFields.find((f) => f.legacyName === img.field_name)?.variable.key ?? img.field_name;
          const sampleId = collections.find((c) => c.id === img.collection_id)?.subject_id ?? null;
          await target.run(
            `INSERT INTO files (id, experiment_id, observation_id, sample_id, variable_key, kind, path, bytes, width, height, created_at) VALUES (?, ?, ?, ?, ?, 'image', ?, ?, ?, ?, ?)`,
            [uuid(), experimentId, img.collection_id, sampleId, key, img.file_path, img.file_size, img.width, img.height, legacyTimestamp(img.created_at)],
          );
        }
        if (edited.length > 0) {
          await recordAudit(target, {
            actor,
            entity: 'experiment',
            entityId: experimentId,
            action: 'import_note',
            details: { message: 'Coletas editadas na versão anterior: o valor original não foi preservado por aquela versão', observations: edited },
          });
        }
      }
      await recordAudit(target, {
        actor,
        entity: 'experiment',
        entityId: experimentId,
        action: 'import_legacy',
        details: { source: sourceName, legacyProjectId: project.id, samples: subjects.length, observations: collections.length },
      });
      result.experiments += 1;
    });
  }
  return result;
}
