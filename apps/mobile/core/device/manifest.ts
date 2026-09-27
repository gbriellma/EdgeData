import { getUnit } from '../units';

/** Manifesto do dispositivo (schemas/device-manifest.schema.json). */
export const MANIFEST_SCHEMA = 'edgedata.device-manifest/1';

export type SensorValueType = 'float32' | 'float64' | 'int16' | 'int32' | 'uint16' | 'uint32' | 'bool' | 'string';

export interface SensorAdc {
  model?: string;
  channel?: number;
  bits?: number;
  gain?: number;
  vref?: number;
  sampling_rate_hz?: number;
}

export interface SensorManifest {
  id: string;
  unit: string;
  label?: string;
  quantity?: string;
  type?: SensorValueType;
  model?: string;
  range?: [number, number];
  resolution?: number;
  accuracy?: number;
  interval_ms?: number;
  adc?: SensorAdc;
}

export type DeviceCapability = 'read' | 'stream' | 'time' | 'blocks' | 'events';

export interface DeviceManifest {
  schema: typeof MANIFEST_SCHEMA;
  id: string;
  name: string;
  manufacturer?: string;
  model?: string;
  serial?: string;
  hardware?: { mcu?: string; revision?: string };
  firmware?: { name?: string; version: string; commit?: string };
  capabilities?: DeviceCapability[];
  sensors: SensorManifest[];
}

export class ManifestError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Manifesto inválido: ${problems.join('; ')}`);
    this.name = 'ManifestError';
  }
}

const DEVICE_ID_RE = /^[A-Za-z0-9._:-]{1,64}$/;
const SENSOR_ID_RE = /^[a-z][a-z0-9_]{0,47}$/;
const VALUE_TYPES: SensorValueType[] = ['float32', 'float64', 'int16', 'int32', 'uint16', 'uint32', 'bool', 'string'];
const CAPABILITIES: DeviceCapability[] = ['read', 'stream', 'time', 'blocks', 'events'];

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const optString = (v: unknown) => (typeof v === 'string' ? v : undefined);
const optNumber = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/**
 * Valida e normaliza um manifesto recebido do dispositivo. Campos desconhecidos são
 * ignorados; problemas estruturais geram ManifestError. Avisos (ex.: unidade fora
 * do catálogo) não impedem o uso e são devolvidos à parte.
 */
export function parseManifest(input: unknown): { manifest: DeviceManifest; warnings: string[] } {
  const problems: string[] = [];
  const warnings: string[] = [];
  if (!isObject(input)) throw new ManifestError(['o manifesto não é um objeto JSON']);

  if (input.schema !== MANIFEST_SCHEMA) problems.push(`schema deve ser "${MANIFEST_SCHEMA}"`);
  const id = optString(input.id);
  if (!id || !DEVICE_ID_RE.test(id)) problems.push('id do dispositivo ausente ou inválido');
  const name = optString(input.name)?.trim();
  if (!name) problems.push('name ausente');

  const sensors: SensorManifest[] = [];
  if (!Array.isArray(input.sensors) || input.sensors.length === 0) {
    problems.push('o dispositivo deve declarar ao menos um sensor');
  } else {
    const seen = new Set<string>();
    input.sensors.forEach((raw, index) => {
      if (!isObject(raw)) {
        problems.push(`sensors[${index}] não é um objeto`);
        return;
      }
      const sid = optString(raw.id);
      if (!sid || !SENSOR_ID_RE.test(sid)) {
        problems.push(`sensors[${index}].id inválido (use snake_case)`);
        return;
      }
      if (seen.has(sid)) problems.push(`sensor "${sid}" repetido`);
      seen.add(sid);
      const unit = optString(raw.unit);
      if (!unit) problems.push(`sensor "${sid}" sem unidade`);
      else if (!getUnit(unit)) warnings.push(`sensor "${sid}": unidade "${unit}" fora do catálogo UCUM do app`);

      let range: [number, number] | undefined;
      if (Array.isArray(raw.range) && raw.range.length === 2 && raw.range.every((n) => typeof n === 'number')) {
        range = [raw.range[0] as number, raw.range[1] as number];
        if (range[0] > range[1]) problems.push(`sensor "${sid}": range invertido`);
      } else if (raw.range !== undefined) {
        warnings.push(`sensor "${sid}": range ignorado (use [mín, máx])`);
      }
      const type = VALUE_TYPES.includes(raw.type as SensorValueType) ? (raw.type as SensorValueType) : undefined;

      sensors.push({
        id: sid,
        unit: unit ?? '1',
        label: optString(raw.label),
        quantity: optString(raw.quantity),
        type,
        model: optString(raw.model),
        range,
        resolution: optNumber(raw.resolution),
        accuracy: optNumber(raw.accuracy),
        interval_ms: optNumber(raw.interval_ms),
        adc: isObject(raw.adc)
          ? {
              model: optString(raw.adc.model),
              channel: optNumber(raw.adc.channel),
              bits: optNumber(raw.adc.bits),
              gain: optNumber(raw.adc.gain),
              vref: optNumber(raw.adc.vref),
              sampling_rate_hz: optNumber(raw.adc.sampling_rate_hz),
            }
          : undefined,
      });
    });
  }

  if (problems.length > 0) throw new ManifestError(problems);

  const firmware = isObject(input.firmware) && typeof input.firmware.version === 'string'
    ? { name: optString(input.firmware.name), version: input.firmware.version, commit: optString(input.firmware.commit) }
    : undefined;
  const hardware = isObject(input.hardware)
    ? { mcu: optString(input.hardware.mcu), revision: optString(input.hardware.revision) }
    : undefined;
  const capabilities = Array.isArray(input.capabilities)
    ? (input.capabilities.filter((c) => CAPABILITIES.includes(c as DeviceCapability)) as DeviceCapability[])
    : undefined;

  return {
    manifest: {
      schema: MANIFEST_SCHEMA,
      id: id!,
      name: name!,
      manufacturer: optString(input.manufacturer),
      model: optString(input.model),
      serial: optString(input.serial),
      hardware,
      firmware,
      capabilities,
      sensors,
    },
    warnings,
  };
}
