import JSZip from 'jszip';

/**
 * Leitor mínimo de planilhas .xlsx (Office Open XML), suficiente para importar
 * tabelas: primeira linha como cabeçalho, textos, números e booleanos. Datas
 * chegam como número de série do Excel (o assistente oferece esse formato).
 */

export interface SheetData {
  name: string;
  rows: string[][];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e];
  });
}

/** Junta todos os <t> de um trecho (texto simples ou rico). */
function textOf(xml: string): string {
  let out = '';
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out += decodeXml(m[1] ?? '');
  return out;
}

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

function resolvePath(target: string): string {
  const clean = target.replace(/^\//, '');
  return clean.startsWith('xl/') ? clean : `xl/${clean}`;
}

export async function readXlsx(data: Uint8Array | ArrayBuffer | string, options: { base64?: boolean } = {}): Promise<SheetData[]> {
  const zip = await JSZip.loadAsync(data, { base64: options.base64 });
  const read = async (path: string) => (await zip.file(path)?.async('string')) ?? null;

  const workbook = await read('xl/workbook.xml');
  if (!workbook) throw new Error('Arquivo não parece ser uma planilha .xlsx');
  const rels = (await read('xl/_rels/workbook.xml.rels')) ?? '';
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], 'Id');
    const target = attr(m[0], 'Target');
    if (id && target) targets.set(id, resolvePath(target));
  }

  const shared: string[] = [];
  const sst = await read('xl/sharedStrings.xml');
  if (sst) for (const m of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));

  const sheets: SheetData[] = [];
  for (const m of workbook.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const name = decodeXml(attr(m[0], 'name') ?? `Planilha ${sheets.length + 1}`);
    const relId = attr(m[0], 'r:id');
    const path = (relId && targets.get(relId)) ?? `xl/worksheets/sheet${sheets.length + 1}.xml`;
    const xml = await read(path);
    if (!xml) continue;
    const rows: string[][] = [];
    for (const rowMatch of xml.matchAll(/<row\b[^>]*\/>|<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const rowNumber = Number(attr(rowMatch[1] !== undefined ? `<row${rowMatch[1]}>` : rowMatch[0], 'r')) || rows.length + 1;
      const cells: string[] = [];
      for (const c of (rowMatch[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const tag = `<c${c[1]}>`;
        const ref = attr(tag, 'r');
        const type = attr(tag, 't');
        const body = c[2] ?? '';
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        let value = '';
        if (type === 's') value = shared[Number(v)] ?? '';
        else if (type === 'inlineStr') value = textOf(body);
        else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
        else if (type === 'str' || type === 'e') value = decodeXml(v ?? '');
        else value = v ?? '';
        const index = ref ? columnIndex(ref) : cells.length;
        while (cells.length < index) cells.push('');
        cells[index] = value;
      }
      while (rows.length < rowNumber - 1) rows.push([]);
      rows[rowNumber - 1] = cells;
    }
    sheets.push({ name, rows });
  }
  return sheets;
}
