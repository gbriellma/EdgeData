import { useState, useCallback, useRef, useEffect } from "react";
import { Platform } from "react-native";
import { BLEConnectionState, BLEDeviceInfo, DevicePayload } from "@/types/ble";

/**
 * Hook para gerenciar conexão BLE
 * 
 * Nota: este é um stub/mock. Para funcionamento real, você precisa de:
 * - react-native-ble-plx (requer development build, não funciona em Expo Go)
 * - ou usar um bridge nativo customizado
 */
export function useBLE() {
  const [connectionState, setConnectionState] =
    useState<BLEConnectionState>(BLEConnectionState.IDLE);
  const [connectedDevice, setConnectedDevice] = useState<BLEDeviceInfo | null>(
    null
  );
  const [lastSensorData, setLastSensorData] = useState<DevicePayload | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const bleRef = useRef<any>(null);
  const subscriptionRef = useRef<any>(null);

  /**
   * Iniciar scan de dispositivos BLE
   */
  const startScan = useCallback(async () => {
    try {
      setConnectionState(BLEConnectionState.SCANNING);
      setError(null);

      // Aqui você implementaria a lógica real com react-native-ble-plx
      // BleManager.scan(...).then(...)

      // Mock: simular encontrar dispositivo
      console.log("[BLE] Iniciando scan (mock)");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      setError(message);
      setConnectionState(BLEConnectionState.ERROR);
      console.error("[BLE] Erro ao iniciar scan:", err);
    }
  }, []);

  /**
   * Conectar a um dispositivo BLE específico
   */
  const connectToDevice = useCallback(async (deviceId: string) => {
    try {
      setConnectionState(BLEConnectionState.CONNECTING);
      setError(null);

      // Aqui você implementaria a lógica real
      // await BleManager.connect(deviceId);

      // Mock: simular conexão bem-sucedida
      setConnectedDevice({
        id: deviceId,
        name: "FoldenDataSensor",
        isConnected: true,
        lastUpdate: Date.now(),
      });

      setConnectionState(BLEConnectionState.CONNECTED);
      console.log("[BLE] Conectado ao dispositivo:", deviceId);

      // Iniciar escuta por notificações
      startListening();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      setError(message);
      setConnectionState(BLEConnectionState.ERROR);
      console.error("[BLE] Erro ao conectar:", err);
    }
  }, []);

  /**
   * Requisitar dados dos sensores (read)
   */
  const requestSensorData = useCallback(async (): Promise<DevicePayload | null> => {
    if (!connectedDevice) {
      setError("Dispositivo não conectado");
      return null;
    }

    try {
      // Aqui você faria um read na característica BLE
      // const data = await BleManager.read(deviceId, serviceUUID, characteristicUUID);

      // Mock: retornar dados simulados dos sensores Atlas Scientific EZO
      const mockData: DevicePayload = {
        device_id: "esp32-ezo-node-01",
        timestamp: Math.floor(Date.now() / 1000),
        sensors: [
          {
            id: "ezo_o2",
            label: "Oxigênio (O₂)",
            unit: "%",
            value: 20.95,
            type: "float",
            ready: true,
          },
          {
            id: "ezo_co2",
            label: "Dióxido de Carbono (CO₂)",
            unit: "ppm",
            value: 412,
            type: "float",
            ready: true,
          },
          {
            id: "ezo_hum_rh",
            label: "Umidade Relativa",
            unit: "%",
            value: 65.2,
            type: "float",
            ready: true,
          },
          {
            id: "ezo_hum_temp",
            label: "Temperatura do Ar",
            unit: "°C",
            value: 28.4,
            type: "float",
            ready: true,
          },
          {
            id: "ezo_hum_dew",
            label: "Ponto de Orvalho",
            unit: "°C",
            value: 18.3,
            type: "float",
            ready: true,
          },
        ],
      };

      setLastSensorData(mockData);
      return mockData;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      setError(message);
      console.error("[BLE] Erro ao requisitar dados:", err);
      return null;
    }
  }, [connectedDevice]);

  /**
   * Iniciar escuta por notificações (updates automáticos)
   */
  const startListening = useCallback(() => {
    // Aqui você configuraria notificações
    // BleManager.startNotification(...).then(...)
    console.log("[BLE] Iniciando escuta por notificações (mock)");
  }, []);

  /**
   * Desconectar do dispositivo
   */
  const disconnect = useCallback(async () => {
    try {
      if (connectedDevice) {
        // BleManager.disconnect(connectedDevice.id);
        console.log("[BLE] Desconectado");
      }

      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
      }

      setConnectedDevice(null);
      setConnectionState(BLEConnectionState.IDLE);
      setLastSensorData(null);
    } catch (err) {
      console.error("[BLE] Erro ao desconectar:", err);
    }
  }, [connectedDevice]);

  /**
   * Parar scan
   */
  const stopScan = useCallback(async () => {
    try {
      // BleManager.stopScan();
      setConnectionState(BLEConnectionState.IDLE);
    } catch (err) {
      console.error("[BLE] Erro ao parar scan:", err);
    }
  }, []);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
      }
    };
  }, []);

  return {
    // State
    connectionState,
    connectedDevice,
    lastSensorData,
    error,

    // Actions
    startScan,
    stopScan,
    connectToDevice,
    disconnect,
    requestSensorData,
  };
}
