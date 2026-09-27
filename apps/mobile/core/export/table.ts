/** Representação tabular neutra, serializada depois para CSV, JSONL ou Parquet. */

export type ColumnType = 'string' | 'integer' | 'number' | 'boolean' | 'datetime' | 'date' | 'time' | 'json';

export interface Column {
  name: string;
  type: ColumnType;
  title?: string;
  description?: string;
  /** Código UCUM */
  unit?: string;
}

export type Row = Record<string, unknown>;

export interface Table {
  /** Nome do recurso/arquivo, em snake_case (ex.: "observations") */
  name: string;
  title: string;
  description?: string;
  columns: Column[];
  rows: Row[];
}

export function isBlankCell(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (typeof value === 'number' && Number.isNaN(value));
}

/** Converte um valor para o tipo declarado da coluna (ou null). */
export function coerceCell(value: unknown, type: ColumnType): unknown {
  if (isBlankCell(value)) return null;
  switch (type) {
    case 'integer': {
      const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
      return Number.isFinite(n) ? Math.round(n) : null;
    }
    case 'number': {
      const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    }
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value !== 0;
      return ['true', '1', 'sim', 'yes'].includes(String(value).toLowerCase());
    case 'datetime': {
      const date = value instanceof Date ? value : new Date(String(value));
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }
    case 'json':
      return typeof value === 'string' ? value : JSON.stringify(value);
    default:
      return typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}
