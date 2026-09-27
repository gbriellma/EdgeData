import { getUnit } from './units';
import type {
  FieldType,
  VariableDefinition,
  VariableRole,
  VisibilityCondition,
  ValueMap,
} from './types';

/** Tipo lógico do valor, usado em validação e exportação (Table Schema / Parquet). */
export type ValueKind =
  | 'string'
  | 'integer'
  | 'number'
  | 'boolean'
  | 'date'
  | 'time'
  | 'datetime'
  | 'geopoint'
  | 'array'
  | 'file'
  | 'file_list';

export interface FieldTypeInfo {
  type: FieldType;
  label: string;
  description: string;
  icon: string;
  category: 'text' | 'number' | 'choice' | 'media' | 'location' | 'auto';
  kind: ValueKind;
  /** Aceita unidade de medida */
  measurable: boolean;
  /** Preenchido pelo app, sem digitação */
  automatic: boolean;
}

export const FIELD_TYPE_INFO: Record<FieldType, FieldTypeInfo> = {
  short_text: { type: 'short_text', label: 'Texto curto', description: 'Até 256 caracteres', icon: 'text-outline', category: 'text', kind: 'string', measurable: false, automatic: false },
  long_text: { type: 'long_text', label: 'Texto longo', description: 'Observações e notas', icon: 'document-text-outline', category: 'text', kind: 'string', measurable: false, automatic: false },
  integer: { type: 'integer', label: 'Número inteiro', description: 'Contagens; limites e unidade', icon: 'calculator-outline', category: 'number', kind: 'integer', measurable: true, automatic: false },
  decimal: { type: 'decimal', label: 'Número decimal', description: 'Medidas com unidade, faixa e resolução', icon: 'speedometer-outline', category: 'number', kind: 'number', measurable: true, automatic: false },
  scale: { type: 'scale', label: 'Escala', description: 'Notas (ex.: severidade 0–9)', icon: 'options-outline', category: 'number', kind: 'integer', measurable: false, automatic: false },
  category: { type: 'category', label: 'Categoria', description: 'Uma opção de uma lista', icon: 'list-outline', category: 'choice', kind: 'string', measurable: false, automatic: false },
  multi_category: { type: 'multi_category', label: 'Multicategoria', description: 'Várias opções de uma lista', icon: 'checkbox-outline', category: 'choice', kind: 'array', measurable: false, automatic: false },
  boolean: { type: 'boolean', label: 'Sim / Não', description: 'Verdadeiro ou falso', icon: 'toggle-outline', category: 'choice', kind: 'boolean', measurable: false, automatic: false },
  date: { type: 'date', label: 'Data', description: 'AAAA-MM-DD', icon: 'calendar-outline', category: 'choice', kind: 'date', measurable: false, automatic: false },
  time: { type: 'time', label: 'Hora', description: 'HH:MM', icon: 'time-outline', category: 'choice', kind: 'time', measurable: false, automatic: false },
  image: { type: 'image', label: 'Foto', description: 'Uma foto pela câmera', icon: 'camera-outline', category: 'media', kind: 'file', measurable: false, automatic: false },
  multi_image: { type: 'multi_image', label: 'Fotos multiângulo', description: 'Uma foto por ângulo configurado', icon: 'images-outline', category: 'media', kind: 'file_list', measurable: false, automatic: false },
  gps: { type: 'gps', label: 'Localização', description: 'Captura GPS com precisão', icon: 'navigate-outline', category: 'location', kind: 'geopoint', measurable: false, automatic: false },
  barcode: { type: 'barcode', label: 'Código de barras / QR', description: 'Lido pela câmera ou digitado', icon: 'barcode-outline', category: 'text', kind: 'string', measurable: false, automatic: false },
  auto_timestamp: { type: 'auto_timestamp', label: 'Data e hora automáticas', description: 'Momento do registro (UTC)', icon: 'time-outline', category: 'auto', kind: 'datetime', measurable: false, automatic: true },
  auto_gps: { type: 'auto_gps', label: 'GPS automático', description: 'Localização ao salvar', icon: 'location-outline', category: 'auto', kind: 'geopoint', measurable: false, automatic: true },
  auto_uuid: { type: 'auto_uuid', label: 'ID único automático', description: 'UUID gerado para o registro', icon: 'finger-print-outline', category: 'auto', kind: 'string', measurable: false, automatic: true },
};

export const FIELD_TYPES: FieldTypeInfo[] = Object.values(FIELD_TYPE_INFO);

export const ROLE_LABELS: Record<VariableRole, string> = {
  identifier: 'Identificador',
  independent: 'Independente (fator)',
  dependent: 'Dependente (resposta)',
  control: 'Controle',
  covariate: 'Covariável',
  metadata: 'Metadado',
};

export function fieldTypeInfo(type: FieldType): FieldTypeInfo {
  return FIELD_TYPE_INFO[type] ?? FIELD_TYPE_INFO.short_text;
}

// ── Identificadores ──────────────────────────────────────────────────────────

const KEY_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;

export function isValidKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/** "Temperatura do Solo (°C)" → "temperatura_do_solo_c" */
export function slugifyKey(label: string): string {
  const slug = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 63);
  if (!slug) return 'variavel';
  return /^[a-z]/.test(slug) ? slug : `v_${slug}`.slice(0, 63);
}

/** Garante uma chave única acrescentando sufixo numérico. */
export function uniqueKey(base: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

// ── Visibilidade condicional ─────────────────────────────────────────────────

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

export function evaluateCondition(condition: VisibilityCondition, values: ValueMap): boolean {
  const current = values[condition.variable];
  const expected = condition.value;
  switch (condition.op) {
    case 'truthy':
      return !isEmpty(current) && current !== false && current !== 'false';
    case 'falsy':
      return isEmpty(current) || current === false || current === 'false';
    case 'equals':
      if (Array.isArray(current)) return current.map(String).includes(String(expected));
      return String(current ?? '') === String(expected ?? '');
    case 'not_equals':
      if (Array.isArray(current)) return !current.map(String).includes(String(expected));
      return String(current ?? '') !== String(expected ?? '');
    case 'in': {
      const options = Array.isArray(expected) ? expected.map(String) : [String(expected)];
      if (Array.isArray(current)) return current.some((item) => options.includes(String(item)));
      return options.includes(String(current ?? ''));
    }
    case 'gt':
    case 'lt': {
      const a = Number(String(current).replace(',', '.'));
      const b = Number(String(expected).replace(',', '.'));
      if (isEmpty(current) || Number.isNaN(a) || Number.isNaN(b)) return false;
      return condition.op === 'gt' ? a > b : a < b;
    }
    default:
      return true;
  }
}

/**
 * Uma variável é visível quando sua condição é satisfeita E a variável de que
 * ela depende também está visível (condições encadeadas).
 */
export function isVisible(
  variable: VariableDefinition,
  values: ValueMap,
  all: readonly VariableDefinition[],
  depth = 0,
): boolean {
  if (!variable.showIf) return true;
  if (depth > all.length) return false; // ciclo — tratado como oculto
  const parent = all.find((v) => v.key === variable.showIf!.variable);
  if (parent && !isVisible(parent, values, all, depth + 1)) return false;
  return evaluateCondition(variable.showIf, values);
}

export function visibleVariables(
  variables: readonly VariableDefinition[],
  values: ValueMap,
): VariableDefinition[] {
  return sortVariables(variables).filter((v) => isVisible(v, values, variables));
}

export function sortVariables<T extends { order: number }>(variables: readonly T[]): T[] {
  return [...variables].sort((a, b) => a.order - b.order);
}

export function describeCondition(condition: VisibilityCondition, all: readonly VariableDefinition[]): string {
  const parent = all.find((v) => v.key === condition.variable);
  const name = parent?.label ?? condition.variable;
  const value = Array.isArray(condition.value) ? condition.value.join(', ') : String(condition.value ?? '');
  switch (condition.op) {
    case 'truthy':
      return `quando "${name}" estiver preenchido/sim`;
    case 'falsy':
      return `quando "${name}" estiver vazio/não`;
    case 'equals':
      return `quando "${name}" = ${value}`;
    case 'not_equals':
      return `quando "${name}" ≠ ${value}`;
    case 'in':
      return `quando "${name}" for um de: ${value}`;
    case 'gt':
      return `quando "${name}" > ${value}`;
    case 'lt':
      return `quando "${name}" < ${value}`;
  }
}

// ── Validação das definições ─────────────────────────────────────────────────

export interface DefinitionIssue {
  key: string;
  message: string;
}

/** Verifica se um conjunto de variáveis é consistente antes de salvar o protocolo. */
export function validateDefinitions(variables: readonly VariableDefinition[]): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const seen = new Set<string>();

  for (const v of variables) {
    if (!isValidKey(v.key)) {
      issues.push({ key: v.key, message: `ID "${v.key}" inválido: use letras minúsculas, números e _ (começando por letra)` });
    }
    if (seen.has(v.key)) issues.push({ key: v.key, message: `ID "${v.key}" repetido` });
    seen.add(v.key);

    if (!v.label.trim()) issues.push({ key: v.key, message: 'Rótulo vazio' });

    const { min, max } = v.config;
    if (min !== undefined && max !== undefined && min > max) {
      issues.push({ key: v.key, message: `${v.label}: mínimo maior que o máximo` });
    }
    if (v.expectedMin !== undefined && v.expectedMax !== undefined && v.expectedMin > v.expectedMax) {
      issues.push({ key: v.key, message: `${v.label}: faixa esperada invertida` });
    }
    if ((v.type === 'category' || v.type === 'multi_category') && !(v.config.options?.length)) {
      issues.push({ key: v.key, message: `${v.label}: categoria sem opções` });
    }
    if (v.type === 'multi_image' && !(v.config.angles?.length)) {
      issues.push({ key: v.key, message: `${v.label}: defina ao menos um ângulo` });
    }
    if (v.unit && !getUnit(v.unit)) {
      issues.push({ key: v.key, message: `${v.label}: unidade "${v.unit}" não reconhecida (use um código UCUM)` });
    }
    if (v.resolution !== undefined && v.resolution <= 0) {
      issues.push({ key: v.key, message: `${v.label}: resolução deve ser positiva` });
    }
    if (v.showIf) {
      const parent = variables.find((p) => p.key === v.showIf!.variable);
      if (!parent) {
        issues.push({ key: v.key, message: `${v.label}: condição depende de variável inexistente` });
      } else if (parent.key === v.key) {
        issues.push({ key: v.key, message: `${v.label}: condição não pode depender de si mesma` });
      }
    }
  }

  // Ciclos em condições
  for (const v of variables) {
    const visited = new Set<string>();
    let current: VariableDefinition | undefined = v;
    while (current?.showIf) {
      if (visited.has(current.key)) {
        issues.push({ key: v.key, message: `${v.label}: condições formam um ciclo` });
        break;
      }
      visited.add(current.key);
      const nextKey: string = current.showIf.variable;
      current = variables.find((p) => p.key === nextKey);
    }
  }

  return issues;
}

/** Cria uma definição com valores padrão coerentes para o tipo. */
export function createVariable(
  type: FieldType,
  label: string,
  existingKeys: Iterable<string>,
  order: number,
): VariableDefinition {
  const key = uniqueKey(slugifyKey(label), existingKeys);
  const base: VariableDefinition = { key, label, type, required: false, order, config: {} };
  switch (type) {
    case 'decimal':
      return { ...base, role: 'dependent', config: { decimals: 2 } };
    case 'integer':
      return { ...base, role: 'dependent' };
    case 'scale':
      return { ...base, role: 'dependent', unit: '{score}', config: { min: 0, max: 9, labels: {} } };
    case 'category':
    case 'multi_category':
      return { ...base, config: { options: [] } };
    case 'boolean':
      return { ...base, config: { defaultValue: false } };
    case 'multi_image':
      return { ...base, config: { angles: [] } };
    case 'auto_timestamp':
    case 'auto_gps':
    case 'auto_uuid':
      return { ...base, role: 'metadata' };
    default:
      return base;
  }
}

/** Compara dois conjuntos de variáveis ignorando a ordem de chaves nos objetos. */
export function definitionsEqual(a: readonly VariableDefinition[], b: readonly VariableDefinition[]): boolean {
  const normalize = (list: readonly VariableDefinition[]) =>
    JSON.stringify(sortVariables(list).map((v) => sortObject(v)));
  return normalize(a) === normalize(b);
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
        .map((k) => [k, sortObject((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}
