import type { Db } from './db';
import { MIGRATIONS, type Migration } from './migrations';

/** Aplica as migrações pendentes. Devolve a versão final do schema. */
export async function migrate(db: Db, migrations: readonly Migration[] = MIGRATIONS): Promise<number> {
  const row = await db.first<{ user_version: number }>('PRAGMA user_version');
  let current = row?.user_version ?? 0;
  const pending = [...migrations].sort((a, b) => a.version - b.version).filter((m) => m.version > current);
  for (const migration of pending) {
    await db.transaction(async () => {
      await db.exec(migration.sql);
      // PRAGMA não aceita parâmetros; a versão é sempre um inteiro do código
      await db.exec(`PRAGMA user_version = ${Math.floor(migration.version)}`);
    });
    current = migration.version;
  }
  return current;
}
