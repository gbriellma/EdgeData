import { FieldType, FieldConfig } from '@/types/schema';

export interface FieldTypeDefinition {
  type: FieldType;
  label: string;
  description: string;
  icon: string;
  category: 'text' | 'number' | 'choice' | 'media' | 'auto';
  defaultConfig: FieldConfig;
}

export const FIELD_TYPES: FieldTypeDefinition[] = [
  {
    type: 'short_text',
    label: 'Texto curto',
    description: 'Texto simples, até 256 caracteres',
    icon: 'text-outline',
    category: 'text',
    defaultConfig: {},
  },
  {
    type: 'long_text',
    label: 'Texto longo',
    description: 'Textarea sem limite',
    icon: 'document-text-outline',
    category: 'text',
    defaultConfig: {},
  },
  {
    type: 'integer',
    label: 'Número inteiro',
    description: 'Validação numérica, min/max configurável',
    icon: 'calculator-outline',
    category: 'number',
    defaultConfig: {},
  },
  {
    type: 'decimal',
    label: 'Número decimal',
    description: 'Casas decimais configuráveis, unidade de medida',
    icon: 'calculator-outline',
    category: 'number',
    defaultConfig: { decimals: 2 },
  },
  {
    type: 'category',
    label: 'Categoria',
    description: 'Seleção única de lista pré-definida',
    icon: 'list-outline',
    category: 'choice',
    defaultConfig: { options: [] },
  },
  {
    type: 'multi_category',
    label: 'Multi-categoria',
    description: 'Seleção múltipla',
    icon: 'checkbox-outline',
    category: 'choice',
    defaultConfig: { options: [] },
  },
  {
    type: 'boolean',
    label: 'Booleano',
    description: 'Toggle sim/não',
    icon: 'toggle-outline',
    category: 'choice',
    defaultConfig: { defaultValue: false },
  },
  {
    type: 'image',
    label: 'Imagem',
    description: 'Captura única via câmera',
    icon: 'camera-outline',
    category: 'media',
    defaultConfig: {},
  },
  {
    type: 'multi_image',
    label: 'Multi-imagem',
    description: 'Múltiplas fotos com ângulos configuráveis',
    icon: 'images-outline',
    category: 'media',
    defaultConfig: { angles: [] },
  },
  {
    type: 'date',
    label: 'Data',
    description: 'Seletor de data, formato ISO',
    icon: 'calendar-outline',
    category: 'choice',
    defaultConfig: {},
  },
  {
    type: 'time',
    label: 'Hora',
    description: 'Seletor de hora, formato HH:MM',
    icon: 'time-outline',
    category: 'choice',
    defaultConfig: {},
  },
  {
    type: 'scale',
    label: 'Escala',
    description: 'Slider numérico com range e labels',
    icon: 'options-outline',
    category: 'number',
    defaultConfig: { min: 0, max: 9, labels: {} },
  },
  {
    type: 'auto_timestamp',
    label: 'Timestamp automático',
    description: 'Preenchido automaticamente',
    icon: 'time-outline',
    category: 'auto',
    defaultConfig: { source: 'timestamp' },
  },
  {
    type: 'auto_gps',
    label: 'GPS automático',
    description: 'Preenchido automaticamente',
    icon: 'location-outline',
    category: 'auto',
    defaultConfig: { source: 'gps' },
  },
  {
    type: 'auto_uuid',
    label: 'UUID automático',
    description: 'Preenchido automaticamente',
    icon: 'finger-print-outline',
    category: 'auto',
    defaultConfig: { source: 'uuid' },
  },
];

export function getFieldTypeDef(type: FieldType): FieldTypeDefinition {
  return FIELD_TYPES.find((f) => f.type === type) ?? FIELD_TYPES[0];
}
