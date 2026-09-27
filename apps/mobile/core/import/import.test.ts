import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { BUILTIN_TEMPLATES } from '../templates';
import { inferDateFormat, parseDateOnly, parseDateTime } from './dates';
import { buildImportPlan, parseLocaleNumber, suggestMapping, tableFromRecords, unitFromHeader } from './plan';
import { readXlsx } from './xlsx';

const variables = BUILTIN_TEMPLATES.find((t) => t.id === 'agro-crescimento')!.variables;
const RECIFE = -180;

describe('datas de planilha', () => {
  it('interpreta formatos comuns no fuso local', () => {
    expect(parseDateTime('01/03/2025', 'dmy', RECIFE)).toBe('2025-03-01T03:00:00.000Z');
    expect(parseDateTime('01/03/2025 14:30', 'dmy', RECIFE)).toBe('2025-03-01T17:30:00.000Z');
    expect(parseDateTime('03/01/2025', 'mdy', RECIFE, '14:30')).toBe('2025-03-01T17:30:00.000Z');
    expect(parseDateTime('2025-03-01T14:30:00Z', 'iso', RECIFE)).toBe('2025-03-01T14:30:00.000Z');
    expect(parseDateTime('45717.5', 'excel', 0)).toBe('2025-03-01T12:00:00.000Z');
    expect(parseDateTime('31/02/2025', 'dmy', RECIFE)).toBeNull();
    expect(parseDateOnly('5/3/25', 'dmy')).toBe('2025-03-05');
  });

  it('sugere o formato', () => {
    expect(inferDateFormat(['01/03/2025', '25/03/2025'])).toBe('dmy');
    expect(inferDateFormat(['03/25/2025'])).toBe('mdy');
    expect(inferDateFormat(['2025-03-01'])).toBe('iso');
    expect(inferDateFormat(['45717', '45718'])).toBe('excel');
  });
});

describe('números e unidades', () => {
  it('lê números em formato brasileiro e internacional', () => {
    expect(parseLocaleNumber('1.234,5')).toBe(1234.5);
    expect(parseLocaleNumber('1,234.5')).toBe(1234.5);
    expect(parseLocaleNumber('12,5')).toBe(12.5);
    expect(parseLocaleNumber('abc')).toBeNull();
  });

  it('reconhece unidade no cabeçalho', () => {
    expect(unitFromHeader('Altura (mm)')).toBe('mm');
    expect(unitFromHeader('altura_cm')).toBe('cm');
    expect(unitFromHeader('Altura')).toBeUndefined();
  });
});

describe('plano de importação', () => {
  const table = tableFromRecords([
    ['Parcela', 'Data', 'Altura (mm)', 'Número de folhas', 'Estádio'],
    ['T1_R1', '01/03/2025', '152,0', '6', 'vegetativo'],
    ['T1_R2', '01/03/2025', '', '7', 'Vegetativo'],
    ['X9', '01/03/2025', '100', '5', ''],
    ['T1_R1', '32/03/2025', '100', '5', 'Floração'],
    ['T1_R1', '08/03/2025', '180', '5', 'Maturando'],
  ]);
  const samples = [{ id: 's1', code: 'T1_R1' }, { id: 's2', code: 'T1_R2' }];

  it('sugere colunas pelos nomes', () => {
    const m = suggestMapping(table, variables, RECIFE);
    expect(m.sampleColumn).toBe('Parcela');
    expect(m.dateColumn).toBe('Data');
    expect(m.variables.altura).toEqual({ column: 'Altura (mm)', unit: 'mm' });
    expect(m.variables.numero_folhas?.column).toBe('Número de folhas');
    expect(m.variables.estadio?.column).toBe('Estádio');
  });

  it('valida linhas, converte unidade e aponta erros', () => {
    const plan = buildImportPlan(table, { ...suggestMapping(table, variables, RECIFE), dateFormat: 'dmy' }, variables, samples);
    expect(plan.valid.map((r) => r.line)).toEqual([2]);
    expect(plan.valid[0].data).toMatchObject({ altura: 15.2, numero_folhas: 6, estadio: 'Vegetativo' });
    expect(plan.valid[0].collectedAt).toBe('2025-03-01T03:00:00.000Z');
    const errors = Object.fromEntries(plan.invalid.map((r) => [r.line, r.errors.join(' | ')]));
    expect(errors[3]).toMatch(/obrigatório/);
    expect(errors[4]).toMatch(/X9 não existe/);
    expect(errors[5]).toMatch(/Data/);
    expect(errors[6]).toMatch(/não está entre as opções/);
    expect(plan.unknownSamples).toEqual(['X9']);
  });
});

describe('leitor de .xlsx', () => {
  it('lê textos compartilhados, números, booleanos e células vazias', async () => {
    const zip = new JSZip();
    zip.file('xl/workbook.xml', '<workbook><sheets><sheet name="Medições &amp; notas" sheetId="1" r:id="rId1"/></sheets></workbook>');
    zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
    zip.file('xl/sharedStrings.xml', '<sst><si><t>Amostra</t></si><si><t>Altura</t></si><si><r><t>T1</t></r><r><t>_R1</t></r></si></sst>');
    zip.file(
      'xl/worksheets/sheet1.xml',
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>ok</t></is></c></row>' +
        '<row r="2"/><row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3"><v>12.5</v></c><c r="C3" t="b"><v>1</v></c></row></sheetData></worksheet>',
    );
    const sheets = await readXlsx(await zip.generateAsync({ type: 'uint8array' }));
    expect(sheets[0].name).toBe('Medições & notas');
    expect(sheets[0].rows).toEqual([['Amostra', 'Altura', '', 'ok'], [], ['T1_R1', '12.5', 'TRUE']]);
    expect(tableFromRecords(sheets[0].rows)).toEqual({ headers: ['Amostra', 'Altura', 'Coluna 3', 'ok'], rows: [['T1_R1', '12.5', 'TRUE', '']] });
  });
});
