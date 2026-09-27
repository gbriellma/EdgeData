import { codeFragment, emptyDesign, expectedCounts } from '@/core/design';
import type { ExperimentalDesign, ExperimentMetadata, ExperimentStatus, ProtocolVariable } from '@/core/types';
import { definitionsEqual, validateDefinitions } from '@/core/variables';
import { nowIso, parseJson, uuid, type Db } from '../db';
import type { Experiment, Project, Protocol } from '../models';
import { ensureWorkspace, recordAudit, shallowDiff } from './common';

// ── Projetos ─────────────────────────────────────────────────────────────────

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  archived: number;
  created_at: string;
  updated_at: string;
}

const toProject = (r: ProjectRow): Project => ({
  id: r.id,
  name: r.name,
  description: r.description,
  archived: !!r.archived,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function listProjects(db: Db): Promise<Project[]> {
  const rows = await db.all<ProjectRow>('SELECT * FROM projects WHERE archived = 0 ORDER BY name COLLATE NOCASE');
  return rows.map(toProject);
}

export async function createProject(db: Db, name: string, description: string | null, actor: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Informe o nome do projeto');
  const workspaceId = await ensureWorkspace(db);
  const id = uuid();
  const now = nowIso();
  await db.run('INSERT INTO projects (id, workspace_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [id, workspaceId, trimmed, description, now, now]);
  await recordAudit(db, { actor, entity: 'project', entityId: id, action: 'create', details: { name: trimmed } });
  return id;
}

// ── Experimentos ─────────────────────────────────────────────────────────────

interface ExperimentRow {
  id: string;
  project_id: string;
  project_name: string;
  study_id: string | null;
  code: string;
  name: string;
  status: ExperimentStatus;
  metadata: string;
  design: string;
  current_protocol_id: string | null;
  archived: number;
  created_at: string;
  updated_at: string;
}

const EXPERIMENT_SELECT = `SELECT e.*, p.name AS project_name FROM experiments e JOIN projects p ON p.id = e.project_id`;

function toExperiment(r: ExperimentRow): Experiment {
  const metadata = parseJson<ExperimentMetadata>(r.metadata, { name: r.name, code: r.code, team: [] });
  return {
    id: r.id,
    projectId: r.project_id,
    projectName: r.project_name,
    studyId: r.study_id,
    code: r.code,
    name: r.name,
    status: r.status,
    metadata: { ...metadata, name: r.name, code: r.code, team: metadata.team ?? [] },
    design: { ...emptyDesign(), ...parseJson<Partial<ExperimentalDesign>>(r.design, {}) },
    currentProtocolId: r.current_protocol_id,
    archived: !!r.archived,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listExperiments(db: Db, options: { includeArchived?: boolean } = {}): Promise<Experiment[]> {
  const rows = await db.all<ExperimentRow>(
    `${EXPERIMENT_SELECT} ${options.includeArchived ? '' : 'WHERE e.archived = 0'} ORDER BY e.updated_at DESC`,
  );
  return rows.map(toExperiment);
}

export async function getExperiment(db: Db, id: string): Promise<Experiment | null> {
  const row = await db.first<ExperimentRow>(`${EXPERIMENT_SELECT} WHERE e.id = ?`, [id]);
  return row ? toExperiment(row) : null;
}

/** Sugere um código curto e único dentro do projeto a partir do nome. */
export async function suggestExperimentCode(db: Db, projectId: string | null, name: string): Promise<string> {
  const base = codeFragment(name).toUpperCase().slice(0, 20) || 'EXP';
  if (!projectId) return base;
  const rows = await db.all<{ code: string }>('SELECT code FROM experiments WHERE project_id = ?', [projectId]);
  const taken = new Set(rows.map((r) => r.code));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export interface CreateExperimentInput {
  projectId?: string;
  newProjectName?: string;
  metadata: ExperimentMetadata;
  design: ExperimentalDesign;
  variables: ProtocolVariable[];
  status?: ExperimentStatus;
}

export async function createExperiment(db: Db, input: CreateExperimentInput, actor: string): Promise<string> {
  const name = input.metadata.name.trim();
  if (!name) throw new Error('Informe o nome do experimento');
  const code = input.metadata.code.trim();
  if (!code) throw new Error('Informe o código do experimento');
  const issues = validateDefinitions(input.variables.filter((v) => v.scope === 'sample'))
    .concat(validateDefinitions(input.variables.filter((v) => v.scope === 'observation')));
  if (issues.length > 0) throw new Error(issues.map((i) => i.message).join('\n'));

  return db.transaction(async () => {
    let projectId = input.projectId;
    if (!projectId) projectId = await createProject(db, input.newProjectName?.trim() || 'Meus experimentos', null, actor);

    const clash = await db.first<{ id: string }>('SELECT id FROM experiments WHERE project_id = ? AND code = ?', [projectId, code]);
    if (clash) throw new Error(`Já existe um experimento com o código ${code} neste projeto`);

    const id = uuid();
    const protocolId = uuid();
    const now = nowIso();
    const metadata = { ...input.metadata, name, code };
    await db.run(
      `INSERT INTO experiments (id, project_id, code, name, status, metadata, design, current_protocol_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, projectId, code, name, input.status ?? 'active', JSON.stringify(metadata), JSON.stringify(input.design), protocolId, now, now],
    );
    await db.run(
      `INSERT INTO protocols (id, experiment_id, version, title, methodology, variables, change_note, created_by, created_at)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)`,
      [protocolId, id, `Protocolo — ${name}`, metadata.methodology ?? null, JSON.stringify(input.variables), 'Versão inicial', actor, now],
    );
    await recordAudit(db, { actor, entity: 'experiment', entityId: id, action: 'create', details: { name, code, design: expectedCounts(input.design) } });
    await recordAudit(db, { actor, entity: 'protocol', entityId: protocolId, action: 'create', details: { version: 1, variables: input.variables.length } });
    return id;
  });
}

export async function updateExperimentMetadata(db: Db, id: string, metadata: ExperimentMetadata, actor: string): Promise<void> {
  const current = await getExperiment(db, id);
  if (!current) throw new Error('Experimento não encontrado');
  const name = metadata.name.trim();
  const code = metadata.code.trim();
  if (!name || !code) throw new Error('Nome e código são obrigatórios');
  if (code !== current.code) {
    const clash = await db.first<{ id: string }>('SELECT id FROM experiments WHERE project_id = ? AND code = ? AND id <> ?', [current.projectId, code, id]);
    if (clash) throw new Error(`Já existe um experimento com o código ${code} neste projeto`);
  }
  const next = { ...metadata, name, code };
  const diff = shallowDiff(current.metadata as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>);
  if (Object.keys(diff).length === 0) return;
  await db.transaction(async () => {
    await db.run('UPDATE experiments SET name = ?, code = ?, metadata = ?, updated_at = ? WHERE id = ?', [name, code, JSON.stringify(next), nowIso(), id]);
    await recordAudit(db, { actor, entity: 'experiment', entityId: id, action: 'update_metadata', details: diff });
  });
}

export async function updateExperimentDesign(db: Db, id: string, design: ExperimentalDesign, actor: string): Promise<void> {
  const current = await getExperiment(db, id);
  if (!current) throw new Error('Experimento não encontrado');
  const diff = shallowDiff(current.design as unknown as Record<string, unknown>, design as unknown as Record<string, unknown>);
  if (Object.keys(diff).length === 0) return;
  await db.transaction(async () => {
    await db.run('UPDATE experiments SET design = ?, updated_at = ? WHERE id = ?', [JSON.stringify(design), nowIso(), id]);
    await recordAudit(db, { actor, entity: 'experiment', entityId: id, action: 'update_design', details: diff });
  });
}

export async function setExperimentStatus(db: Db, id: string, status: ExperimentStatus, actor: string): Promise<void> {
  await db.transaction(async () => {
    await db.run('UPDATE experiments SET status = ?, updated_at = ? WHERE id = ?', [status, nowIso(), id]);
    await recordAudit(db, { actor, entity: 'experiment', entityId: id, action: 'set_status', details: { status } });
  });
}

export async function setExperimentArchived(db: Db, id: string, archived: boolean, actor: string): Promise<void> {
  await db.transaction(async () => {
    await db.run('UPDATE experiments SET archived = ?, updated_at = ? WHERE id = ?', [archived ? 1 : 0, nowIso(), id]);
    await recordAudit(db, { actor, entity: 'experiment', entityId: id, action: archived ? 'archive' : 'unarchive' });
  });
}

export async function touchExperiment(db: Db, id: string): Promise<void> {
  await db.run('UPDATE experiments SET updated_at = ? WHERE id = ?', [nowIso(), id]);
}

// ── Protocolos ───────────────────────────────────────────────────────────────

interface ProtocolRow {
  id: string;
  experiment_id: string;
  version: number;
  title: string;
  methodology: string | null;
  variables: string;
  change_note: string | null;
  created_by: string | null;
  created_at: string;
}

const toProtocol = (r: ProtocolRow): Protocol => ({
  id: r.id,
  experimentId: r.experiment_id,
  version: r.version,
  title: r.title,
  methodology: r.methodology,
  variables: parseJson<ProtocolVariable[]>(r.variables, []),
  changeNote: r.change_note,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

export async function getProtocol(db: Db, id: string): Promise<Protocol | null> {
  const row = await db.first<ProtocolRow>('SELECT * FROM protocols WHERE id = ?', [id]);
  return row ? toProtocol(row) : null;
}

export async function listProtocols(db: Db, experimentId: string): Promise<Protocol[]> {
  const rows = await db.all<ProtocolRow>('SELECT * FROM protocols WHERE experiment_id = ? ORDER BY version', [experimentId]);
  return rows.map(toProtocol);
}

export async function getCurrentProtocol(db: Db, experimentId: string): Promise<Protocol> {
  const row = await db.first<ProtocolRow>(
    `SELECT p.* FROM protocols p JOIN experiments e ON e.current_protocol_id = p.id WHERE e.id = ?`,
    [experimentId],
  );
  if (!row) throw new Error('Experimento sem protocolo');
  return toProtocol(row);
}

async function protocolInUse(db: Db, protocolId: string): Promise<boolean> {
  return !!(await db.first<{ id: string }>('SELECT id FROM sessions WHERE protocol_id = ? LIMIT 1', [protocolId]));
}

export interface SaveVariablesResult {
  protocolId: string;
  version: number;
  /** true quando foi criada uma nova versão do protocolo */
  newVersion: boolean;
}

/**
 * Salva as variáveis do experimento. Se o protocolo atual ainda não foi usado em
 * nenhuma sessão, ele é atualizado; caso contrário nasce uma nova versão — os dados
 * antigos continuam ligados à definição com que foram coletados.
 */
export async function saveVariables(
  db: Db,
  experimentId: string,
  variables: ProtocolVariable[],
  actor: string,
  changeNote?: string,
): Promise<SaveVariablesResult> {
  const issues = validateDefinitions(variables.filter((v) => v.scope === 'sample'))
    .concat(validateDefinitions(variables.filter((v) => v.scope === 'observation')));
  if (issues.length > 0) throw new Error(issues.map((i) => i.message).join('\n'));

  return db.transaction(async () => {
    const current = await getCurrentProtocol(db, experimentId);
    if (definitionsEqual(current.variables, variables)) {
      return { protocolId: current.id, version: current.version, newVersion: false };
    }
    const beforeKeys = current.variables.map((v) => v.key);
    const afterKeys = variables.map((v) => v.key);
    const details = {
      added: afterKeys.filter((k) => !beforeKeys.includes(k)),
      removed: beforeKeys.filter((k) => !afterKeys.includes(k)),
      changed: afterKeys.filter(
        (k) => beforeKeys.includes(k) && JSON.stringify(current.variables.find((v) => v.key === k)) !== JSON.stringify(variables.find((v) => v.key === k)),
      ),
    };

    if (!(await protocolInUse(db, current.id))) {
      await db.run('UPDATE protocols SET variables = ?, change_note = COALESCE(?, change_note) WHERE id = ?', [JSON.stringify(variables), changeNote ?? null, current.id]);
      await recordAudit(db, { actor, entity: 'protocol', entityId: current.id, action: 'update_variables', details });
      await touchExperiment(db, experimentId);
      return { protocolId: current.id, version: current.version, newVersion: false };
    }

    const last = await db.first<{ version: number }>('SELECT MAX(version) AS version FROM protocols WHERE experiment_id = ?', [experimentId]);
    const version = (last?.version ?? current.version) + 1;
    const id = uuid();
    await db.run(
      `INSERT INTO protocols (id, experiment_id, version, title, methodology, variables, change_note, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, experimentId, version, current.title, current.methodology, JSON.stringify(variables), changeNote ?? null, actor, nowIso()],
    );
    await db.run('UPDATE experiments SET current_protocol_id = ?, updated_at = ? WHERE id = ?', [id, nowIso(), experimentId]);
    await recordAudit(db, { actor, entity: 'protocol', entityId: id, action: 'new_version', details: { ...details, version, previous: current.version } });
    return { protocolId: id, version, newVersion: true };
  });
}

/** Atualiza a metodologia descrita no protocolo (gera nova versão se já foi usado). */
export async function saveMethodology(db: Db, experimentId: string, methodology: string, actor: string): Promise<void> {
  await db.transaction(async () => {
    const current = await getCurrentProtocol(db, experimentId);
    if ((current.methodology ?? '') === methodology) return;
    if (!(await protocolInUse(db, current.id))) {
      await db.run('UPDATE protocols SET methodology = ? WHERE id = ?', [methodology, current.id]);
      await recordAudit(db, { actor, entity: 'protocol', entityId: current.id, action: 'update_methodology' });
      return;
    }
    const last = await db.first<{ version: number }>('SELECT MAX(version) AS version FROM protocols WHERE experiment_id = ?', [experimentId]);
    const id = uuid();
    const version = (last?.version ?? current.version) + 1;
    await db.run(
      `INSERT INTO protocols (id, experiment_id, version, title, methodology, variables, change_note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, experimentId, version, current.title, methodology, JSON.stringify(current.variables), 'Metodologia revisada', actor, nowIso()],
    );
    await db.run('UPDATE experiments SET current_protocol_id = ?, updated_at = ? WHERE id = ?', [id, nowIso(), experimentId]);
    await recordAudit(db, { actor, entity: 'protocol', entityId: id, action: 'new_version', details: { version, reason: 'methodology' } });
  });
}

// ── Estatísticas ─────────────────────────────────────────────────────────────

export interface ExperimentStats {
  samples: number;
  sessions: number;
  openSessionId: string | null;
  observations: number;
  retracted: number;
  events: number;
  readings: number;
  files: number;
  expectedObservations: number;
  lastCollectionAt: string | null;
}

export async function getExperimentStats(db: Db, experiment: Experiment): Promise<ExperimentStats> {
  const row = await db.first<{
    samples: number;
    sessions: number;
    observations: number;
    retracted: number;
    events: number;
    readings: number;
    files: number;
    last_collection_at: string | null;
  }>(
    `SELECT
      (SELECT COUNT(*) FROM samples WHERE experiment_id = ?1 AND archived = 0) AS samples,
      (SELECT COUNT(*) FROM sessions WHERE experiment_id = ?1) AS sessions,
      (SELECT COUNT(*) FROM observations WHERE experiment_id = ?1 AND superseded_by IS NULL AND retracted_at IS NULL) AS observations,
      (SELECT COUNT(*) FROM observations WHERE experiment_id = ?1 AND retracted_at IS NOT NULL) AS retracted,
      (SELECT COUNT(*) FROM events WHERE experiment_id = ?1 AND retracted_at IS NULL) AS events,
      (SELECT COUNT(*) FROM readings WHERE experiment_id = ?1) AS readings,
      (SELECT COUNT(*) FROM files WHERE experiment_id = ?1) AS files,
      (SELECT MAX(collected_at) FROM observations WHERE experiment_id = ?1) AS last_collection_at`,
    [experiment.id],
  );
  const open = await db.first<{ id: string }>("SELECT id FROM sessions WHERE experiment_id = ? AND status = 'open' ORDER BY started_at DESC LIMIT 1", [experiment.id]);
  const expected = expectedCounts(experiment.design);
  // Sem desenho definido, o esperado é amostras cadastradas × sessões previstas
  const expectedObservations = expected.treatments > 0 ? expected.observations : (row?.samples ?? 0) * expected.sessions;
  return {
    samples: row?.samples ?? 0,
    sessions: row?.sessions ?? 0,
    openSessionId: open?.id ?? null,
    observations: row?.observations ?? 0,
    retracted: row?.retracted ?? 0,
    events: row?.events ?? 0,
    readings: row?.readings ?? 0,
    files: row?.files ?? 0,
    expectedObservations,
    lastCollectionAt: row?.last_collection_at ?? null,
  };
}

/** IDs de variáveis que já têm dados (não devem ser renomeados). */
export async function usedVariableKeys(db: Db, experimentId: string): Promise<string[]> {
  const rows = await db.all<{ key: string }>(
    `SELECT DISTINCT j.key AS key FROM observations o, json_each(o.data) j WHERE o.experiment_id = ?
     UNION
     SELECT DISTINCT j.key AS key FROM samples s, json_each(s.data) j WHERE s.experiment_id = ?`,
    [experimentId, experimentId],
  );
  return rows.map((r) => r.key);
}

/** Quantas sessões usaram cada versão do protocolo. */
export async function sessionsPerProtocol(db: Db, experimentId: string): Promise<Map<string, number>> {
  const rows = await db.all<{ protocol_id: string; n: number }>(
    'SELECT protocol_id, COUNT(*) AS n FROM sessions WHERE experiment_id = ? GROUP BY protocol_id',
    [experimentId],
  );
  return new Map(rows.map((r) => [r.protocol_id, r.n]));
}
