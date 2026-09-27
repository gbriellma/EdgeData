import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Schema } from '@/types/schema';
import { ProjectTemplate, TEMPLATES } from '@/constants/templates';

// ── Template file format ──
export interface TemplateFile {
  version: number;
  type: 'edgedata-template';
  name: string;
  description: string;
  subjectSchema: Schema;
  collectionSchema: Schema;
  createdAt: string;
}

const CUSTOM_TEMPLATES_DIR = `${FileSystem.documentDirectory}custom_templates/`;

// ── Ensure directory ──
async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(CUSTOM_TEMPLATES_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CUSTOM_TEMPLATES_DIR, { intermediates: true });
  }
}

// ── Export template to shareable JSON file ──
export async function exportTemplate(
  name: string,
  description: string,
  subjectSchema: Schema,
  collectionSchema: Schema
): Promise<string> {
  const template: TemplateFile = {
    version: 1,
    type: 'edgedata-template',
    name,
    description,
    subjectSchema,
    collectionSchema,
    createdAt: new Date().toISOString(),
  };

  const safeName = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 60);

  const filePath = `${FileSystem.cacheDirectory}${safeName}.edgetemplate.json`;
  await FileSystem.writeAsStringAsync(filePath, JSON.stringify(template, null, 2));

  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(filePath, {
      mimeType: 'application/json',
      dialogTitle: 'Exportar Template',
    });
  }

  return filePath;
}

// ── Import template from file picker ──
export async function importTemplateFromFile(): Promise<TemplateFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'application/octet-stream'],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.[0]) return null;

  const content = await FileSystem.readAsStringAsync(result.assets[0].uri);
  const parsed = JSON.parse(content);

  // Validate structure
  if (!parsed.subjectSchema?.fields || !parsed.collectionSchema?.fields) {
    throw new Error('Arquivo inválido: não contém schemas válidos.');
  }

  // Accept both versioned template files and plain schema objects
  const template: TemplateFile = {
    version: parsed.version ?? 1,
    type: 'edgedata-template',
    name: parsed.name ?? result.assets[0].name?.replace('.edgetemplate.json', '').replace('.json', '') ?? 'Template Importado',
    description: parsed.description ?? '',
    subjectSchema: parsed.subjectSchema,
    collectionSchema: parsed.collectionSchema,
    createdAt: parsed.createdAt ?? new Date().toISOString(),
  };

  return template;
}

// ── Save a custom template locally ──
export async function saveCustomTemplate(template: TemplateFile): Promise<void> {
  await ensureDir();
  const id = `custom_${Date.now()}`;
  const filePath = `${CUSTOM_TEMPLATES_DIR}${id}.json`;
  await FileSystem.writeAsStringAsync(filePath, JSON.stringify(template, null, 2));
}

// ── List all custom templates saved locally ──
export async function listCustomTemplates(): Promise<ProjectTemplate[]> {
  await ensureDir();
  const files = await FileSystem.readDirectoryAsync(CUSTOM_TEMPLATES_DIR);
  const templates: ProjectTemplate[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const content = await FileSystem.readAsStringAsync(`${CUSTOM_TEMPLATES_DIR}${file}`);
      const parsed: TemplateFile = JSON.parse(content);
      templates.push({
        id: file.replace('.json', ''),
        name: parsed.name,
        description: parsed.description,
        subjectSchema: parsed.subjectSchema,
        collectionSchema: parsed.collectionSchema,
      });
    } catch {
      // Skip invalid files
    }
  }

  return templates;
}

// ── Delete a custom template ──
export async function deleteCustomTemplate(id: string): Promise<void> {
  const filePath = `${CUSTOM_TEMPLATES_DIR}${id}.json`;
  const info = await FileSystem.getInfoAsync(filePath);
  if (info.exists) {
    await FileSystem.deleteAsync(filePath);
  }
}

// ── Get ALL templates (built-in + custom) ──
export async function getAllTemplates(): Promise<ProjectTemplate[]> {
  const custom = await listCustomTemplates();
  return [...TEMPLATES, ...custom];
}
