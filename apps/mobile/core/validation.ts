import type { GeoPoint, ValueMap, VariableDefinition } from './types';
import { fieldTypeInfo, isVisible, sortVariables } from './variables';

export interface ValidationError {
  field: string;
  message: string;
}

function isBlank(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0)
  );
}

export function isGeoPoint(value: unknown): value is GeoPoint {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as GeoPoint).latitude === 'number' &&
    typeof (value as GeoPoint).longitude === 'number'
  );
}

/** Aceita "12,5" (vírgula decimal) além de "12.5". */
export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(',', '.');
  if (text === '' || text === '-' || text === '.') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/**
 * Converte o valor do formulário para o tipo definitivo que será gravado.
 * Números viram number, textos são aparados, vazios viram undefined.
 */
export function normalizeValue(variable: VariableDefinition, value: unknown): unknown {
  if (isBlank(value)) return undefined;
  switch (variable.type) {
    case 'integer':
    case 'scale': {
      const n = parseNumber(value);
      return n === null ? value : n;
    }
    case 'decimal': {
      const n = parseNumber(value);
      if (n === null) return value;
      const decimals = variable.config.decimals;
      return decimals !== undefined ? Number(n.toFixed(decimals)) : n;
    }
    case 'short_text':
    case 'long_text':
    case 'barcode':
      return typeof value === 'string' ? value.trim() : String(value);
    case 'boolean':
      if (typeof value === 'string') return value === 'true' || value === '1' || value.toLowerCase() === 'sim';
      return !!value;
    default:
      return value;
  }
}

/** Normaliza todas as variáveis e remove valores de variáveis ocultas. */
export function normalizeValues(variables: readonly VariableDefinition[], values: ValueMap): ValueMap {
  const result: ValueMap = {};
  for (const variable of variables) {
    if (!isVisible(variable, values, variables)) continue;
    const normalized = normalizeValue(variable, values[variable.key]);
    if (normalized !== undefined) result[variable.key] = normalized;
  }
  return result;
}

export function validateValue(variable: VariableDefinition, value: unknown): ValidationError[] {
  const { key, label, type, required, config } = variable;
  const info = fieldTypeInfo(type);
  const errors: ValidationError[] = [];
  const fail = (message: string) => errors.push({ field: key, message });

  if (info.automatic) return errors;

  if (isBlank(value) || (type === 'boolean' && value === undefined)) {
    if (required) fail(`${label} é obrigatório`);
    return errors;
  }

  switch (type) {
    case 'short_text':
      if (String(value).length > 256) fail(`${label} deve ter no máximo 256 caracteres`);
      break;

    case 'integer':
    case 'scale':
    case 'decimal': {
      const n = parseNumber(value);
      if (n === null) {
        fail(`${label} deve ser um número`);
        break;
      }
      if (type !== 'decimal' && !Number.isInteger(n)) {
        fail(`${label} deve ser um número inteiro`);
        break;
      }
      const min = type === 'scale' ? config.min ?? 0 : config.min;
      const max = type === 'scale' ? config.max ?? 9 : config.max;
      if (min !== undefined && n < min) fail(`${label} deve ser no mínimo ${min}`);
      if (max !== undefined && n > max) fail(`${label} deve ser no máximo ${max}`);
      break;
    }

    case 'category':
      if (config.options && !config.options.includes(String(value))) fail(`${label}: opção inválida`);
      break;

    case 'multi_category': {
      if (!Array.isArray(value)) {
        fail(`${label}: formato inválido`);
        break;
      }
      const invalid = value.filter((item) => !config.options?.includes(String(item)));
      if (invalid.length > 0) fail(`${label}: opções inválidas: ${invalid.join(', ')}`);
      break;
    }

    case 'date':
      if (typeof value !== 'string' || !DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
        fail(`${label}: data inválida (use DD/MM/AAAA)`);
      }
      break;

    case 'time':
      if (typeof value !== 'string' || !TIME_RE.test(value)) fail(`${label}: use o formato HH:MM`);
      break;

    case 'gps':
      if (!isGeoPoint(value)) {
        fail(`${label}: localização inválida`);
      } else if (Math.abs(value.latitude) > 90 || Math.abs(value.longitude) > 180) {
        fail(`${label}: coordenadas fora do intervalo`);
      }
      break;

    case 'multi_image':
      if (!Array.isArray(value)) fail(`${label}: formato inválido`);
      else if (required && config.angles?.length && value.length < config.angles.length) {
        fail(`${label}: faltam ${config.angles.length - value.length} ângulo(s)`);
      }
      break;
  }

  return errors;
}

/** Valida apenas variáveis visíveis (campos condicionais ocultos são ignorados). */
export function validateValues(variables: readonly VariableDefinition[], values: ValueMap): ValidationError[] {
  return sortVariables(variables)
    .filter((variable) => isVisible(variable, values, variables))
    .flatMap((variable) => validateValue(variable, values[variable.key]));
}
