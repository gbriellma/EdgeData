import * as FileSystem from 'expo-file-system/legacy';
import { reviewBeforeExport, type ReviewIssue } from '@/core/review';
import { getDb } from '@/database/connection';
import { loadExportInput } from '@/database/export-input';
import { loadQualityReport } from '@/database/quality-report';
import { countDrafts } from '@/database/repo/drafts';
import { getExperiment } from '@/database/repo/experiments';
import { listSessions } from '@/database/repo/sessions';
import { resolveMediaUri } from './media';

/** Reúne o que a revisão antes de exportar precisa, inclusive fotos ausentes no aparelho. */
export async function runExportReview(experimentId: string): Promise<ReviewIssue[]> {
  const db = await getDb();
  const experiment = await getExperiment(db, experimentId);
  if (!experiment) throw new Error('Experimento não encontrado');
  const [{ report, variables }, sessions, drafts, loaded] = await Promise.all([
    loadQualityReport(db, experimentId),
    listSessions(db, experimentId),
    countDrafts(db, experimentId),
    loadExportInput(db, experimentId, { version: '0.0.0', createdAt: new Date().toISOString() }, { name: 'EdgeData', version: '' }),
  ]);
  let missingMedia = 0;
  for (const ref of loaded.media) {
    const info = await FileSystem.getInfoAsync(resolveMediaUri(ref.source)).catch(() => ({ exists: false }));
    if (!info.exists) missingMedia += 1;
  }
  return reviewBeforeExport({
    metadata: experiment.metadata,
    variables,
    samples: loaded.input.samples.length,
    observations: loaded.input.observations.filter((o) => o.status === 'current').length,
    openSessions: sessions.filter((s) => s.status === 'open').map((s) => s.code),
    drafts,
    quality: report,
    missingMedia,
  });
}
