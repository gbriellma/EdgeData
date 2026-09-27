/**
 * Identificação de amostras por QR Code, código de barras ou digitação.
 *
 * O QR carrega a identidade estável (UUID) e o código legível:
 *   edgedata://sample/<uuid>?c=<código>
 * O UUID nunca muda; o código serve para humanos e para busca quando só há
 * um código de barras ou uma etiqueta escrita à mão.
 */

export const QR_SCHEME = 'edgedata';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** <esquema>://<sample|subject>/<uuid>[?query] — inclui etiquetas de versões anteriores */
const URI_RE = /^([a-z][a-z0-9+.-]*):\/\/(sample|subject)\/([0-9a-f-]{36})(?:\?(.*))?$/i;

export type ScannedCode =
  | { kind: 'uuid'; id: string; code?: string }
  | { kind: 'code'; code: string }
  | { kind: 'empty' };

export function isUuid(text: string): boolean {
  return UUID_RE.test(text);
}

export function sampleQrPayload(sampleId: string, code?: string | null): string {
  const base = `${QR_SCHEME}://sample/${sampleId.toLowerCase()}`;
  return code ? `${base}?c=${encodeURIComponent(code)}` : base;
}

export function parseScannedCode(raw: string): ScannedCode {
  const text = (raw ?? '').trim();
  if (!text) return { kind: 'empty' };

  const uri = URI_RE.exec(text);
  if (uri && isUuid(uri[3])) {
    const params = new URLSearchParamsLite(uri[4] ?? '');
    const code = params.get('c') ?? undefined;
    return { kind: 'uuid', id: uri[3].toLowerCase(), ...(code ? { code } : {}) };
  }

  if (isUuid(text)) return { kind: 'uuid', id: text.toLowerCase() };

  return { kind: 'code', code: text };
}

/** Parser mínimo de query string (URLSearchParams não existe em todos os runtimes JS móveis). */
class URLSearchParamsLite {
  private readonly map = new Map<string, string>();

  constructor(query: string) {
    for (const part of query.split('&')) {
      if (!part) continue;
      const [k, ...rest] = part.split('=');
      try {
        this.map.set(decodeURIComponent(k), decodeURIComponent(rest.join('=').replace(/\+/g, ' ')));
      } catch {
        // parâmetro malformado é ignorado
      }
    }
  }

  get(key: string): string | null {
    return this.map.get(key) ?? null;
  }
}

/** Normaliza códigos para comparação (ignora caixa e espaços nas pontas). */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}
