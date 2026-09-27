import type { QualityReport } from './quality';
import type { ExperimentMetadata, ProtocolVariable } from './types';
import { normalizeOrcid } from './codes';

/** Checagem antes de exportar: o que deixaria o dataset incompleto ou ambíguo. */

export type IssueSeverity = 'error' | 'warning' | 'info';
export type IssueTarget = 'details' | 'quality' | 'sessions' | 'observations' | 'variables' | 'samples' | 'collect';

export interface ReviewIssue {
  id: string;
  severity: IssueSeverity;
  title: string;
  detail?: string;
  target?: IssueTarget;
}

export interface ReviewInput {
  metadata: ExperimentMetadata;
  variables: readonly ProtocolVariable[];
  samples: number;
  observations: number;
  openSessions: string[];
  drafts: number;
  quality: Pick<QualityReport, 'flagged' | 'outliers' | 'neverObserved' | 'missing'>;
  /** Fotos referenciadas que não existem mais no aparelho */
  missingMedia: number;
}

const blank = (v?: string | null) => !v || !v.trim();

export function reviewBeforeExport(input: ReviewInput): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const add = (issue: ReviewIssue) => issues.push(issue);
  const m = input.metadata;

  if (input.observations === 0) add({ id: 'no-data', severity: 'error', title: 'Nenhuma observação registrada', detail: 'O dataset sairia sem dados.', target: 'collect' });

  const missingMeta = [
    blank(m.description) && blank(m.objective) ? 'descrição ou objetivo' : null,
    blank(m.methodology) ? 'metodologia' : null,
    blank(m.license) ? 'licença' : null,
  ].filter((x): x is string => x !== null);
  if (missingMeta.length > 0) {
    add({ id: 'meta-core', severity: 'warning', title: 'Metadados incompletos', detail: `Falta: ${missingMeta.join(', ')}. Sem isso o README fica vago e o reuso fica incerto.`, target: 'details' });
  }
  const optional = [blank(m.institution) ? 'instituição' : null, blank(m.location) ? 'local' : null, blank(m.startDate) ? 'período' : null].filter(
    (x): x is string => x !== null,
  );
  if (optional.length > 0) add({ id: 'meta-optional', severity: 'info', title: 'Metadados recomendados em branco', detail: optional.join(', '), target: 'details' });
  if (m.team.length === 0) add({ id: 'team', severity: 'warning', title: 'Equipe não informada', detail: 'Inclua ao menos o responsável pelo experimento.', target: 'details' });
  else if (!m.team.some((t) => t.orcid && normalizeOrcid(t.orcid))) {
    add({ id: 'orcid', severity: 'info', title: 'Nenhum ORCID na equipe', detail: 'O ORCID identifica os autores sem ambiguidade na citação.', target: 'details' });
  }

  if (input.openSessions.length > 0) {
    add({ id: 'open-sessions', severity: 'warning', title: `Sessão aberta: ${input.openSessions.join(', ')}`, detail: 'Encerre para registrar o horário final da coleta.', target: 'sessions' });
  }
  if (input.drafts > 0) add({ id: 'drafts', severity: 'warning', title: 'Há uma coleta não salva (rascunho)', detail: 'Ela não entra no pacote até ser salva.', target: 'collect' });
  if (input.quality.flagged.length > 0) {
    add({ id: 'flagged', severity: 'warning', title: `${input.quality.flagged.length} valor(es) sinalizado(s) sem revisão`, detail: 'Confira, corrija ou aceite cada um no painel de qualidade.', target: 'quality' });
  }
  if (input.quality.outliers.length > 0) {
    add({ id: 'outliers', severity: 'info', title: `${input.quality.outliers.length} valor(es) estatisticamente atípico(s)`, detail: 'Não são erros por definição, mas merecem uma olhada.', target: 'quality' });
  }
  if (input.missingMedia > 0) add({ id: 'media', severity: 'warning', title: `${input.missingMedia} foto(s) não encontrada(s) no aparelho`, detail: 'Elas ficarão fora do pacote.', target: 'observations' });
  if (input.quality.neverObserved.length > 0 && input.observations > 0) {
    add({ id: 'never-observed', severity: 'info', title: `${input.quality.neverObserved.length} amostra(s) sem nenhuma observação`, target: 'quality' });
  }
  if (input.quality.missing.length > 0) {
    add({ id: 'missing-values', severity: 'info', title: `${input.quality.missing.length} campo(s) opcional(is) em branco`, target: 'quality' });
  }
  const noUnit = input.variables.filter((v) => v.type === 'decimal' && !v.unit);
  if (noUnit.length > 0) {
    add({ id: 'units', severity: 'warning', title: 'Variáveis numéricas sem unidade', detail: noUnit.map((v) => v.label).join(', '), target: 'variables' });
  }
  const order: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}
