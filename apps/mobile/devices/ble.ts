import { PermissionsAndroid, Platform } from 'react-native';
import type { BleManager, Device as BleDevice, Subscription } from 'react-native-ble-plx';
import { BLE_NAME_PREFIX, BLE_RX_CHAR_UUID, BLE_SERVICE_UUID, BLE_TX_CHAR_UUID, chunkUtf8 } from '@/core/device/protocol';
import type { DeviceLink } from '@/core/device/session';
import { base64ToChunk, textToBase64, Utf8StreamDecoder } from '@/core/device/utf8';

let manager: BleManager | null = null;

export class BluetoothUnavailableError extends Error {}

/** BleManager único. Exige development build (não funciona no Expo Go). */
export function getBleManager(): BleManager {
  if (manager) return manager;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BleManager: Manager } = require('react-native-ble-plx') as typeof import('react-native-ble-plx');
    manager = new Manager();
    return manager;
  } catch {
    throw new BluetoothUnavailableError('Bluetooth indisponível nesta versão do app. Use um development build (npx expo run:android).');
  }
}

export async function ensureBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const version = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);
  const permissions =
    version >= 31
      ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const result = await PermissionsAndroid.requestMultiple(permissions);
  return permissions.every((p) => result[p] === PermissionsAndroid.RESULTS.GRANTED);
}

export async function bluetoothState(): Promise<string> {
  return getBleManager().state();
}

export interface ScanResult {
  id: string;
  name: string;
  rssi: number | null;
}

/** Procura dispositivos que anunciam o serviço EdgeData (ou o prefixo de nome). */
export async function startScan(onFound: (device: ScanResult) => void, onError: (message: string) => void): Promise<() => void> {
  const ble = getBleManager();
  await ble.startDeviceScan(null, { allowDuplicates: false }, async (error, device) => {
    if (error) {
      onError(error.message);
      return;
    }
    if (!device) return;
    const name = device.localName ?? device.name ?? '';
    const advertisesService = device.serviceUUIDs?.some((u) => u.toLowerCase() === BLE_SERVICE_UUID);
    if (!advertisesService && !name.startsWith(BLE_NAME_PREFIX)) return;
    onFound({ id: device.id, name: name || device.id, rssi: device.rssi ?? null });
  });
  return () => {
    void ble.stopDeviceScan();
  };
}

/** Conecta e devolve um canal de texto (NDJSON) sobre as características RX/TX. */
export async function connectBle(bleId: string, onDisconnect: () => void): Promise<{ link: DeviceLink; device: BleDevice }> {
  const ble = getBleManager();
  let device = await ble.connectToDevice(bleId, Platform.OS === 'android' ? { requestMTU: 247 } : undefined);
  device = await device.discoverAllServicesAndCharacteristics();
  const decoder = new Utf8StreamDecoder();
  const listeners = new Set<(chunk: string) => void>();
  const subscriptions: Subscription[] = [];

  subscriptions.push(
    device.monitorCharacteristicForService(BLE_SERVICE_UUID, BLE_TX_CHAR_UUID, (error, characteristic) => {
      if (error || !characteristic?.value) return;
      const text = decoder.decode(base64ToChunk(characteristic.value));
      listeners.forEach((listener) => listener(text));
    }),
  );
  subscriptions.push(device.onDisconnected(() => onDisconnect()));

  const link: DeviceLink = {
    async write(text) {
      const size = Math.max(20, (device.mtu ?? 23) - 3);
      for (const chunk of chunkUtf8(text, size)) {
        await device.writeCharacteristicWithResponseForService(BLE_SERVICE_UUID, BLE_RX_CHAR_UUID, textToBase64(chunk));
      }
    },
    onText(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async close() {
      subscriptions.forEach((s) => s.remove());
      listeners.clear();
      await ble.cancelDeviceConnection(bleId).catch(() => undefined);
    },
  };
  return { link, device };
}
