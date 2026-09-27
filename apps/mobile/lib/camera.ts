import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import type { PhotoConfig } from '@/components/forms/FieldRenderer';
import type { ValueMap, VariableDefinition } from '@/core/types';
import type { NewFile } from '@/database/repo/observations';
import { isRelativeMediaPath, persistMedia } from './media';

/** Abre a câmera e devolve o URI temporário da foto (redimensionada se configurado). */
export async function takePhoto(config?: PhotoConfig): Promise<string | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permissão necessária', 'Permita o acesso à câmera para fotografar.');
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false, exif: false });
  if (result.canceled || !result.assets[0]) return null;
  let uri = result.assets[0].uri;
  if (config?.width || config?.height) {
    const resize: { width?: number; height?: number } = {};
    if (config.width) resize.width = config.width;
    if (config.height) resize.height = config.height;
    const manipulated = await ImageManipulator.manipulateAsync(uri, [{ resize }], { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG });
    uri = manipulated.uri;
  }
  return uri;
}

/** Aplica a foto capturada ao valor do formulário (campo simples ou multiângulo). */
export function applyPhoto(values: ValueMap, key: string, uri: string, angle?: string): ValueMap {
  if (!angle) return { ...values, [key]: uri };
  const current = Array.isArray(values[key]) ? (values[key] as { angle: string; uri: string }[]) : [];
  return { ...values, [key]: [...current.filter((p) => p.angle !== angle), { angle, uri }] };
}

/**
 * Copia as fotos temporárias do formulário para a pasta permanente do experimento.
 * Devolve os valores com caminhos relativos e a lista de arquivos a registrar.
 */
export async function persistFormMedia(
  variables: readonly VariableDefinition[],
  values: ValueMap,
  experimentId: string,
  namePrefix: string,
): Promise<{ values: ValueMap; files: NewFile[] }> {
  const next: ValueMap = { ...values };
  const files: NewFile[] = [];
  for (const variable of variables) {
    const value = values[variable.key];
    if (variable.type === 'image' && typeof value === 'string' && value) {
      const fresh = !isRelativeMediaPath(value);
      const media = await persistMedia(value, experimentId, `${namePrefix}_${variable.key}`);
      next[variable.key] = media.path;
      if (fresh) files.push({ variableKey: variable.key, path: media.path, mimeType: media.mimeType, bytes: media.bytes, sha256: media.sha256 });
    }
    if (variable.type === 'multi_image' && Array.isArray(value)) {
      const photos: { angle: string; uri: string }[] = [];
      for (const photo of value as { angle: string; uri: string }[]) {
        const fresh = !isRelativeMediaPath(photo.uri);
        const media = await persistMedia(photo.uri, experimentId, `${namePrefix}_${variable.key}_${photo.angle}`);
        photos.push({ angle: photo.angle, uri: media.path });
        if (fresh) files.push({ variableKey: variable.key, path: media.path, mimeType: media.mimeType, bytes: media.bytes, sha256: media.sha256 });
      }
      next[variable.key] = photos;
    }
  }
  return { values: next, files };
}
