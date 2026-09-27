import * as Print from 'expo-print';
import QRCodeLib from 'qrcode';
import { sampleQrPayload } from '@/core/codes';

const COLUMNS = 3;

export interface LabelEntry {
  id: string;
  /** Código legível impresso em destaque */
  code: string;
  /** Linha secundária (tratamento, experimento…) */
  label?: string;
}

interface LabelWithSvg extends LabelEntry {
  svgString: string;
}

async function generateQRSvg(data: string): Promise<string> {
  try {
    const svg = await QRCodeLib.toString(data, {
      type: 'svg',
      width: 140,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    });
    return svg;
  } catch {
    return '<svg></svg>';
  }
}

function buildTableRows(subjects: LabelWithSvg[]): string {
  const rows: string[] = [];

  for (let i = 0; i < subjects.length; i += COLUMNS) {
    const chunk = subjects.slice(i, i + COLUMNS);

    while (chunk.length < COLUMNS) {
      chunk.push({ id: '', code: '', label: '', svgString: '' });
    }

    const cells = chunk
      .map(({ id, code, label, svgString }) => {
        if (!id) return '<td class="label-cell empty-cell"></td>';
        return `
      <td class="label-cell">
        <div class="qr-container">
          <div class="qr-svg">${svgString}</div>
          <div class="subject-label">${escapeHtml(code)}</div>
          ${label ? `<div class="subject-sublabel">${escapeHtml(label)}</div>` : ''}
        </div>
      </td>`;
      })
      .join('');

    rows.push(`<tr>${cells}</tr>`);
  }

  return rows.join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHtml(subjects: LabelWithSvg[], title: string): string {
  const tableRows = buildTableRows(subjects);
  const totalSubjects = subjects.length;
  const geradoEm = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Etiquetas QR Code — EdgeData</title>
  <style>
    @page {
      size: A4;
      margin: 12mm 10mm;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      background: #fff;
      color: #1c1c1e;
    }

    .page-header {
      text-align: center;
      border-bottom: 2px solid #2E7D32;
      padding-bottom: 8px;
      margin-bottom: 16px;
    }

    .page-header h1 {
      font-size: 18px;
      color: #2E7D32;
      font-weight: 700;
      letter-spacing: 0.5px;
    }

    .page-header p {
      font-size: 10px;
      color: #6B7280;
      margin-top: 4px;
    }

    .labels-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    .label-cell {
      width: 33.33%;
      padding: 6px;
      vertical-align: top;
      border: 1px dashed #E5E7EB;
      text-align: center;
      page-break-inside: avoid;
    }

    .empty-cell {
      border: 1px dashed transparent;
    }

    .qr-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 8px 4px;
      background: #fff;
      border-radius: 6px;
    }

    .qr-svg {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 140px;
      height: 140px;
    }

    .qr-svg svg {
      width: 100%;
      height: 100%;
    }

    .subject-label {
      margin-top: 4px;
      font-size: 11px;
      font-weight: 600;
      color: #1c1c1e;
      text-align: center;
      max-width: 160px;
      word-wrap: break-word;
      line-height: 1.3;
    }

    .subject-sublabel {
      margin-top: 2px;
      font-size: 9px;
      color: #6B7280;
      text-align: center;
      max-width: 160px;
      word-wrap: break-word;
    }

    .page-footer {
      margin-top: 12px;
      text-align: center;
      font-size: 8px;
      color: #9CA3AF;
      border-top: 1px solid #E5E7EB;
      padding-top: 6px;
    }

    .offline-note {
      margin-top: 8px;
      padding: 6px 10px;
      background: #FFF3E0;
      border: 1px solid #F57C00;
      border-radius: 4px;
      font-size: 9px;
      color: #5D3B00;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="page-header">
    <h1>${escapeHtml(title)}</h1>
    <p>Amostras: ${totalSubjects} &nbsp;|&nbsp; Gerado em: ${geradoEm}</p>
  </div>

  <div class="offline-note">
    QR Codes gerados localmente — funciona offline. Recorte as etiquetas pelas linhas tracejadas.
  </div>

  <br />

  <table class="labels-table">
    <tbody>
      ${tableRows}
    </tbody>
  </table>

  <div class="page-footer">
    EdgeData — edgedata://sample/{uuid}?c={código}
  </div>
</body>
</html>`;
}

/**
 * Gera um PDF com etiquetas (QR Code com UUID + código legível) e devolve o URI.
 */
export async function generateQRLabelPDF(entries: LabelEntry[], title = 'EdgeData — Etiquetas'): Promise<string> {
  if (entries.length === 0) {
    throw new Error('Nenhuma amostra selecionada para gerar etiquetas.');
  }

  const withSvg: LabelWithSvg[] = await Promise.all(
    entries.map(async (entry) => ({ ...entry, svgString: await generateQRSvg(sampleQrPayload(entry.id, entry.code)) })),
  );

  const { uri } = await Print.printToFileAsync({ html: buildHtml(withSvg, title), base64: false });
  return uri;
}
