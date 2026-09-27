export type FieldType =
  | 'short_text'
  | 'long_text'
  | 'integer'
  | 'decimal'
  | 'category'
  | 'multi_category'
  | 'boolean'
  | 'image'
  | 'multi_image'
  | 'date'
  | 'time'
  | 'scale'
  | 'auto_timestamp'
  | 'auto_gps'
  | 'auto_uuid';

export interface FieldConfig {
  min?: number;
  max?: number;
  decimals?: number;
  unit?: string;
  options?: string[];
  labels?: Record<number, string>;
  source?: 'timestamp' | 'gps' | 'uuid';
  defaultValue?: unknown;
  angles?: Array<{ key: string; label: string }>;
  photoWidth?: number;
  photoHeight?: number;
}

export interface SchemaField {
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  order: number;
  config: FieldConfig;
}

export interface Schema {
  fields: SchemaField[];
}

export interface ProjectParsed {
  id: string;
  name: string;
  description: string | null;
  subjectSchema: Schema;
  collectionSchema: Schema;
  backupConfig: BackupConfig;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BackupConfig {
  auto_every_n: number;
  cloud_enabled: boolean;
}

export interface SubjectParsed {
  id: string;
  projectId: string;
  data: Record<string, unknown>;
  qrGenerated: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionParsed {
  id: string;
  subjectId: string;
  projectId: string;
  data: Record<string, unknown>;
  latitude: number | null;
  longitude: number | null;
  collectedAt: string;
  modifiedAt: string | null;
}

export interface ImageRecord {
  id: string;
  collectionId: string;
  fieldName: string;
  filePath: string;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
}
