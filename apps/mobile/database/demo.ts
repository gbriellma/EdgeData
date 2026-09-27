import { planSamples } from '@/core/design';
import { BUILTIN_TEMPLATES } from '@/core/templates';
import type { ExperimentalDesign } from '@/core/types';
import type { Db } from './db';
import { createExperiment, createProject, listProjects } from './repo/experiments';
import { createObservation, retractObservation, reviseObservation } from './repo/observations';
import { createSamplesFromPlan, listSamples } from './repo/samples';
import { closeSession, openSession, recordEvent } from './repo/sessions';

export const DEMO_CODE = 'DEMO-FEIJAO';

/** Gerador pseudoaleatório determinístico (mulberry32) — a demonstração é sempre igual. */
function random(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Cria (uma única vez) um experimento de demonstração com dados SINTÉTICOS:
 * desenho fatorial, duas sessões, uma revisão, uma retratação e eventos.
 */
export async function createDemoExperiment(db: Db, actor: string): Promise<string> {
  const existing = await db.first<{ id: string }>('SELECT id FROM experiments WHERE code = ?', [DEMO_CODE]);
  if (existing) return existing.id;

  const template = BUILTIN_TEMPLATES.find((t) => t.id === 'agro-crescimento')!;
  const design: ExperimentalDesign = {
    ...template.design,
    factors: [
      { key: 'cultivar', label: 'Cultivar', levels: ['BRS Estilo', 'IPR Tangará'] },
      { key: 'irrigacao', label: 'Irrigação', levels: ['Plena', 'Déficit hídrico'] },
    ],
    replicates: 3,
    blocks: 3,
    sessionsExpected: 3,
  };
  const project = (await listProjects(db)).find((p) => p.name === 'Demonstração');
  const projectId = project?.id ?? (await createProject(db, 'Demonstração', 'Dados sintéticos para conhecer o app', actor));

  const experimentId = await createExperiment(
    db,
    {
      projectId,
      metadata: {
        name: '[Demonstração] Feijão sob déficit hídrico',
        code: DEMO_CODE,
        description: 'Experimento fictício com dados SINTÉTICOS, criado para explorar o EdgeData. Não use em análises.',
        objective: 'Avaliar o crescimento de duas cultivares de feijão sob irrigação plena e déficit hídrico.',
        hypothesis: 'O déficit hídrico reduz a altura das plantas nas duas cultivares.',
        institution: 'Instituição exemplo',
        location: 'Casa de vegetação (exemplo)',
        methodology: 'Altura medida do colo ao ápice com régua milimetrada; folhas trifolioladas contadas manualmente.',
        team: [{ name: actor, role: 'Responsável' }],
        license: 'CC0-1.0',
      },
      design,
      variables: template.variables,
    },
    actor,
  );
  await createSamplesFromPlan(db, experimentId, planSamples(design), ['cultivar', 'irrigacao'], actor);
  const samples = await listSamples(db, experimentId);
  const rand = random(42);

  const day = (d: number, minutes: number) => new Date(Date.UTC(2026, 1, 1 + d, 12, minutes)).toISOString();
  const observationIds: string[] = [];
  for (const [index, offsetDays] of [0, 7].entries()) {
    const session = await openSession(db, experimentId, { operator: actor, notes: index === 0 ? 'Céu limpo, 29 °C' : 'Nublado, 26 °C' });
    await recordEvent(db, { experimentId, sessionId: session.id, label: index === 0 ? 'Início da coleta' : 'Irrigação do tratamento pleno', occurredAt: day(offsetDays, 0) }, actor);
    for (const [i, sample] of samples.entries()) {
      const deficit = sample.data.irrigacao === 'Déficit hídrico';
      const base = 12 + offsetDays * 1.6 - (deficit ? offsetDays * 0.7 : 0);
      const obs = await createObservation(
        db,
        {
          sessionId: session.id,
          sampleId: sample.id,
          collectedAt: day(offsetDays, 5 + i),
          data: {
            altura: Number((base + rand() * 3).toFixed(1)),
            numero_folhas: Math.round(3 + offsetDays / 3 + rand() * 2),
            estadio: offsetDays === 0 ? 'Vegetativo' : rand() > 0.7 ? 'Floração' : 'Vegetativo',
            momento: day(offsetDays, 5 + i),
          },
        },
        actor,
      );
      observationIds.push(obs.id);
    }
    await closeSession(db, session.id, actor);
  }

  // Uma correção e uma retratação, para mostrar o histórico
  await reviseObservation(db, observationIds[0], { data: { altura: 13.4, numero_folhas: 4, estadio: 'Vegetativo' }, reason: 'Digitado 31,4 em vez de 13,4 (exemplo)' }, actor);
  await retractObservation(db, observationIds[1], 'Planta tombada pelo vento (exemplo)', actor);
  return experimentId;
}
