import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { parseCsv } from '@/core/csv';
import { base64ToBytes, sha256Hex } from '@/core/export/checksums';
import { Utf8StreamDecoder } from '@/core/device/utf8';
import { readXlsx, type SheetData } from '@/core/import/xlsx';

export interface PickedSpreadsheet {
  fileName: string;
  sha256: string;
  sheets: SheetData[];
}

const XLSX_TYPES = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
const CSV_TYPES = ['text/csv', 'text/comma-separated-values', 'text/tab-separated-values', 'text/plain'];

/** Abre um CSV/TSV ou .xlsx e devolve as planilhas como texto, com o SHA-256 do arquivo. */
export async function pickSpreadsheet(): Promise<PickedSpreadsheet | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: [...XLSX_TYPES, ...CSV_TYPES, '*/*'], copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  const bytes = base64ToBytes(base64);
  const sha256 = sha256Hex(bytes);
  const name = asset.name ?? 'planilha';
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK": .xlsx é um zip
  if (!isZip && /\.xls$/i.test(name)) throw new Error('Arquivos .xls antigos não são suportados. Salve como .xlsx ou CSV.');
  if (isZip || /\.xlsx$/i.test(name)) {
    return { fileName: name, sha256, sheets: await readXlsx(bytes) };
  }
  const text = new Utf8StreamDecoder().decode(bytes);
  const parsed = parseCsv(text);
  const rows = [parsed.headers, ...parsed.rows.map((r) => parsed.headers.map((h) => r[h] ?? ''))];
  return { fileName: name, sha256, sheets: [{ name, rows }] };
}
