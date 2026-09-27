import * as Crypto from 'expo-crypto';
import { getDatabase } from './database';

// ── UUID ──
export function generateUUID(): string {
  return Crypto.randomUUID();
}

// ══════════════════════════════════════
// PROJECTS
// ══════════════════════════════════════

export interface Project {
  id: string;
  name: string;
  description: string | null;
  subject_schema: string;
  collection_schema: string;
  backup_config: string;
  archived: number;
  created_at: string;
  updated_at: string;
}

export async function createProject(
  name: string,
  description: string | null,
  subjectSchema: object,
  collectionSchema: object
): Promise<string> {
  const db = await getDatabase();
  const id = generateUUID();

  await db.runAsync(
    `INSERT INTO projects (id, name, description, subject_schema, collection_schema)
     VALUES (?, ?, ?, ?, ?)`,
    id,
    name,
    description,
    JSON.stringify(subjectSchema),
    JSON.stringify(collectionSchema)
  );

  return id;
}

export async function getAllProjects(): Promise<Project[]> {
  const db = await getDatabase();
  return await db.getAllAsync<Project>(
    'SELECT * FROM projects WHERE archived = 0 ORDER BY updated_at DESC'
  );
}

export async function getProjectById(id: string): Promise<Project | null> {
  const db = await getDatabase();
  return await db.getFirstAsync<Project>(
    'SELECT * FROM projects WHERE id = ?',
    id
  );
}

export async function updateProject(
  id: string,
  name: string,
  description: string | null,
  subjectSchema: object,
  collectionSchema: object
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE projects SET name = ?, description = ?, subject_schema = ?, collection_schema = ?, updated_at = datetime('now')
     WHERE id = ?`,
    name,
    description,
    JSON.stringify(subjectSchema),
    JSON.stringify(collectionSchema),
    id
  );
}

export async function archiveProject(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE projects SET archived = 1, updated_at = datetime('now') WHERE id = ?`,
    id
  );
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDatabase();
  const count = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM collections WHERE project_id = ?',
    id
  );
  if ((count?.count ?? 0) > 0) {
    throw new Error('Projeto possui coletas. Use arquivar em vez de excluir.');
  }
  await db.runAsync('DELETE FROM subjects WHERE project_id = ?', id);
  await db.runAsync('DELETE FROM projects WHERE id = ?', id);
}

// ══════════════════════════════════════
// SUBJECTS
// ══════════════════════════════════════

export interface Subject {
  id: string;
  project_id: string;
  data: string;
  qr_generated: number;
  created_at: string;
  updated_at: string;
}

export async function createSubject(
  projectId: string,
  data: object
): Promise<string> {
  const db = await getDatabase();
  const id = generateUUID();

  await db.runAsync(
    `INSERT INTO subjects (id, project_id, data) VALUES (?, ?, ?)`,
    id,
    projectId,
    JSON.stringify(data)
  );

  return id;
}

export async function getSubjectsByProject(projectId: string): Promise<Subject[]> {
  const db = await getDatabase();
  return await db.getAllAsync<Subject>(
    'SELECT * FROM subjects WHERE project_id = ? ORDER BY created_at ASC',
    projectId
  );
}

export async function getSubjectById(id: string): Promise<Subject | null> {
  const db = await getDatabase();
  return await db.getFirstAsync<Subject>(
    'SELECT * FROM subjects WHERE id = ?',
    id
  );
}

export async function updateSubject(id: string, data: object): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE subjects SET data = ?, updated_at = datetime('now') WHERE id = ?`,
    JSON.stringify(data),
    id
  );
}

export async function deleteSubject(id: string): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `DELETE FROM images WHERE collection_id IN (SELECT id FROM collections WHERE subject_id = ?)`,
      id
    );
    await db.runAsync('DELETE FROM collections WHERE subject_id = ?', id);
    await db.runAsync('DELETE FROM subjects WHERE id = ?', id);
  });
}

export async function markQRGenerated(subjectIds: string[]): Promise<void> {
  if (subjectIds.length === 0) return;
  const db = await getDatabase();
  const placeholders = subjectIds.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE subjects SET qr_generated = 1, updated_at = datetime('now') WHERE id IN (${placeholders})`,
    ...subjectIds
  );
}

export async function createSubjectsBatch(
  projectId: string,
  dataList: object[]
): Promise<string[]> {
  const db = await getDatabase();
  const ids: string[] = [];

  await db.withTransactionAsync(async () => {
    for (const data of dataList) {
      const id = generateUUID();
      await db.runAsync(
        `INSERT INTO subjects (id, project_id, data) VALUES (?, ?, ?)`,
        id,
        projectId,
        JSON.stringify(data)
      );
      ids.push(id);
    }
  });

  return ids;
}

// ══════════════════════════════════════
// COLLECTIONS
// ══════════════════════════════════════

export interface Collection {
  id: string;
  subject_id: string;
  project_id: string;
  data: string;
  latitude: number | null;
  longitude: number | null;
  collected_at: string;
  modified_at: string | null;
}

export async function createCollection(
  subjectId: string,
  projectId: string,
  data: object,
  latitude: number | null,
  longitude: number | null
): Promise<string> {
  const db = await getDatabase();
  const id = generateUUID();

  await db.runAsync(
    `INSERT INTO collections (id, subject_id, project_id, data, latitude, longitude)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    subjectId,
    projectId,
    JSON.stringify(data),
    latitude,
    longitude
  );

  return id;
}

export async function getCollectionsBySubject(subjectId: string): Promise<Collection[]> {
  const db = await getDatabase();
  return await db.getAllAsync<Collection>(
    'SELECT * FROM collections WHERE subject_id = ? ORDER BY collected_at DESC',
    subjectId
  );
}

export async function getCollectionsByProject(projectId: string): Promise<Collection[]> {
  const db = await getDatabase();
  return await db.getAllAsync<Collection>(
    'SELECT * FROM collections WHERE project_id = ? ORDER BY collected_at DESC',
    projectId
  );
}

export async function getCollectionCount(projectId: string): Promise<number> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM collections WHERE project_id = ?',
    projectId
  );
  return result?.count ?? 0;
}

export async function updateCollection(
  id: string,
  data: object,
  latitude: number | null,
  longitude: number | null
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE collections SET data = ?, latitude = ?, longitude = ?, modified_at = datetime('now')
     WHERE id = ?`,
    JSON.stringify(data),
    latitude,
    longitude,
    id
  );
}

export async function deleteCollection(id: string): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM images WHERE collection_id = ?', id);
    await db.runAsync('DELETE FROM collections WHERE id = ?', id);
  });
}

export async function getCollectionById(id: string): Promise<Collection | null> {
  const db = await getDatabase();
  return await db.getFirstAsync<Collection>(
    'SELECT * FROM collections WHERE id = ?',
    id
  );
}

// ══════════════════════════════════════
// IMAGES
// ══════════════════════════════════════

export interface Image {
  id: string;
  collection_id: string;
  field_name: string;
  file_path: string;
  file_size: number | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

export async function createImage(
  collectionId: string,
  fieldName: string,
  filePath: string,
  fileSize: number | null,
  width: number | null,
  height: number | null
): Promise<string> {
  const db = await getDatabase();
  const id = generateUUID();

  await db.runAsync(
    `INSERT INTO images (id, collection_id, field_name, file_path, file_size, width, height)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    collectionId,
    fieldName,
    filePath,
    fileSize,
    width,
    height
  );

  return id;
}

export async function getImagesByCollection(collectionId: string): Promise<Image[]> {
  const db = await getDatabase();
  return await db.getAllAsync<Image>(
    'SELECT * FROM images WHERE collection_id = ? ORDER BY created_at ASC',
    collectionId
  );
}

export async function getAllImagesByProject(projectId: string): Promise<(Image & { collected_at: string })[]> {
  const db = await getDatabase();
  return await db.getAllAsync<Image & { collected_at: string }>(
    `SELECT i.*, c.collected_at FROM images i
     JOIN collections c ON i.collection_id = c.id
     WHERE c.project_id = ?
     ORDER BY c.collected_at ASC, i.created_at ASC`,
    projectId
  );
}

// ══════════════════════════════════════
// STATS (para dashboard do projeto)
// ══════════════════════════════════════

export interface ProjectStats {
  total_subjects: number;
  total_collections: number;
  total_images: number;
  last_collection_at: string | null;
}

export async function getProjectStats(projectId: string): Promise<ProjectStats> {
  const db = await getDatabase();

  const row = await db.getFirstAsync<{
    total_subjects: number;
    total_collections: number;
    total_images: number;
    last_collection_at: string | null;
  }>(
    `SELECT
      (SELECT COUNT(*) FROM subjects WHERE project_id = ?) AS total_subjects,
      (SELECT COUNT(*) FROM collections WHERE project_id = ?) AS total_collections,
      (SELECT COUNT(*) FROM images WHERE collection_id IN (SELECT id FROM collections WHERE project_id = ?)) AS total_images,
      (SELECT collected_at FROM collections WHERE project_id = ? ORDER BY collected_at DESC LIMIT 1) AS last_collection_at`,
    projectId,
    projectId,
    projectId,
    projectId
  );

  return {
    total_subjects: row?.total_subjects ?? 0,
    total_collections: row?.total_collections ?? 0,
    total_images: row?.total_images ?? 0,
    last_collection_at: row?.last_collection_at ?? null,
  };
}
