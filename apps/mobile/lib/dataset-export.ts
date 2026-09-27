import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { bytesToBase64 } from '@/core/export/checksums';
import { buildDatasetPackage, nextReleaseVersion, type MediaFile } from '@/core/export/package';
import type { DataFormat } from '@/core/export/serializers';
import { getDb } from '@/database/connection';
import { nowIso } from '@/database/db';
import { loadExportInput } from '@/database/export-input';
import { ensureDataset, listReleases, recordRelease } from '@/database/repo/devices';
import { hashFile, resolveMediaUri } from './media';

export interface ExportOptions {
  formats: DataFormat[];
  includeMedia: boolean;
  notes?: string;
  actor: string;
}

export interface ExportResult {
  zipPath: string;
  version: string;
  fileCount: number;
  totalBytes: number;
  missingMedia: string[];
}

type Progress = (label: string, fraction: number) => void;

function nativeZip(): { zip: (source: string, target: string) => Promise<string> } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-zip-archive');
  } catch {
    return null;
  }
}

async function writeFile(root: string, path: string, data: string | Uint8Array): Promise<void> {
  const full = `${root}${path}`;
  const dir = full.slice(0, full.lastIndexOf('/') + 1);
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  if (typeof data === 'string') await FileSystem.writeAsStringAsync(full, data);
  else await FileSystem.writeAsStringAsync(full, bytesToBase64(data), { encoding: FileSystem.EncodingType.Base64 });
}

/**
 * Gera o pacote do dataset (dados, documentação, mídia e checksums), compacta em
 * ZIP e registra a release. Cada exportação recebe uma nova versão semântica.
 */
export async function exportDataset(experimentId: string, options: ExportOptions, onProgress: Progress = () => {}): Promise<ExportResult> {
  const db = await getDb();
  const previous = await listReleases(db, experimentId);
  const version = nextReleaseVersion(previous.map((r) => r.version));
  const createdAt = nowIso();

  onProgress('Lendo dados…', 0.05);
  const { input, media } = await loadExportInput(
    db,
    experimentId,
    { version, createdAt, createdBy: options.actor, notes: options.notes },
    { name: 'EdgeData', version: Constants.expoConfig?.version ?? '0.0.0' },
  );

  // Mídia: confere existência e hash (usa o SHA-256 registrado na coleta quando houver)
  const mediaFiles: MediaFile[] = [];
  const missingMedia: string[] = [];
  const toCopy: { from: string; to: string }[] = [];
  if (options.includeMedia) {
    for (let i = 0; i < media.length; i++) {
      const ref = media[i];
      onProgress(`Conferindo fotos ${i + 1}/${media.length}…`, 0.1 + 0.3 * (i / Math.max(1, media.length)));
      const uri = resolveMediaUri(ref.source);
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) {
        missingMedia.push(ref.source);
        input.fileMap.delete(ref.source);
        continue;
      }
      const { sha256, bytes } = ref.sha256 && ref.bytes ? { sha256: ref.sha256, bytes: ref.bytes } : await hashFile(uri);
      mediaFiles.push({ path: ref.target, sha256, bytes });
      toCopy.push({ from: uri, to: ref.target });
    }
  } else {
    input.fileMap.clear();
  }

  onProgress('Gerando tabelas e documentação…', 0.45);
  const pkg = buildDatasetPackage(input, options.formats, mediaFiles);

  const workDir = `${FileSystem.cacheDirectory}export_${Date.now()}/`;
  const root = `${workDir}${pkg.name}/`;
  await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  try {
    for (const file of pkg.files) await writeFile(root, file.path, file.data);
    for (let i = 0; i < toCopy.length; i++) {
      onProgress(`Copiando fotos ${i + 1}/${toCopy.length}…`, 0.5 + 0.3 * (i / Math.max(1, toCopy.length)));
      const target = `${root}${toCopy[i].to}`;
      await FileSystem.makeDirectoryAsync(target.slice(0, target.lastIndexOf('/') + 1), { intermediates: true });
      await FileSystem.copyAsync({ from: toCopy[i].from, to: target });
    }

    onProgress('Compactando…', 0.85);
    const zipPath = `${FileSystem.cacheDirectory}${pkg.name}.zip`;
    await FileSystem.deleteAsync(zipPath, { idempotent: true });
    const native = nativeZip();
    if (native) {
      await native.zip(workDir, zipPath);
    } else {
      // Fallback em memória (Expo Go): adequado para datasets pequenos
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const JSZip = require('jszip');
      const zip = new JSZip();
      for (const file of pkg.files) zip.file(`${pkg.name}/${file.path}`, file.data);
      for (const item of toCopy) {
        const base64 = await FileSystem.readAsStringAsync(item.from, { encoding: FileSystem.EncodingType.Base64 });
        zip.file(`${pkg.name}/${item.to}`, base64, { base64: true, compression: 'STORE' });
      }
      await FileSystem.writeAsStringAsync(zipPath, await zip.generateAsync({ type: 'base64' }), { encoding: FileSystem.EncodingType.Base64 });
    }

    const totalBytes = pkg.checksums.reduce((sum, c) => sum + c.bytes, 0);
    const checksumFile = pkg.files.find((f) => f.path === 'checksums.sha256')?.data as string;
    const datasetId = await ensureDataset(db, experimentId, input.experiment.metadata.name);
    await recordRelease(
      db,
      { datasetId, version, formats: options.formats, checksums: checksumFile, fileCount: pkg.checksums.length + 1, totalBytes, notes: options.notes, createdAt },
      options.actor,
    );
    onProgress('Pronto', 1);
    return { zipPath, version, fileCount: pkg.checksums.length + 1, totalBytes, missingMedia };
  } finally {
    await FileSystem.deleteAsync(workDir, { idempotent: true });
  }
}
