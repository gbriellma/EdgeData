import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  archiveProject,
  deleteProject,
  getProjectStats,
  Project,
  ProjectStats,
} from '@/database/db-helpers';
import { Schema } from '@/types/schema';
import { useProjectStore } from '@/stores/projectStore';

export function useProjects() {
  const { projects, setProjects, loading, setLoading } = useProjectStore();
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllProjects();
      if (mountedRef.current) setProjects(data);
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Erro ao carregar projetos');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [setProjects, setLoading]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { projects, loading, error, refresh };
}

export function useProjectDetail(id: string | undefined) {
  const [project, setProject] = useState<Project | null>(null);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [p, s] = await Promise.all([
        getProjectById(id),
        getProjectStats(id),
      ]);
      if (mountedRef.current) {
        setProject(p);
        setStats(s);
      }
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Erro ao carregar projeto');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { project, stats, loading, error, refresh };
}

export function useProjectActions() {
  const create = useCallback(
    async (
      name: string,
      description: string | null,
      subjectSchema: Schema,
      collectionSchema: Schema
    ) => {
      return await createProject(name, description, subjectSchema, collectionSchema);
    },
    []
  );

  const update = useCallback(
    async (
      id: string,
      name: string,
      description: string | null,
      subjectSchema: Schema,
      collectionSchema: Schema
    ) => {
      await updateProject(id, name, description, subjectSchema, collectionSchema);
    },
    []
  );

  const archive = useCallback(async (id: string) => {
    await archiveProject(id);
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteProject(id);
  }, []);

  return { create, update, archive, remove };
}
