import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import { adapt, DB_NAME, getDb } from '@/database/connection';
import { importLegacy, isLegacyDatabase, summarizeLegacy, type LegacyImportResult, type LegacySummary } from '@/database/legacy-import';

const SQLITE_DIR = `${FileSystem.documentDirectory}SQLite/`;

export interface LegacyDatabase extends LegacySummary {
  fileName: string;
}

/** Procura, na pasta de bancos do app, bancos criados pela versão anterior. */
export async function findLegacyDatabases(): Promise<LegacyDatabase[]> {
  const info = await FileSystem.getInfoAsync(SQLITE_DIR);
  if (!info.exists) return [];
  const files = (await FileSystem.readDirectoryAsync(SQLITE_DIR)).filter((f) => f.endsWith('.db') && f !== DB_NAME);
  const found: LegacyDatabase[] = [];
  for (const fileName of files) {
    let database: SQLite.SQLiteDatabase | null = null;
    try {
      database = await SQLite.openDatabaseAsync(fileName);
      const db = adapt(database);
      if (await isLegacyDatabase(db)) found.push({ fileName, ...(await summarizeLegacy(db)) });
    } catch {
      // arquivo que não é SQLite válido
    } finally {
      await database?.closeAsync().catch(() => undefined);
    }
  }
  return found;
}

export async function importLegacyDatabase(fileName: string, actor: string): Promise<LegacyImportResult> {
  const database = await SQLite.openDatabaseAsync(fileName);
  try {
    return await importLegacy(adapt(database), await getDb(), actor, fileName);
  } finally {
    await database.closeAsync().catch(() => undefined);
  }
}
