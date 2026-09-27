import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { setUuidGenerator, type Db, type SqlValue } from './db';
import { migrate } from './migrate';
import { ensureWorkspace } from './repo/common';

export const DB_NAME = 'edgedata.db';

setUuidGenerator(() => Crypto.randomUUID());

function adapt(database: SQLite.SQLiteDatabase): Db {
  let depth = 0;
  return {
    async exec(sql) {
      await database.execAsync(sql);
    },
    async run(sql, params: SqlValue[] = []) {
      const result = await database.runAsync(sql, params);
      return { changes: result.changes };
    },
    async all<T>(sql: string, params: SqlValue[] = []) {
      return database.getAllAsync<T>(sql, params);
    },
    async first<T>(sql: string, params: SqlValue[] = []) {
      return (await database.getFirstAsync<T>(sql, params)) ?? null;
    },
    async transaction<T>(fn: () => Promise<T>) {
      // Transações aninhadas participam da transação externa
      if (depth > 0) return fn();
      let result: T | undefined;
      depth += 1;
      try {
        await database.withTransactionAsync(async () => {
          result = await fn();
        });
      } finally {
        depth -= 1;
      }
      return result as T;
    },
  };
}

let dbPromise: Promise<Db> | null = null;
let rawDatabase: SQLite.SQLiteDatabase | null = null;

async function open(): Promise<Db> {
  const database = await SQLite.openDatabaseAsync(DB_NAME);
  await database.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  rawDatabase = database;
  const db = adapt(database);
  await migrate(db);
  await ensureWorkspace(db);
  return db;
}

/** Banco aberto e migrado (abre na primeira chamada). */
export function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = open().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

/** Grava o WAL no arquivo principal (antes de copiar o banco num backup). */
export async function checkpoint(): Promise<void> {
  await getDb();
  await rawDatabase?.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
}

/** Fecha a conexão (usado ao restaurar backup). */
export async function closeDb(): Promise<void> {
  if (!dbPromise) return;
  try {
    await dbPromise;
    await rawDatabase?.closeAsync();
  } catch {
    // conexão já estava inválida
  }
  rawDatabase = null;
  dbPromise = null;
}
