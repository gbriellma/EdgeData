/**
 * EdgeData Device Protocol v1 — mensagens JSON delimitadas por nova linha (NDJSON).
 * Ver docs/PROTOCOLO_DISPOSITIVOS.md.
 */

export const PROTOCOL_VERSION = 1;

export const BLE_SERVICE_UUID = 'ed0a0001-abd6-484b-8c0b-c353facbd2c5';
export const BLE_RX_CHAR_UUID = 'ed0a0002-abd6-484b-8c0b-c353facbd2c5'; // app → dispositivo
export const BLE_TX_CHAR_UUID = 'ed0a0003-abd6-484b-8c0b-c353facbd2c5'; // dispositivo → app
export const BLE_NAME_PREFIX = 'EdgeData-';

// ── Comandos (app → dispositivo) ─────────────────────────────────────────────

export type DeviceCommand =
  | { cmd: 'hello' }
  | { cmd: 'read' }
  | { cmd: 'start'; interval_ms?: number }
  | { cmd: 'stop' }
  | { cmd: 'time'; utc_ms: number }
  | { cmd: 'ping' };

export function encodeCommand(command: DeviceCommand, id: string): string {
  return `${JSON.stringify({ id, ...command })}\n`;
}

// ── Mensagens (dispositivo → app) ────────────────────────────────────────────

export interface HelloMessage { t: 'hello'; proto: number; manifest: unknown; id?: string }
export interface ObsMessage { t: 'obs'; seq?: number; ms?: number; utc_ms?: number; values: Record<string, number | string | boolean | null> }
export interface BlockMessage { t: 'blk'; seq?: number; sensor: string; ms?: number; fs: number; v: number[] }
export interface StatusMessage { t: 'status'; ms?: number; battery_pct?: number; rssi?: number; streaming?: boolean; interval_ms?: number; [k: string]: unknown }
export interface EventMessage { t: 'evt'; ms?: number; utc_ms?: number; label: string; data?: unknown }
export interface AckMessage { t: 'ack'; id: string; ok?: boolean }
export interface ErrMessage { t: 'err'; id?: string; msg: string }
export interface PongMessage { t: 'pong'; id?: string; ms?: number }
export interface LogMessage { t: 'log'; level?: string; msg: string }

export type DeviceMessage =
  | HelloMessage
  | ObsMessage
  | BlockMessage
  | StatusMessage
  | EventMessage
  | AckMessage
  | ErrMessage
  | PongMessage
  | LogMessage;

export type ParseResult = { ok: true; message: DeviceMessage } | { ok: false; error: string; line: string };

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function parseDeviceLine(line: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(line);
  } catch {
    return { ok: false, error: 'JSON inválido', line };
  }
  if (!isObject(data) || typeof data.t !== 'string') return { ok: false, error: 'mensagem sem campo "t"', line };

  switch (data.t) {
    case 'hello':
      if (!isObject(data.manifest)) return { ok: false, error: 'hello sem manifesto', line };
      return {
        ok: true,
        message: { t: 'hello', proto: Number(data.proto ?? 1), manifest: data.manifest, ...(typeof data.id === 'string' ? { id: data.id } : {}) },
      };
    case 'obs':
      if (!isObject(data.values)) return { ok: false, error: 'obs sem values', line };
      return { ok: true, message: data as unknown as ObsMessage };
    case 'blk':
      if (typeof data.sensor !== 'string' || !Array.isArray(data.v) || typeof data.fs !== 'number') {
        return { ok: false, error: 'blk incompleto (sensor, fs, v)', line };
      }
      return { ok: true, message: data as unknown as BlockMessage };
    case 'evt':
      if (typeof data.label !== 'string') return { ok: false, error: 'evt sem label', line };
      return { ok: true, message: data as unknown as EventMessage };
    case 'ack':
      return { ok: true, message: { t: 'ack', id: String(data.id ?? ''), ok: data.ok !== false } };
    case 'err':
      return { ok: true, message: { t: 'err', id: data.id === undefined ? undefined : String(data.id), msg: String(data.msg ?? 'erro') } };
    case 'status':
    case 'pong':
    case 'log':
      return { ok: true, message: data as unknown as DeviceMessage };
    default:
      return { ok: false, error: `tipo desconhecido "${data.t}"`, line };
  }
}

/**
 * Remonta linhas a partir de pedaços (notificações BLE, leituras seriais).
 * Protege contra linhas gigantes (dispositivo com defeito) descartando o buffer.
 */
export class LineAssembler {
  private buffer = '';

  constructor(private readonly maxLineLength = 64 * 1024) {}

  push(chunk: string): string[] {
    this.buffer += chunk;
    const lines: string[] = [];
    let index = this.buffer.indexOf('\n');
    while (index >= 0) {
      const line = this.buffer.slice(0, index).replace(/\r$/, '').trim();
      if (line) lines.push(line);
      this.buffer = this.buffer.slice(index + 1);
      index = this.buffer.indexOf('\n');
    }
    if (this.buffer.length > this.maxLineLength) this.buffer = '';
    return lines;
  }

  reset(): void {
    this.buffer = '';
  }
}

/** Divide um texto em pedaços de no máximo `size` bytes UTF-8 sem quebrar caracteres. */
export function chunkUtf8(text: string, size: number): string[] {
  if (size < 4) throw new Error('tamanho de pedaço muito pequeno');
  const chunks: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of text) {
    const charBytes = utf8Length(char);
    if (bytes + charBytes > size) {
      chunks.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += charBytes;
  }
  if (current) chunks.push(current);
  return chunks;
}

export function utf8Length(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** Detecta perda de pacotes pela sequência `seq`. */
export class SequenceTracker {
  private last: number | null = null;
  received = 0;
  lost = 0;

  track(seq: number | undefined): number {
    if (seq === undefined) return 0;
    this.received += 1;
    let gap = 0;
    if (this.last !== null && seq > this.last + 1) gap = seq - this.last - 1;
    if (this.last !== null && seq <= this.last) gap = 0; // dispositivo reiniciou
    this.lost += gap;
    this.last = seq;
    return gap;
  }

  get lossRatio(): number {
    const total = this.received + this.lost;
    return total === 0 ? 0 : this.lost / total;
  }

  reset(): void {
    this.last = null;
    this.received = 0;
    this.lost = 0;
  }
}
