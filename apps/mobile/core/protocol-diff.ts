import type { ProtocolVariable } from './types';
import { unitSymbol } from './units';
import { fieldTypeInfo } from './variables';

/** Diferenças entre duas versões do protocolo, em frases curtas para o histórico. */
export interface ProtocolChange {
  kind: 'added' | 'removed' | 'changed';
  key: string;
  label: string;
  details: string[];
}

const fmtRange = (v: ProtocolVariable) => (v.expectedMin === undefined && v.expectedMax === undefined ? 'sem faixa' : `${v.expectedMin ?? '…'} a ${v.expectedMax ?? '…'}`);
const scopeLabel = (v: ProtocolVariable) => (v.scope === 'sample' ? 'por amostra' : 'por observação');

export function diffProtocols(before: readonly ProtocolVariable[], after: readonly ProtocolVariable[]): ProtocolChange[] {
  const old = new Map(before.map((v) => [v.key, v]));
  const next = new Map(after.map((v) => [v.key, v]));
  const changes: ProtocolChange[] = [];
  for (const v of after) {
    const prev = old.get(v.key);
    if (!prev) {
      changes.push({ kind: 'added', key: v.key, label: v.label, details: [`${fieldTypeInfo(v.type).label}${v.unit ? ` em ${unitSymbol(v.unit)}` : ''}, ${scopeLabel(v)}`] });
      continue;
    }
    const details: string[] = [];
    if (prev.label !== v.label) details.push(`nome: "${prev.label}" para "${v.label}"`);
    if (prev.type !== v.type) details.push(`tipo: ${fieldTypeInfo(prev.type).label} para ${fieldTypeInfo(v.type).label}`);
    if ((prev.unit ?? '') !== (v.unit ?? '')) details.push(`unidade: ${prev.unit ? unitSymbol(prev.unit) : 'nenhuma'} para ${v.unit ? unitSymbol(v.unit) : 'nenhuma'}`);
    if (prev.required !== v.required) details.push(v.required ? 'passou a ser obrigatória' : 'deixou de ser obrigatória');
    if (prev.scope !== v.scope) details.push(`registro: ${scopeLabel(prev)} para ${scopeLabel(v)}`);
    if (fmtRange(prev) !== fmtRange(v)) details.push(`faixa esperada: ${fmtRange(prev)} para ${fmtRange(v)}`);
    if (JSON.stringify(prev.config.options ?? []) !== JSON.stringify(v.config.options ?? [])) {
      const added = (v.config.options ?? []).filter((o) => !(prev.config.options ?? []).includes(o));
      const removed = (prev.config.options ?? []).filter((o) => !(v.config.options ?? []).includes(o));
      details.push(['opções', added.length ? `+ ${added.join(', ')}` : '', removed.length ? `- ${removed.join(', ')}` : ''].filter(Boolean).join(' '));
    }
    if (JSON.stringify(prev.showIf ?? null) !== JSON.stringify(v.showIf ?? null)) details.push('condição de exibição alterada');
    if (details.length > 0) changes.push({ kind: 'changed', key: v.key, label: v.label, details });
  }
  for (const v of before) if (!next.has(v.key)) changes.push({ kind: 'removed', key: v.key, label: v.label, details: [] });
  return changes;
}
