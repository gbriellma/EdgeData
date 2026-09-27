import { create } from 'zustand';
import { Project } from '@/database/db-helpers';
import { Schema } from '@/types/schema';

interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;
  loading: boolean;

  setProjects: (projects: Project[]) => void;
  setActiveProject: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  activeProjectId: null,
  loading: false,

  setProjects: (projects) => set({ projects }),
  setActiveProject: (id) => set({ activeProjectId: id }),
  setLoading: (loading) => set({ loading }),
}));
