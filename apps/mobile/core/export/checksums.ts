import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export function toBytes(data: string | Uint8Array): Uint8Array {
  return typeof data === 'string' ? utf8ToBytes(data) : data;
}

export function sha256Hex(data: string | Uint8Array): string {
  return bytesToHex(sha256(toBytes(data)));
}

/** SHA-256 incremental, para arquivos grandes lidos em partes. */
export function createSha256() {
  const hash = sha256.create();
  return {
    update(chunk: Uint8Array) {
      hash.update(chunk);
      return this;
    },
    hex: () => bytesToHex(hash.digest()),
  };
}

export interface ChecksumEntry {
  path: string;
  sha256: string;
  bytes: number;
}

/** Formato do `sha256sum` (verificável com `sha256sum -c checksums.sha256`). */
export function formatChecksumFile(entries: readonly ChecksumEntry[]): string {
  return [...entries]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((entry) => `${entry.sha256}  ${entry.path}`)
    .join('\n')
    .concat('\n');
}

export function parseChecksumFile(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^([0-9a-f]{64}) [ *](.+)$/.exec(line.trim());
    if (match) map.set(match[2], match[1]);
  }
  return map;
}

/** Decodifica base64 (arquivos lidos pelo expo-file-system) sem depender de Buffer/atob. */
export function base64ToBytes(base64: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < alphabet.length; i++) lookup[alphabet.charCodeAt(i)] = i;
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const length = Math.floor((clean.length * 3) / 4);
  const bytes = new Uint8Array(length);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = lookup[clean.charCodeAt(i)];
    const b = lookup[clean.charCodeAt(i + 1)];
    const c = lookup[clean.charCodeAt(i + 2)];
    const d = lookup[clean.charCodeAt(i + 3)];
    if (p < length) bytes[p++] = (a << 2) | (b >> 4);
    if (p < length) bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (p < length) bytes[p++] = ((c & 3) << 6) | d;
  }
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += alphabet[a >> 2] + alphabet[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? alphabet[((b & 15) << 2) | (c >> 6)] : '=';
    out += i + 2 < bytes.length ? alphabet[c & 63] : '=';
  }
  return out;
}
