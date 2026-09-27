import { isGeoPoint } from '../validation';
import { fieldTypeInfo, sortVariables } from '../variables';
import type { GeoPoint, VariableDefinition, VariableScope } from '../types';
import type { ExportInput, ExportObservation } from './model';
import type { Column, Row, Table } from './table';

/**
 * União das variáveis de todas as versões do protocolo (pela chave).
 * A definição mais recente dá nome, unidade e descrição à coluna.
 */
export function mergedVariables(input: ExportInput, scope: VariableScope): VariableDefinition[] {
  const byKey = new Map<string, VariableDefinition>();
  const ordered = [...input.protocols].sort((a, b) => a.version - b.version);
  for (const protocol of ordered) {
    for (const variable of protocol.variables) {
      if (variable.scope === scope) byKey.set(variable.key, variable);
    }
  }
  return sortVariables([...byKey.values()]);
}

// ── Variável → colunas ───────────────────────────────────────────────────────

const GEO_SUFFIXES = [
  ['lat', 'latitude (WGS 84)', 'deg'],
  ['lon', 'longitude (WGS 84)', 'deg'],
  ['alt', 'altitude', 'm'],
  ['accuracy', 'precisão horizontal', 'm'],
] as const;

export function variableColumns(v: VariableDefinition): Column[] {
  const base = { title: v.label, description: v.description };
  switch (v.type) {
    case 'decimal':
      return [{ name: v.key, type: 'number', unit: v.unit, ...base }];
    case 'integer':
    case 'scale':
      return [{ name: v.key, type: 'integer', unit: v.unit, ...base }];
    case 'boolean':
      return [{ name: v.key, type: 'boolean', ...base }];
    case 'multi_category':
      return [{ name: v.key, type: 'json', ...base }];
    case 'date':
      return [{ name: v.key, type: 'date', ...base }];
    case 'time':
      return [{ name: v.key, type: 'time', ...base }];
    case 'auto_timestamp':
      return [{ name: v.key, type: 'datetime', ...base }];
    case 'gps':
    case 'auto_gps':
      return GEO_SUFFIXES.map(([suffix, label, unit]) => ({
        name: `${v.key}_${suffix}`,
        type: 'number' as const,
        unit,
        title: `${v.label} — ${label}`,
      }));
    case 'image':
      return [{ name: v.key, type: 'string', title: v.label, description: 'Caminho relativo do arquivo de imagem no pacote' }];
    case 'multi_image': {
      const angles = v.config.angles ?? [];
      if (angles.length === 0) return [{ name: v.key, type: 'json', ...base }];
      return angles.map((angle) => ({
        name: `${v.key}_${angle.key}`,
        type: 'string' as const,
        title: `${v.label} — ${angle.label}`,
        description: 'Caminho relativo do arquivo de imagem no pacote',
      }));
    }
    default:
      return [{ name: v.key, type: 'string', ...base }];
  }
}

/** Interpreta GPS gravado como objeto ou no formato antigo "lat,lon". */
export function toGeoPoint(value: unknown): GeoPoint | null {
  if (isGeoPoint(value)) return value;
  if (typeof value === 'string') {
    const [lat, lon] = value.split(',').map((part) => Number(part.trim()));
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { latitude: lat, longitude: lon };
  }
  return null;
}

function filePath(uri: unknown, fileMap: Map<string, string>): string | null {
  if (typeof uri !== 'string' || !uri) return null;
  return fileMap.get(uri) ?? null;
}

export function variableCells(v: VariableDefinition, value: unknown, fileMap: Map<string, string>): Row {
  switch (v.type) {
    case 'gps':
    case 'auto_gps': {
      const point = toGeoPoint(value);
      return {
        [`${v.key}_lat`]: point?.latitude ?? null,
        [`${v.key}_lon`]: point?.longitude ?? null,
        [`${v.key}_alt`]: point?.altitude ?? null,
        [`${v.key}_accuracy`]: point?.accuracy ?? null,
      };
    }
    case 'image':
      return { [v.key]: filePath(value, fileMap) };
    case 'multi_image': {
      const photos = Array.isArray(value) ? (value as { angle?: string; uri?: string }[]) : [];
      const angles = v.config.angles ?? [];
      if (angles.length === 0) {
        return { [v.key]: photos.map((p) => ({ angle: p.angle ?? null, file: filePath(p.uri, fileMap) })) };
      }
      return Object.fromEntries(
        angles.map((angle) => [`${v.key}_${angle.key}`, filePath(photos.find((p) => p.angle === angle.key)?.uri, fileMap)]),
      );
    }
    default:
      return { [v.key]: value ?? null };
  }
}

function qcColumns(variables: VariableDefinition[]): Column[] {
  return variables
    .filter((v) => !fieldTypeInfo(v.type).automatic)
    .map((v) => ({ name: `qc_${v.key}`, type: 'string' as const, title: `Flag de qualidade — ${v.label}` }));
}

// ── Tabelas ──────────────────────────────────────────────────────────────────

export function samplesTable(input: ExportInput): Table {
  const variables = mergedVariables(input, 'sample');
  const columns: Column[] = [
    { name: 'sample_id', type: 'string', title: 'ID da amostra (UUID)' },
    { name: 'sample_code', type: 'string', title: 'Código da amostra' },
    { name: 'treatment', type: 'string', title: 'Tratamento' },
    { name: 'replicate', type: 'integer', title: 'Réplica' },
    { name: 'block', type: 'integer', title: 'Bloco' },
    { name: 'created_at', type: 'datetime', title: 'Cadastro (UTC)' },
    ...variables.flatMap(variableColumns),
  ];
  const rows = input.samples.map((sample) => ({
    sample_id: sample.id,
    sample_code: sample.code,
    treatment: sample.treatment ?? null,
    replicate: sample.replicate ?? null,
    block: sample.block ?? null,
    created_at: sample.createdAt,
    ...Object.assign({}, ...variables.map((v) => variableCells(v, sample.data[v.key], input.fileMap))),
  }));
  return { name: 'samples', title: 'Amostras', description: 'Unidades experimentais e seus atributos fixos.', columns, rows };
}

function observationRows(input: ExportInput, observations: ExportObservation[], variables: VariableDefinition[], history: boolean): Row[] {
  const samples = new Map(input.samples.map((s) => [s.id, s]));
  const sessions = new Map(input.sessions.map((s) => [s.id, s]));
  const protocols = new Map(input.protocols.map((p) => [p.id, p]));
  return observations.map((obs) => {
    const sample = samples.get(obs.sampleId);
    const row: Row = {
      observation_id: obs.id,
      sample_id: obs.sampleId,
      sample_code: sample?.code ?? null,
      treatment: sample?.treatment ?? null,
      session_id: obs.sessionId,
      session_code: sessions.get(obs.sessionId)?.code ?? null,
      protocol_version: protocols.get(obs.protocolId)?.version ?? null,
      collected_at: obs.collectedAt,
      latitude: obs.location?.latitude ?? null,
      longitude: obs.location?.longitude ?? null,
      altitude: obs.location?.altitude ?? null,
      gps_accuracy: obs.location?.accuracy ?? null,
      source: obs.source,
      revision: obs.revision,
      ...Object.assign({}, ...variables.map((v) => variableCells(v, obs.data[v.key], input.fileMap))),
      ...Object.fromEntries(variables.map((v) => [`qc_${v.key}`, obs.qc[v.key] ?? null])),
    };
    if (history) {
      row.status = obs.status;
      row.supersedes_id = obs.supersedesId ?? null;
      row.retraction_reason = obs.retractionReason ?? null;
      row.created_by = obs.createdBy ?? null;
    }
    return row;
  });
}

function observationColumns(variables: VariableDefinition[], history: boolean): Column[] {
  return [
    { name: 'observation_id', type: 'string', title: 'ID da observação (UUID)' },
    { name: 'sample_id', type: 'string', title: 'ID da amostra' },
    { name: 'sample_code', type: 'string', title: 'Código da amostra' },
    { name: 'treatment', type: 'string', title: 'Tratamento' },
    { name: 'session_id', type: 'string', title: 'ID da sessão' },
    { name: 'session_code', type: 'string', title: 'Código da sessão' },
    { name: 'protocol_version', type: 'integer', title: 'Versão do protocolo' },
    { name: 'collected_at', type: 'datetime', title: 'Coleta (UTC)' },
    { name: 'latitude', type: 'number', unit: 'deg', title: 'Latitude da coleta (WGS 84)' },
    { name: 'longitude', type: 'number', unit: 'deg', title: 'Longitude da coleta (WGS 84)' },
    { name: 'altitude', type: 'number', unit: 'm', title: 'Altitude da coleta' },
    { name: 'gps_accuracy', type: 'number', unit: 'm', title: 'Precisão do GPS' },
    { name: 'source', type: 'string', title: 'Origem (manual, device, import)' },
    { name: 'revision', type: 'integer', title: 'Revisão (1 = original)' },
    ...variables.flatMap(variableColumns),
    ...qcColumns(variables),
    ...(history
      ? ([
          { name: 'status', type: 'string', title: 'current, superseded ou retracted' },
          { name: 'supersedes_id', type: 'string', title: 'Observação corrigida por esta revisão' },
          { name: 'retraction_reason', type: 'string', title: 'Motivo da retratação' },
          { name: 'created_by', type: 'string', title: 'Responsável pelo registro' },
        ] satisfies Column[])
      : []),
  ];
}

export function observationsTable(input: ExportInput): Table {
  const variables = mergedVariables(input, 'observation');
  const current = input.observations.filter((o) => o.status === 'current');
  return {
    name: 'observations',
    title: 'Observações',
    description: 'Versão vigente de cada observação (revisões e retratações ficam em observations_history).',
    columns: observationColumns(variables, false),
    rows: observationRows(input, current, variables, false),
  };
}

export function observationsHistoryTable(input: ExportInput): Table {
  const variables = mergedVariables(input, 'observation');
  return {
    name: 'observations_history',
    title: 'Histórico de observações',
    description: 'Todas as versões de todas as observações, incluindo valores originais corrigidos e retratados.',
    columns: observationColumns(variables, true),
    rows: observationRows(input, input.observations, variables, true),
  };
}

export function sessionsTable(input: ExportInput): Table {
  const protocols = new Map(input.protocols.map((p) => [p.id, p]));
  return {
    name: 'sessions',
    title: 'Sessões',
    description: 'Idas a campo / corridas de aquisição.',
    columns: [
      { name: 'session_id', type: 'string' },
      { name: 'session_code', type: 'string' },
      { name: 'protocol_version', type: 'integer' },
      { name: 'operator', type: 'string' },
      { name: 'status', type: 'string' },
      { name: 'started_at', type: 'datetime' },
      { name: 'ended_at', type: 'datetime' },
      { name: 'notes', type: 'string' },
      { name: 'device_snapshot', type: 'json', description: 'Configuração dos dispositivos conectados na abertura da sessão' },
    ],
    rows: input.sessions.map((s) => ({
      session_id: s.id,
      session_code: s.code,
      protocol_version: protocols.get(s.protocolId)?.version ?? null,
      operator: s.operator ?? null,
      status: s.status,
      started_at: s.startedAt,
      ended_at: s.endedAt ?? null,
      notes: s.notes ?? null,
      device_snapshot: s.deviceSnapshot ?? null,
    })),
  };
}

export function eventsTable(input: ExportInput): Table {
  const sessions = new Map(input.sessions.map((s) => [s.id, s]));
  return {
    name: 'events',
    title: 'Eventos',
    description: 'Marcadores registrados durante as sessões.',
    columns: [
      { name: 'event_id', type: 'string' },
      { name: 'session_id', type: 'string' },
      { name: 'session_code', type: 'string' },
      { name: 'occurred_at', type: 'datetime' },
      { name: 'label', type: 'string' },
      { name: 'kind', type: 'string', description: 'manual ou device' },
      { name: 'device_id', type: 'string' },
      { name: 'data', type: 'json' },
    ],
    rows: input.events.map((e) => ({
      event_id: e.id,
      session_id: e.sessionId,
      session_code: sessions.get(e.sessionId)?.code ?? null,
      occurred_at: e.occurredAt,
      label: e.label,
      kind: e.kind,
      device_id: e.deviceId ?? null,
      data: e.data ?? null,
    })),
  };
}

export function readingsTable(input: ExportInput): Table {
  return {
    name: 'readings',
    title: 'Leituras de dispositivos',
    description: 'Série temporal em formato longo: uma linha por sensor por leitura.',
    columns: [
      { name: 'reading_id', type: 'string' },
      { name: 'session_id', type: 'string' },
      { name: 'device_id', type: 'string' },
      { name: 'sensor_id', type: 'string' },
      { name: 'value', type: 'number' },
      { name: 'unit', type: 'string', description: 'Código UCUM' },
      { name: 'qc_flag', type: 'string' },
      { name: 'seq', type: 'integer', description: 'Sequência enviada pelo dispositivo' },
      { name: 'device_ms', type: 'integer', unit: 'ms', description: 'Relógio monotônico do dispositivo' },
      { name: 'device_utc', type: 'datetime', description: 'Horário UTC do dispositivo (se sincronizado)' },
      { name: 'received_at', type: 'datetime', description: 'Horário UTC de recepção no celular' },
    ],
    rows: input.readings.map((r) => ({
      reading_id: r.id,
      session_id: r.sessionId,
      device_id: r.deviceId,
      sensor_id: r.sensorId,
      value: typeof r.value === 'boolean' ? Number(r.value) : r.value,
      unit: r.unit ?? null,
      qc_flag: r.qc,
      seq: r.seq ?? null,
      device_ms: r.deviceMs ?? null,
      device_utc: r.deviceUtc ?? null,
      received_at: r.receivedAt,
    })),
  };
}

export function buildTables(input: ExportInput): Table[] {
  return [
    samplesTable(input),
    observationsTable(input),
    observationsHistoryTable(input),
    sessionsTable(input),
    eventsTable(input),
    readingsTable(input),
  ];
}
