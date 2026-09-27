import * as FileSystem from 'expo-file-system/legacy';
import { base64ToBytes, sha256Hex } from '@/core/export/checksums';
import { uuid } from '@/database/db';

/**
 * Mídia fica em <documentos>/media/<experimento>/ e o banco guarda o caminho
 * RELATIVO — no iOS o caminho absoluto da pasta de documentos muda entre
 * atualizações do app.
 */
export const MEDIA_DIR = 'media/';

export interface PersistedMedia {
  path: string;
  bytes: number;
  sha256: string;
  mimeType: string;
}

export function isRelativeMediaPath(value: string): boolean {
  return value.startsWith(MEDIA_DIR);
}

/** Caminho relativo (ou URI antiga absoluta) → URI utilizável por <Image> e FileSystem. */
export function resolveMediaUri(pathOrUri: string): string {
  if (!pathOrUri) return pathOrUri;
  if (isRelativeMediaPath(pathOrUri)) return `${FileSystem.documentDirectory}${pathOrUri}`;
  return pathOrUri;
}

function extensionOf(uri: string): string {
  const match = /\.([A-Za-z0-9]{2,5})(?:\?|$)/.exec(uri);
  return match ? match[1].toLowerCase() : 'jpg';
}

function mimeOf(ext: string): string {
  if (ext === 'png') return 'image/png';
  if (ext === 'heic') return 'image/heic';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

export function safeFileName(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'arquivo'
  );
}

export async function hashFile(uri: string): Promise<{ sha256: string; bytes: number }> {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const bytes = base64ToBytes(base64);
  return { sha256: sha256Hex(bytes), bytes: bytes.byteLength };
}

/** Copia um arquivo temporário (câmera) para a pasta permanente e calcula o SHA-256. */
export async function persistMedia(tempUri: string, experimentId: string, baseName: string): Promise<PersistedMedia> {
  if (isRelativeMediaPath(tempUri)) {
    const { sha256, bytes } = await hashFile(resolveMediaUri(tempUri));
    return { path: tempUri, sha256, bytes, mimeType: mimeOf(extensionOf(tempUri)) };
  }
  const ext = extensionOf(tempUri);
  const dir = `${MEDIA_DIR}${experimentId}/`;
  await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}${dir}`, { intermediates: true });
  const path = `${dir}${safeFileName(baseName)}_${uuid().slice(0, 8)}.${ext}`;
  await FileSystem.copyAsync({ from: tempUri, to: `${FileSystem.documentDirectory}${path}` });
  const { sha256, bytes } = await hashFile(`${FileSystem.documentDirectory}${path}`);
  return { path, sha256, bytes, mimeType: mimeOf(ext) };
}
