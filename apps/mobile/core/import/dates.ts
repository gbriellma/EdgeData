/** Datas de planilhas: ISO, dia/mês/ano, mês/dia/ano e número de série do Excel. */

export type DateFormat = 'iso' | 'dmy' | 'mdy' | 'excel';

export const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  iso: 'AAAA-MM-DD (ISO)',
  dmy: 'DD/MM/AAAA',
  mdy: 'MM/DD/AAAA',
  excel: 'Número de série do Excel',
};

const DMY_RE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

// Excel conta dias desde 30/12/1899 (compensando o 29/02/1900 inexistente)
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

interface Parts {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
  ss: number;
  /** Deslocamento explícito em minutos (ISO com fuso); se ausente, usa o local */
  offsetMin?: number;
}

function valid(p: Parts): boolean {
  if (p.m < 1 || p.m > 12 || p.d < 1 || p.d > 31 || p.hh > 23 || p.mm > 59 || p.ss > 59) return false;
  const probe = new Date(Date.UTC(p.y, p.m - 1, p.d));
  return probe.getUTCMonth() === p.m - 1 && probe.getUTCDate() === p.d;
}

function parseParts(value: string, format: DateFormat): Parts | null {
  const text = value.trim();
  if (!text) return null;
  if (format === 'excel') {
    const serial = Number(text.replace(',', '.'));
    if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
    const date = new Date(EXCEL_EPOCH_MS + Math.round(serial * 86_400_000));
    return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate(), hh: date.getUTCHours(), mm: date.getUTCMinutes(), ss: date.getUTCSeconds() };
  }
  if (format === 'iso') {
    const m = ISO_RE.exec(text);
    if (!m) return null;
    let offsetMin: number | undefined;
    if (m[7]) {
      if (m[7] === 'Z') offsetMin = 0;
      else {
        const sign = m[7][0] === '-' ? -1 : 1;
        const digits = m[7].slice(1).replace(':', '');
        offsetMin = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2)));
      }
    }
    return { y: +m[1], m: +m[2], d: +m[3], hh: +(m[4] ?? 0), mm: +(m[5] ?? 0), ss: +(m[6] ?? 0), offsetMin };
  }
  const m = DMY_RE.exec(text);
  if (!m) return null;
  let year = +m[3];
  if (m[3].length === 2) year += year < 70 ? 2000 : 1900;
  const [d, mo] = format === 'dmy' ? [+m[1], +m[2]] : [+m[2], +m[1]];
  return { y: year, m: mo, d, hh: +(m[4] ?? 0), mm: +(m[5] ?? 0), ss: +(m[6] ?? 0) };
}

/**
 * Converte o texto da planilha em instante UTC (ISO). Horários sem fuso são
 * interpretados no fuso local informado (minutos em relação ao UTC; Recife = -180).
 * `time` é uma coluna de hora separada, opcional.
 */
export function parseDateTime(value: string, format: DateFormat, tzOffsetMin: number, time?: string): string | null {
  const parts = parseParts(value, format);
  if (!parts || !valid(parts)) return null;
  if (time && time.trim()) {
    const t = TIME_RE.exec(time.trim());
    if (t) {
      parts.hh = +t[1];
      parts.mm = +t[2];
      parts.ss = +(t[3] ?? 0);
    } else if (format !== 'excel' || !Number.isFinite(Number(time))) return null;
    else {
      const seconds = Math.round((Number(time) % 1) * 86_400);
      parts.hh = Math.floor(seconds / 3600);
      parts.mm = Math.floor((seconds % 3600) / 60);
      parts.ss = seconds % 60;
    }
    if (!valid(parts)) return null;
  }
  const offset = parts.offsetMin ?? tzOffsetMin;
  const utc = Date.UTC(parts.y, parts.m - 1, parts.d, parts.hh, parts.mm, parts.ss) - offset * 60_000;
  return new Date(utc).toISOString();
}

/** Converte para data simples AAAA-MM-DD (variáveis do tipo data). */
export function parseDateOnly(value: string, format: DateFormat): string | null {
  const parts = parseParts(value, format);
  if (!parts || !valid(parts)) return null;
  return `${String(parts.y).padStart(4, '0')}-${String(parts.m).padStart(2, '0')}-${String(parts.d).padStart(2, '0')}`;
}

/**
 * Sugere o formato olhando os valores: números grandes → Excel; AAAA-MM-DD → ISO;
 * com barras, decide pelo primeiro campo > 12 (dia) ou segundo > 12 (mês/dia).
 */
export function inferDateFormat(values: readonly string[]): DateFormat {
  const sample = values.map((v) => v.trim()).filter(Boolean).slice(0, 200);
  if (sample.length === 0) return 'dmy';
  if (sample.every((v) => /^\d+([.,]\d+)?$/.test(v) && Number(v.replace(',', '.')) > 59)) return 'excel';
  if (sample.every((v) => ISO_RE.test(v))) return 'iso';
  let firstBig = 0;
  let secondBig = 0;
  for (const v of sample) {
    const m = DMY_RE.exec(v);
    if (!m) continue;
    if (+m[1] > 12) firstBig += 1;
    if (+m[2] > 12) secondBig += 1;
  }
  return secondBig > firstBig ? 'mdy' : 'dmy';
}
