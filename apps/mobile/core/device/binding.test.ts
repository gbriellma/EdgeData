import { describe, expect, it } from 'vitest';
import type { VariableDefinition } from '../types';
import { formatReading, readingToValue, sensorCompatibility } from './binding';
import type { SensorManifest } from './manifest';

const variable = (patch: Partial<VariableDefinition>): VariableDefinition => ({
  key: 'v',
  label: 'V',
  type: 'decimal',
  required: false,
  order: 0,
  config: {},
  ...patch,
});

const temp: SensorManifest = { id: 'soil_temp', unit: 'Cel', resolution: 0.0625 };
const voltage: SensorManifest = { id: 'ch0', unit: 'mV', type: 'int32' };

describe('vínculo sensor → variável', () => {
  it('aceita mesma unidade e unidades conversíveis', () => {
    expect(sensorCompatibility(temp, variable({ unit: 'Cel' }))).toEqual({ ok: true });
    expect(sensorCompatibility(voltage, variable({ unit: 'V' }))).toEqual({ ok: true, convertFrom: 'mV' });
    expect(sensorCompatibility(temp, variable({}))).toEqual({ ok: true });
  });

  it('bloqueia dimensões diferentes e tipos que não recebem leitura', () => {
    const r = sensorCompatibility(temp, variable({ unit: 'cm' }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/incompatíveis/);
    expect(sensorCompatibility(temp, variable({ type: 'image' })).ok).toBe(false);
    expect(sensorCompatibility(temp, variable({ type: 'boolean' })).ok).toBe(false);
    expect(sensorCompatibility({ id: 'b', unit: '1', type: 'bool' }, variable({ type: 'boolean' })).ok).toBe(true);
  });

  it('converte unidade e arredonda pela resolução', () => {
    expect(readingToValue(1234, voltage, variable({ unit: 'V' }))).toEqual({ ok: true, value: 1.234, converted: true });
    expect(readingToValue(23.43751, temp, variable({ unit: 'Cel' }))).toEqual({ ok: true, value: 23.4375, converted: false });
    expect(readingToValue(23.46, temp, variable({ unit: 'Cel', config: { decimals: 1 } }))).toMatchObject({ value: 23.5 });
    expect(readingToValue(23.6, temp, variable({ type: 'integer', unit: 'Cel' }))).toMatchObject({ value: 24 });
    expect(readingToValue(20, temp, variable({ unit: 'K' }))).toMatchObject({ value: 293.15 });
  });

  it('recusa leitura ausente', () => {
    expect(readingToValue(null, temp, variable({ unit: 'Cel' })).ok).toBe(false);
    expect(readingToValue('abc', temp, variable({ unit: 'Cel' })).ok).toBe(false);
  });

  it('formata leituras para exibição', () => {
    expect(formatReading(23.4375, temp)).toBe('23,4375 °C');
    expect(formatReading(null, temp)).toBe('—');
    expect(formatReading(true, undefined)).toBe('sim');
  });
});
