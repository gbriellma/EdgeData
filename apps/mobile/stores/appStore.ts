import { create } from 'zustand';

interface AppState {
  dbReady: boolean;
  dbError: string | null;
  collectionsSinceBackup: number;
  lastBackupAt: string | null;

  setDbReady: (ready: boolean) => void;
  setDbError: (error: string | null) => void;
  incrementCollectionCount: () => void;
  resetCollectionCount: () => void;
  setLastBackupAt: (date: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  dbReady: false,
  dbError: null,
  collectionsSinceBackup: 0,
  lastBackupAt: null,

  setDbReady: (ready) => set({ dbReady: ready }),
  setDbError: (error) => set({ dbError: error }),
  incrementCollectionCount: () =>
    set((state) => ({
      collectionsSinceBackup: state.collectionsSinceBackup + 1,
    })),
  resetCollectionCount: () => set({ collectionsSinceBackup: 0 }),
  setLastBackupAt: (date) => set({ lastBackupAt: date }),
}));
