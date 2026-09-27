import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { getProjectById } from './db-helpers';
import { getSubjectsByProject } from './db-helpers';
import { getCollectionsByProject } from './db-helpers';
import { getAllImagesByProject } from './db-helpers';

const { StorageAccessFramework } = FileSystem;

// UTF-8 BOM ensures correct encoding in Excel/Google Sheets
const BOM = '\uFEFF';

// ── Types ──────────────────────────────────────────────────────────────────

interface SchemaField {
  name: string;
  label: string;
  type: string;
  required: boolean;
  order: number;
  config: object;
}

interface Schema {
  fields: SchemaField[];
}

interface ImageEntry {
  filePath: string;
  fileName: string;
  /** ISO date string from the collection's collected_at. Used for date-based folder grouping. */
  dateFolder?: string;
}

export interface ExportOptions {
  /** When true, images are organized into subfolders by collection date (e.g., images/2026-02-15/) */
  groupByDate?: boolean;
}

// ── CSV helpers ────────────────────────────────────────────────────────────

function escapeCSVCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCSVRow(cells: unknown[]): string {
  return cells.map(escapeCSVCell).join(',');
}

/**
 * Extracts just the YYYY-MM-DD date portion from a datetime string.
 */
function getDateFolder(collectedAt: string): string {
  try {
    const d = new Date(collectedAt);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return 'sem-data';
  }
}

function parseSchema(raw: string): Schema {
  try {
    const parsed = JSON.parse(raw) as Schema;
    if (!Array.isArray(parsed?.fields)) return { fields: [] };
    parsed.fields = [...parsed.fields].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return parsed;
  } catch {
    return { fields: [] };
  }
}

function formatImageCellValue(val: unknown, fieldType: string, dateFolder?: string): string | unknown {
  const prefix = dateFolder ? `images/${dateFolder}/` : 'images/';
  if (fieldType === 'image' && typeof val === 'string') {
    const filename = val.split('/').pop();
    return filename ? `${prefix}${filename}` : '';
  }
  if (fieldType === 'multi_image' && Array.isArray(val)) {
    return (val as Array<{ angle?: string; uri?: string }>)
      .map((p) => {
        const filename = p.uri?.split('/').pop();
        return filename ? `${prefix}${filename}` : '';
      })
      .filter(Boolean)
      .join('; ');
  }
  return null; // not an image field
}

/**
 * Extracts image file paths from a data JSON blob by checking schema fields
 * of type 'image' and 'multi_image'. Returns entries with file paths that
 * exist on disk and aren't already tracked in the knownPaths set.
 */
async function extractImagesFromData(
  data: Record<string, unknown>,
  schema: Schema,
  knownPaths: Set<string>,
): Promise<ImageEntry[]> {
  const entries: ImageEntry[] = [];

  for (const field of schema.fields) {
    if (field.type === 'image') {
      const uri = data[field.name];
      if (typeof uri === 'string' && uri.length > 0 && !knownPaths.has(uri)) {
        const info = await FileSystem.getInfoAsync(uri);
        if (info.exists) {
          const fileName = uri.split('/').pop() ?? `${field.name}.jpg`;
          entries.push({ filePath: uri, fileName });
          knownPaths.add(uri);
        }
      }
    } else if (field.type === 'multi_image') {
      const photos = data[field.name];
      if (Array.isArray(photos)) {
        for (const photo of photos as Array<{ angle?: string; uri?: string }>) {
          const uri = photo?.uri;
          if (typeof uri === 'string' && uri.length > 0 && !knownPaths.has(uri)) {
            const info = await FileSystem.getInfoAsync(uri);
            if (info.exists) {
              const fileName = uri.split('/').pop() ?? `${field.name}_${photo.angle ?? 'photo'}.jpg`;
              entries.push({ filePath: uri, fileName });
              knownPaths.add(uri);
            }
          }
        }
      }
    }
  }

  return entries;
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function generateSubjectsCSV(projectId: string): Promise<string> {
  const project = await getProjectById(projectId);
  if (!project) throw new Error(`Projeto não encontrado: ${projectId}`);

  const schema = parseSchema(project.subject_schema);
  const subjects = await getSubjectsByProject(projectId);

  const headerCells = ['id', 'created_at', ...schema.fields.map((f) => f.label)];
  const rows: string[] = [buildCSVRow(headerCells)];

  for (const subject of subjects) {
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(subject.data) as Record<string, unknown>;
    } catch { /* empty */ }

    const dataCells = schema.fields.map((f) => {
      const imgVal = formatImageCellValue(data[f.name], f.type);
      return imgVal !== null ? imgVal : (data[f.name] ?? '');
    });
    rows.push(buildCSVRow([subject.id, subject.created_at, ...dataCells]));
  }

  return rows.join('\r\n');
}

export async function generateCollectionsCSV(projectId: string, options?: ExportOptions): Promise<string> {
  const project = await getProjectById(projectId);
  if (!project) throw new Error(`Projeto não encontrado: ${projectId}`);

  const schema = parseSchema(project.collection_schema);
  const collections = await getCollectionsByProject(projectId);
  const hasGPS = schema.fields.some((f) => f.type === 'auto_gps');

  const headerCells = [
    'id',
    'subject_id',
    'collected_at',
    ...(hasGPS ? ['latitude', 'longitude'] : []),
    ...schema.fields.map((f) => f.label),
  ];
  const rows: string[] = [buildCSVRow(headerCells)];

  for (const col of collections) {
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(col.data) as Record<string, unknown>;
    } catch { /* empty */ }

    const dateFolder = options?.groupByDate ? getDateFolder(col.collected_at) : undefined;

    const dataCells = schema.fields.map((f) => {
      const imgVal = formatImageCellValue(data[f.name], f.type, dateFolder);
      return imgVal !== null ? imgVal : (data[f.name] ?? '');
    });
    rows.push(
      buildCSVRow([
        col.id,
        col.subject_id,
        col.collected_at,
        ...(hasGPS ? [col.latitude ?? '', col.longitude ?? ''] : []),
        ...dataCells,
      ])
    );
  }

  return rows.join('\r\n');
}

/**
 * Collects all image file paths for a project from both the images table
 * and from data JSON blobs (for legacy collections created before imagePersist).
 * Includes the collection date for optional date-based folder grouping.
 */
async function collectAllImages(projectId: string, project: { subject_schema: string; collection_schema: string }): Promise<ImageEntry[]> {
  const collectionSchema = parseSchema(project.collection_schema);
  const subjectSchema = parseSchema(project.subject_schema);
  const collections = await getCollectionsByProject(projectId);
  const subjects = await getSubjectsByProject(projectId);

  const knownPaths = new Set<string>();
  const allEntries: ImageEntry[] = [];

  // 1. Images from the images table (single batch query instead of N+1)
  const allDbImages = await getAllImagesByProject(projectId);
  for (const img of allDbImages) {
    if (!knownPaths.has(img.file_path)) {
      const info = await FileSystem.getInfoAsync(img.file_path);
      if (info.exists) {
        const fileName = img.file_path.split('/').pop() ?? img.id;
        const dateFolder = getDateFolder(img.collected_at);
        allEntries.push({ filePath: img.file_path, fileName, dateFolder });
        knownPaths.add(img.file_path);
      }
    }
  }

  // 2. Images from collection data JSON (legacy collections before imagePersist)
  for (const col of collections) {
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(col.data) as Record<string, unknown>; } catch { continue; }
    const extracted = await extractImagesFromData(data, collectionSchema, knownPaths);
    const dateFolder = getDateFolder(col.collected_at);
    for (const entry of extracted) {
      allEntries.push({ ...entry, dateFolder });
    }
  }

  // 3. Images from subject data JSON (no date — they belong to the subject, not a collection)
  for (const sub of subjects) {
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(sub.data) as Record<string, unknown>; } catch { continue; }
    const extracted = await extractImagesFromData(data, subjectSchema, knownPaths);
    allEntries.push(...extracted);
  }

  return allEntries;
}

/**
 * Exports project data to a user-chosen directory via SAF (Android).
 *
 * Writes files one at a time — peak memory is ~4-8MB (one image),
 * regardless of total project size. Scales to 10k+ images.
 *
 * Returns the number of files exported.
 */
export async function exportProjectToDirectory(
  projectId: string,
  onProgress?: (current: number, total: number, label: string) => void,
  options?: ExportOptions,
): Promise<{ fileCount: number; directoryUri: string }> {
  const project = await getProjectById(projectId);
  if (!project) throw new Error(`Projeto não encontrado: ${projectId}`);

  // Ask user to pick destination directory
  const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permissions.granted) {
    throw new Error('CANCELLED');
  }

  const dirUri = permissions.directoryUri;

  // Build CSV content (small, fits in memory)
  onProgress?.(0, 1, 'Gerando CSVs...');
  const subjectsCSV = await generateSubjectsCSV(projectId);
  const collectionsCSV = await generateCollectionsCSV(projectId);

  // Collect all image paths
  onProgress?.(0, 1, 'Buscando imagens...');
  const allImages = await collectAllImages(projectId, project);
  const totalFiles = 2 + allImages.length; // 2 CSVs + images

  // Write subjects.csv
  onProgress?.(1, totalFiles, 'Salvando subjects.csv...');
  const subjectsFileUri = await StorageAccessFramework.createFileAsync(
    dirUri, 'subjects', 'text/csv'
  );
  await FileSystem.writeAsStringAsync(subjectsFileUri, BOM + subjectsCSV);

  // Write collections.csv
  onProgress?.(2, totalFiles, 'Salvando collections.csv...');
  const collectionsFileUri = await StorageAccessFramework.createFileAsync(
    dirUri, 'collections', 'text/csv'
  );
  await FileSystem.writeAsStringAsync(collectionsFileUri, BOM + collectionsCSV);

  // Write images one at a time (low memory)
  for (let i = 0; i < allImages.length; i++) {
    const entry = allImages[i];
    onProgress?.(3 + i, totalFiles, `Salvando imagem ${i + 1}/${allImages.length}...`);

    // Read as base64 (one image at a time ~3-4MB)
    let base64: string | null = await FileSystem.readAsStringAsync(entry.filePath, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Determine MIME type from extension
    const ext = entry.fileName.split('.').pop()?.toLowerCase() ?? 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

    // Create and write file via SAF
    const imageFileUri = await StorageAccessFramework.createFileAsync(
      dirUri, entry.fileName, mimeType
    );
    await FileSystem.writeAsStringAsync(imageFileUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    base64 = null; // release memory immediately
  }

  return { fileCount: totalFiles, directoryUri: dirUri };
}

/**
 * Checks if SAF export is available (Android only).
 */
export function isSAFAvailable(): boolean {
  return Platform.OS === 'android';
}

/**
 * Builds a temporary directory with all export files (CSVs + images),
 * then zips it natively using react-native-zip-archive.
 *
 * Uses FileSystem.copyAsync for images (no memory overhead).
 * The native zip() streams to disk — no OOM regardless of project size.
 *
 * Requires a development build (react-native-zip-archive is a native module).
 */
export async function exportProjectZIP(
  projectId: string,
  onProgress?: (current: number, total: number, label: string) => void,
  options?: ExportOptions,
): Promise<string> {
  const { zip, subscribe } = require('react-native-zip-archive');

  const project = await getProjectById(projectId);
  if (!project) throw new Error(`Projeto não encontrado: ${projectId}`);

  const timestamp = Date.now();
  const safeName = project.name.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const tempDir = `${FileSystem.cacheDirectory}export_temp_${timestamp}/`;
  const imagesDir = `${tempDir}images/`;

  // Clean up any previous temp dir
  const tempInfo = await FileSystem.getInfoAsync(tempDir);
  if (tempInfo.exists) {
    await FileSystem.deleteAsync(tempDir, { idempotent: true });
  }

  await FileSystem.makeDirectoryAsync(imagesDir, { intermediates: true });

  // Build CSV content (pass options so image paths match the folder structure)
  onProgress?.(0, 1, 'Gerando CSVs...');
  const subjectsCSV = await generateSubjectsCSV(projectId);
  const collectionsCSV = await generateCollectionsCSV(projectId, options);

  // Write CSVs to temp dir
  await FileSystem.writeAsStringAsync(`${tempDir}subjects.csv`, BOM + subjectsCSV);
  await FileSystem.writeAsStringAsync(`${tempDir}collections.csv`, BOM + collectionsCSV);

  // Collect all image paths
  onProgress?.(0, 1, 'Buscando imagens...');
  const allImages = await collectAllImages(projectId, project);

  // Track created date subdirectories
  const createdDateDirs = new Set<string>();

  // Copy images to temp dir (file-to-file, no memory overhead)
  for (let i = 0; i < allImages.length; i++) {
    const entry = allImages[i];
    onProgress?.(i + 1, allImages.length, `Copiando imagem ${i + 1}/${allImages.length}...`);

    let destDir = imagesDir;
    if (options?.groupByDate && entry.dateFolder) {
      destDir = `${imagesDir}${entry.dateFolder}/`;
      if (!createdDateDirs.has(entry.dateFolder)) {
        await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
        createdDateDirs.add(entry.dateFolder);
      }
    }

    await FileSystem.copyAsync({
      from: entry.filePath,
      to: `${destDir}${entry.fileName}`,
    });
  }

  // Zip the temp directory natively (streams to disk, no OOM)
  const zipPath = `${FileSystem.cacheDirectory}export_${safeName}_${timestamp}.zip`;

  onProgress?.(allImages.length, allImages.length, 'Compactando ZIP...');

  const subscription = subscribe(({ progress }: { progress: number }) => {
    onProgress?.(
      Math.round(progress * allImages.length),
      allImages.length,
      `Compactando... ${Math.round(progress * 100)}%`
    );
  });

  try {
    await zip(tempDir, zipPath);
  } finally {
    subscription.remove();
  }

  // Clean up temp directory
  await FileSystem.deleteAsync(tempDir, { idempotent: true });

  return zipPath;
}

/**
 * Checks if native ZIP (react-native-zip-archive) is available.
 * Returns false in Expo Go since it requires native modules.
 */
export function isNativeZipAvailable(): boolean {
  try {
    require('react-native-zip-archive');
    return true;
  } catch {
    return false;
  }
}
