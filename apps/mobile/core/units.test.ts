import { describe, expect, it } from 'vitest';
import {
  UNITS,
  areCompatible,
  convert,
  getUnit,
  normalizeUnitCode,
  searchUnits,
  unitSymbol,
  UnitConversionError,
} from './units';

describe('catálogo de unidades', () => {
  it('não tem códigos duplicados', () => {
    const codes = UNITS.map((unit) => unit.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('tem fator positivo em todas as unidades', () => {
    for (const unit of UNITS) expect(unit.factor).toBeGreaterThan(0);
  });
});

describe('convert', () => {
  it('1000 mV = 1 V', () => {
    expect(convert(1000, 'mV', 'V')).toBeCloseTo(1, 12);
  });

  it('100 cm = 1 m', () => {
    expect(convert(100, 'cm', 'm')).toBeCloseTo(1, 12);
  });

  it('25 °C = 298,15 K (e não 25 K)', () => {
    expect(convert(25, 'Cel', 'K')).toBeCloseTo(298.15, 10);
    expect(convert(25, 'Cel', 'K')).not.toBe(25);
  });

  it('converte Fahrenheit ↔ Celsius', () => {
    expect(convert(212, '[degF]', 'Cel')).toBeCloseTo(100, 10);
    expect(convert(-40, 'Cel', '[degF]')).toBeCloseTo(-40, 10);
  });

  it('converte vazão e condutividade', () => {
    expect(convert(60, 'L/min', 'L/s')).toBeCloseTo(1, 12);
    expect(convert(1, 'mS/cm', 'uS/cm')).toBeCloseTo(1000, 9);
    expect(convert(1, 'dS/m', 'mS/cm')).toBeCloseTo(1, 12);
  });

  it('converte proporções', () => {
    expect(convert(1, '%', '[ppm]')).toBeCloseTo(10000, 6);
  });

  it('recusa dimensões diferentes', () => {
    expect(() => convert(1, 'V', 'm')).toThrow(UnitConversionError);
    expect(areCompatible('Cel', 'kPa')).toBe(false);
  });

  it('recusa escalas logarítmicas e contagens diferentes', () => {
    expect(areCompatible('{count}', '{score}')).toBe(false);
    expect(areCompatible('[pH]', '[pH]')).toBe(true);
  });

  it('recusa unidades desconhecidas', () => {
    expect(() => convert(1, 'furlong', 'm')).toThrow(/desconhecida/);
  });
});

describe('normalizeUnitCode', () => {
  it('reconhece símbolos comuns', () => {
    expect(normalizeUnitCode('°C')).toBe('Cel');
    expect(normalizeUnitCode('ppm')).toBe('[ppm]');
    expect(normalizeUnitCode('µS/cm')).toBe('uS/cm');
    expect(normalizeUnitCode('ha')).toBe('har');
    expect(normalizeUnitCode(' kpa ')).toBe('kPa');
  });

  it('devolve undefined quando não reconhece', () => {
    expect(normalizeUnitCode('xyz')).toBeUndefined();
    expect(normalizeUnitCode('')).toBeUndefined();
  });
});

describe('exibição e busca', () => {
  it('mostra o símbolo', () => {
    expect(unitSymbol('Cel')).toBe('°C');
    expect(unitSymbol('desconhecida')).toBe('desconhecida');
    expect(getUnit('har')?.name).toBe('hectare');
  });

  it('busca sem acento', () => {
    expect(searchUnits('pressao').some((unit) => unit.code === 'kPa')).toBe(true);
    expect(searchUnits('celsius').map((unit) => unit.code)).toContain('Cel');
  });
});
