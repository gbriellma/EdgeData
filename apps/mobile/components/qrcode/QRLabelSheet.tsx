import * as Print from 'expo-print';
import QRCodeLib from 'qrcode';

const QR_URI_PREFIX = 'edgedata://subject/';
const COLUMNS = 3;

interface SubjectEntry {
  id: string;
  label: string;
}

interface SubjectWithSvg extends SubjectEntry {
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

function buildTableRows(subjects: SubjectWithSvg[]): string {
  const rows: string[] = [];

  for (let i = 0; i < subjects.length; i += COLUMNS) {
    const chunk = subjects.slice(i, i + COLUMNS);

    while (chunk.length < COLUMNS) {
      chunk.push({ id: '', label: '', svgString: '' });
    }

    const cells = chunk
      .map(({ id, label, svgString }) => {
        if (!id) return '<td class="label-cell empty-cell"></td>';
        return `
      <td class="label-cell">
        <div class="qr-container">
          <div class="qr-svg">${svgString}</div>
          <div class="subject-label">${escapeHtml(label)}</div>
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

function buildHtml(subjects: SubjectWithSvg[]): string {
  const tableRows = buildTableRows(subjects);
  const totalSubjects = subjects.length;
  const totalPages = Math.ceil(totalSubjects / (COLUMNS * 5));
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
    <h1>EdgeData — Etiquetas QR Code</h1>
    <p>Total de sujeitos: ${totalSubjects} &nbsp;|&nbsp; Gerado em: ${geradoEm}</p>
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
    EdgeData &copy; ${new Date().getFullYear()} — edgedata://subject/{id}
  </div>
</body>
</html>`;
}

/**
 * Gera um PDF com etiquetas QR code para os sujeitos fornecidos
 * e abre o compartilhamento nativo do dispositivo.
 *
 * @param subjects Lista de sujeitos com `id` e `label`
 */
export async function generateQRLabelPDF(subjects: SubjectEntry[]): Promise<string> {
  if (subjects.length === 0) {
    throw new Error('Nenhum sujeito fornecido para geração de etiquetas.');
  }

  // Generate all QR codes locally in parallel — much faster than fetching from API
  const subjectsWithSvg: SubjectWithSvg[] = await Promise.all(
    subjects.map(async (s) => {
      const qrData = `${QR_URI_PREFIX}${s.id}`;
      const svgString = await generateQRSvg(qrData);
      return { ...s, svgString };
    })
  );

  const html = buildHtml(subjectsWithSvg);

  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
  });

  return uri;
}
