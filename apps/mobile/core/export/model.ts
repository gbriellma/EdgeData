import type { DeviceManifest } from '../device/manifest';
import type {
  ExperimentalDesign,
  ExperimentMetadata,
  GeoPoint,
  QcFlag,
  QcFlags,
  ProtocolVariable,
  ValueMap,
} from '../types';

/** Dados já carregados do banco, prontos para virar um pacote de dataset. */

export interface ExportProtocol {
  id: string;
  version: number;
  title: string;
  methodology?: string;
  createdAt: string;
  variables: ProtocolVariable[];
}

export interface ExportSample {
  id: string;
  code: string;
  treatment?: string | null;
  replicate?: number | null;
  block?: number | null;
  data: ValueMap;
  createdAt: string;
}

export interface ExportSession {
  id: string;
  code: string;
  protocolId: string;
  operator?: string | null;
  status: string;
  startedAt: string;
  endedAt?: string | null;
  notes?: string | null;
  deviceSnapshot?: unknown;
}

export type ObservationStatus = 'current' | 'superseded' | 'retracted';

export interface ExportObservation {
  id: string;
  sampleId: string;
  sessionId: string;
  protocolId: string;
  data: ValueMap;
  qc: QcFlags;
  location?: GeoPoint | null;
  collectedAt: string;
  source: 'manual' | 'device' | 'import';
  revision: number;
  supersedesId?: string | null;
  status: ObservationStatus;
  retractionReason?: string | null;
  createdBy?: string | null;
}

export interface ExportEvent {
  id: string;
  sessionId: string;
  occurredAt: string;
  label: string;
  kind: 'manual' | 'device';
  deviceId?: string | null;
  data?: unknown;
  createdBy?: string | null;
  retractedAt?: string | null;
  retractionReason?: string | null;
}

export interface ExportReading {
  id: string;
  sessionId: string;
  deviceId: string;
  sensorId: string;
  value: number | string | boolean | null;
  unit?: string | null;
  qc: QcFlag;
  seq?: number | null;
  deviceMs?: number | null;
  deviceUtc?: string | null;
  receivedAt: string;
  /** Valor corrigido pela calibração vigente na leitura (o bruto fica em `value`) */
  valueCorrected?: number | null;
  calibrationId?: string | null;
}

export interface ExportCalibration {
  id: string;
  deviceId: string;
  sensorId: string;
  method: string;
  points: { raw: number; reference: number; note?: string }[];
  coefficients: number[];
  r2: number | null;
  rmse: number | null;
  unit: string | null;
  referenceInstrument: string | null;
  certificate: string | null;
  validFrom: string;
  validUntil: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface ExportQcReview {
  id: string;
  observationId: string;
  variableKey: string;
  flag: QcFlag;
  decision: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface ExportImport {
  id: string;
  sessionId: string;
  fileName: string;
  sha256: string | null;
  rowsTotal: number;
  rowsImported: number;
  mapping: unknown;
  createdBy: string | null;
  createdAt: string;
}

export interface ExportDevice {
  id: string;
  name: string;
  manifest: DeviceManifest;
}

export interface ExportAuditEntry {
  id: string;
  at: string;
  actor: string;
  entity: string;
  entityId: string;
  action: string;
  details?: unknown;
}

export interface ExportInput {
  experiment: {
    id: string;
    projectName?: string;
    metadata: ExperimentMetadata;
    design: ExperimentalDesign;
    createdAt: string;
  };
  protocols: ExportProtocol[];
  samples: ExportSample[];
  sessions: ExportSession[];
  observations: ExportObservation[];
  events: ExportEvent[];
  readings: ExportReading[];
  devices: ExportDevice[];
  audit: ExportAuditEntry[];
  calibrations?: ExportCalibration[];
  qcReviews?: ExportQcReview[];
  imports?: ExportImport[];
  release: {
    version: string;
    createdAt: string;
    createdBy?: string;
    notes?: string;
  };
  software: { name: string; version: string };
  /** Mapa URI local da mídia → caminho relativo dentro do pacote (ex.: files/foto.jpg) */
  fileMap: Map<string, string>;
}
