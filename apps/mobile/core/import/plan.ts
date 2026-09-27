import { normalizeCode } from '../codes';
import type { ProtocolVariable, ValueMap } from '../types';
import { areCompatible, convert, getUnit } from '../units';
import { normalizeValues, validateValues } from '../validation';
import { fieldTypeInfo, slugifyKey } from '../variables';
import { parseDateOnly, parseDateTime, type DateFormat } from './dates';

/** Tabela genérica vinda de CSV ou XLSX: cabeçalho + linhas como texto. */
export interface ImportTable {
  headers: string[];
  rows: string[][];
}

export interface VariableMapping {
  column: string;
  /** Unidade em que a planilha está (convertida para a unidade da variável) */
  unit?: string;
}

export interface ImportMapping {
  sampleColumn: string;
  dateColumn?: string;
  timeColumn?: string;
  dateFormat: DateFormat;
  /** Usado quando não há coluna de data */
  defaultDate?: string;
  tzOffsetMin: number;
  variables: Record<string, VariableMapping>;
}

export interface PlannedRow {
  /** Linha na planilha (1 = cabeçalho) */
  line: number;
  sampleCode: string;
  sampleId: string | null;
  collectedAt: string | null;
  data: ValueMap;
  errors: string[];
  warnings: string[];
}

export interface ImportPlan {
  rows: PlannedRow[];
  valid: PlannedRow[];
  invalid: PlannedRow[];
  unknownSamples: string[];
}

/** Variáveis que podem vir de uma planilha (fotos, GPS e campos automáticos não). */
export function importableVariables(variables: readonly ProtocolVariable[]): ProtocolVariable[] {
  return variables.filter((v) => v.scope === 'observation' && !fieldTypeInfo(v.type).automatic && !['image', 'multi_image', 'gps'].includes(v.type));
}

export function tableFromRecords(records: string[][]): ImportTable {
  const nonEmpty = records.filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  const headers = nonEmpty[0].map((h, i) => String(h ?? '').trim() || `Coluna ${i + 1}`);
  return { headers, rows: nonEmpty.slice(1).map((r) => headers.map((_, i) => String(r[i] ?? '').trim())) };
}

const SAMPLE_HINTS = ['amostra', 'sample', 'codigo', 'code', 'parcela', 'plot', 'id', 'unidade', 'sujeito'];
const DATE_HINTS = ['data_hora', 'datetime', 'collected_at', 'momento', 'data', 'date', 'dia', 'timestamp'];
const TIME_HINTS = ['hora', 'time', 'horario'];

/** Sugere o mapeamento comparando cabeçalhos com IDs e rótulos das variáveis. */
export function suggestMapping(table: ImportTable, variables: readonly ProtocolVariable[], tzOffsetMin: number): Omit<ImportMapping, 'dateFormat'> {
  const slugs = table.headers.map((h) => slugifyKey(h));
  const find = (hints: string[]) => {
    for (const hint of hints) {
      const i = slugs.findIndex((s) => s === hint);
      if (i >= 0) return table.headers[i];
    }
    for (const hint of hints) {
      const i = slugs.findIndex((s) => s.startsWith(hint) || s.endsWith(`_${hint}`));
      if (i >= 0) return table.headers[i];
    }
    return undefined;
  };
  const sampleColumn = find(SAMPLE_HINTS) ?? table.headers[0] ?? '';
  const dateColumn = find(DATE_HINTS);
  const timeColumn = find(TIME_HINTS);
  const used = new Set([sampleColumn, dateColumn, timeColumn].filter(Boolean));
  const mapped: Record<string, VariableMapping> = {};
  for (const variable of importableVariables(variables)) {
    const candidates = [variable.key, slugifyKey(variable.label)];
    const index = slugs.findIndex((s, i) => !used.has(table.headers[i]) && candidates.some((c) => s === c || s.startsWith(`${c}_`)));
    if (index >= 0) {
      mapped[variable.key] = { column: table.headers[index], unit: unitFromHeader(table.headers[index]) ?? variable.unit };
      used.add(table.headers[index]);
    }
  }
  return { sampleColumn, dateColumn, timeColumn: timeColumn !== dateColumn ? timeColumn : undefined, tzOffsetMin, variables: mapped };
}

/** Extrai a unidade escrita no cabeçalho: "altura (mm)" ou "altura_mm". */
export function unitFromHeader(header: string): string | undefined {
  const inParens = /[([]\s*([^)\]]+?)\s*[)\]]\s*$/.exec(header)?.[1];
  if (inParens && getUnit(inParens)) return getUnit(inParens)!.code;
  const suffix = /_([a-zA-Z%°]+)$/.exec(header.trim())?.[1];
  if (suffix && getUnit(suffix)) return getUnit(suffix)!.code;
  return undefined;
}

/** Número em formato brasileiro ou internacional: "1.234,5", "1,234.5", "12,5", "12.5". */
export function parseLocaleNumber(text: string): number | null {
  let t = text.trim().replace(/\s/g, '');
  if (!t) return null;
  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    t = lastComma > lastDot ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (lastComma >= 0) {
    t = (t.match(/,/g) ?? []).length > 1 ? t.replace(/,/g, '') : t.replace(',', '.');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const TRUE_WORDS = new Set(['sim', 's', 'yes', 'y', 'true', 'verdadeiro', 'v', '1', 'x']);
const FALSE_WORDS = new Set(['nao', 'não', 'n', 'no', 'false', 'falso', 'f', '0']);

function convertCell(variable: ProtocolVariable, text: string, mapping: VariableMapping, dateFormat: DateFormat): { value?: unknown; error?: string } {
  if (text === '') return {};
  switch (variable.type) {
    case 'integer':
    case 'decimal':
    case 'scale': {
      let n = parseLocaleNumber(text);
      if (n === null) return { error: `${variable.label}: "${text}" não é número` };
      if (mapping.unit && variable.unit && mapping.unit !== variable.unit) {
        if (!areCompatible(mapping.unit, variable.unit)) return { error: `${variable.label}: unidade ${mapping.unit} incompatível com ${variable.unit}` };
        n = convert(n, mapping.unit, variable.unit);
      }
      if (variable.type !== 'decimal' && Math.abs(n - Math.round(n)) < 1e-9) n = Math.round(n);
      return { value: n };
    }
    case 'boolean': {
      const word = text.toLowerCase();
      if (TRUE_WORDS.has(word)) return { value: true };
      if (FALSE_WORDS.has(word)) return { value: false };
      return { error: `${variable.label}: "${text}" não é sim/não` };
    }
    case 'category': {
      const option = variable.config.options?.find((o) => o.toLowerCase() === text.toLowerCase());
      if (variable.config.options && !option) return { error: `${variable.label}: "${text}" não está entre as opções` };
      return { value: option ?? text };
    }
    case 'multi_category': {
      const items = text.split(/[;|]/).map((t) => t.trim()).filter(Boolean);
      const resolved = items.map((i) => variable.config.options?.find((o) => o.toLowerCase() === i.toLowerCase()) ?? i);
      return { value: resolved };
    }
    case 'date': {
      const date = parseDateOnly(text, dateFormat);
      return date ? { value: date } : { error: `${variable.label}: data "${text}" inválida` };
    }
    case 'time': {
      const m = /^(\d{1,2}):(\d{2})/.exec(text);
      return m ? { value: `${m[1].padStart(2, '0')}:${m[2]}` } : { error: `${variable.label}: hora "${text}" inválida` };
    }
    default:
      return { value: text };
  }
}

/**
 * Valida cada linha contra as amostras e o protocolo, sem gravar nada: o
 * assistente mostra o resultado e só importa as linhas válidas.
 */
export function buildImportPlan(
  table: ImportTable,
  mapping: ImportMapping,
  variables: readonly ProtocolVariable[],
  samples: readonly { id: string; code: string }[],
): ImportPlan {
  const col = (name?: string) => (name ? table.headers.indexOf(name) : -1);
  const sampleIdx = col(mapping.sampleColumn);
  const dateIdx = col(mapping.dateColumn);
  const timeIdx = col(mapping.timeColumn);
  const byCode = new Map(samples.map((s) => [normalizeCode(s.code), s.id]));
  const obsVars = variables.filter((v) => v.scope === 'observation');
  const mapped = importableVariables(variables).filter((v) => mapping.variables[v.key] && col(mapping.variables[v.key].column) >= 0);
  const unknown = new Set<string>();
  const seen = new Set<string>();

  const rows = table.rows.map((cells, i): PlannedRow => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const sampleCode = sampleIdx >= 0 ? cells[sampleIdx] ?? '' : '';
    const sampleId = sampleCode ? byCode.get(normalizeCode(sampleCode)) ?? null : null;
    if (!sampleCode) errors.push('Sem código de amostra');
    else if (!sampleId) {
      errors.push(`Amostra ${sampleCode} não existe no experimento`);
      unknown.add(sampleCode);
    }

    let collectedAt: string | null = null;
    if (dateIdx >= 0) {
      collectedAt = parseDateTime(cells[dateIdx] ?? '', mapping.dateFormat, mapping.tzOffsetMin, timeIdx >= 0 ? cells[timeIdx] : undefined);
      if (!collectedAt) errors.push(`Data "${cells[dateIdx] ?? ''}" inválida para o formato escolhido`);
    } else if (mapping.defaultDate) collectedAt = mapping.defaultDate;
    else errors.push('Informe a coluna de data ou uma data padrão');

    const raw: ValueMap = {};
    for (const variable of mapped) {
      const m = mapping.variables[variable.key];
      const result = convertCell(variable, cells[col(m.column)] ?? '', m, mapping.dateFormat);
      if (result.error) errors.push(result.error);
      else if (result.value !== undefined) raw[variable.key] = result.value;
    }
    const data = normalizeValues(obsVars, raw);
    if (errors.length === 0) errors.push(...validateValues(obsVars, data).map((e) => e.message));

    if (sampleId && collectedAt) {
      const key = `${sampleId}|${collectedAt}`;
      if (seen.has(key)) warnings.push('Mesma amostra e horário de outra linha');
      seen.add(key);
    }
    if (collectedAt && collectedAt > new Date(Date.now() + 86_400_000).toISOString()) warnings.push('Data no futuro');
    return { line: i + 2, sampleCode, sampleId, collectedAt, data, errors, warnings };
  });

  return {
    rows,
    valid: rows.filter((r) => r.errors.length === 0),
    invalid: rows.filter((r) => r.errors.length > 0),
    unknownSamples: [...unknown],
  };
}
