import { useEffect } from 'react';
import { getDatabase } from '@/database/database';
import { useAppStore } from '@/stores/appStore';

export function useDatabase() {
  const { dbReady, dbError, setDbReady, setDbError } = useAppStore();

  useEffect(() => {
    if (!dbReady && !dbError) {
      getDatabase()
        .then(() => setDbReady(true))
        .catch((err) => {
          const message = err instanceof Error ? err.message : 'Falha ao inicializar banco de dados';
          console.error('DB init failed:', err);
          setDbError(message);
        });
    }
  }, [dbReady, dbError, setDbReady, setDbError]);

  return { dbReady, dbError };
}
