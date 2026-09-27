import * as Location from 'expo-location';
import type { GeoPoint } from '@/core/types';

/** Captura a posição atual com precisão, altitude e horário (WGS 84). */
export async function captureLocation(): Promise<GeoPoint | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;
  try {
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      altitude: position.coords.altitude ?? null,
      accuracy: position.coords.accuracy ?? null,
      crs: 'EPSG:4326',
      capturedAt: new Date(position.timestamp).toISOString(),
    };
  } catch {
    return null;
  }
}

export function formatGeoPoint(point: GeoPoint | null | undefined): string {
  if (!point) return 'Sem localização';
  const accuracy = point.accuracy ? ` ±${Math.round(point.accuracy)} m` : '';
  return `${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}${accuracy}`;
}
