import { Schema, SchemaField } from '@/types/schema';

export interface ValidationError {
  field: string;
  message: string;
}

export function validateFormData(
  schema: Schema,
  data: Record<string, unknown>
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const field of schema.fields) {
    const value = data[field.name];
    const fieldErrors = validateField(field, value);
    errors.push(...fieldErrors);
  }

  return errors;
}

export function validateField(
  field: SchemaField,
  value: unknown
): ValidationError[] {
  const errors: ValidationError[] = [];
  const { name, label, type, required, config } = field;

  // Auto fields don't need user validation
  if (type.startsWith('auto_')) return errors;

  // Required check
  if (required) {
    if (type === 'boolean') {
      // For booleans, only undefined/null means "not filled in" — false is valid
      if (value === undefined || value === null) {
        errors.push({ field: name, message: `${label} é obrigatório` });
        return errors;
      }
    } else if (value === undefined || value === null || value === '') {
      errors.push({ field: name, message: `${label} é obrigatório` });
      return errors;
    }
    if (type === 'multi_category' && Array.isArray(value) && value.length === 0) {
      errors.push({ field: name, message: `${label} é obrigatório` });
      return errors;
    }
    if (type === 'multi_image' && Array.isArray(value) && value.length === 0) {
      errors.push({ field: name, message: `${label} é obrigatório` });
      return errors;
    }
  }

  // Skip further validation if empty and not required
  if (type === 'boolean') {
    if (value === undefined || value === null) return errors;
  } else {
    if (value === undefined || value === null || value === '') return errors;
  }

  // Type-specific validation
  switch (type) {
    case 'short_text':
      if (typeof value === 'string' && value.length > 256) {
        errors.push({ field: name, message: `${label} deve ter no máximo 256 caracteres` });
      }
      break;

    case 'integer': {
      const num = Number(value);
      if (isNaN(num) || !Number.isInteger(num)) {
        errors.push({ field: name, message: `${label} deve ser um número inteiro` });
      } else {
        if (config.min !== undefined && num < config.min) {
          errors.push({ field: name, message: `${label} deve ser no mínimo ${config.min}` });
        }
        if (config.max !== undefined && num > config.max) {
          errors.push({ field: name, message: `${label} deve ser no máximo ${config.max}` });
        }
      }
      break;
    }

    case 'decimal': {
      const num = Number(value);
      if (isNaN(num)) {
        errors.push({ field: name, message: `${label} deve ser um número` });
      } else {
        if (config.min !== undefined && num < config.min) {
          errors.push({ field: name, message: `${label} deve ser no mínimo ${config.min}` });
        }
        if (config.max !== undefined && num > config.max) {
          errors.push({ field: name, message: `${label} deve ser no máximo ${config.max}` });
        }
      }
      break;
    }

    case 'scale': {
      const num = Number(value);
      if (isNaN(num)) {
        errors.push({ field: name, message: `${label} deve ser um número` });
      } else {
        const min = config.min ?? 0;
        const max = config.max ?? 9;
        if (num < min || num > max) {
          errors.push({ field: name, message: `${label} deve estar entre ${min} e ${max}` });
        }
      }
      break;
    }

    case 'category':
      if (config.options && !config.options.includes(value as string)) {
        errors.push({ field: name, message: `${label}: opção inválida` });
      }
      break;

    case 'multi_category':
      if (Array.isArray(value) && config.options) {
        const invalid = (value as string[]).filter((v) => !config.options!.includes(v));
        if (invalid.length > 0) {
          errors.push({ field: name, message: `${label}: opções inválidas: ${invalid.join(', ')}` });
        }
      }
      break;
  }

  return errors;
}
