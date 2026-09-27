import { create } from 'zustand';
import { getDb } from '@/database/connection';
import { getSetting, setSetting } from '@/database/repo/common';

export type UiMode = 'simple' | 'scientific';

export interface SettingsState {
  loaded: boolean;
  /** Nome de quem opera o app — vai para sessões, observações e auditoria */
  operatorName: string;
  operatorOrcid: string;
  uiMode: UiMode;
  /** Backup automático a cada N observações (0 = desligado) */
  autoBackupEvery: number;
  observationsSinceBackup: number;
  lastBackupAt: string | null;
  load: () => Promise<void>;
  update: (changes: Partial<Pick<SettingsState, 'operatorName' | 'operatorOrcid' | 'uiMode' | 'autoBackupEvery' | 'observationsSinceBackup' | 'lastBackupAt'>>) => Promise<void>;
}

const KEYS = ['operatorName', 'operatorOrcid', 'uiMode', 'autoBackupEvery', 'observationsSinceBackup', 'lastBackupAt'] as const;

export const useSettings = create<SettingsState>((set) => ({
  loaded: false,
  operatorName: '',
  operatorOrcid: '',
  uiMode: 'simple',
  autoBackupEvery: 20,
  observationsSinceBackup: 0,
  lastBackupAt: null,

  load: async () => {
    const db = await getDb();
    const values: Record<string, string | null> = {};
    for (const key of KEYS) values[key] = await getSetting(db, key);
    set({
      loaded: true,
      operatorName: values.operatorName ?? '',
      operatorOrcid: values.operatorOrcid ?? '',
      uiMode: values.uiMode === 'scientific' ? 'scientific' : 'simple',
      autoBackupEvery: values.autoBackupEvery ? Number(values.autoBackupEvery) : 20,
      observationsSinceBackup: values.observationsSinceBackup ? Number(values.observationsSinceBackup) : 0,
      lastBackupAt: values.lastBackupAt || null,
    });
  },

  update: async (changes) => {
    const db = await getDb();
    for (const [key, value] of Object.entries(changes)) {
      await setSetting(db, key, value === null || value === undefined ? '' : String(value));
    }
    set(changes);
  },
}));

/** Nome usado como autor de registros e auditoria. */
export function currentActor(): string {
  return useSettings.getState().operatorName.trim() || 'Pesquisador';
}
