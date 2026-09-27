/**
 * Tipos do domínio do EdgeData. Sem dependências de React Native: este arquivo é
 * compartilhado por telas, banco de dados, exportação e testes.
 */

// ── Variáveis ────────────────────────────────────────────────────────────────

/** Como o valor é coletado e exibido no formulário. */
export type FieldType =
  | 'short_text'
  | 'long_text'
  | 'integer'
  | 'decimal'
  | 'category'
  | 'multi_category'
  | 'boolean'
  | 'image'
  | 'multi_image'
  | 'date'
  | 'time'
  | 'scale'
  | 'gps'
  | 'barcode'
  | 'auto_timestamp'
  | 'auto_gps'
  | 'auto_uuid';

/** Onde a variável é registrada: uma vez por amostra ou a cada observação. */
export type VariableScope = 'sample' | 'observation';

/** Papel da variável no desenho experimental. */
export type VariableRole =
  | 'identifier'
  | 'independent'
  | 'dependent'
  | 'control'
  | 'covariate'
  | 'metadata';

export type ConditionOperator = 'equals' | 'not_equals' | 'in' | 'truthy' | 'falsy' | 'gt' | 'lt';

/** Exibe a variável somente quando outra variável satisfaz a condição. */
export interface VisibilityCondition {
  variable: string;
  op: ConditionOperator;
  value?: string | number | boolean | (string | number)[];
}

export interface AngleDefinition {
  key: string;
  label: string;
}

export interface VariableConfig {
  /** Limite mínimo aceito (valor abaixo é inválido e impede salvar) */
  min?: number;
  /** Limite máximo aceito (valor acima é inválido e impede salvar) */
  max?: number;
  decimals?: number;
  options?: string[];
  labels?: Record<number, string>;
  defaultValue?: unknown;
  angles?: AngleDefinition[];
  photoWidth?: number;
  photoHeight?: number;
}

export interface VariableDefinition {
  /** Identificador estável em snake_case (vira nome de coluna na exportação) */
  key: string;
  label: string;
  description?: string;
  type: FieldType;
  /** Código UCUM (ex.: "Cel", "cm", "[ppm]") */
  unit?: string;
  required: boolean;
  order: number;
  role?: VariableRole;
  /** Faixa esperada: fora dela o valor é aceito, mas recebe a flag OUT_OF_RANGE */
  expectedMin?: number;
  expectedMax?: number;
  /** Menor variação que o instrumento/processo distingue, na unidade da variável */
  resolution?: number;
  /** Exatidão declarada (±), na unidade da variável */
  accuracy?: number;
  /** Dado pessoal ou sensível (LGPD): tratado com cuidado na exportação */
  sensitive?: boolean;
  showIf?: VisibilityCondition;
  config: VariableConfig;
}

/** Variável como gravada numa versão do protocolo. */
export interface ProtocolVariable extends VariableDefinition {
  scope: VariableScope;
}

// ── Desenho experimental ─────────────────────────────────────────────────────

export interface Factor {
  key: string;
  label: string;
  levels: string[];
}

export interface ExplicitTreatment {
  code: string;
  label?: string;
  levels?: Record<string, string>;
}

export interface ControlGroup {
  code: string;
  label?: string;
}

export interface ExperimentalDesign {
  factors: Factor[];
  /** factorial: combina todos os níveis; explicit: usa a lista `treatments` */
  treatmentMode: 'factorial' | 'explicit';
  treatments: ExplicitTreatment[];
  controls: ControlGroup[];
  replicates: number;
  /** Número de blocos (0 ou 1 = sem blocos) */
  blocks: number;
  sessionsExpected: number;
  sessionDurationMin?: number;
  /** Texto livre ou duração ISO-8601 (ex.: "P7D" = semanal) */
  collectionFrequency?: string;
  /** Taxa de aquisição de sensores, quando houver (Hz) */
  samplingRateHz?: number;
}

// ── Experimento ──────────────────────────────────────────────────────────────

export interface TeamMember {
  name: string;
  role?: string;
  orcid?: string;
  email?: string;
  affiliation?: string;
}

export type ExperimentStatus = 'draft' | 'active' | 'completed';

export interface ExperimentMetadata {
  name: string;
  code: string;
  description?: string;
  objective?: string;
  hypothesis?: string;
  institution?: string;
  laboratory?: string;
  team: TeamMember[];
  funding?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  methodology?: string;
  inclusionCriteria?: string;
  exclusionCriteria?: string;
  notes?: string;
  license?: string;
}

// ── Qualidade ────────────────────────────────────────────────────────────────

export type QcFlag =
  | 'GOOD'
  | 'SUSPECT'
  | 'BAD'
  | 'MISSING'
  | 'OUT_OF_RANGE'
  | 'SATURATED'
  | 'CALIBRATION'
  | 'OUTLIER'
  | 'MANUAL_REVIEW';

export type QcFlags = Record<string, QcFlag>;

// ── Geolocalização ───────────────────────────────────────────────────────────

export interface GeoPoint {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  /** Precisão horizontal em metros */
  accuracy?: number | null;
  /** Sistema de referência; o GPS do celular usa WGS 84 */
  crs?: string;
  capturedAt?: string;
}

export type ValueMap = Record<string, unknown>;
