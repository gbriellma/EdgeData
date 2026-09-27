import { formatChecksumFile, sha256Hex, toBytes, type ChecksumEntry } from './checksums';
import { buildDatapackage, buildMetadata, buildProvenance, buildReadme, dataDictionaryTable, type PackagedResource } from './documents';
import type { ExportInput } from './model';
import { getSerializer, tableToCsv, type DataFormat } from './serializers';
import { buildTables } from './tables';

export interface PackageFile {
  path: string;
  data: string | Uint8Array;
}

export interface MediaFile {
  path: string;
  sha256: string;
  bytes: number;
}

export interface DatasetPackage {
  /** Nome sugerido da pasta/arquivo ZIP */
  name: string;
  files: PackageFile[];
  checksums: ChecksumEntry[];
}

export function packageName(code: string, version: string): string {
  const safe = code.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'dataset';
  return `${safe}-v${version}`;
}

/**
 * Monta todos os arquivos textuais/tabulares do pacote. A mídia (fotos) é copiada
 * pela camada do app, que informa caminho, tamanho e hash em `media`.
 */
export function buildDatasetPackage(
  input: ExportInput,
  formats: readonly DataFormat[],
  media: readonly MediaFile[] = [],
): DatasetPackage {
  if (formats.length === 0) throw new Error('Escolha ao menos um formato de dados');

  const files: PackageFile[] = [];
  const resources: PackagedResource[] = [];

  for (const table of buildTables(input)) {
    for (const format of formats) {
      const serializer = getSerializer(format);
      const data = serializer.serialize(table);
      const bytes = toBytes(data);
      const path = `data/${table.name}.${serializer.extension}`;
      files.push({ path, data });
      resources.push({ table, path, format: serializer.extension, mediatype: serializer.mimeType, bytes: bytes.byteLength, sha256: sha256Hex(bytes) });
    }
  }

  const dictionary = dataDictionaryTable(input);
  files.push({ path: 'data_dictionary.csv', data: tableToCsv(dictionary) });
  files.push({ path: 'metadata.json', data: `${JSON.stringify(buildMetadata(input), null, 2)}\n` });
  files.push({ path: 'datapackage.json', data: `${JSON.stringify(buildDatapackage(input, resources), null, 2)}\n` });
  files.push({ path: 'provenance.json', data: `${JSON.stringify(buildProvenance(input), null, 2)}\n` });
  files.push({ path: 'README.md', data: buildReadme(input, resources, media.length) });

  const checksums: ChecksumEntry[] = [
    ...files.map((file) => {
      const bytes = toBytes(file.data);
      return { path: file.path, sha256: sha256Hex(bytes), bytes: bytes.byteLength };
    }),
    ...media.map((m) => ({ path: m.path, sha256: m.sha256, bytes: m.bytes })),
  ];
  files.push({ path: 'checksums.sha256', data: formatChecksumFile(checksums) });

  return { name: packageName(input.experiment.metadata.code, input.release.version), files, checksums };
}

/** Próxima versão semântica: primeira release 1.0.0; depois incrementa o minor. */
export function nextReleaseVersion(previous: readonly string[]): string {
  const parsed = previous
    .map((v) => /^(\d+)\.(\d+)\.(\d+)$/.exec(v))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => [Number(m[1]), Number(m[2]), Number(m[3])] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const last = parsed.at(-1);
  if (!last) return '1.0.0';
  return `${last[0]}.${last[1] + 1}.0`;
}
