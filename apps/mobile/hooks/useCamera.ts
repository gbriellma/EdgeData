import { useState, useCallback } from 'react';
import { useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import type { CameraView } from 'expo-camera';

export function useCamera() {
  const [permission, requestCameraPermission] = useCameraPermissions();

  const hasPermission = permission?.granted ?? false;

  const requestPermission = useCallback(async () => {
    await requestCameraPermission();
  }, [requestCameraPermission]);

  const takePicture = useCallback(async (
    cameraRef: React.RefObject<CameraView>
  ): Promise<string | null> => {
    if (!cameraRef.current) return null;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 1 });
      return photo?.uri ?? null;
    } catch (error) {
      console.error('useCamera: takePicture failed', error);
      return null;
    }
  }, []);

  const pickFromGallery = useCallback(async (): Promise<string | null> => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return null;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        allowsEditing: false,
      });
      if (result.canceled) return null;
      return result.assets[0]?.uri ?? null;
    } catch (error) {
      console.error('useCamera: pickFromGallery failed', error);
      return null;
    }
  }, []);

  return {
    hasPermission,
    requestPermission,
    takePicture,
    pickFromGallery,
  };
}
