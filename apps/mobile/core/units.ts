/**
 * Unidades de medida com códigos UCUM (Unified Code for Units of Measure).
 *
 * O catálogo cobre as unidades mais usadas em experimentos de campo, laboratório e IoT.
 * Cada unidade pertence a uma dimensão e sabe converter para a unidade base da dimensão:
 *
 *   base = valor * factor + offset
 *
 * O offset só é usado em temperaturas (°C e °F não são proporcionais ao kelvin).
 * Valores brutos NUNCA são convertidos ao serem gravados: a conversão existe para
 * análise, validação de compatibilidade e exportação.
 */

export type Dimension =
  | 'dimensionless'
  | 'count'
  | 'length'
  | 'area'
  | 'volume'
  | 'mass'
  | 'time'
  | 'temperature'
  | 'pressure'
  | 'force'
  | 'energy'
  | 'power'
  | 'voltage'
  | 'current'
  | 'resistance'
  | 'frequency'
  | 'velocity'
  | 'flow'
  | 'conductivity'
  | 'molar_concentration'
  | 'mass_concentration'
  | 'mass_fraction'
  | 'illuminance'
  | 'irradiance'
  | 'photon_flux'
  | 'precipitation_rate'
  | 'angle'
  | 'acidity'
  | 'level';

export interface UnitDefinition {
  /** Código UCUM (case-sensitive), ex.: "Cel", "mV", "[ppm]" */
  code: string;
  /** Símbolo para exibição, ex.: "°C" */
  symbol: string;
  /** Nome por extenso em português */
  name: string;
  dimension: Dimension;
  /** Multiplicador para a unidade base da dimensão */
  factor: number;
  /** Deslocamento para a unidade base (somente temperatura) */
  offset?: number;
}

export const DIMENSION_LABELS: Record<Dimension, string> = {
  dimensionless: 'Adimensional / proporção',
  count: 'Contagem e escalas',
  length: 'Comprimento',
  area: 'Área',
  volume: 'Volume',
  mass: 'Massa',
  time: 'Tempo',
  temperature: 'Temperatura',
  pressure: 'Pressão',
  force: 'Força',
  energy: 'Energia',
  power: 'Potência',
  voltage: 'Tensão elétrica',
  current: 'Corrente elétrica',
  resistance: 'Resistência elétrica',
  frequency: 'Frequência',
  velocity: 'Velocidade',
  flow: 'Vazão',
  conductivity: 'Condutividade elétrica',
  molar_concentration: 'Concentração molar',
  mass_concentration: 'Concentração em massa',
  mass_fraction: 'Fração mássica',
  illuminance: 'Iluminância',
  irradiance: 'Irradiância',
  photon_flux: 'Fluxo de fótons (PAR)',
  precipitation_rate: 'Taxa de precipitação',
  angle: 'Ângulo',
  acidity: 'Acidez',
  level: 'Nível (logarítmico)',
};

const u = (
  code: string,
  symbol: string,
  name: string,
  dimension: Dimension,
  factor = 1,
  offset?: number,
): UnitDefinition => ({ code, symbol, name, dimension, factor, ...(offset !== undefined ? { offset } : {}) });

export const UNITS: readonly UnitDefinition[] = [
  // Adimensional
  u('1', '—', 'adimensional', 'dimensionless'),
  u('%', '%', 'por cento', 'dimensionless', 1e-2),
  u('[ppth]', '‰', 'por mil', 'dimensionless', 1e-3),
  u('[ppm]', 'ppm', 'partes por milhão', 'dimensionless', 1e-6),
  u('[ppb]', 'ppb', 'partes por bilhão', 'dimensionless', 1e-9),
  // Contagem e escalas (anotações UCUM entre chaves)
  u('{count}', 'un.', 'contagem', 'count'),
  u('{score}', 'nota', 'escala / nota', 'count'),
  // Comprimento
  u('m', 'm', 'metro', 'length'),
  u('km', 'km', 'quilômetro', 'length', 1e3),
  u('cm', 'cm', 'centímetro', 'length', 1e-2),
  u('mm', 'mm', 'milímetro', 'length', 1e-3),
  u('um', 'µm', 'micrômetro', 'length', 1e-6),
  u('nm', 'nm', 'nanômetro', 'length', 1e-9),
  u('[in_i]', 'in', 'polegada', 'length', 0.0254),
  // Área
  u('m2', 'm²', 'metro quadrado', 'area'),
  u('cm2', 'cm²', 'centímetro quadrado', 'area', 1e-4),
  u('mm2', 'mm²', 'milímetro quadrado', 'area', 1e-6),
  u('har', 'ha', 'hectare', 'area', 1e4),
  u('km2', 'km²', 'quilômetro quadrado', 'area', 1e6),
  // Volume
  u('L', 'L', 'litro', 'volume'),
  u('mL', 'mL', 'mililitro', 'volume', 1e-3),
  u('uL', 'µL', 'microlitro', 'volume', 1e-6),
  u('m3', 'm³', 'metro cúbico', 'volume', 1e3),
  u('cm3', 'cm³', 'centímetro cúbico', 'volume', 1e-3),
  // Massa
  u('g', 'g', 'grama', 'mass'),
  u('kg', 'kg', 'quilograma', 'mass', 1e3),
  u('mg', 'mg', 'miligrama', 'mass', 1e-3),
  u('ug', 'µg', 'micrograma', 'mass', 1e-6),
  u('t', 't', 'tonelada', 'mass', 1e6),
  // Tempo
  u('s', 's', 'segundo', 'time'),
  u('ms', 'ms', 'milissegundo', 'time', 1e-3),
  u('us', 'µs', 'microssegundo', 'time', 1e-6),
  u('min', 'min', 'minuto', 'time', 60),
  u('h', 'h', 'hora', 'time', 3600),
  u('d', 'd', 'dia', 'time', 86400),
  u('wk', 'sem', 'semana', 'time', 604800),
  // Temperatura (base: kelvin)
  u('K', 'K', 'kelvin', 'temperature'),
  u('Cel', '°C', 'grau Celsius', 'temperature', 1, 273.15),
  u('[degF]', '°F', 'grau Fahrenheit', 'temperature', 5 / 9, 273.15 - (32 * 5) / 9),
  // Pressão (base: pascal)
  u('Pa', 'Pa', 'pascal', 'pressure'),
  u('hPa', 'hPa', 'hectopascal', 'pressure', 1e2),
  u('kPa', 'kPa', 'quilopascal', 'pressure', 1e3),
  u('MPa', 'MPa', 'megapascal', 'pressure', 1e6),
  u('bar', 'bar', 'bar', 'pressure', 1e5),
  u('mbar', 'mbar', 'milibar', 'pressure', 1e2),
  u('[psi]', 'psi', 'libra por polegada quadrada', 'pressure', 6894.757293168),
  u('mm[Hg]', 'mmHg', 'milímetro de mercúrio', 'pressure', 133.322387415),
  // Força
  u('N', 'N', 'newton', 'force'),
  u('kN', 'kN', 'quilonewton', 'force', 1e3),
  // Energia
  u('J', 'J', 'joule', 'energy'),
  u('kJ', 'kJ', 'quilojoule', 'energy', 1e3),
  u('W.h', 'Wh', 'watt-hora', 'energy', 3600),
  u('kW.h', 'kWh', 'quilowatt-hora', 'energy', 3.6e6),
  // Potência
  u('W', 'W', 'watt', 'power'),
  u('mW', 'mW', 'miliwatt', 'power', 1e-3),
  u('kW', 'kW', 'quilowatt', 'power', 1e3),
  // Elétricas
  u('V', 'V', 'volt', 'voltage'),
  u('mV', 'mV', 'milivolt', 'voltage', 1e-3),
  u('uV', 'µV', 'microvolt', 'voltage', 1e-6),
  u('A', 'A', 'ampere', 'current'),
  u('mA', 'mA', 'miliampere', 'current', 1e-3),
  u('uA', 'µA', 'microampere', 'current', 1e-6),
  u('Ohm', 'Ω', 'ohm', 'resistance'),
  u('kOhm', 'kΩ', 'quilo-ohm', 'resistance', 1e3),
  u('MOhm', 'MΩ', 'mega-ohm', 'resistance', 1e6),
  // Frequência
  u('Hz', 'Hz', 'hertz', 'frequency'),
  u('kHz', 'kHz', 'quilohertz', 'frequency', 1e3),
  u('MHz', 'MHz', 'megahertz', 'frequency', 1e6),
  // Velocidade (base: m/s)
  u('m/s', 'm/s', 'metro por segundo', 'velocity'),
  u('km/h', 'km/h', 'quilômetro por hora', 'velocity', 1000 / 3600),
  // Vazão (base: L/s)
  u('L/s', 'L/s', 'litro por segundo', 'flow'),
  u('L/min', 'L/min', 'litro por minuto', 'flow', 1 / 60),
  u('L/h', 'L/h', 'litro por hora', 'flow', 1 / 3600),
  u('mL/min', 'mL/min', 'mililitro por minuto', 'flow', 1e-3 / 60),
  u('m3/h', 'm³/h', 'metro cúbico por hora', 'flow', 1000 / 3600),
  // Condutividade (base: S/m)
  u('S/m', 'S/m', 'siemens por metro', 'conductivity'),
  u('dS/m', 'dS/m', 'decisiemens por metro', 'conductivity', 0.1),
  u('mS/cm', 'mS/cm', 'milisiemens por centímetro', 'conductivity', 0.1),
  u('uS/cm', 'µS/cm', 'microsiemens por centímetro', 'conductivity', 1e-4),
  // Concentrações
  u('mol/L', 'mol/L', 'mol por litro', 'molar_concentration'),
  u('mmol/L', 'mmol/L', 'milimol por litro', 'molar_concentration', 1e-3),
  u('umol/L', 'µmol/L', 'micromol por litro', 'molar_concentration', 1e-6),
  u('g/L', 'g/L', 'grama por litro', 'mass_concentration'),
  u('mg/L', 'mg/L', 'miligrama por litro', 'mass_concentration', 1e-3),
  u('ug/L', 'µg/L', 'micrograma por litro', 'mass_concentration', 1e-6),
  u('ug/m3', 'µg/m³', 'micrograma por metro cúbico', 'mass_concentration', 1e-9),
  u('g/kg', 'g/kg', 'grama por quilograma', 'mass_fraction'),
  u('mg/kg', 'mg/kg', 'miligrama por quilograma', 'mass_fraction', 1e-3),
  // Luz e radiação
  u('lx', 'lx', 'lux', 'illuminance'),
  u('W/m2', 'W/m²', 'watt por metro quadrado', 'irradiance'),
  u('umol/(m2.s)', 'µmol/m²/s', 'micromol por metro quadrado por segundo', 'photon_flux'),
  // Precipitação
  u('mm/h', 'mm/h', 'milímetro por hora', 'precipitation_rate'),
  u('mm/d', 'mm/d', 'milímetro por dia', 'precipitation_rate', 1 / 24),
  // Ângulo
  u('deg', '°', 'grau', 'angle', Math.PI / 180),
  u('rad', 'rad', 'radiano', 'angle'),
  // Outros
  u('[pH]', 'pH', 'pH', 'acidity'),
  u('dB', 'dB', 'decibel', 'level'),
];

const BY_CODE = new Map(UNITS.map((unit) => [unit.code, unit]));

/** Aliases comuns digitados por usuários → código UCUM. */
const ALIASES: Record<string, string> = {
  '°C': 'Cel',
  'ºC': 'Cel',
  C: 'Cel',
  '°F': '[degF]',
  ppm: '[ppm]',
  ppb: '[ppb]',
  'µm': 'um',
  'µL': 'uL',
  'µg': 'ug',
  'µV': 'uV',
  'µA': 'uA',
  'µS/cm': 'uS/cm',
  'uS/cm': 'uS/cm',
  ha: 'har',
  'm²': 'm2',
  'cm²': 'cm2',
  'm³': 'm3',
  Ω: 'Ohm',
  'kΩ': 'kOhm',
  l: 'L',
  ml: 'mL',
  'l/min': 'L/min',
  pH: '[pH]',
  psi: '[psi]',
  mmHg: 'mm[Hg]',
  kWh: 'kW.h',
  Wh: 'W.h',
  '°': 'deg',
  un: '{count}',
};

export function getUnit(code: string | null | undefined): UnitDefinition | undefined {
  if (!code) return undefined;
  return BY_CODE.get(code);
}

/**
 * Normaliza o que o usuário digitou para um código UCUM conhecido.
 * Retorna `undefined` quando a unidade não é reconhecida.
 */
export function normalizeUnitCode(input: string | null | undefined): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (BY_CODE.has(trimmed)) return trimmed;
  const alias = ALIASES[trimmed];
  if (alias) return alias;
  const insensitive = UNITS.find((unit) => unit.code.toLowerCase() === trimmed.toLowerCase());
  return insensitive?.code;
}

/** Símbolo amigável para exibir; se a unidade não for do catálogo, devolve o próprio texto. */
export function unitSymbol(code: string | null | undefined): string {
  if (!code) return '';
  return getUnit(code)?.symbol ?? code;
}

/** Dimensões em que unidades diferentes não são conversíveis entre si. */
const NON_CONVERTIBLE: ReadonlySet<Dimension> = new Set(['acidity', 'level', 'count']);

export function areCompatible(from: string, to: string): boolean {
  const a = getUnit(from);
  const b = getUnit(to);
  if (!a || !b) return false;
  if (a.code === b.code) return true;
  if (NON_CONVERTIBLE.has(a.dimension)) return false;
  return a.dimension === b.dimension;
}

export class UnitConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnitConversionError';
  }
}

/** Converte um valor entre duas unidades compatíveis. */
export function convert(value: number, from: string, to: string): number {
  const a = getUnit(from);
  const b = getUnit(to);
  if (!a) throw new UnitConversionError(`Unidade desconhecida: ${from}`);
  if (!b) throw new UnitConversionError(`Unidade desconhecida: ${to}`);
  if (a.code === b.code) return value;
  if (!areCompatible(a.code, b.code)) {
    throw new UnitConversionError(
      `Unidades incompatíveis: ${a.symbol} (${DIMENSION_LABELS[a.dimension]}) e ${b.symbol} (${DIMENSION_LABELS[b.dimension]})`,
    );
  }
  const base = value * a.factor + (a.offset ?? 0);
  return (base - (b.offset ?? 0)) / b.factor;
}

/** Unidades agrupadas por dimensão, na ordem do catálogo — útil para seletores. */
export function unitsByDimension(): { dimension: Dimension; label: string; units: UnitDefinition[] }[] {
  const groups = new Map<Dimension, UnitDefinition[]>();
  for (const unit of UNITS) {
    const list = groups.get(unit.dimension) ?? [];
    list.push(unit);
    groups.set(unit.dimension, list);
  }
  return [...groups.entries()].map(([dimension, units]) => ({
    dimension,
    label: DIMENSION_LABELS[dimension],
    units,
  }));
}

/** Busca por código, símbolo ou nome (sem acento, sem diferenciar maiúsculas). */
export function searchUnits(query: string): UnitDefinition[] {
  const q = stripAccents(query.trim().toLowerCase());
  if (!q) return [...UNITS];
  return UNITS.filter((unit) =>
    [unit.code, unit.symbol, unit.name, DIMENSION_LABELS[unit.dimension]].some((text) =>
      stripAccents(text.toLowerCase()).includes(q),
    ),
  );
}

function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
