// Tipos para BLE e Sensores Atlas Scientific EZO
export interface SensorData {
  id: string;
  label: string;
  unit: string;
  value: number | string;
  type: "float" | "int" | "string" | "boolean";
  ready?: boolean; // indica se o sensor respondeu com sucesso
}

export interface DevicePayload {
  device_id: string;
  timestamp: number;
  sensors: SensorData[];
}

export interface SensorBinding {
  sensor_id: string;
  dataset_field_key: string;
  sensor_label?: string;
}

export interface BLEDeviceInfo {
  id: string;
  name: string;
  isConnected: boolean;
  lastUpdate?: number;
}

export enum BLEConnectionState {
  IDLE = "idle",
  SCANNING = "scanning",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  ERROR = "error",
}

// IDs dos sensores Atlas Scientific EZO (devem coincidir com o firmware)
export const EZO_SENSOR_IDS = {
  O2: "ezo_o2",
  CO2: "ezo_co2",
  HUMIDITY: "ezo_hum_rh",
  AIR_TEMP: "ezo_hum_temp",
  DEW_POINT: "ezo_hum_dew",
} as const;
