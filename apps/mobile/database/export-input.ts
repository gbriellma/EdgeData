import type { ExportInput } from '@/core/export/model';
import type { Db } from './db';
import { listExperimentAudit } from './repo/common';
import { getExperiment, listProtocols } from './repo/experiments';
import { listDevices, listReadings } from './repo/devices';
import { listFiles, listObservations } from './repo/observations';
import { listSamples } from './repo/samples';
import { listEvents, listSessions } from './repo/sessions';

export interface MediaReference {
  /** Valor gravado (caminho relativo ou URI antiga) */
  source: string;
  /** Caminho dentro do pacote (files/...) */
  target: string;
  /** SHA-256 já conhecido (tabela files), se houver */
  sha256: string | null;
  bytes: number | null;
}

function baseName(path: string): string {
  const clean = path.split('?')[0];
  return clean.slice(clean.lastIndexOf('/') + 1) || 'arquivo';
}

/** Coleta referências de mídia nos valores (foto simples e multiângulo). */
function mediaIn(value: unknown): string[] {
  if (typeof value === 'string') return /\.(jpe?g|png|heic|webp|gif|tiff?)$/i.test(value.split('?')[0]) ? [value] : [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => (item && typeof item === 'object' && typeof (item as { uri?: unknown }).uri === 'string' ? [(item as { uri: string }).uri] : []));
  }
  return [];
}

/**
 * Carrega tudo que compõe o dataset de um experimento e resolve os nomes dos
 * arquivos de mídia dentro do pacote (sem colisões).
 */
export async function loadExportInput(
  db: Db,
  experimentId: string,
  release: ExportInput['release'],
  software: ExportInput['software'],
): Promise<{ input: ExportInput; media: MediaReference[] }> {
  const experiment = await getExperiment(db, experimentId);
  if (!experiment) throw new Error('Experimento não encontrado');

  const [protocols, samples, sessions, observations, events, readings, devices, audit, files] = await Promise.all([
    listProtocols(db, experimentId),
    listSamples(db, experimentId, { includeArchived: true }),
    listSessions(db, experimentId),
    listObservations(db, { experimentId, status: 'all', order: 'asc' }),
    listEvents(db, { experimentId, includeRetracted: true }),
    listReadings(db, { experimentId }),
    listDevices(db),
    listExperimentAudit(db, experimentId),
    listFiles(db, { experimentId }),
  ]);

  // Ordem cronológica (do banco): nomes de arquivo e linhas saem estáveis entre exportações
  const orderedObservations = observations;

  const mediaVarKeys = new Set(
    protocols.flatMap((p) => p.variables.filter((v) => v.type === 'image' || v.type === 'multi_image').map((v) => v.key)),
  );
  const knownFiles = new Map(files.map((f) => [f.path, f]));
  const fileMap = new Map<string, string>();
  const media: MediaReference[] = [];
  const usedNames = new Set<string>();

  const register = (source: string) => {
    if (fileMap.has(source)) return;
    let name = baseName(source);
    if (usedNames.has(name)) {
      const dot = name.lastIndexOf('.');
      const stem = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : '';
      let n = 2;
      while (usedNames.has(`${stem}_${n}${ext}`)) n += 1;
      name = `${stem}_${n}${ext}`;
    }
    usedNames.add(name);
    const target = `files/${name}`;
    fileMap.set(source, target);
    const known = knownFiles.get(source);
    media.push({ source, target, sha256: known?.sha256 ?? null, bytes: known?.bytes ?? null });
  };

  for (const record of [...samples.map((s) => s.data), ...orderedObservations.map((o) => o.data)]) {
    for (const [key, value] of Object.entries(record)) {
      if (mediaVarKeys.has(key)) mediaIn(value).forEach(register);
    }
  }

  const deviceIds = new Set<string>([
    ...readings.map((r) => r.deviceId),
    ...sessions.flatMap((s) => s.deviceSnapshot.map((d) => d.deviceId)),
  ]);

  const input: ExportInput = {
    experiment: {
      id: experiment.id,
      projectName: experiment.projectName,
      metadata: experiment.metadata,
      design: experiment.design,
      createdAt: experiment.createdAt,
    },
    protocols: protocols.map((p) => ({
      id: p.id,
      version: p.version,
      title: p.title,
      methodology: p.methodology ?? undefined,
      createdAt: p.createdAt,
      variables: p.variables,
    })),
    samples: samples.map((s) => ({ id: s.id, code: s.code, treatment: s.treatment, replicate: s.replicate, block: s.block, data: s.data, createdAt: s.createdAt })),
    sessions: sessions.map((s) => ({
      id: s.id,
      code: s.code,
      protocolId: s.protocolId,
      operator: s.operator,
      status: s.status,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      notes: s.notes,
      deviceSnapshot: s.deviceSnapshot,
    })),
    observations: orderedObservations.map((o) => ({
        id: o.id,
        sampleId: o.sampleId,
        sessionId: o.sessionId,
        protocolId: o.protocolId,
        data: o.data,
        qc: o.qc,
        location: o.location,
        collectedAt: o.collectedAt,
        source: o.source,
        revision: o.revision,
        supersedesId: o.supersedesId,
        status: o.status,
        retractionReason: o.retractionReason,
        createdBy: o.createdBy,
      })),
    events: events.map((e) => ({
      id: e.id,
      sessionId: e.sessionId,
      occurredAt: e.occurredAt,
      label: e.label,
      kind: e.kind,
      deviceId: e.deviceId,
      data: e.data,
      createdBy: e.createdBy,
      retractedAt: e.retractedAt,
      retractionReason: e.retractionReason,
    })),
    readings: readings.map((r) => ({
      id: r.id,
      sessionId: r.sessionId,
      deviceId: r.deviceId,
      sensorId: r.sensorId,
      value: r.value,
      unit: r.unit,
      qc: r.qc,
      seq: r.seq,
      deviceMs: r.deviceMs,
      deviceUtc: r.deviceUtc,
      receivedAt: r.receivedAt,
    })),
    devices: devices.filter((d) => deviceIds.has(d.id)).map((d) => ({ id: d.id, name: d.name, manifest: d.manifest })),
    audit: audit.map((a) => ({ id: a.id, at: a.at, actor: a.actor, entity: a.entity, entityId: a.entityId, action: a.action, details: a.details })),
    release,
    software,
    fileMap,
  };
  return { input, media };
}
