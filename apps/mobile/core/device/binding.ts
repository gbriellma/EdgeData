import type { VariableDefinition } from '../types';
import { areCompatible, convert, getUnit, unitSymbol } from '../units';
import type { SensorManifest } from './manifest';

/** Tipos de variável que podem receber leitura de sensor. */
const NUMERIC_TYPES = new Set(['integer', 'decimal']);
const TEXT_TYPES = new Set(['short_text', 'barcode']);

export type Compatibility = { ok: true; convertFrom?: string } | { ok: false; reason: string };

/**
 * Verifica se um sensor pode alimentar uma variável. Unidades diferentes só são
 * aceitas quando conversíveis (ex.: mV → V); dimensões diferentes são bloqueadas.
 */
export function sensorCompatibility(sensor: SensorManifest, variable: VariableDefinition): Compatibility {
  const sensorType = sensor.type ?? 'float32';
  if (variable.type === 'boolean') {
    return sensorType === 'bool' ? { ok: true } : { ok: false, reason: 'A variável é sim/não e o sensor não é booleano' };
  }
  if (TEXT_TYPES.has(variable.type)) return { ok: true };
  if (!NUMERIC_TYPES.has(variable.type)) return { ok: false, reason: 'Este tipo de campo não recebe leituras de sensor' };
  if (sensorType === 'string' || sensorType === 'bool') return { ok: false, reason: 'O sensor não fornece números' };

  const target = variable.unit;
  if (!target || target === '{score}') return { ok: true };
  if (!sensor.unit) return { ok: true };
  if (sensor.unit === target) return { ok: true };
  if (!getUnit(sensor.unit)) return { ok: false, reason: `Unidade do sensor fora do catálogo UCUM: ${sensor.unit}` };
  if (!areCompatible(sensor.unit, target)) {
    return { ok: false, reason: `Unidades incompatíveis: sensor em ${unitSymbol(sensor.unit)}, variável em ${unitSymbol(target)}` };
  }
  return { ok: true, convertFrom: sensor.unit };
}

export type ConvertedReading = { ok: true; value: unknown; converted: boolean } | { ok: false; reason: string };

/** Converte o valor bruto do sensor para o valor da variável (unidade e tipo). */
export function readingToValue(raw: unknown, sensor: SensorManifest, variable: VariableDefinition): ConvertedReading {
  const compat = sensorCompatibility(sensor, variable);
  if (!compat.ok) return compat;
  if (raw === null || raw === undefined) return { ok: false, reason: 'O sensor não tem leitura válida agora' };

  if (variable.type === 'boolean') return { ok: true, value: Boolean(raw), converted: false };
  if (TEXT_TYPES.has(variable.type)) return { ok: true, value: String(raw), converted: false };

  const numeric = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(numeric)) return { ok: false, reason: 'Leitura não numérica' };
  let value = compat.convertFrom && variable.unit ? convert(numeric, compat.convertFrom, variable.unit) : numeric;
  if (variable.type === 'integer') value = Math.round(value);
  else value = roundTo(value, decimalsFor(variable, sensor));
  return { ok: true, value, converted: Boolean(compat.convertFrom) };
}

/** Casas decimais: as da variável, senão as implícitas na resolução do sensor. */
function decimalsFor(variable: VariableDefinition, sensor: SensorManifest): number {
  if (typeof variable.config.decimals === 'number') return variable.config.decimals;
  const resolution = variable.resolution ?? (variable.unit === sensor.unit ? sensor.resolution : undefined);
  if (resolution && resolution > 0) return decimalPlaces(resolution);
  return 6;
}

/** Casas decimais de um número como escrito (0.0625 → 4, 0.1 → 1). */
function decimalPlaces(value: number): number {
  const text = value.toPrecision(12).replace(/0+$/, '');
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : Math.min(10, text.length - dot - 1);
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Texto curto para exibir uma leitura: "23,4 °C". */
export function formatReading(raw: unknown, sensor: SensorManifest | undefined): string {
  if (raw === null || raw === undefined) return '—';
  if (typeof raw === 'boolean') return raw ? 'sim' : 'não';
  if (typeof raw === 'number') {
    const unit = sensor?.unit && sensor.unit !== '1' ? ` ${unitSymbol(sensor.unit)}` : '';
    const decimals = sensor?.resolution && sensor.resolution > 0 ? decimalPlaces(sensor.resolution) : 2;
    return `${raw.toLocaleString('pt-BR', { maximumFractionDigits: decimals, minimumFractionDigits: 0 })}${unit}`;
  }
  return String(raw);
}
