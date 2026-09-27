import { describeDesign, expandTreatments, expectedCounts } from '../design';
import { QC_FLAG_INFO } from '../qc';
import { getUnit, unitSymbol } from '../units';
import { fieldTypeInfo, ROLE_LABELS, describeCondition } from '../variables';
import type { QcFlag } from '../types';
import type { ExportInput } from './model';
import type { ColumnType, Table } from './table';
import { mergedVariables, variableColumns } from './tables';

/**
 * Documentos gerados SOMENTE a partir do que foi registrado no app.
 * Nada é inventado: seções sem informação são omitidas.
 */

// ── Dicionário de dados ──────────────────────────────────────────────────────

export function dataDictionaryTable(input: ExportInput): Table {
  const rows = (['sample', 'observation'] as const).flatMap((scope) =>
    mergedVariables(input, scope).flatMap((v) =>
      variableColumns(v).map((column) => ({
        table: scope === 'sample' ? 'samples' : 'observations',
        column: column.name,
        variable: v.key,
        label: column.title ?? v.label,
        description: v.description ?? null,
        field_type: v.type,
        data_type: column.type,
        unit_ucum: column.unit ?? null,
        unit_symbol: column.unit ? unitSymbol(column.unit) : null,
        role: v.role ? ROLE_LABELS[v.role] : null,
        required: v.required,
        allowed_min: v.config.min ?? null,
        allowed_max: v.config.max ?? null,
        expected_min: v.expectedMin ?? null,
        expected_max: v.expectedMax ?? null,
        resolution: v.resolution ?? null,
        accuracy: v.accuracy ?? null,
        options: v.config.options?.join('; ') ?? null,
        condition: v.showIf ? describeCondition(v.showIf, mergedVariables(input, scope)) : null,
        sensitive: v.sensitive ?? false,
      })),
    ),
  );
  const col = (name: string, type: ColumnType = 'string') => ({ name, type });
  return {
    name: 'data_dictionary',
    title: 'Dicionário de dados',
    columns: [
      col('table'), col('column'), col('variable'), col('label'), col('description'), col('field_type'), col('data_type'),
      col('unit_ucum'), col('unit_symbol'), col('role'), col('required', 'boolean'), col('allowed_min', 'number'),
      col('allowed_max', 'number'), col('expected_min', 'number'), col('expected_max', 'number'),
      col('resolution', 'number'), col('accuracy', 'number'), col('options'), col('condition'), col('sensitive', 'boolean'),
    ],
    rows,
  };
}

// ── metadata.json ────────────────────────────────────────────────────────────

export function buildMetadata(input: ExportInput) {
  const { experiment, release } = input;
  return {
    $schema: 'edgedata.dataset-metadata/1',
    dataset: {
      title: experiment.metadata.name,
      version: release.version,
      created_at: release.createdAt,
      created_by: release.createdBy ?? null,
      notes: release.notes ?? null,
      license: experiment.metadata.license ?? null,
    },
    experiment: {
      id: experiment.id,
      project: experiment.projectName ?? null,
      ...experiment.metadata,
      created_at: experiment.createdAt,
    },
    design: {
      ...experiment.design,
      treatments_expanded: expandTreatments(experiment.design),
      expected: expectedCounts(experiment.design),
      summary: describeDesign(experiment.design),
    },
    protocols: input.protocols.map((p) => ({
      id: p.id,
      version: p.version,
      title: p.title,
      methodology: p.methodology ?? null,
      created_at: p.createdAt,
      variables: p.variables,
    })),
    devices: input.devices.map((d) => ({ id: d.id, name: d.name, manifest: d.manifest })),
    counts: {
      samples: input.samples.length,
      sessions: input.sessions.length,
      observations_current: input.observations.filter((o) => o.status === 'current').length,
      observations_total_versions: input.observations.length,
      observations_retracted: input.observations.filter((o) => o.status === 'retracted').length,
      events: input.events.length,
      readings: input.readings.length,
      calibrations: (input.calibrations ?? []).length,
      qc_reviews: (input.qcReviews ?? []).length,
      files: input.fileMap.size,
    },
    imports: (input.imports ?? []).map((i) => ({
      session_id: i.sessionId,
      file_name: i.fileName,
      sha256: i.sha256,
      rows_total: i.rowsTotal,
      rows_imported: i.rowsImported,
      mapping: i.mapping,
      imported_by: i.createdBy,
      imported_at: i.createdAt,
    })),
    software: input.software,
  };
}

// ── datapackage.json (Frictionless Data Package v1 + Table Schema) ────────────

const FRICTIONLESS_TYPE: Record<ColumnType, string> = {
  string: 'string',
  integer: 'integer',
  number: 'number',
  boolean: 'boolean',
  datetime: 'datetime',
  date: 'date',
  time: 'time',
  json: 'any',
};

export interface PackagedResource {
  table: Table;
  path: string;
  format: string;
  mediatype: string;
  bytes: number;
  sha256: string;
}

export function buildDatapackage(input: ExportInput, resources: readonly PackagedResource[]) {
  const { metadata } = input.experiment;
  const slug = metadata.code.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'dataset';
  return {
    profile: 'tabular-data-package',
    name: slug,
    title: metadata.name,
    ...(metadata.description ? { description: metadata.description } : {}),
    version: input.release.version,
    created: input.release.createdAt,
    ...(metadata.license ? { licenses: [{ name: metadata.license }] } : {}),
    contributors: metadata.team.map((member) => ({
      title: member.name,
      ...(member.role ? { role: member.role } : {}),
      ...(member.email ? { email: member.email } : {}),
      ...(member.orcid ? { path: `https://orcid.org/${member.orcid}` } : {}),
      ...(member.affiliation ? { organization: member.affiliation } : {}),
    })),
    resources: resources.map((r) => ({
      name: `${r.table.name}-${r.format}`,
      path: r.path,
      title: r.table.title,
      ...(r.table.description ? { description: r.table.description } : {}),
      profile: 'tabular-data-resource',
      format: r.format,
      mediatype: r.mediatype,
      encoding: 'utf-8',
      bytes: r.bytes,
      hash: `sha256:${r.sha256}`,
      schema: {
        fields: r.table.columns.map((c) => ({
          name: c.name,
          type: FRICTIONLESS_TYPE[c.type],
          ...(c.title ? { title: c.title } : {}),
          ...(c.description ? { description: c.description } : {}),
          ...(c.unit ? { unit: c.unit } : {}),
        })),
      },
    })),
  };
}

// ── provenance.json (W3C PROV-JSON) ──────────────────────────────────────────

export function buildProvenance(input: ExportInput) {
  const ns = 'edgedata';
  const entity: Record<string, unknown> = {};
  const activity: Record<string, unknown> = {};
  const agent: Record<string, unknown> = {};
  const wasGeneratedBy: Record<string, unknown> = {};
  const used: Record<string, unknown> = {};
  const wasAssociatedWith: Record<string, unknown> = {};

  const datasetId = `${ns}:dataset/${input.experiment.id}@${input.release.version}`;
  entity[datasetId] = { 'prov:type': 'prov:Collection', 'prov:label': input.experiment.metadata.name, [`${ns}:version`]: input.release.version };

  for (const protocol of input.protocols) {
    entity[`${ns}:protocol/${protocol.id}`] = { 'prov:type': `${ns}:Protocol`, 'prov:label': `${protocol.title} v${protocol.version}` };
  }
  for (const device of input.devices) {
    agent[`${ns}:device/${device.id}`] = {
      'prov:type': 'prov:SoftwareAgent',
      'prov:label': device.name,
      [`${ns}:firmware`]: device.manifest.firmware?.version ?? null,
    };
  }
  const people = new Set<string>();
  for (const member of input.experiment.metadata.team) people.add(member.name);
  for (const session of input.sessions) if (session.operator) people.add(session.operator);
  for (const name of people) agent[`${ns}:person/${encodeURIComponent(name)}`] = { 'prov:type': 'prov:Person', 'prov:label': name };

  for (const session of input.sessions) {
    const id = `${ns}:session/${session.id}`;
    activity[id] = {
      'prov:startTime': session.startedAt,
      ...(session.endedAt ? { 'prov:endTime': session.endedAt } : {}),
      'prov:label': `Sessão ${session.code}`,
    };
    used[`_:u_${session.id}`] = { 'prov:activity': id, 'prov:entity': `${ns}:protocol/${session.protocolId}` };
    if (session.operator) {
      wasAssociatedWith[`_:a_${session.id}`] = { 'prov:activity': id, 'prov:agent': `${ns}:person/${encodeURIComponent(session.operator)}` };
    }
  }

  // Arquivos de origem das importações: a sessão de importação "usou" o arquivo
  for (const imp of input.imports ?? []) {
    const fileId = `${ns}:file/${imp.sha256 ?? imp.id}`;
    entity[fileId] = { 'prov:type': `${ns}:SourceFile`, 'prov:label': imp.fileName, ...(imp.sha256 ? { [`${ns}:sha256`]: imp.sha256 } : {}) };
    used[`_:u_import_${imp.id}`] = { 'prov:activity': `${ns}:session/${imp.sessionId}`, 'prov:entity': fileId };
  }
  for (const c of input.calibrations ?? []) {
    entity[`${ns}:calibration/${c.id}`] = {
      'prov:type': `${ns}:Calibration`,
      'prov:label': `${c.deviceId}/${c.sensorId} ${c.method}`,
      [`${ns}:coefficients`]: c.coefficients,
      [`${ns}:validFrom`]: c.validFrom,
      ...(c.validUntil ? { [`${ns}:validUntil`]: c.validUntil } : {}),
    };
  }

  const exportActivity = `${ns}:export/${input.release.version}`;
  activity[exportActivity] = { 'prov:startTime': input.release.createdAt, 'prov:label': `Exportação ${input.release.version}` };
  agent[`${ns}:software`] = { 'prov:type': 'prov:SoftwareAgent', 'prov:label': `${input.software.name} ${input.software.version}` };
  wasGeneratedBy['_:g_export'] = { 'prov:entity': datasetId, 'prov:activity': exportActivity };
  wasAssociatedWith['_:a_export'] = { 'prov:activity': exportActivity, 'prov:agent': `${ns}:software` };

  return {
    prefix: { [ns]: 'https://github.com/gbriellma/EdgeData#' },
    entity,
    activity,
    agent,
    used,
    wasGeneratedBy,
    wasAssociatedWith,
    // Trilha de auditoria completa (append-only no aparelho)
    [`${ns}:auditLog`]: input.audit.map((entry) => ({
      at: entry.at,
      actor: entry.actor,
      action: entry.action,
      entity: `${entry.entity}/${entry.entityId}`,
      details: entry.details ?? null,
    })),
  };
}

// ── README.md ────────────────────────────────────────────────────────────────

function mdEscape(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export function buildReadme(input: ExportInput, resources: readonly PackagedResource[], mediaCount: number): string {
  const { metadata, design } = input.experiment;
  const lines: string[] = [];
  const section = (title: string) => lines.push('', `## ${title}`, '');
  const field = (label: string, value?: string | null) => {
    if (value && value.trim()) lines.push(`- **${label}:** ${value.trim()}`);
  };

  lines.push(`# ${metadata.name}`, '');
  lines.push(`Dataset versão **${input.release.version}**, gerado em ${input.release.createdAt} pelo ${input.software.name} ${input.software.version}.`);
  if (metadata.description) lines.push('', metadata.description.trim());

  section('Experimento');
  field('Código', metadata.code);
  field('Projeto', input.experiment.projectName);
  field('Objetivo', metadata.objective);
  field('Hipótese', metadata.hypothesis);
  field('Instituição', metadata.institution);
  field('Laboratório', metadata.laboratory);
  field('Financiamento', metadata.funding);
  field('Local', metadata.location);
  if (metadata.startDate || metadata.endDate) field('Período', `${metadata.startDate ?? '?'} a ${metadata.endDate ?? '?'}`);

  if (metadata.team.length > 0) {
    section('Equipe');
    for (const m of metadata.team) {
      const extra = [m.role, m.affiliation, m.orcid ? `ORCID [${m.orcid}](https://orcid.org/${m.orcid})` : undefined].filter(Boolean).join(' · ');
      lines.push(`- ${m.name}${extra ? ` - ${extra}` : ''}`);
    }
  }

  section('Desenho experimental');
  lines.push(describeDesign(design));
  const treatments = expandTreatments(design);
  if (treatments.length > 0) {
    lines.push('', '| Tratamento | Descrição | Controle |', '|---|---|---|');
    for (const t of treatments) lines.push(`| ${mdEscape(t.code)} | ${mdEscape(t.label)} | ${t.isControl ? 'sim' : 'não'} |`);
  }
  if (design.blocks > 1) lines.push('', `Blocos: ${design.blocks}.`);
  if (design.collectionFrequency) lines.push('', `Frequência de coleta: ${design.collectionFrequency}.`);
  if (design.sessionDurationMin) lines.push('', `Duração por sessão: ${design.sessionDurationMin} min.`);
  if (design.samplingRateHz) lines.push('', `Taxa de aquisição dos sensores: ${design.samplingRateHz} Hz.`);

  if (metadata.methodology || input.protocols.length > 0) {
    section('Protocolo');
    if (metadata.methodology) lines.push(metadata.methodology.trim(), '');
    for (const p of [...input.protocols].sort((a, b) => a.version - b.version)) {
      const sessions = input.sessions.filter((s) => s.protocolId === p.id).length;
      lines.push(`- **v${p.version}** (${p.createdAt.slice(0, 10)}): ${p.variables.length} variáveis, usada em ${sessions} sessão(ões)`);
    }
  }
  field('Critérios de inclusão', metadata.inclusionCriteria);
  field('Critérios de exclusão', metadata.exclusionCriteria);

  section('Variáveis');
  lines.push('| Tabela | Variável | Descrição | Tipo | Unidade | Faixa esperada |', '|---|---|---|---|---|---|');
  for (const scope of ['sample', 'observation'] as const) {
    for (const v of mergedVariables(input, scope)) {
      const unit = v.unit ? `${unitSymbol(v.unit)} (\`${v.unit}\`)` : '';
      const range = v.expectedMin !== undefined || v.expectedMax !== undefined ? `${v.expectedMin ?? '−∞'} a ${v.expectedMax ?? '+∞'}` : '';
      lines.push(`| ${scope === 'sample' ? 'samples' : 'observations'} | \`${v.key}\` | ${mdEscape(v.label)}${v.description ? ` - ${mdEscape(v.description)}` : ''} | ${fieldTypeInfo(v.type).label} | ${unit} | ${range} |`);
    }
  }
  lines.push('', 'Detalhes completos em `data_dictionary.csv`. Unidades seguem o padrão UCUM.');

  if (input.devices.length > 0) {
    section('Dispositivos e sensores');
    for (const d of input.devices) {
      const fw = d.manifest.firmware ? ` - firmware ${d.manifest.firmware.name ?? ''} ${d.manifest.firmware.version}${d.manifest.firmware.commit ? ` (${d.manifest.firmware.commit})` : ''}` : '';
      lines.push(`- **${d.name}** (${d.manifest.model ?? d.manifest.hardware?.mcu ?? 'modelo não informado'})${fw}`);
      for (const s of d.manifest.sensors) {
        const details = [s.model, getUnit(s.unit) ? unitSymbol(s.unit) : s.unit, s.range ? `faixa ${s.range[0]}…${s.range[1]}` : undefined, s.resolution ? `resolução ${s.resolution}` : undefined, s.accuracy ? `exatidão ±${s.accuracy}` : undefined]
          .filter(Boolean)
          .join(', ');
        lines.push(`  - \`${s.id}\` ${s.label ?? ''}${details ? ` - ${details}` : ''}`);
      }
    }
  }

  section('Arquivos');
  lines.push('| Arquivo | Conteúdo | Linhas |', '|---|---|---|');
  for (const r of resources) lines.push(`| \`${r.path}\` | ${mdEscape(r.table.title)} | ${r.table.rows.length} |`);
  if (mediaCount > 0) lines.push(`| \`files/\` | Fotos e anexos | ${mediaCount} arquivos |`);
  lines.push(
    '| `metadata.json` | Experimento, desenho, protocolos, dispositivos | - |',
    '| `datapackage.json` | Descrição Frictionless Data Package (Table Schema) | - |',
    '| `data_dictionary.csv` | Dicionário de dados | - |',
    '| `provenance.json` | Proveniência (W3C PROV-JSON) e trilha de auditoria | - |',
    '| `checksums.sha256` | SHA-256 de todos os arquivos | - |',
  );

  if ((input.calibrations ?? []).length > 0) {
    section('Calibração');
    lines.push(
      'Leituras de sensores guardam o valor bruto (`value`) e, quando havia calibração vigente, o valor corrigido',
      '(`value_corrected`) com a curva usada (`calibration_id`). Curvas em `calibrations`:',
      '',
    );
    for (const c of input.calibrations ?? []) {
      const [c0 = 0, c1 = 0, c2 = 0] = c.coefficients;
      const eq = `${c2 ? `${c2}·x² + ` : ''}${c1}·x + ${c0}`;
      const validity = `${c.validFrom.slice(0, 10)} a ${c.validUntil ? c.validUntil.slice(0, 10) : 'sem prazo'}`;
      lines.push(`- \`${c.deviceId}/${c.sensorId}\`: y = ${eq} (RMSE ${c.rmse ?? '?'}; ${validity})${c.revokedAt ? `, revogada: ${c.revokedReason ?? ''}` : ''}`);
    }
  }

  if ((input.imports ?? []).length > 0) {
    section('Dados importados');
    for (const i of input.imports ?? []) {
      lines.push(`- ${i.rowsImported} observação(ões) de \`${i.fileName}\`${i.sha256 ? ` (SHA-256 \`${i.sha256.slice(0, 16)}…\`)` : ''}, importadas em ${i.createdAt.slice(0, 10)}.`);
    }
  }

  section('Qualidade dos dados');
  lines.push(
    'Nenhum dado foi apagado. Correções geram revisões (a versão original fica em `observations_history`) e',
    'exclusões são retratações com motivo. Cada valor medido tem uma coluna `qc_<variável>`:',
    '',
  );
  const flagCounts = new Map<QcFlag, number>();
  for (const o of input.observations.filter((x) => x.status === 'current')) {
    for (const flag of Object.values(o.qc)) flagCounts.set(flag, (flagCounts.get(flag) ?? 0) + 1);
  }
  for (const [flag, info] of Object.entries(QC_FLAG_INFO) as [QcFlag, (typeof QC_FLAG_INFO)[QcFlag]][]) {
    const count = flagCounts.get(flag);
    if (count || flag === 'GOOD' || flag === 'MISSING' || flag === 'OUT_OF_RANGE') {
      lines.push(`- \`${flag}\` - ${info.description}${count ? `: ${count} valor(es)` : ''}`);
    }
  }
  const expected = expectedCounts(design).observations;
  const collected = input.observations.filter((o) => o.status === 'current').length;
  const retracted = input.observations.filter((o) => o.status === 'retracted').length;
  lines.push('', `Observações coletadas: ${collected} de ${expected} previstas pelo desenho.`);
  if (retracted > 0) lines.push(`Observações retratadas: ${retracted}.`);
  const reviews = (input.qcReviews ?? []).length;
  if (reviews > 0) lines.push(`Valores sinalizados conferidos e aceitos por uma pessoa: ${reviews} (ver \`qc_reviews\`).`);

  section('Integridade');
  lines.push('Verifique que nenhum arquivo foi alterado com:', '', '```bash', 'sha256sum -c checksums.sha256', '```');

  section('Licença');
  lines.push(metadata.license ? metadata.license : 'Não definida pelos autores.');

  const authors = metadata.team.map((m) => m.name).join('; ');
  if (authors) {
    section('Como citar');
    lines.push(`${authors} (${input.release.createdAt.slice(0, 4)}). *${metadata.name}* (versão ${input.release.version}) [Conjunto de dados].`);
  }

  return `${lines.join('\n')}\n`;
}
