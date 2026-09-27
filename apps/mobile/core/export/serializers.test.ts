import { parquetReadObjects } from 'hyparquet';
import { describe, expect, it } from 'vitest';
import { getSerializer, listSerializers, tableToCsv, tableToJsonl, tableToParquet } from './serializers';
import type { Table } from './table';

const table: Table = {
  name: 'observations',
  title: 'Observações',
  columns: [
    { name: 'observation_id', type: 'string' },
    { name: 'collected_at', type: 'datetime' },
    { name: 'altura', type: 'number', unit: 'cm' },
    { name: 'folhas', type: 'integer' },
    { name: 'irrigado', type: 'boolean' },
    { name: 'sintomas', type: 'json' },
    { name: 'obs', type: 'string' },
  ],
  rows: [
    { observation_id: 'a', collected_at: '2026-02-15T10:00:00.000Z', altura: 18.5, folhas: 6, irrigado: true, sintomas: ['Clorose', 'Murcha'], obs: 'Folha com "mancha", borda' },
    { observation_id: 'b', collected_at: '2026-02-15T10:05:00.000Z', altura: '17,2', folhas: null, irrigado: false, sintomas: [], obs: '' },
  ],
};

describe('CSV', () => {
  it('escapa aspas, vírgulas e mantém tipos', () => {
    const csv = tableToCsv(table);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe('observation_id,collected_at,altura,folhas,irrigado,sintomas,obs');
    expect(lines[1]).toBe('a,2026-02-15T10:00:00.000Z,18.5,6,true,Clorose; Murcha,"Folha com ""mancha"", borda"');
    expect(lines[2]).toBe('b,2026-02-15T10:05:00.000Z,17.2,,false,,');
  });

  it('adiciona BOM quando pedido', () => {
    expect(tableToCsv(table, { bom: true }).startsWith('﻿')).toBe(true);
  });
});

describe('JSON Lines', () => {
  it('preserva estruturas e nulos', () => {
    const [first, second] = tableToJsonl(table).trimEnd().split('\n').map((l) => JSON.parse(l));
    expect(first.sintomas).toEqual(['Clorose', 'Murcha']);
    expect(second).toMatchObject({ altura: 17.2, folhas: null, obs: null });
  });
});

describe('Parquet', () => {
  it('ida e volta com hyparquet', async () => {
    const bytes = tableToParquet(table);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('PAR1');
    const rows = await parquetReadObjects({ file: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer });
    expect(rows).toHaveLength(2);
    expect(rows[0].altura).toBe(18.5);
    expect(rows[0].folhas).toBe(6);
    expect(rows[1].folhas).toBeNull();
    expect(rows[0].irrigado).toBe(true);
    expect(new Date(rows[0].collected_at as Date).toISOString()).toBe('2026-02-15T10:00:00.000Z');
    expect(rows[0].sintomas).toEqual(['Clorose', 'Murcha']);
  });

  it('tabela vazia ainda gera arquivo válido', () => {
    const bytes = tableToParquet({ ...table, rows: [] });
    expect(bytes.byteLength).toBeGreaterThan(8);
  });
});

describe('registro de formatos', () => {
  it('tem CSV, JSONL e Parquet', () => {
    expect(listSerializers().map((s) => s.format)).toEqual(['csv', 'jsonl', 'parquet']);
    expect(getSerializer('parquet').extension).toBe('parquet');
  });
});
