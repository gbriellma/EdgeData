// Gera todas as imagens do app e da loja a partir do símbolo (symbol.mjs).
// Uso: cd design/brand && npm install && npm run build
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { defs, svg, symbolGroup } from './symbol.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appImages = resolve(here, '../../apps/mobile/assets/images');
const store = resolve(here, 'store');
const sources = resolve(here, 'svg');
mkdirSync(store, { recursive: true });
mkdirSync(sources, { recursive: true });

// Área segura do ícone adaptativo do Android: círculo de 66 dp num quadro de 108 dp
const ADAPTIVE_SCALE = 0.74;
const DARK_LEAF = { leafA: '#4CAF50', leafB: '#1B5E20' };

const background = `<rect width="1024" height="1024" fill="url(#bg)"/>`;

const art = {
  icon: svg(defs() + background + symbolGroup({ scale: 1.02 })),
  adaptiveBackground: svg(defs() + background),
  adaptiveForeground: svg(defs() + symbolGroup({ scale: ADAPTIVE_SCALE })),
  adaptiveMonochrome: svg(symbolGroup({ scale: ADAPTIVE_SCALE, knockout: true, leaf: '#fff' })),
  splash: svg(defs(DARK_LEAF) + symbolGroup({ scale: 1.1 })),
  symbol: svg(defs(DARK_LEAF) + symbolGroup({ scale: 1.1 })),
};

const font = (weight) =>
  `@font-face{font-family:Inter;font-weight:${weight};src:url(data:font/woff2;base64,${readFileSync(
    resolve(here, `node_modules/@fontsource/inter/files/inter-latin-${weight}-normal.woff2`),
  ).toString('base64')}) format('woff2')}`;

// Arte de destaque da Play Store (1024×500, sem transparência)
function featureGraphic() {
  const dots = [];
  for (let x = 24; x < 1024; x += 32) for (let y = 20; y < 500; y += 32) dots.push(`<circle cx="${x}" cy="${y}" r="1.6"/>`);
  // série temporal decorativa ao fundo
  const series = [];
  for (let i = 0; i <= 64; i++) {
    const x = (i / 64) * 1024;
    const y = 400 - 40 * Math.sin(i / 4.2) - 22 * Math.sin(i / 1.7) - i * 2.2;
    series.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  const symbolSvg = svg(defs() + symbolGroup({ scale: 1.1 }));
  return `
  <style>${font(800)}${font(600)}${font(400)}
    .fg{position:relative;width:1024px;height:500px;overflow:hidden;font-family:Inter,sans-serif;
      background:linear-gradient(135deg,#1E6A3A 0%,#0E3A22 100%)}
    .deco{position:absolute;inset:0}
    .row{position:absolute;left:96px;right:80px;top:0;bottom:0;display:flex;align-items:center;gap:40px}
    .mark{width:260px;height:260px;flex:none;border-radius:60px;background:rgba(255,255,255,.06);
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.10)}
    .mark svg{width:260px;height:260px;display:block}
    h1{margin:0;font-weight:800;font-size:92px;letter-spacing:-2.5px;color:#fff;line-height:1}
    h2{margin:14px 0 0;font-weight:600;font-size:36px;color:#B9F09A;letter-spacing:-.5px}
    p{margin:18px 0 0;font-weight:400;font-size:21px;line-height:1.45;color:rgba(255,255,255,.78);max-width:540px}
  </style>
  <div class="fg">
    <svg class="deco" width="1024" height="500" viewBox="0 0 1024 500">
      <g fill="#fff" opacity=".07">${dots.join('')}</g>
      <polyline points="${series.join(' ')}" fill="none" stroke="#8BE06A" stroke-width="3" opacity=".22" stroke-linejoin="round"/>
    </svg>
    <div class="row">
      <div class="mark">${symbolSvg.replace('width="1024" height="1024"', '')}</div>
      <div>
        <h1>EdgeData</h1>
        <h2>Do sensor ao dataset</h2>
        <p>Planeje experimentos, colete em campo e no laboratório, à mão ou com ESP32, e exporte datasets científicos rastreáveis.</p>
      </div>
    </div>
  </div>`;
}

const jobs = [
  { name: 'icon', html: art.icon, size: 1024, out: resolve(appImages, 'icon.png') },
  { name: 'adaptiveBackground', html: art.adaptiveBackground, size: 1024, out: resolve(appImages, 'android-icon-background.png') },
  { name: 'adaptiveForeground', html: art.adaptiveForeground, size: 1024, out: resolve(appImages, 'android-icon-foreground.png'), transparent: true },
  { name: 'adaptiveMonochrome', html: art.adaptiveMonochrome, size: 1024, out: resolve(appImages, 'android-icon-monochrome.png'), transparent: true },
  { name: 'splash', html: art.splash, size: 1024, out: resolve(appImages, 'splash-icon.png'), transparent: true },
  { name: 'favicon', html: art.icon, size: 48, out: resolve(appImages, 'favicon.png') },
  { name: 'playIcon', html: art.icon, size: 512, out: resolve(store, 'play-icon-512.png') },
  { name: 'feature', html: featureGraphic(), width: 1024, height: 500, out: resolve(store, 'feature-graphic-1024x500.png') },
];

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
for (const job of jobs) {
  const w = job.width ?? job.size;
  const h = job.height ?? job.size;
  // SVGs de 1024 são reduzidos pelo navegador (antialiasing melhor que reamostrar o PNG)
  const html = job.size && job.size !== 1024 ? job.html.replace('width="1024" height="1024"', `width="${w}" height="${h}"`) : job.html;
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: job.out, omitBackground: !!job.transparent, clip: { x: 0, y: 0, width: w, height: h } });
  console.log(`✓ ${job.out.replace(resolve(here, '../..') + '/', '')}`);
}
await browser.close();

for (const [name, content] of Object.entries(art)) writeFileSync(resolve(sources, `${name}.svg`), `${content}\n`);
console.log('✓ SVGs em design/brand/svg');
