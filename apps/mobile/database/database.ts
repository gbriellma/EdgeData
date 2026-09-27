import * as SQLite from 'expo-sqlite';

const DB_NAME = 'edgedata.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = initDatabase();
  }
  return dbPromise;
}

export async function resetDatabase(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      await db.closeAsync();
    } catch {
      // ignore errors closing the db
    }
    dbPromise = null;
  }
}

async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await initTables(db);
  return db;
}

async function initTables(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      subject_schema TEXT NOT NULL DEFAULT '{"fields":[]}',
      collection_schema TEXT NOT NULL DEFAULT '{"fields":[]}',
      backup_config TEXT DEFAULT '{"auto_every_n":20,"cloud_enabled":false}',
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      qr_generated INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      latitude REAL,
      longitude REAL,
      collected_at TEXT NOT NULL DEFAULT (datetime('now')),
      modified_at TEXT,
      FOREIGN KEY (subject_id) REFERENCES subjects(id),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      collection_id TEXT NOT NULL,
      field_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      width INTEGER,
      height INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (collection_id) REFERENCES collections(id)
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sensor_bindings (
      sensor_id TEXT PRIMARY KEY,
      sensor_label TEXT NOT NULL,
      dataset_field_key TEXT NOT NULL,
      unit TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Indices para queries frequentes
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_subjects_project ON subjects(project_id);
    CREATE INDEX IF NOT EXISTS idx_collections_subject ON collections(subject_id);
    CREATE INDEX IF NOT EXISTS idx_collections_project ON collections(project_id);
    CREATE INDEX IF NOT EXISTS idx_collections_date ON collections(collected_at);
    CREATE INDEX IF NOT EXISTS idx_images_collection ON images(collection_id);
    CREATE INDEX IF NOT EXISTS idx_sensor_bindings_field ON sensor_bindings(dataset_field_key);
  `);
}
