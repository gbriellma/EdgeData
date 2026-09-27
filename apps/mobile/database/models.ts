import type { CalibrationMethod, CalibrationPoint } from '@/core/calibration';
import type { DeviceManifest } from '@/core/device/manifest';
import type {
  ExperimentalDesign,
  ExperimentMetadata,
  ExperimentStatus,
  GeoPoint,
  ProtocolVariable,
  QcFlag,
  QcFlags,
  ValueMap,
} from '@/core/types';

/** Entidades como o app as usa (JSON já interpretado, nomes em camelCase). */

export interface Project {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Experiment {
  id: string;
  projectId: string;
  projectName: string;
  studyId: string | null;
  code: string;
  name: string;
  status: ExperimentStatus;
  metadata: ExperimentMetadata;
  design: ExperimentalDesign;
  currentProtocolId: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Protocol {
  id: string;
  experimentId: string;
  version: number;
  title: string;
  methodology: string | null;
  variables: ProtocolVariable[];
  changeNote: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface Sample {
  id: string;
  experimentId: string;
  code: string;
  treatment: string | null;
  replicate: number | null;
  block: number | null;
  data: ValueMap;
  qrGenerated: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceSnapshotEntry {
  deviceId: string;
  name: string;
  manifest: DeviceManifest;
  connected: boolean;
}

export interface Session {
  id: string;
  experimentId: string;
  protocolId: string;
  code: string;
  operator: string | null;
  status: 'open' | 'closed';
  startedAt: string;
  endedAt: string | null;
  tzOffsetMin: number | null;
  deviceSnapshot: DeviceSnapshotEntry[];
  notes: string | null;
  createdAt: string;
}

export type ObservationStatus = 'current' | 'superseded' | 'retracted';

export interface Observation {
  id: string;
  experimentId: string;
  sessionId: string;
  sampleId: string;
  protocolId: string;
  data: ValueMap;
  qc: QcFlags;
  location: GeoPoint | null;
  collectedAt: string;
  tzOffsetMin: number | null;
  source: 'manual' | 'device' | 'import';
  revision: number;
  supersedesId: string | null;
  supersededBy: string | null;
  supersededAt: string | null;
  retractedAt: string | null;
  retractionReason: string | null;
  createdBy: string | null;
  createdAt: string;
  status: ObservationStatus;
}

export interface EventRecord {
  id: string;
  experimentId: string;
  sessionId: string;
  occurredAt: string;
  label: string;
  kind: 'manual' | 'device';
  deviceId: string | null;
  data: unknown;
  createdBy: string | null;
  createdAt: string;
  retractedAt: string | null;
  retractionReason: string | null;
}

export interface FileRecord {
  id: string;
  experimentId: string;
  observationId: string | null;
  sampleId: string | null;
  variableKey: string | null;
  kind: string;
  /** Caminho relativo à pasta de documentos do app */
  path: string;
  mimeType: string | null;
  bytes: number | null;
  sha256: string | null;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface Device {
  id: string;
  name: string;
  transport: string;
  address: string | null;
  manifest: DeviceManifest;
  firstSeenAt: string;
  lastSeenAt: string | null;
}

export interface SensorBinding {
  id: string;
  experimentId: string;
  variableKey: string;
  deviceId: string;
  sensorId: string;
  createdAt: string;
}

export interface Reading {
  id: string;
  experimentId: string;
  sessionId: string;
  deviceId: string;
  sensorId: string;
  value: number | string | null;
  unit: string | null;
  qc: QcFlag;
  seq: number | null;
  deviceMs: number | null;
  deviceUtc: string | null;
  receivedAt: string;
  observationId: string | null;
  /** Valor após a curva de calibração vigente (o bruto fica em `value`) */
  valueCorrected: number | null;
  calibrationId: string | null;
}

export interface DatasetRelease {
  id: string;
  datasetId: string;
  version: string;
  formats: string[];
  checksums: string;
  fileCount: number;
  totalBytes: number;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  entity: string;
  entityId: string;
  action: string;
  details: unknown;
}

export interface Calibration {
  id: string;
  deviceId: string;
  sensorId: string;
  method: CalibrationMethod;
  points: CalibrationPoint[];
  coefficients: number[];
  r2: number | null;
  rmse: number | null;
  unit: string | null;
  referenceInstrument: string | null;
  certificate: string | null;
  validFrom: string;
  validUntil: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
}

export interface QcReview {
  id: string;
  experimentId: string;
  observationId: string;
  variableKey: string;
  flag: QcFlag;
  decision: 'accepted';
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface Draft {
  experimentId: string;
  sessionId: string | null;
  sampleId: string | null;
  data: ValueMap;
  extra: Record<string, unknown>;
  updatedAt: string;
}

export interface ImportRecord {
  id: string;
  experimentId: string;
  sessionId: string;
  fileName: string;
  sha256: string | null;
  rowsTotal: number;
  rowsImported: number;
  mapping: unknown;
  createdBy: string | null;
  createdAt: string;
}
