import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { BUILTIN_TEMPLATES, parseTemplate, templateToFile, type ExperimentTemplate } from '@/core/templates';
import { safeFileName } from './media';

const CUSTOM_DIR = `${FileSystem.documentDirectory}templates/`;

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(CUSTOM_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(CUSTOM_DIR, { intermediates: true });
}

/** Abre o seletor de arquivos e lê um `.edgetemplate.json` (formatos novo e antigo). */
export async function pickTemplateFile(): Promise<ExperimentTemplate | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'application/octet-stream', '*/*'], copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]) return null;
  const content = await FileSystem.readAsStringAsync(result.assets[0].uri);
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    throw new Error('O arquivo não é um JSON válido');
  }
  return parseTemplate(json);
}

export async function shareTemplate(template: ExperimentTemplate): Promise<void> {
  const path = `${FileSystem.cacheDirectory}${safeFileName(template.name)}.edgetemplate.json`;
  await FileSystem.writeAsStringAsync(path, templateToFile(template));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: 'Compartilhar template' });
  }
}

export async function saveCustomTemplate(template: ExperimentTemplate): Promise<void> {
  await ensureDir();
  await FileSystem.writeAsStringAsync(`${CUSTOM_DIR}${safeFileName(template.id)}.json`, templateToFile(template));
}

export async function listCustomTemplates(): Promise<ExperimentTemplate[]> {
  await ensureDir();
  const files = await FileSystem.readDirectoryAsync(CUSTOM_DIR);
  const templates: ExperimentTemplate[] = [];
  for (const file of files.filter((f) => f.endsWith('.json'))) {
    try {
      templates.push(parseTemplate(JSON.parse(await FileSystem.readAsStringAsync(`${CUSTOM_DIR}${file}`))));
    } catch {
      // arquivo corrompido é ignorado
    }
  }
  return templates.sort((a, b) => a.name.localeCompare(b.name));
}

export async function deleteCustomTemplate(id: string): Promise<void> {
  await FileSystem.deleteAsync(`${CUSTOM_DIR}${safeFileName(id)}.json`, { idempotent: true });
}

export { BUILTIN_TEMPLATES };
