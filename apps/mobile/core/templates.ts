import { emptyDesign } from './design';
import type {
  ExperimentalDesign,
  ExperimentMetadata,
  FieldType,
  ProtocolVariable,
  VariableScope,
} from './types';
import { normalizeUnitCode } from './units';
import { FIELD_TYPE_INFO, slugifyKey, uniqueKey } from './variables';

/** Arquivo `.edgetemplate.json` (versão 2). */
export interface ExperimentTemplate {
  version: 2;
  type: 'edgedata-template';
  id: string;
  name: string;
  description: string;
  /** Área de aplicação (agricultura, IoT, visão computacional…) */
  domain?: string;
  metadata?: Partial<Pick<ExperimentMetadata, 'objective' | 'methodology' | 'hypothesis'>>;
  design: ExperimentalDesign;
  variables: ProtocolVariable[];
  createdAt?: string;
}

// ── Conversão do formato antigo (schemas de sujeito/coleta) ──────────────────

interface LegacyField {
  name?: string;
  label?: string;
  type?: string;
  required?: boolean;
  order?: number;
  config?: Record<string, unknown>;
}

/**
 * Converte um schema do formato anterior (campos de "sujeito" ou "coleta") em
 * variáveis. Unidades em texto livre ("cm", "°C") viram códigos UCUM quando
 * reconhecidas; caso contrário o texto original vai para a descrição.
 */
export function legacySchemaToVariables(schema: unknown, scope: VariableScope): ProtocolVariable[] {
  return legacySchemaFields(schema, scope).map((f) => f.variable);
}

/** Como `legacySchemaToVariables`, mas mantém o nome antigo de cada campo (para migrar valores). */
export function legacySchemaFields(schema: unknown, scope: VariableScope): { legacyName: string; variable: ProtocolVariable }[] {
  const fields: LegacyField[] =
    schema && typeof schema === 'object' && Array.isArray((schema as { fields?: unknown }).fields)
      ? ((schema as { fields: LegacyField[] }).fields)
      : [];
  const keys: string[] = [];
  return fields
    .filter((f) => f && typeof f === 'object')
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((field, index) => {
      const label = String(field.label ?? field.name ?? `Campo ${index + 1}`);
      const key = uniqueKey(slugifyKey(String(field.name ?? label)), keys);
      keys.push(key);
      const type: FieldType = (field.type && field.type in FIELD_TYPE_INFO ? field.type : 'short_text') as FieldType;
      const config = { ...(field.config ?? {}) } as Record<string, unknown>;
      const rawUnit = typeof config.unit === 'string' ? config.unit : undefined;
      delete config.unit;
      delete config.source;
      const unit = normalizeUnitCode(rawUnit);
      const variable: ProtocolVariable = {
        scope,
        key,
        label,
        type,
        required: !!field.required,
        order: index + 1,
        config: config as ProtocolVariable['config'],
      };
      if (unit) variable.unit = unit;
      else if (rawUnit) variable.description = `Unidade informada: ${rawUnit}`;
      if (type === 'scale') variable.unit = '{score}';
      return { legacyName: String(field.name ?? label), variable };
    });
}

// ── Leitura de arquivos de template ──────────────────────────────────────────

export class TemplateError extends Error {}

export function parseTemplate(json: unknown): ExperimentTemplate {
  if (!json || typeof json !== 'object') throw new TemplateError('Arquivo de template inválido');
  const data = json as Record<string, unknown>;
  if (data.type !== 'edgedata-template') throw new TemplateError('Este arquivo não é um template do EdgeData');
  const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Template importado';
  const description = typeof data.description === 'string' ? data.description : '';

  if (data.version === 1) {
    return {
      version: 2,
      type: 'edgedata-template',
      id: `import-${slugifyKey(name)}`,
      name,
      description,
      design: emptyDesign(),
      variables: [
        ...legacySchemaToVariables(data.subjectSchema, 'sample'),
        ...legacySchemaToVariables(data.collectionSchema, 'observation'),
      ],
      createdAt: typeof data.createdAt === 'string' ? data.createdAt : undefined,
    };
  }

  if (data.version === 2) {
    if (!Array.isArray(data.variables)) throw new TemplateError('Template sem variáveis');
    const design = { ...emptyDesign(), ...(data.design as Partial<ExperimentalDesign> | undefined) };
    return {
      version: 2,
      type: 'edgedata-template',
      id: typeof data.id === 'string' ? data.id : `import-${slugifyKey(name)}`,
      name,
      description,
      domain: typeof data.domain === 'string' ? data.domain : undefined,
      metadata: (data.metadata as ExperimentTemplate['metadata']) ?? undefined,
      design,
      variables: data.variables as ProtocolVariable[],
      createdAt: typeof data.createdAt === 'string' ? data.createdAt : undefined,
    };
  }

  throw new TemplateError(`Versão de template não suportada: ${String(data.version)}`);
}

// ── Templates embutidos ──────────────────────────────────────────────────────

const s = (key: string, label: string, type: FieldType, order: number, extra: Partial<ProtocolVariable> = {}): ProtocolVariable => ({
  scope: 'sample',
  key,
  label,
  type,
  order,
  required: false,
  config: {},
  ...extra,
});
const o = (key: string, label: string, type: FieldType, order: number, extra: Partial<ProtocolVariable> = {}): ProtocolVariable => ({
  ...s(key, label, type, order, extra),
  scope: 'observation',
});

export const BUILTIN_TEMPLATES: ExperimentTemplate[] = [
  {
    version: 2,
    type: 'edgedata-template',
    id: 'agro-crescimento',
    name: 'Experimento agrícola — crescimento',
    description: 'Fatorial com réplicas; altura, folhas, estádio e foto por sessão.',
    domain: 'Agricultura',
    metadata: { objective: 'Avaliar o efeito dos tratamentos no crescimento das plantas.' },
    design: {
      ...emptyDesign(),
      factors: [
        { key: 'cultivar', label: 'Cultivar', levels: ['Cultivar 1', 'Cultivar 2'] },
        { key: 'irrigacao', label: 'Irrigação', levels: ['Plena', 'Déficit hídrico'] },
      ],
      replicates: 4,
      blocks: 4,
      sessionsExpected: 6,
      collectionFrequency: 'semanal',
    },
    variables: [
      s('cultivar', 'Cultivar', 'short_text', 1, { role: 'independent' }),
      s('irrigacao', 'Irrigação', 'short_text', 2, { role: 'independent' }),
      s('data_semeadura', 'Data de semeadura', 'date', 3, { role: 'control' }),
      o('altura', 'Altura da planta', 'decimal', 1, { unit: 'cm', required: true, role: 'dependent', expectedMin: 1, expectedMax: 250, resolution: 0.1, config: { min: 0, decimals: 1 } }),
      o('numero_folhas', 'Número de folhas', 'integer', 2, { unit: '{count}', role: 'dependent', config: { min: 0 } }),
      o('estadio', 'Estádio fenológico', 'category', 3, { role: 'dependent', config: { options: ['Emergência', 'Vegetativo', 'Floração', 'Enchimento de grãos', 'Maturação'] } }),
      o('foto', 'Foto da planta', 'image', 4),
      o('momento', 'Data e hora', 'auto_timestamp', 5),
      o('observacoes', 'Observações', 'long_text', 6),
    ],
  },
  {
    version: 2,
    type: 'edgedata-template',
    id: 'fitopatologia-severidade',
    name: 'Fitopatologia — incidência e severidade',
    description: 'Campos condicionais: há doença? → qual? → severidade e foto da lesão.',
    domain: 'Agricultura',
    design: {
      ...emptyDesign(),
      treatmentMode: 'explicit',
      treatments: [{ code: 'F1', label: 'Fungicida 1' }, { code: 'F2', label: 'Fungicida 2' }],
      controls: [{ code: 'C', label: 'Testemunha sem aplicação' }],
      replicates: 5,
      sessionsExpected: 4,
    },
    variables: [
      o('ha_doenca', 'Há sintomas de doença?', 'boolean', 1, { required: true, role: 'dependent', config: { defaultValue: false } }),
      o('doenca', 'Doença', 'category', 2, { required: true, role: 'dependent', config: { options: ['Ferrugem', 'Mancha angular', 'Antracnose', 'Oídio', 'Outra'] }, showIf: { variable: 'ha_doenca', op: 'truthy' } }),
      o('severidade', 'Severidade', 'scale', 3, { unit: '{score}', required: true, role: 'dependent', config: { min: 0, max: 9, labels: { 0: 'Sem sintomas', 9: 'Muito severo' } }, showIf: { variable: 'ha_doenca', op: 'truthy' } }),
      o('foto_lesao', 'Foto da lesão', 'image', 4, { showIf: { variable: 'ha_doenca', op: 'truthy' } }),
      o('local', 'Localização', 'auto_gps', 5),
      o('observacoes', 'Observações', 'long_text', 6),
    ],
  },
  {
    version: 2,
    type: 'edgedata-template',
    id: 'ambiental-sensores',
    name: 'Monitoramento ambiental com sensores (IoT)',
    description: 'Temperatura, umidade e CO₂ lidos de um ESP32 por Bluetooth.',
    domain: 'IoT / Ambiental',
    design: { ...emptyDesign(), treatmentMode: 'explicit', treatments: [{ code: 'P1', label: 'Ponto 1' }, { code: 'P2', label: 'Ponto 2' }], replicates: 1, sessionsExpected: 10, collectionFrequency: 'diária' },
    variables: [
      s('ponto', 'Ponto de coleta', 'short_text', 1, { role: 'identifier' }),
      s('local', 'Localização do ponto', 'gps', 2, { role: 'metadata' }),
      o('temp_ar', 'Temperatura do ar', 'decimal', 1, { unit: 'Cel', role: 'dependent', expectedMin: -5, expectedMax: 50, config: { decimals: 2 } }),
      o('umidade_rel', 'Umidade relativa', 'decimal', 2, { unit: '%', role: 'dependent', expectedMin: 0, expectedMax: 100, config: { min: 0, max: 100, decimals: 1 } }),
      o('co2', 'CO₂', 'decimal', 3, { unit: '[ppm]', role: 'dependent', expectedMin: 300, expectedMax: 5000, config: { min: 0, decimals: 0 } }),
      o('momento', 'Data e hora', 'auto_timestamp', 4),
    ],
  },
  {
    version: 2,
    type: 'edgedata-template',
    id: 'qualidade-agua',
    name: 'Qualidade da água',
    description: 'pH, condutividade, oxigênio dissolvido, turbidez e temperatura por ponto.',
    domain: 'Ambiental',
    design: { ...emptyDesign(), treatmentMode: 'explicit', treatments: [{ code: 'MON', label: 'Montante' }, { code: 'JUS', label: 'Jusante' }], replicates: 3, sessionsExpected: 12, collectionFrequency: 'mensal' },
    variables: [
      s('corpo_hidrico', 'Corpo hídrico', 'short_text', 1, { role: 'identifier' }),
      o('ph', 'pH', 'decimal', 1, { unit: '[pH]', role: 'dependent', expectedMin: 5, expectedMax: 9.5, config: { min: 0, max: 14, decimals: 2 } }),
      o('condutividade', 'Condutividade elétrica', 'decimal', 2, { unit: 'uS/cm', role: 'dependent', config: { min: 0, decimals: 1 } }),
      o('od', 'Oxigênio dissolvido', 'decimal', 3, { unit: 'mg/L', role: 'dependent', expectedMin: 2, expectedMax: 14, config: { min: 0, decimals: 2 } }),
      o('turbidez', 'Turbidez (NTU)', 'decimal', 4, { role: 'dependent', config: { min: 0, decimals: 1 } }),
      o('temp_agua', 'Temperatura da água', 'decimal', 5, { unit: 'Cel', role: 'covariate', config: { decimals: 1 } }),
      o('local', 'Localização', 'auto_gps', 6),
    ],
  },
  {
    version: 2,
    type: 'edgedata-template',
    id: 'visao-computacional',
    name: 'Dataset de visão computacional',
    description: 'Fotos multiângulo com rótulo de classe por imagem.',
    domain: 'Visão computacional',
    design: { ...emptyDesign(), treatmentMode: 'explicit', treatments: [{ code: 'SAUDAVEL', label: 'Saudável' }, { code: 'DOENTE', label: 'Doente' }], replicates: 30, sessionsExpected: 1 },
    variables: [
      s('classe', 'Classe', 'category', 1, { required: true, role: 'dependent', config: { options: ['Saudável', 'Doente'] } }),
      o('fotos', 'Fotos', 'multi_image', 1, { required: true, config: { angles: [{ key: 'superior', label: 'Superior' }, { key: 'lateral', label: 'Lateral' }, { key: 'inferior', label: 'Inferior' }], photoWidth: 1024 } }),
      o('iluminacao', 'Iluminação', 'category', 2, { role: 'covariate', config: { options: ['Sol pleno', 'Nublado', 'Sombra', 'Artificial'] } }),
      o('distancia', 'Distância da câmera', 'decimal', 3, { unit: 'cm', role: 'covariate', config: { min: 0, decimals: 0 } }),
    ],
  },
  {
    version: 2,
    type: 'edgedata-template',
    id: 'vibracao-acustica',
    name: 'Ensaio de vibração / acústica',
    description: 'Configuração de aquisição por corrida e marcadores de evento.',
    domain: 'Sinais e sistemas embarcados',
    design: { ...emptyDesign(), treatmentMode: 'explicit', treatments: [{ code: 'VAZ', label: 'Com vazamento' }], controls: [{ code: 'SEM', label: 'Sem vazamento' }], replicates: 5, sessionsExpected: 3, sessionDurationMin: 20, samplingRateHz: 32000 },
    variables: [
      s('tubulacao', 'Tubulação', 'short_text', 1, { role: 'control' }),
      s('material', 'Material', 'category', 2, { role: 'control', config: { options: ['PVC', 'PEAD', 'Ferro fundido', 'Aço'] } }),
      o('vazao', 'Vazão', 'decimal', 1, { unit: 'L/min', role: 'independent', config: { min: 0, decimals: 2 } }),
      o('pressao', 'Pressão', 'decimal', 2, { unit: 'kPa', role: 'covariate', config: { min: 0, decimals: 1 } }),
      o('ganho_adc', 'Ganho do ADC', 'integer', 3, { role: 'metadata', config: { min: 1 } }),
      o('taxa_amostragem', 'Taxa de amostragem', 'decimal', 4, { unit: 'Hz', role: 'metadata', config: { min: 0 } }),
      o('arquivo_sinal', 'Nome do arquivo de sinal', 'short_text', 5, { description: 'Arquivo gravado no cartão SD do dispositivo' }),
      o('observacoes', 'Observações', 'long_text', 6),
    ],
  },
];

export function templateToFile(template: ExperimentTemplate): string {
  return `${JSON.stringify({ ...template, createdAt: template.createdAt ?? new Date().toISOString() }, null, 2)}\n`;
}
