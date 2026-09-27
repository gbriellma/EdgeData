import { base64ToBytes, bytesToBase64 } from '../export/checksums';

/** UTF-8 sem depender de TextEncoder/TextDecoder (nem todos os runtimes móveis têm os dois). */
export function utf8Encode(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
  }
  return Uint8Array.from(bytes);
}

/**
 * Decodificador incremental: guarda bytes de um caractere multibyte cortado ao meio
 * entre dois pacotes BLE e os completa no pacote seguinte.
 */
export class Utf8StreamDecoder {
  private pending: number[] = [];

  decode(chunk: Uint8Array): string {
    const bytes = this.pending.length ? [...this.pending, ...chunk] : Array.from(chunk);
    this.pending = [];
    let out = '';
    let i = 0;
    while (i < bytes.length) {
      const b = bytes[i];
      const size = b < 0x80 ? 1 : b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1;
      if (i + size > bytes.length) {
        this.pending = bytes.slice(i);
        break;
      }
      let code: number;
      if (size === 1) code = b < 0x80 ? b : 0xfffd;
      else if (size === 2) code = ((b & 31) << 6) | (bytes[i + 1] & 63);
      else if (size === 3) code = ((b & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63);
      else code = ((b & 7) << 18) | ((bytes[i + 1] & 63) << 12) | ((bytes[i + 2] & 63) << 6) | (bytes[i + 3] & 63);
      out += String.fromCodePoint(code);
      i += size;
    }
    return out;
  }
}

export const textToBase64 = (text: string): string => bytesToBase64(utf8Encode(text));
export const base64ToChunk = (base64: string): Uint8Array => base64ToBytes(base64);
