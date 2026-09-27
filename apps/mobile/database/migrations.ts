/**
 * Migrações do banco local. Cada migração roda uma única vez, em ordem, dentro de
 * uma transação; `PRAGMA user_version` guarda a última aplicada.
 *
 * Regra: nunca editar uma migração já publicada — sempre criar a próxima.
 */

export interface Migration {
  version: number;
  description: string;
  sql: string;
}

const IMMUTABLE_OBSERVATION_COLUMNS = [
  'id',
  'experiment_id',
  'session_id',
  'sample_id',
  'protocol_id',
  'data',
  'qc',
  'latitude',
  'longitude',
  'altitude',
  'gps_accuracy',
  'collected_at',
  'tz_offset_min',
  'source',
  'revision',
  'supersedes_id',
  'created_by',
  'created_at',
];

const changed = (columns: string[]) => columns.map((c) => `NEW.${c} IS NOT OLD.${c}`).join(' OR ');

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Modelo científico: projetos, experimentos, protocolos versionados, amostras, sessões, observações imutáveis, eventos, arquivos, dispositivos, leituras, datasets e auditoria',
    sql: `
      CREATE TABLE workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        name TEXT NOT NULL,
        description TEXT,
        archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE studies (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE experiments (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        study_id TEXT REFERENCES studies(id),
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'completed')),
        metadata TEXT NOT NULL DEFAULT '{}',
        design TEXT NOT NULL DEFAULT '{}',
        current_protocol_id TEXT,
        archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (project_id, code)
      );

      CREATE TABLE protocols (
        id TEXT PRIMARY KEY,
        experiment_id TEXT NOT NULL REFERENCES experiments(id),
        version INTEGER NOT NULL,
        title TEXT NOT NULL,
        methodology TEXT,
        variables TEXT NOT NULL DEFAULT '[]',
        change_note TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL,
        UNIQUE (experiment_id, version)
      );

      CREATE TABLE samples (
        id TEXT PRIMARY KEY,
        experiment_id TEXT NOT NULL REFERENCES experiments(id),
        code TEXT NOT NULL,
        treatment TEXT,
        replicate INTEGER,
        block INTEGER,
        data TEXT NOT NULL DEFAULT '{}',
        qr_generated INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (experiment_id, code)
      );

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        experiment_id TEXT NOT NULL REFERENCES experiments(id),
        protocol_id TEXT NOT NULL REFERENCES protocols(id),
        code TEXT NOT NULL,
        operator TEXT,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
        started_at TEXT NOT NULL,
        ended_at TEXT,
        tz_offset_min INTEGER,
        device_snapshot TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        UNIQUE (experiment_id, code)
      );

      CREATE TABLE observations (
        id TEXT PRIMARY KEY,
        experiment_id TEXT NOT NULL REFERENCES experiments(id),
        session_id TEXT NOT NULL REFERENCES sessions(id),
        sample_id TEXT NOT NULL REFERENCES samples(id),
        protocol_id TEXT NOT NULL REFERENCES protocols(id),
        data TEXT NOT NULL,
        qc TEXT NOT NULL DEFAULT '{}',
        latitude REAL,
        longitude REAL,
        altitude REAL,
        gps_accuracy REAL,
        collected_at TEXT NOT NULL,
        tz_offset_min INTEGER,
        source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'device', 'import')),
        revision INTEGER NOT NULL DEFAULT 1,
        supersedes_id TEXT REFERENCES observations(id),
        superseded_by TEXT,
        superseded_at TEXT,
        retracted_at TEXT,
        retraction_reason TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE events (
        id TEXT PRIMARY KEY,
        experiment_id TEXT NOT NULL REFERENCES experiments(id),
        session_id TEXT NOT NULL REFERENCES sessions(id),
        occurred_at TEXT NOT NULL,
        label TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'manual' CHECK (kind IN ('manual', 'device')),
        device_id TEXT,
        data TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL,
        retracted_at TEXT,
        retraction_reason TEXT
      );

      CREATE TABLE files (
        id TEXT PRIMARY KEY,
        experiment_id TEXT NOT NULL REFERENCES experiments(id),
        observation_id TEXT REFERENCES observations(id),
        sample_id TEXT REFERENCES samples(id),
        variable_key TEXT,
        kind TEXT NOT NULL DEFAULT 'image',
        path TEXT NOT NULL,
        mime_type TEXT,
        bytes INTEGER,
        sha256 TEXT,
        width INTEGER,
        height INTEGER,
        meta TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        transport TEXT NOT NULL DEFAULT 'ble',
        address TEXT,
        manifest TEXT NOT NULL,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE sensor_bindings (
        id TEXT PRIMARY KEY,
        experiment_id TEXT NOT NULL REFERENCES experiments(id),
        variable_key TEXT NOT NULL,
        device_id TEXT NOT NULL REFERENCES devices(id),
        sensor_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (experiment_id, variable_key)
      );

      CREATE TABLE readings (
        id TEXT PRIMARY KEY,
        experiment_id TEXT NOT NULL REFERENCES experiments(id),
        session_id TEXT NOT NULL REFERENCES sessions(id),
        device_id TEXT NOT NULL,
        sensor_id TEXT NOT NULL,
        value REAL,
        value_text TEXT,
        unit TEXT,
        qc TEXT NOT NULL DEFAULT 'GOOD',
        seq INTEGER,
        device_ms INTEGER,
        device_utc TEXT,
        received_at TEXT NOT NULL,
        observation_id TEXT REFERENCES observations(id)
      );

      CREATE TABLE datasets (
        id TEXT PRIMARY KEY,
        experiment_id TEXT NOT NULL REFERENCES experiments(id),
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE dataset_releases (
        id TEXT PRIMARY KEY,
        dataset_id TEXT NOT NULL REFERENCES datasets(id),
        version TEXT NOT NULL,
        formats TEXT NOT NULL,
        checksums TEXT NOT NULL,
        file_count INTEGER NOT NULL,
        total_bytes INTEGER NOT NULL,
        notes TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL,
        UNIQUE (dataset_id, version)
      );

      CREATE TABLE audit_log (
        id TEXT PRIMARY KEY,
        at TEXT NOT NULL,
        actor TEXT NOT NULL,
        entity TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT
      );

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE INDEX idx_experiments_project ON experiments(project_id);
      CREATE INDEX idx_protocols_experiment ON protocols(experiment_id);
      CREATE INDEX idx_samples_experiment ON samples(experiment_id);
      CREATE INDEX idx_sessions_experiment ON sessions(experiment_id, status);
      CREATE INDEX idx_observations_experiment ON observations(experiment_id, collected_at);
      CREATE INDEX idx_observations_sample ON observations(sample_id);
      CREATE INDEX idx_observations_session ON observations(session_id);
      CREATE INDEX idx_events_session ON events(session_id, occurred_at);
      CREATE INDEX idx_files_observation ON files(observation_id);
      CREATE INDEX idx_readings_session ON readings(session_id, received_at);
      CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);

      -- ── Dados brutos imutáveis ──────────────────────────────────────────────
      CREATE TRIGGER observations_immutable
      BEFORE UPDATE ON observations
      WHEN ${changed(IMMUTABLE_OBSERVATION_COLUMNS)}
      BEGIN
        SELECT RAISE(ABORT, 'Dados brutos são imutáveis: registre uma revisão');
      END;

      CREATE TRIGGER observations_supersede_once
      BEFORE UPDATE OF superseded_by ON observations
      WHEN OLD.superseded_by IS NOT NULL
      BEGIN
        SELECT RAISE(ABORT, 'Observação já foi revisada');
      END;

      CREATE TRIGGER observations_retract_once
      BEFORE UPDATE OF retracted_at, retraction_reason ON observations
      WHEN OLD.retracted_at IS NOT NULL
      BEGIN
        SELECT RAISE(ABORT, 'Observação já foi retratada');
      END;

      CREATE TRIGGER observations_no_delete
      BEFORE DELETE ON observations
      BEGIN
        SELECT RAISE(ABORT, 'Observações não podem ser apagadas: use retratação');
      END;

      CREATE TRIGGER readings_immutable
      BEFORE UPDATE ON readings
      WHEN ${changed(['id', 'session_id', 'device_id', 'sensor_id', 'value', 'value_text', 'unit', 'qc', 'seq', 'device_ms', 'device_utc', 'received_at'])}
      BEGIN
        SELECT RAISE(ABORT, 'Leituras de dispositivos são imutáveis');
      END;

      CREATE TRIGGER readings_no_delete
      BEFORE DELETE ON readings
      BEGIN
        SELECT RAISE(ABORT, 'Leituras de dispositivos não podem ser apagadas');
      END;

      CREATE TRIGGER events_immutable
      BEFORE UPDATE ON events
      WHEN ${changed(['id', 'session_id', 'occurred_at', 'label', 'kind', 'device_id', 'data', 'created_by', 'created_at'])}
      BEGIN
        SELECT RAISE(ABORT, 'Eventos são imutáveis: retrate e registre outro');
      END;

      CREATE TRIGGER events_no_delete
      BEFORE DELETE ON events
      BEGIN
        SELECT RAISE(ABORT, 'Eventos não podem ser apagados: use retratação');
      END;

      CREATE TRIGGER files_immutable
      BEFORE UPDATE ON files
      WHEN ${changed(['id', 'path', 'sha256', 'bytes', 'observation_id', 'sample_id', 'variable_key'])}
      BEGIN
        SELECT RAISE(ABORT, 'Arquivos registrados são imutáveis');
      END;

      CREATE TRIGGER files_no_delete_when_observed
      BEFORE DELETE ON files
      WHEN OLD.observation_id IS NOT NULL
      BEGIN
        SELECT RAISE(ABORT, 'Arquivos de observações não podem ser apagados');
      END;

      -- Protocolo usado por alguma sessão fica congelado
      CREATE TRIGGER protocols_frozen_when_used
      BEFORE UPDATE OF variables, version, methodology ON protocols
      WHEN EXISTS (SELECT 1 FROM sessions WHERE protocol_id = OLD.id)
      BEGIN
        SELECT RAISE(ABORT, 'Protocolo já usado em sessões: crie uma nova versão');
      END;

      CREATE TRIGGER releases_immutable
      BEFORE UPDATE ON dataset_releases
      BEGIN
        SELECT RAISE(ABORT, 'Releases publicadas são imutáveis');
      END;

      CREATE TRIGGER releases_no_delete
      BEFORE DELETE ON dataset_releases
      BEGIN
        SELECT RAISE(ABORT, 'Releases publicadas não podem ser apagadas');
      END;

      -- Trilha de auditoria append-only
      CREATE TRIGGER audit_no_update
      BEFORE UPDATE ON audit_log
      BEGIN
        SELECT RAISE(ABORT, 'A trilha de auditoria é somente de inclusão');
      END;

      CREATE TRIGGER audit_no_delete
      BEFORE DELETE ON audit_log
      BEGIN
        SELECT RAISE(ABORT, 'A trilha de auditoria é somente de inclusão');
      END;
    `,
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;
