import { parquetWriteBuffer } from 'hyparquet-writer';
import { coerceCell, isBlankCell, type ColumnType, type Table } from './table';

export type DataFormat = 'csv' | 'jsonl' | 'parquet';

export interface Serializer {
  format: DataFormat;
  label: string;
  extension: string;
  mimeType: string;
  description: string;
  serialize(table: Table): string | Uint8Array;
}

// ── CSV (RFC 4180) ───────────────────────────────────────────────────────────

function csvCell(value: unknown, type: ColumnType): string {
  if (isBlankCell(value)) return '';
  let text: string;
  if (type === 'json' && Array.isArray(value) && value.every((v) => typeof v !== 'object' || v === null)) {
    text = value.join('; ');
  } else {
    const coerced = coerceCell(value, type);
    if (coerced === null) return '';
    text = String(coerced);
  }
  return /[",\r\n]/.test(text) || /^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function tableToCsv(table: Table, options: { bom?: boolean } = {}): string {
  const header = table.columns.map((c) => csvCell(c.name, 'string')).join(',');
  const lines = table.rows.map((row) => table.columns.map((c) => csvCell(row[c.name], c.type)).join(','));
  return `${options.bom ? '﻿' : ''}${[header, ...lines].join('\r\n')}\r\n`;
}

// ── JSON Lines ───────────────────────────────────────────────────────────────

export function tableToJsonl(table: Table): string {
  return table.rows
    .map((row) => {
      const record: Record<string, unknown> = {};
      for (const column of table.columns) {
        const value = row[column.name];
        // Em JSON, estruturas continuam estruturas (não viram texto)
        record[column.name] =
          column.type === 'json' ? (isBlankCell(value) ? null : typeof value === 'string' ? safeParse(value) : value) : coerceCell(value, column.type);
      }
      return JSON.stringify(record);
    })
    .map((line) => `${line}\n`)
    .join('');
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ── Parquet ──────────────────────────────────────────────────────────────────

const INT32_MIN = -(2 ** 31);
const INT32_MAX = 2 ** 31 - 1;

export function tableToParquet(table: Table): Uint8Array {
  const columnData = table.columns.map((column) => {
    if (column.type === 'json') {
      // o writer serializa o JSON; passamos a estrutura, não o texto
      const data = table.rows.map((row) => {
        const value = row[column.name];
        if (isBlankCell(value)) return null;
        return typeof value === 'string' ? safeParse(value) : value;
      });
      return { name: column.name, data, type: 'JSON' as const };
    }
    const values = table.rows.map((row) => coerceCell(row[column.name], column.type));
    switch (column.type) {
      case 'integer': {
        const fitsInt32 = values.every((v) => v === null || ((v as number) >= INT32_MIN && (v as number) <= INT32_MAX));
        return fitsInt32
          ? { name: column.name, data: values, type: 'INT32' as const }
          : { name: column.name, data: values, type: 'DOUBLE' as const };
      }
      case 'number':
        return { name: column.name, data: values, type: 'DOUBLE' as const };
      case 'boolean':
        return { name: column.name, data: values, type: 'BOOLEAN' as const };
      case 'datetime':
        return { name: column.name, data: values.map((v) => (v === null ? null : new Date(v as string))), type: 'TIMESTAMP' as const };
      default:
        return { name: column.name, data: values, type: 'STRING' as const };
    }
  });
  const buffer = parquetWriteBuffer({ columnData });
  return new Uint8Array(buffer);
}

// ── Registro de formatos (exportadores plugáveis) ────────────────────────────

const registry = new Map<DataFormat, Serializer>();

export function registerSerializer(serializer: Serializer): void {
  registry.set(serializer.format, serializer);
}

export function getSerializer(format: DataFormat): Serializer {
  const serializer = registry.get(format);
  if (!serializer) throw new Error(`Formato de exportação não registrado: ${format}`);
  return serializer;
}

export function listSerializers(): Serializer[] {
  return [...registry.values()];
}

registerSerializer({
  format: 'csv',
  label: 'CSV',
  extension: 'csv',
  mimeType: 'text/csv',
  description: 'Planilhas, R, Python — universal',
  serialize: (table) => tableToCsv(table),
});

registerSerializer({
  format: 'jsonl',
  label: 'JSON Lines',
  extension: 'jsonl',
  mimeType: 'application/x-ndjson',
  description: 'Um registro JSON por linha; preserva estruturas',
  serialize: tableToJsonl,
});

registerSerializer({
  format: 'parquet',
  label: 'Parquet',
  extension: 'parquet',
  mimeType: 'application/vnd.apache.parquet',
  description: 'Colunar e tipado — pandas, Polars, DuckDB, Spark',
  serialize: tableToParquet,
});
