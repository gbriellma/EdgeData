import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getSubjectsByProject,
  createSubject,
  updateSubject,
  deleteSubject,
  createSubjectsBatch,
  markQRGenerated,
  Subject,
} from '@/database/db-helpers';

export function useSubjects(projectId: string | undefined) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getSubjectsByProject(projectId);
      if (mountedRef.current) setSubjects(data);
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Erro ao carregar sujeitos');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(
    async (data: object) => {
      if (!projectId) return '';
      const id = await createSubject(projectId, data);
      await refresh();
      return id;
    },
    [projectId, refresh]
  );

  const update = useCallback(
    async (id: string, data: object) => {
      await updateSubject(id, data);
      await refresh();
    },
    [refresh]
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteSubject(id);
      await refresh();
    },
    [refresh]
  );

  const importBatch = useCallback(
    async (dataList: object[]) => {
      if (!projectId) return [];
      const ids = await createSubjectsBatch(projectId, dataList);
      await refresh();
      return ids;
    },
    [projectId, refresh]
  );

  const markQR = useCallback(
    async (ids: string[]) => {
      await markQRGenerated(ids);
      await refresh();
    },
    [refresh]
  );

  return { subjects, loading, error, refresh, create, update, remove, importBatch, markQR };
}
