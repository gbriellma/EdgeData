import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseCsv } from './csv';

describe('parseCsv', () => {
  it('lê o CSV de exemplo de amostras', () => {
    const { headers, rows } = parseCsv('nome,variedade,rega\nT1_C_F1_R1,T1,controle\n');
    expect(headers).toEqual(['nome', 'variedade', 'rega']);
    expect(rows).toEqual([{ nome: 'T1_C_F1_R1', variedade: 'T1', rega: 'controle' }]);
  });

  it('lida com aspas, quebras de linha e BOM', () => {
    const { rows } = parseCsv('﻿codigo,obs\r\nA1,"linha 1\nlinha 2"\r\nA2,"com ""aspas"", e vírgula"\r\n');
    expect(rows).toEqual([
      { codigo: 'A1', obs: 'linha 1\nlinha 2' },
      { codigo: 'A2', obs: 'com "aspas", e vírgula' },
    ]);
  });

  it('detecta ponto e vírgula (Excel em português)', () => {
    expect(detectDelimiter('codigo;altura;obs\nA1;12,5;x')).toBe(';');
    expect(parseCsv('codigo;altura\nA1;12,5').rows[0]).toEqual({ codigo: 'A1', altura: '12,5' });
  });

  it('ignora linhas vazias', () => {
    expect(parseCsv('\n\na,b\n\n1,2\n\n').rows).toEqual([{ a: '1', b: '2' }]);
  });
});
