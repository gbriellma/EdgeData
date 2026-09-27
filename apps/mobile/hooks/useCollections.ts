import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getCollectionsByProject,
  getCollectionsBySubject,
  getCollectionById,
  createCollection,
  updateCollection,
  deleteCollection,
  createImage,
  getImagesByCollection,
  Collection,
  Image,
} from '@/database/db-helpers';

export function useCollectionsByProject(projectId: string | undefined) {
  const [collections, setCollections] = useState<Collection[]>([]);
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
      const data = await getCollectionsByProject(projectId);
      if (mountedRef.current) setCollections(data);
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Erro ao carregar coletas');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { collections, loading, error, refresh };
}

export function useCollectionsBySubject(subjectId: string | undefined) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!subjectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getCollectionsBySubject(subjectId);
      if (mountedRef.current) setCollections(data);
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Erro ao carregar coletas');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { collections, loading, error, refresh };
}

export function useCollectionDetail(collectionId: string | undefined) {
  const [collection, setCollection] = useState<Collection | null>(null);
  const [images, setImages] = useState<Image[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!collectionId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [c, imgs] = await Promise.all([
        getCollectionById(collectionId),
        getImagesByCollection(collectionId),
      ]);
      if (mountedRef.current) {
        setCollection(c);
        setImages(imgs);
      }
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Erro ao carregar coleta');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [collectionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { collection, images, loading, error, refresh };
}

export function useCollectionActions() {
  const create = useCallback(
    async (
      subjectId: string,
      projectId: string,
      data: object,
      latitude: number | null,
      longitude: number | null
    ) => {
      return await createCollection(subjectId, projectId, data, latitude, longitude);
    },
    []
  );

  const update = useCallback(
    async (
      id: string,
      data: object,
      latitude: number | null,
      longitude: number | null
    ) => {
      await updateCollection(id, data, latitude, longitude);
    },
    []
  );

  const remove = useCallback(async (id: string) => {
    await deleteCollection(id);
  }, []);

  const addImage = useCallback(
    async (
      collectionId: string,
      fieldName: string,
      filePath: string,
      fileSize: number | null,
      width: number | null,
      height: number | null
    ) => {
      return await createImage(collectionId, fieldName, filePath, fileSize, width, height);
    },
    []
  );

  return { create, update, remove, addImage };
}
