import { DatabaseSync } from 'node:sqlite';
import type { Db, SqlValue } from '../db';
import { migrate } from '../migrate';

/** Adaptador do `node:sqlite` para testes dos repositórios (mesmo SQLite do app). */
export function createNodeDb(): Db & { raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  let depth = 0;
  const db: Db & { raw: DatabaseSync } = {
    raw,
    async exec(sql) {
      raw.exec(sql);
    },
    async run(sql, params: SqlValue[] = []) {
      const result = raw.prepare(sql).run(...params);
      return { changes: Number(result.changes) };
    },
    async all<T>(sql: string, params: SqlValue[] = []) {
      return raw.prepare(sql).all(...params) as T[];
    },
    async first<T>(sql: string, params: SqlValue[] = []) {
      return (raw.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async transaction<T>(fn: () => Promise<T>) {
      if (depth > 0) return fn();
      depth += 1;
      raw.exec('BEGIN');
      try {
        const result = await fn();
        raw.exec('COMMIT');
        return result;
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      } finally {
        depth -= 1;
      }
    },
  };
  return db;
}

export async function createMigratedDb() {
  const db = createNodeDb();
  await migrate(db);
  return db;
}
