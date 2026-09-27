import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';

import { checkpoint, closeDb, DB_NAME } from './connection';

// ── Constants ──────────────────────────────────────────────────────────────

const DB_DIR = `${FileSystem.documentDirectory}SQLite/`;
const DB_PATH = `${DB_DIR}${DB_NAME}`;

// Fotos e anexos (ver lib/media.ts)
const IMAGES_DIR = `${FileSystem.documentDirectory}media/`;

const BACKUP_DIR = `${FileSystem.documentDirectory}backups/`;

// ── Internal helpers ───────────────────────────────────────────────────────

interface JSZipEntry {
  dir: boolean;
  async(type: 'base64'): Promise<string>;
}

async function ensureDirExists(dir: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

async function collectFilesRecursively(dir: string): Promise<string[]> {
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists || !info.isDirectory) return [];

  const entries = await FileSystem.readDirectoryAsync(dir);
  const results: string[] = [];

  for (const entry of entries) {
    const fullPath = `${dir}${entry}`;
    const entryInfo = await FileSystem.getInfoAsync(fullPath);
    if (entryInfo.isDirectory) {
      const nested = await collectFilesRecursively(`${fullPath}/`);
      results.push(...nested);
    } else {
      results.push(fullPath);
    }
  }

  return results;
}

function isNativeZipAvailable(): boolean {
  try {
    require('react-native-zip-archive');
    return true;
  } catch {
    return false;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Creates a full backup ZIP of the database and all image files.
 *
 * Uses react-native-zip-archive (native) when available for zero-OOM backup.
 * Falls back to JSZip (in-memory) for Expo Go — works for small projects.
 */
export async function createBackup(): Promise<string> {
  await checkpoint();

  await ensureDirExists(BACKUP_DIR);
  const timestamp = Date.now();
  const zipFileName = `backup_${timestamp}.zip`;
  const zipPath = `${BACKUP_DIR}${zipFileName}`;

  if (isNativeZipAvailable()) {
    return createBackupNative(zipPath);
  }
  return createBackupJSZip(zipPath);
}

/**
 * Native backup using react-native-zip-archive.
 * Copies files to a temp directory, then zips natively (streams to disk).
 */
async function createBackupNative(zipPath: string): Promise<string> {
  const { zip } = require('react-native-zip-archive');

  const tempDir = `${FileSystem.cacheDirectory}backup_temp_${Date.now()}/`;
  const tempDbDir = `${tempDir}database/`;
  const tempImagesDir = `${tempDir}media/`;

  // Clean up any previous temp dir
  const tempInfo = await FileSystem.getInfoAsync(tempDir);
  if (tempInfo.exists) {
    await FileSystem.deleteAsync(tempDir, { idempotent: true });
  }

  await FileSystem.makeDirectoryAsync(tempDbDir, { intermediates: true });

  // Copy database file
  const dbInfo = await FileSystem.getInfoAsync(DB_PATH);
  if (dbInfo.exists) {
    await FileSystem.copyAsync({ from: DB_PATH, to: `${tempDbDir}${DB_NAME}` });
  }

  // Copy image files
  const imagesInfo = await FileSystem.getInfoAsync(IMAGES_DIR);
  if (imagesInfo.exists) {
    const imagePaths = await collectFilesRecursively(IMAGES_DIR);
    for (const imgPath of imagePaths) {
      const relative = imgPath.replace(IMAGES_DIR, '');
      const destPath = `${tempImagesDir}${relative}`;
      const parentDir = destPath.substring(0, destPath.lastIndexOf('/') + 1);
      await ensureDirExists(parentDir);
      await FileSystem.copyAsync({ from: imgPath, to: destPath });
    }
  }

  // Zip natively (streams to disk, no OOM)
  await zip(tempDir, zipPath);

  // Clean up temp directory
  await FileSystem.deleteAsync(tempDir, { idempotent: true });

  return zipPath;
}

/**
 * Fallback backup using JSZip (in-memory).
 * Works in Expo Go but may OOM with many images.
 */
async function createBackupJSZip(zipPath: string): Promise<string> {
  const JSZip = require('jszip');
  const zipObj = new JSZip();

  // Add database file
  const dbInfo = await FileSystem.getInfoAsync(DB_PATH);
  if (dbInfo.exists) {
    const dbBase64 = await FileSystem.readAsStringAsync(DB_PATH, {
      encoding: FileSystem.EncodingType.Base64,
    });
    zipObj.file(`database/${DB_NAME}`, dbBase64, { base64: true });
  }

  // Add image files
  const imagesInfo = await FileSystem.getInfoAsync(IMAGES_DIR);
  if (imagesInfo.exists) {
    const imagePaths = await collectFilesRecursively(IMAGES_DIR);
    for (const imgPath of imagePaths) {
      const relative = imgPath.replace(IMAGES_DIR, '');
      let imgBase64: string | null = await FileSystem.readAsStringAsync(imgPath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      zipObj.file(`media/${relative}`, imgBase64, { base64: true, compression: 'STORE' });
      imgBase64 = null;
    }
  }

  const zipBase64 = await zipObj.generateAsync({ type: 'base64' });
  await FileSystem.writeAsStringAsync(zipPath, zipBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return zipPath;
}

/**
 * Restores a backup from a ZIP file.
 *
 * Uses react-native-zip-archive (native) when available.
 * Falls back to JSZip for Expo Go.
 */
export async function restoreBackup(zipPath?: string): Promise<void> {
  let resolvedZipPath = zipPath ?? null;

  if (!resolvedZipPath) {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/zip',
      copyToCacheDirectory: true,
    });

    if (result.canceled) {
      throw new Error('Restauração cancelada pelo usuário.');
    }

    const asset = result.assets?.[0];
    if (!asset?.uri) {
      throw new Error('Nenhum arquivo selecionado.');
    }
    resolvedZipPath = asset.uri;
  }

  // Fecha a conexão e remove arquivos WAL antes de sobrescrever o banco
  await closeDb();
  await FileSystem.deleteAsync(`${DB_PATH}-wal`, { idempotent: true });
  await FileSystem.deleteAsync(`${DB_PATH}-shm`, { idempotent: true });

  if (isNativeZipAvailable()) {
    await restoreBackupNative(resolvedZipPath);
  } else {
    await restoreBackupJSZip(resolvedZipPath);
  }
}

/**
 * Native restore using react-native-zip-archive.
 */
async function restoreBackupNative(zipPath: string): Promise<void> {
  const { unzip } = require('react-native-zip-archive');

  const tempDir = `${FileSystem.cacheDirectory}restore_temp_${Date.now()}/`;

  // Unzip to temp directory
  await unzip(zipPath, tempDir);

  // Restore database
  const tempDbPath = `${tempDir}database/${DB_NAME}`;
  const dbInfo = await FileSystem.getInfoAsync(tempDbPath);
  if (!dbInfo.exists) {
    await FileSystem.deleteAsync(tempDir, { idempotent: true });
    throw new Error('Arquivo de backup inválido: banco de dados não encontrado no ZIP.');
  }

  await ensureDirExists(DB_DIR);
  await FileSystem.copyAsync({ from: tempDbPath, to: DB_PATH });

  // Restore images
  const tempImagesDir = `${tempDir}media/`;
  const imagesInfo = await FileSystem.getInfoAsync(tempImagesDir);
  if (imagesInfo.exists) {
    // Clear existing images
    const existingImagesInfo = await FileSystem.getInfoAsync(IMAGES_DIR);
    if (existingImagesInfo.exists) {
      await FileSystem.deleteAsync(IMAGES_DIR, { idempotent: true });
    }
    await ensureDirExists(IMAGES_DIR);

    const imagePaths = await collectFilesRecursively(tempImagesDir);
    for (const imgPath of imagePaths) {
      const relative = imgPath.replace(tempImagesDir, '');
      const destPath = `${IMAGES_DIR}${relative}`;
      const parentDir = destPath.substring(0, destPath.lastIndexOf('/') + 1);
      await ensureDirExists(parentDir);
      await FileSystem.copyAsync({ from: imgPath, to: destPath });
    }
  }

  // Clean up temp directory
  await FileSystem.deleteAsync(tempDir, { idempotent: true });
}

/**
 * Fallback restore using JSZip (in-memory).
 */
async function restoreBackupJSZip(zipPath: string): Promise<void> {
  const JSZip = require('jszip');

  const zipBase64 = await FileSystem.readAsStringAsync(zipPath, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const zipObj = await JSZip.loadAsync(zipBase64, { base64: true });

  // Restore database
  const dbFile = zipObj.file(`database/${DB_NAME}`);
  if (!dbFile) {
    throw new Error('Arquivo de backup inválido: banco de dados não encontrado no ZIP.');
  }

  await ensureDirExists(DB_DIR);
  const dbBase64 = await dbFile.async('base64');
  await FileSystem.writeAsStringAsync(DB_PATH, dbBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Restore images
  const imageFiles = zipObj.folder('media');
  if (imageFiles) {
    await ensureDirExists(IMAGES_DIR);

    const imageEntries: { relativePath: string; file: JSZipEntry }[] = [];
    imageFiles.forEach((relativePath: string, file: JSZipEntry) => {
      if (!file.dir) {
        imageEntries.push({ relativePath, file });
      }
    });

    for (const { relativePath, file } of imageEntries) {
      const destPath = `${IMAGES_DIR}${relativePath}`;
      const parentDir = destPath.substring(0, destPath.lastIndexOf('/') + 1);
      await ensureDirExists(parentDir);

      const imgBase64 = await file.async('base64');
      await FileSystem.writeAsStringAsync(destPath, imgBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }
  }
}

/**
 * Returns information about locally stored backups.
 */
export async function getBackupInfo(): Promise<{
  lastBackup: string | null;
  backupCount: number;
}> {
  const dirInfo = await FileSystem.getInfoAsync(BACKUP_DIR);
  if (!dirInfo.exists) {
    return { lastBackup: null, backupCount: 0 };
  }

  const entries = await FileSystem.readDirectoryAsync(BACKUP_DIR);
  const zipFiles = entries.filter((e) => e.endsWith('.zip'));

  if (zipFiles.length === 0) {
    return { lastBackup: null, backupCount: 0 };
  }

  const timestamps = zipFiles
    .map((name) => {
      const match = name.match(/^backup_(\d+)\.zip$/);
      return match ? Number(match[1]) : null;
    })
    .filter((t): t is number => t !== null)
    .sort((a, b) => b - a);

  const lastBackup =
    timestamps.length > 0 ? new Date(timestamps[0]).toISOString() : null;

  return {
    lastBackup,
    backupCount: zipFiles.length,
  };
}
