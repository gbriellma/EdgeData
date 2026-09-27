import { describe, expect, it } from 'vitest';
import { diffProtocols } from './protocol-diff';
import type { ProtocolVariable } from './types';

const base: ProtocolVariable = { key: 'altura', label: 'Altura', type: 'decimal', unit: 'cm', required: true, order: 1, config: {}, scope: 'observation' };

describe('diferença entre versões do protocolo', () => {
  it('lista inclusões, remoções e alterações', () => {
    const before: ProtocolVariable[] = [base, { ...base, key: 'cor', label: 'Cor', type: 'category', unit: undefined, config: { options: ['verde', 'amarela'] } }, { ...base, key: 'velha', label: 'Velha' }];
    const after: ProtocolVariable[] = [
      { ...base, unit: 'mm', required: false, expectedMin: 1, expectedMax: 100 },
      { ...base, key: 'cor', label: 'Cor da folha', type: 'category', unit: undefined, config: { options: ['verde', 'roxa'] } },
      { ...base, key: 'temp', label: 'Temperatura', unit: 'Cel' },
    ];
    const changes = diffProtocols(before, after);
    expect(changes.map((c) => [c.kind, c.key])).toEqual([
      ['changed', 'altura'],
      ['changed', 'cor'],
      ['added', 'temp'],
      ['removed', 'velha'],
    ]);
    expect(changes[0].details).toEqual(['unidade: cm para mm', 'deixou de ser obrigatória', 'faixa esperada: sem faixa para 1 a 100']);
    expect(changes[1].details).toEqual(['nome: "Cor" para "Cor da folha"', 'opções + roxa - amarela']);
    expect(changes[2].details[0]).toMatch(/°C, por observação/);
  });
});
