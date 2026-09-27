import { useState, useCallback } from 'react';
import * as Location from 'expo-location';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export function useLocation() {
  const [hasPermission, setHasPermission] = useState(false);
  const [loading, setLoading] = useState(false);

  const requestPermission = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    setHasPermission(status === 'granted');
  }, []);

  const getCurrentLocation = useCallback(async (): Promise<Coordinates | null> => {
    if (!hasPermission) return null;
    setLoading(true);
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    } catch (error) {
      console.error('useLocation: getCurrentLocation failed', error);
      return null;
    } finally {
      setLoading(false);
    }
  }, [hasPermission]);

  return {
    hasPermission,
    loading,
    requestPermission,
    getCurrentLocation,
  };
}
