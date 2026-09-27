export interface CsvParseResult {
  headers: string[];
  rows: Record<string, string>[];
  delimiter: string;
}

/** Detecta o delimitador pela primeira linha (vírgula, ponto e vírgula ou tab). */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const counts = [',', ';', '\t'].map((d) => ({ d, n: countOutsideQuotes(firstLine, d) }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ',';
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let inQuotes = false;
  let n = 0;
  for (const char of line) {
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && char === delimiter) n += 1;
  }
  return n;
}

/** Parser CSV RFC 4180: aspas, aspas duplicadas e quebras de linha dentro de campos. */
export function parseCsv(input: string, delimiter?: string): CsvParseResult {
  const text = input.replace(/^﻿/, '');
  const sep = delimiter ?? detectDelimiter(text);
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') inQuotes = true;
    else if (char === sep) {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else field += char;
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const nonEmpty = records.filter((r) => r.some((cell) => cell.trim() !== ''));
  if (nonEmpty.length === 0) return { headers: [], rows: [], delimiter: sep };
  const headers = nonEmpty[0].map((h) => h.trim());
  const rows = nonEmpty.slice(1).map((values) => Object.fromEntries(headers.map((h, j) => [h, (values[j] ?? '').trim()])));
  return { headers, rows, delimiter: sep };
}
