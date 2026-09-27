import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { createImage } from '@/database/db-helpers';
import { Schema } from '@/types/schema';

const IMAGES_DIR = `${FileSystem.documentDirectory}images/`;

async function ensureDirExists(dir: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

function isTemporaryUri(uri: string): boolean {
  if (!uri || typeof uri !== 'string') return false;
  // Already in our permanent IMAGES_DIR — skip
  if (uri.startsWith(IMAGES_DIR)) return false;
  // Anything starting with file:// that isn't in IMAGES_DIR is temporary
  return uri.startsWith('file://') || uri.startsWith('/');
}

function getExtension(uri: string): string {
  const match = uri.match(/\.(\w+)$/);
  return match ? `.${match[1]}` : '.jpg';
}

/**
 * Builds a human-readable subject name for filenames.
 * Uses the 'nome' field if present, otherwise joins all non-empty
 * text/category field values with underscores.
 * Example: "T2_C_F1_R2"
 */
function buildSubjectName(subjectData?: Record<string, unknown>, subjectSchema?: Schema): string {
  if (!subjectData || !subjectSchema) return '';

  // Check for 'nome' or 'name' field first
  const nomeField = subjectSchema.fields.find(
    (f) => f.name === 'nome' || f.name === 'name',
  );
  if (nomeField) {
    const nomeVal = subjectData[nomeField.name];
    if (nomeVal !== undefined && nomeVal !== null && nomeVal !== '') {
      return sanitizeForFilename(String(nomeVal));
    }
  }

  // Fallback: join all non-empty fields
  const sortedFields = [...subjectSchema.fields].sort((a, b) => a.order - b.order);
  const parts: string[] = [];

  for (const field of sortedFields) {
    const val = subjectData[field.name];
    if (val !== undefined && val !== null && val !== '' && typeof val !== 'boolean') {
      const str = sanitizeForFilename(String(val));
      if (str) parts.push(str);
    }
  }

  return parts.join('_');
}

function sanitizeForFilename(str: string): string {
  return str
    .trim()
    .replace(/[\/\\:*?"<>|\s]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Returns today's date formatted as DD-MM-YYYY for use in filenames.
 */
function getDateStamp(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/**
 * Persists images from formData to permanent storage.
 *
 * For each image/multi_image field in the schema:
 * - Copies temp camera URIs to IMAGES_DIR/<entityId>/
 * - For collections: inserts rows into the `images` table
 * - Returns updated formData with permanent file paths
 *
 * When subjectData and subjectSchema are provided, images are named
 * using subject name and date:
 * - Single image: "{name}_{date}.jpg" (e.g., "T2_C_F1_R2_15-02-2026.jpg")
 * - Multi-angle: "{position}_{name}_{date}.jpg" (e.g., "Frente_T2_C_F1_R2_15-02-2026.jpg")
 */
export async function persistFormImages(
  entityType: 'subject' | 'collection',
  entityId: string,
  schema: Schema,
  formData: Record<string, unknown>,
  subjectData?: Record<string, unknown>,
  subjectSchema?: Schema,
): Promise<Record<string, unknown>> {
  const updatedData = { ...formData };
  const entityDir = `${IMAGES_DIR}${entityId}/`;
  let dirCreated = false;

  const subjectName = buildSubjectName(subjectData, subjectSchema);
  const dateStamp = getDateStamp();

  // Build metadata for this entity's images (subject/QR ID mapping)
  const imageMetadata: Record<string, unknown>[] = [];

  for (const field of schema.fields) {
    if (field.type === 'image') {
      const uri = updatedData[field.name];
      if (typeof uri === 'string' && isTemporaryUri(uri)) {
        if (!dirCreated) {
          await ensureDirExists(entityDir);
          dirCreated = true;
        }
        const ext = getExtension(uri);
        const baseName = subjectName
          ? `${subjectName}_${dateStamp}`
          : Crypto.randomUUID();
        const filename = `${baseName}${ext}`;
        const destPath = `${entityDir}${filename}`;

        await FileSystem.copyAsync({ from: uri, to: destPath });
        updatedData[field.name] = destPath;

        imageMetadata.push({
          filename,
          field: field.name,
          subject_id: entityType === 'collection' ? undefined : entityId,
          collection_id: entityType === 'collection' ? entityId : undefined,
          subject_name: subjectName || undefined,
          date: dateStamp,
        });

        if (entityType === 'collection') {
          const fileInfo = await FileSystem.getInfoAsync(destPath);
          const fileSize = fileInfo.exists && !fileInfo.isDirectory ? (fileInfo.size ?? null) : null;
          await createImage(entityId, field.name, destPath, fileSize, null, null);
        }
      }
    } else if (field.type === 'multi_image') {
      const photos = updatedData[field.name];
      if (Array.isArray(photos)) {
        if (!dirCreated) {
          await ensureDirExists(entityDir);
          dirCreated = true;
        }
        const updatedPhotos: Array<{ angle: string; uri: string }> = [];
        for (const photo of photos as Array<{ angle: string; uri: string }>) {
          if (photo.uri && isTemporaryUri(photo.uri)) {
            const ext = getExtension(photo.uri);
            const angleName = photo.angle.replace(/[^a-zA-Z0-9_-]/g, '');
            let filename: string;
            if (subjectName) {
              filename = `${angleName}_${subjectName}_${dateStamp}${ext}`;
            } else {
              filename = `${field.name}_${angleName}_${Crypto.randomUUID()}${ext}`;
            }
            const destPath = `${entityDir}${filename}`;

            await FileSystem.copyAsync({ from: photo.uri, to: destPath });
            updatedPhotos.push({ angle: photo.angle, uri: destPath });

            imageMetadata.push({
              filename,
              field: field.name,
              angle: photo.angle,
              subject_id: entityType === 'collection' ? undefined : entityId,
              collection_id: entityType === 'collection' ? entityId : undefined,
              subject_name: subjectName || undefined,
              date: dateStamp,
            });

            if (entityType === 'collection') {
              const fileInfo = await FileSystem.getInfoAsync(destPath);
              const fileSize = fileInfo.exists && !fileInfo.isDirectory ? (fileInfo.size ?? null) : null;
              await createImage(entityId, field.name, destPath, fileSize, null, null);
            }
          } else {
            updatedPhotos.push(photo);
          }
        }
        updatedData[field.name] = updatedPhotos;
      }
    }
  }

  // Write metadata sidecar file with subject/QR ID mapping for each image
  if (imageMetadata.length > 0 && dirCreated) {
    const metadataPath = `${entityDir}metadata.json`;
    try {
      // Merge with existing metadata if present
      let existing: Record<string, unknown>[] = [];
      const metaInfo = await FileSystem.getInfoAsync(metadataPath);
      if (metaInfo.exists) {
        const raw = await FileSystem.readAsStringAsync(metadataPath);
        existing = JSON.parse(raw) as Record<string, unknown>[];
      }
      const merged = [...existing, ...imageMetadata];
      await FileSystem.writeAsStringAsync(metadataPath, JSON.stringify(merged, null, 2));
    } catch {
      // Non-critical — don't fail the persist if metadata write fails
    }
  }

  return updatedData;
}
