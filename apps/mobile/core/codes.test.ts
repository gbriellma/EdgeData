import { describe, expect, it } from 'vitest';
import { normalizeCode, parseScannedCode, sampleQrPayload } from './codes';

const ID = '71b75a4c-d089-499f-8df2-b46d5d8e432c';

describe('QR de amostras', () => {
  it('ida e volta com código legível', () => {
    const payload = sampleQrPayload(ID, 'T1_C_F1 R1');
    expect(payload).toBe(`edgedata://sample/${ID}?c=T1_C_F1%20R1`);
    expect(parseScannedCode(payload)).toEqual({ kind: 'uuid', id: ID, code: 'T1_C_F1 R1' });
  });

  it('lê etiquetas antigas no formato <esquema>://subject/<uuid>', () => {
    expect(parseScannedCode(`legado://subject/${ID.toUpperCase()}`)).toEqual({ kind: 'uuid', id: ID });
  });

  it('aceita UUID puro', () => {
    expect(parseScannedCode(` ${ID} `)).toEqual({ kind: 'uuid', id: ID });
  });

  it('trata qualquer outro texto como código de amostra', () => {
    expect(parseScannedCode('PEARL-PIPE03-RUN017')).toEqual({ kind: 'code', code: 'PEARL-PIPE03-RUN017' });
    expect(parseScannedCode('   ')).toEqual({ kind: 'empty' });
  });

  it('normaliza códigos', () => {
    expect(normalizeCode(' t1_r1 ')).toBe('T1_R1');
  });
});
