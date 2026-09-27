// Geometria do símbolo EdgeData: folha cuja nervura central é um sinal de sensor.
// Tudo num quadro de 1024×1024, eixo da folha na diagonal (base embaixo à esquerda).

const B = [300, 724]; // base
const T = [724, 300]; // ponta
const d = [T[0] - B[0], T[1] - B[1]];
const len = Math.hypot(...d);
const u = [d[0] / len, d[1] / len]; // ao longo do eixo
const n = [u[1] * -1, u[0]]; // perpendicular (lado superior-esquerdo é negativo)

const at = (t, off) => [B[0] + d[0] * t + n[0] * off, B[1] + d[1] * t + n[1] * off];
const p = ([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`;

export function leafPath() {
  const a1 = at(0.06, 265), a2 = at(0.6, 215);
  const b2 = at(0.6, -215), b1 = at(0.06, -265);
  return `M ${p(B)} C ${p(a1)} ${p(a2)} ${p(T)} C ${p(b2)} ${p(b1)} ${p(B)} Z`;
}

// Sinal: começa no pecíolo, oscila como uma série temporal e termina perto da ponta
export const signalPoints = [
  [0.07, 0],
  [0.3, 0],
  [0.42, 74],
  [0.56, -60],
  [0.66, 0],
  [0.78, 0],
].map(([t, off]) => at(t, off));

export function signalPath() {
  return 'M ' + signalPoints.map(p).join(' L ');
}

export const stem = { from: at(0.0, 0), to: at(-0.14, 0) };

/**
 * Símbolo como grupo SVG.
 * opts: leafFill, signalColor, dotColor, scale (em torno do centro), knockout (sinal transparente)
 */
export function symbolGroup({ leaf = 'url(#leaf)', signal = '#fff', dot = '#fff', scale = 1, knockout = false, stroke = 36 } = {}) {
  const tf = `translate(512 512) scale(${scale}) translate(-512 -512)`;
  const last = signalPoints[signalPoints.length - 1];
  const dots = [signalPoints[2], signalPoints[3], last];
  const signalEls = `
    <path d="${signalPath()}" fill="none" stroke="${knockout ? '#000' : signal}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots.map(([x, y], i) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i === dots.length - 1 ? stroke * 1.05 : stroke * 0.95}" fill="${knockout ? '#000' : dot}"/>`).join('')}`;
  const stemEl = `<line x1="${stem.from[0]}" y1="${stem.from[1]}" x2="${stem.to[0].toFixed(1)}" y2="${stem.to[1].toFixed(1)}" stroke="${knockout ? '#fff' : leaf}" stroke-width="${stroke * 1.25}" stroke-linecap="round"/>`;
  if (knockout) {
    return `<mask id="ko" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
        <g transform="${tf}"><path d="${leafPath()}" fill="#fff"/>${stemEl}${signalEls}</g>
      </mask>
      <rect width="1024" height="1024" fill="${leaf}" mask="url(#ko)"/>`;
  }
  return `<g transform="${tf}">${stemEl}<path d="${leafPath()}" fill="${leaf}"/>${signalEls}</g>`;
}

export const defs = ({ leafA = '#8BE06A', leafB = '#34A457', bgA = '#0E3A22', bgB = '#1E6A3A' } = {}) => `
  <defs>
    <linearGradient id="leaf" x1="260" y1="780" x2="760" y2="260" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${leafB}"/><stop offset="1" stop-color="${leafA}"/>
    </linearGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="1024" y2="1024" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${bgB}"/><stop offset="1" stop-color="${bgA}"/>
    </linearGradient>
  </defs>`;

export const svg = (body, w = 1024, h = 1024) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
