/**
 * Interface mínima de acesso ao SQLite. O app usa o expo-sqlite; os testes usam o
 * `node:sqlite`. Os repositórios dependem só desta interface.
 */

export type SqlValue = string | number | null;

export interface Db {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  first<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  /** Executa `fn` numa transação; desfaz tudo se lançar erro. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Deslocamento do fuso local em minutos (ex.: Recife = -180). */
export function tzOffsetMinutes(date = new Date()): number {
  return -date.getTimezoneOffset();
}

export function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

let uuidImpl: () => string = () => {
  // RFC 4122 v4 — substituído pelo gerador criptográfico do app em runtime
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export function setUuidGenerator(fn: () => string): void {
  uuidImpl = fn;
}

export function uuid(): string {
  return uuidImpl();
}
