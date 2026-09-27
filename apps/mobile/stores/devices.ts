import { create } from 'zustand';
import type { DeviceManifest, SensorManifest } from '@/core/device/manifest';
import type { ObsMessage } from '@/core/device/protocol';
import { DeviceSession, type LatestValue } from '@/core/device/session';
import { getDb, getDeviceDb } from '@/database/connection';
import type { Device } from '@/database/models';
import { recordReadings, upsertDevice } from '@/database/repo/devices';
import { addDevicesToSnapshot, recordEvent } from '@/database/repo/sessions';
import { connectBle, ensureBlePermissions, startScan as bleStartScan, type ScanResult } from '@/devices/ble';
import { currentActor } from './settings';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface ConnectionState {
  bleId: string;
  name: string;
  status: ConnectionStatus;
  error: string | null;
  /** Dispositivo cadastrado a partir do manifesto */
  device: Device | null;
  manifest: DeviceManifest | null;
  warnings: string[];
  latest: Record<string, LatestValue>;
  streaming: boolean;
  intervalMs: number | null;
  received: number;
  lost: number;
  batteryPct: number | null;
  /** Leituras gravadas enquanto ligado a uma sessão de coleta */
  recorded: number;
}

/** Sessão de coleta que recebe as leituras e eventos dos dispositivos. */
export interface RecordingTarget {
  experimentId: string;
  sessionId: string;
}

export interface SensorRead {
  raw: number | string | boolean | null;
  sensor: SensorManifest;
  /** Leitura gravada (quando há sessão ligada) — vai para a proveniência da observação */
  readingId: string | null;
  receivedAt: string;
}

interface DevicesState {
  scanning: boolean;
  found: ScanResult[];
  scanError: string | null;
  connections: Record<string, ConnectionState>;
  target: RecordingTarget | null;
  writeError: string | null;
  startScan: () => Promise<void>;
  stopScan: () => void;
  connect: (bleId: string, name: string) => Promise<void>;
  disconnect: (bleId: string) => Promise<void>;
  readNow: (bleId: string) => Promise<void>;
  setStreaming: (bleId: string, on: boolean, intervalMs?: number) => Promise<void>;
  attach: (target: RecordingTarget | null) => Promise<void>;
  readSensor: (deviceId: string, sensorId: string) => Promise<SensorRead>;
}

// Objetos com estado que não pertencem ao store (não serializáveis)
const sessions = new Map<string, DeviceSession>();
const closing = new Set<string>();
const recordedObs = new WeakMap<ObsMessage, Promise<string[]>>();
let stopScanFn: (() => void) | null = null;
let scanTimer: ReturnType<typeof setTimeout> | null = null;

// Escritas no banco em fila: preservam a ordem de chegada das leituras
let writeQueue: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(fn);
  writeQueue = next.catch(() => undefined);
  return next;
}

// Atualizações de "última leitura" agrupadas para não redesenhar a cada pacote
const pendingLatest = new Map<string, Record<string, LatestValue>>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const useDevices = create<DevicesState>((set, get) => {
  const patch = (bleId: string, changes: Partial<ConnectionState>) =>
    set((state) => {
      const current = state.connections[bleId];
      if (!current) return state;
      return { connections: { ...state.connections, [bleId]: { ...current, ...changes } } };
    });

  const flushLatest = () => {
    flushTimer = null;
    set((state) => {
      const connections = { ...state.connections };
      for (const [bleId, values] of pendingLatest) {
        const current = connections[bleId];
        const session = sessions.get(bleId);
        if (!current) continue;
        connections[bleId] = {
          ...current,
          latest: { ...current.latest, ...values },
          received: session?.tracker.received ?? current.received,
          lost: session?.tracker.lost ?? current.lost,
        };
      }
      pendingLatest.clear();
      return { connections };
    });
  };

  const snapshotEntry = (c: ConnectionState) =>
    c.device && c.manifest ? { deviceId: c.device.id, name: c.manifest.name, manifest: c.manifest, connected: true } : null;

  const onMessage = (bleId: string, session: DeviceSession): Parameters<DeviceSession['on']>[0] => (message, receivedAt) => {
    const connection = get().connections[bleId];
    const target = get().target;
    if (!connection) return;

    if (message.t === 'obs') {
      const values: Record<string, LatestValue> = pendingLatest.get(bleId) ?? {};
      for (const [sensorId, value] of Object.entries(message.values)) values[sensorId] = session.latest.get(sensorId) ?? { value, receivedAt };
      pendingLatest.set(bleId, values);
      if (!flushTimer) flushTimer = setTimeout(flushLatest, 250);

      const device = connection.device;
      if (target && device) {
        const readings = Object.entries(message.values).map(([sensorId, value]) => ({
          sensorId,
          value,
          seq: message.seq,
          deviceMs: message.ms,
          deviceUtcMs: message.utc_ms,
          receivedAt,
        }));
        const promise = enqueue(async () =>
          recordReadings(await getDeviceDb(), { experimentId: target.experimentId, sessionId: target.sessionId, device, readings }),
        );
        recordedObs.set(message, promise);
        promise.then(
          (ids) => patch(bleId, { recorded: (get().connections[bleId]?.recorded ?? 0) + (ids.length > 0 ? 1 : 0) }),
          (error) => set({ writeError: `Falha ao gravar leitura: ${errorMessage(error)}` }),
        );
      }
      return;
    }

    if (message.t === 'status') {
      patch(bleId, {
        batteryPct: typeof message.battery_pct === 'number' ? message.battery_pct : connection.batteryPct,
        streaming: typeof message.streaming === 'boolean' ? message.streaming : connection.streaming,
        intervalMs: typeof message.interval_ms === 'number' ? message.interval_ms : connection.intervalMs,
      });
      return;
    }

    if (message.t === 'evt' && target && connection.device) {
      const deviceId = connection.device.id;
      const occurredAt = message.utc_ms ? new Date(message.utc_ms).toISOString() : receivedAt;
      enqueue(async () =>
        recordEvent(
          await getDeviceDb(),
          { experimentId: target.experimentId, sessionId: target.sessionId, label: message.label, kind: 'device', deviceId, data: message.data, occurredAt },
          connection.name,
        ),
      ).catch((error) => set({ writeError: `Falha ao gravar evento: ${errorMessage(error)}` }));
    }
  };

  const handleDisconnect = (bleId: string) => {
    const session = sessions.get(bleId);
    sessions.delete(bleId);
    void session?.close().catch(() => undefined);
    if (closing.has(bleId)) return;
    const connection = get().connections[bleId];
    patch(bleId, { status: 'disconnected', streaming: false, error: 'Conexão perdida' });
    const target = get().target;
    if (target && connection?.device) {
      const deviceId = connection.device.id;
      enqueue(async () =>
        recordEvent(
          await getDeviceDb(),
          { experimentId: target.experimentId, sessionId: target.sessionId, label: `Conexão perdida: ${connection.name}`, kind: 'device', deviceId },
          currentActor(),
        ),
      ).catch(() => undefined);
    }
  };

  return {
    scanning: false,
    found: [],
    scanError: null,
    connections: {},
    target: null,
    writeError: null,

    startScan: async () => {
      if (get().scanning) return;
      set({ scanError: null, found: [] });
      try {
        if (!(await ensureBlePermissions())) {
          set({ scanError: 'Permissão de Bluetooth negada. Libere nas configurações do Android.' });
          return;
        }
        stopScanFn = await bleStartScan(
          (device) =>
            set((state) => {
              const others = state.found.filter((d) => d.id !== device.id);
              return { found: [...others, device].sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999)) };
            }),
          (message) => {
            set({ scanError: message });
            get().stopScan();
          },
        );
        set({ scanning: true });
        scanTimer = setTimeout(() => get().stopScan(), 15000);
      } catch (error) {
        set({ scanError: errorMessage(error), scanning: false });
      }
    },

    stopScan: () => {
      if (scanTimer) clearTimeout(scanTimer);
      scanTimer = null;
      stopScanFn?.();
      stopScanFn = null;
      set({ scanning: false });
    },

    connect: async (bleId, name) => {
      const existing = get().connections[bleId];
      if (existing && (existing.status === 'connected' || existing.status === 'connecting')) return;
      get().stopScan();
      closing.delete(bleId);
      set((state) => ({
        connections: {
          ...state.connections,
          [bleId]: {
            bleId,
            name,
            status: 'connecting',
            error: null,
            device: existing?.device ?? null,
            manifest: existing?.manifest ?? null,
            warnings: [],
            latest: existing?.latest ?? {},
            streaming: false,
            intervalMs: null,
            received: 0,
            lost: 0,
            batteryPct: null,
            recorded: existing?.recorded ?? 0,
          },
        },
      }));

      let session: DeviceSession | null = null;
      try {
        if (!(await ensureBlePermissions())) throw new Error('Permissão de Bluetooth negada');
        const { link } = await connectBle(bleId, () => handleDisconnect(bleId));
        session = new DeviceSession(link, { timeoutMs: 6000 });
        sessions.set(bleId, session);
        session.on(onMessage(bleId, session));
        const manifest = await session.hello();
        const device = await upsertDevice(await getDb(), manifest, 'ble', bleId, currentActor());
        if (manifest.capabilities?.includes('time')) await session.syncTime().catch(() => undefined);
        patch(bleId, { status: 'connected', name: manifest.name, manifest, device, warnings: session.manifestWarnings });

        const target = get().target;
        const entry = snapshotEntry(get().connections[bleId]);
        if (target && entry) await addDevicesToSnapshot(await getDb(), target.sessionId, [entry]);
      } catch (error) {
        closing.add(bleId);
        sessions.delete(bleId);
        await session?.close().catch(() => undefined);
        patch(bleId, { status: 'error', error: errorMessage(error) });
      }
    },

    disconnect: async (bleId) => {
      closing.add(bleId);
      const session = sessions.get(bleId);
      sessions.delete(bleId);
      if (session) {
        if (get().connections[bleId]?.streaming) await session.stop().catch(() => undefined);
        await session.close().catch(() => undefined);
      }
      set((state) => {
        const connections = { ...state.connections };
        delete connections[bleId];
        return { connections };
      });
    },

    readNow: async (bleId) => {
      const session = sessions.get(bleId);
      if (!session) throw new Error('Dispositivo não conectado');
      await session.read();
    },

    setStreaming: async (bleId, on, intervalMs) => {
      const session = sessions.get(bleId);
      if (!session) throw new Error('Dispositivo não conectado');
      if (on) await session.start(intervalMs);
      else await session.stop();
      patch(bleId, { streaming: on, intervalMs: on ? (intervalMs ?? get().connections[bleId]?.intervalMs ?? null) : null });
    },

    attach: async (target) => {
      set({ target, writeError: null });
      if (!target) return;
      const entries = Object.values(get().connections)
        .filter((c) => c.status === 'connected')
        .map(snapshotEntry)
        .filter((e): e is NonNullable<typeof e> => e !== null);
      if (entries.length > 0) await addDevicesToSnapshot(await getDb(), target.sessionId, entries);
    },

    readSensor: async (deviceId, sensorId) => {
      const connection = Object.values(get().connections).find((c) => c.device?.id === deviceId && c.status === 'connected');
      const session = connection ? sessions.get(connection.bleId) : undefined;
      if (!connection || !session) throw new Error('Dispositivo não conectado. Conecte-o na aba Dispositivos.');
      const sensor = connection.manifest?.sensors.find((s) => s.id === sensorId);
      if (!sensor) throw new Error(`O dispositivo não tem o sensor "${sensorId}"`);
      const message = await session.read();
      if (!(sensorId in message.values)) throw new Error(`A leitura não trouxe o sensor "${sensorId}"`);
      const ids = (await recordedObs.get(message)) ?? [];
      const index = Object.keys(message.values).indexOf(sensorId);
      return {
        raw: message.values[sensorId],
        sensor,
        readingId: ids[index] ?? null,
        receivedAt: session.latest.get(sensorId)?.receivedAt ?? new Date().toISOString(),
      };
    },
  };
});

/** Dispositivos conectados agora (para telas que só precisam da lista). */
export function connectedDevices(connections: Record<string, ConnectionState>): ConnectionState[] {
  return Object.values(connections).filter((c) => c.status === 'connected');
}
