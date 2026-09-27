import { beforeEach, describe, expect, it } from 'vitest';
import { planSamples } from '@/core/design';
import { BUILTIN_TEMPLATES } from '@/core/templates';
import { listAudit } from './repo/common';
import { createCalibration, listCalibrations, revokeCalibration } from './repo/calibrations';
import { recordReadings, upsertDevice, listReadings } from './repo/devices';
import { clearDraft, getDraft, saveDraft } from './repo/drafts';
import { createExperiment, getExperiment } from './repo/experiments';
import { importObservations, listImports } from './repo/imports';
import { createObservation, listObservations } from './repo/observations';
import { acceptFlaggedValue, listQcReviews } from './repo/quality';
import { createSamplesFromPlan, listSamples } from './repo/samples';
import { listSessions, openSession } from './repo/sessions';
import { createMigratedDb } from './testing/node-db';

const ACTOR = 'Gabriel';
const template = BUILTIN_TEMPLATES.find((t) => t.id === 'agro-crescimento')!;

let db: Awaited<ReturnType<typeof createMigratedDb>>;
let experimentId: string;

beforeEach(async () => {
  db = await createMigratedDb();
  experimentId = await createExperiment(
    db,
    { newProjectName: 'Tese', metadata: { name: 'Crescimento', code: 'CRE', team: [{ name: ACTOR }] }, design: template.design, variables: template.variables },
    ACTOR,
  );
  const experiment = (await getExperiment(db, experimentId))!;
  await createSamplesFromPlan(db, experimentId, planSamples(experiment.design), [], ACTOR);
});

describe('rascunhos', () => {
  it('guarda um rascunho por experimento e apaga ao salvar', async () => {
    const [sample] = await listSamples(db, experimentId);
    const session = await openSession(db, experimentId, { operator: ACTOR });
    await saveDraft(db, { experimentId, sessionId: session.id, sampleId: sample.id, data: { altura: '12' } });
    await saveDraft(db, { experimentId, sessionId: session.id, sampleId: sample.id, data: { altura: '12.5' }, extra: { readingIds: { altura: 'r1' } } });
    const draft = await getDraft(db, experimentId);
    expect(draft?.data).toEqual({ altura: '12.5' });
    expect(draft?.extra).toEqual({ readingIds: { altura: 'r1' } });
    await clearDraft(db, experimentId);
    expect(await getDraft(db, experimentId)).toBeNull();
  });
});

describe('calibração', () => {
  const manifest = { schema: 'edgedata.device-manifest/1' as const, id: 'esp32-01', name: 'Estação', sensors: [{ id: 'temp', unit: 'Cel' }] };

  it('grava o valor corrigido ao lado do bruto e respeita a validade', async () => {
    const device = await upsertDevice(db, manifest, 'ble', 'AA', ACTOR);
    const session = await openSession(db, experimentId, { operator: ACTOR });
    const calibration = await createCalibration(
      db,
      {
        deviceId: device.id,
        sensorId: 'temp',
        method: 'linear',
        points: [{ raw: 0, reference: 0.5 }, { raw: 50, reference: 50.5 }],
        validFrom: '2026-01-01T00:00:00.000Z',
        validUntil: '2026-12-31T00:00:00.000Z',
      },
      ACTOR,
    );
    expect(calibration.coefficients[0]).toBeCloseTo(0.5, 10);
    await recordReadings(db, {
      experimentId,
      sessionId: session.id,
      device,
      readings: [
        { sensorId: 'temp', value: 20, receivedAt: '2026-06-01T00:00:00.000Z' },
        { sensorId: 'temp', value: 20, receivedAt: '2027-02-01T00:00:00.000Z' },
      ],
    });
    const readings = await listReadings(db, { sessionId: session.id });
    expect(readings.map((r) => [r.value, r.valueCorrected, r.calibrationId])).toEqual([
      [20, 20.5, calibration.id],
      [20, null, null],
    ]);
    await expect(db.run('UPDATE calibrations SET coefficients = ?', ['[0,2]'])).rejects.toThrow(/imutáveis/);
    await revokeCalibration(db, calibration.id, 'Padrão fora de validade', ACTOR);
    expect((await listCalibrations(db, { deviceId: device.id }))[0].revokedReason).toBe('Padrão fora de validade');
    await expect(revokeCalibration(db, calibration.id, 'de novo', ACTOR)).rejects.toThrow(/revogada/);
  });
});

describe('revisão de QC', () => {
  it('registra aceite sem alterar o dado bruto', async () => {
    const [sample] = await listSamples(db, experimentId);
    const session = await openSession(db, experimentId, { operator: ACTOR });
    const obs = await createObservation(db, { sessionId: session.id, sampleId: sample.id, data: { altura: 400 } }, ACTOR);
    expect(obs.qc.altura).toBe('OUT_OF_RANGE');
    await acceptFlaggedValue(db, { observationId: obs.id, variableKey: 'altura', flag: 'OUT_OF_RANGE', note: 'Planta de controle, medida conferida' }, ACTOR);
    const reviews = await listQcReviews(db, experimentId);
    expect(reviews.map((r) => [r.variableKey, r.decision])).toEqual([['altura', 'accepted']]);
    expect((await listAudit(db, { entityId: obs.id })).map((a) => a.action)).toContain('qc_accept');
    await expect(db.run('DELETE FROM qc_reviews')).rejects.toThrow(/inclusão/);
  });
});

describe('importação de observações', () => {
  it('cria sessão encerrada de importação com proveniência', async () => {
    const samples = await listSamples(db, experimentId);
    const result = await importObservations(
      db,
      {
        experimentId,
        fileName: 'medicoes-2025.csv',
        sha256: 'abc',
        rowsTotal: 3,
        rows: [
          { sampleId: samples[0].id, collectedAt: '2025-03-01T12:00:00.000Z', data: { altura: 10.2 } },
          { sampleId: samples[1].id, collectedAt: '2025-03-08T12:00:00.000Z', data: { altura: 14 } },
        ],
        mapping: { sample: 'parcela', altura: { column: 'alt_mm', unit: 'mm' } },
      },
      ACTOR,
    );
    expect(result.imported).toBe(2);
    const session = (await listSessions(db, experimentId)).find((s) => s.id === result.sessionId)!;
    expect(session.code).toBe('IMP-001');
    expect(session.status).toBe('closed');
    expect(session.startedAt).toBe('2025-03-01T12:00:00.000Z');
    const observations = await listObservations(db, { experimentId });
    expect(observations.every((o) => o.source === 'import')).toBe(true);
    expect((await listImports(db, experimentId))[0].rowsTotal).toBe(3);
  });

  it('desfaz tudo se uma linha for inválida', async () => {
    const samples = await listSamples(db, experimentId);
    await expect(
      importObservations(
        db,
        { experimentId, fileName: 'x.csv', rowsTotal: 1, rows: [{ sampleId: samples[0].id, collectedAt: '2025-01-01T00:00:00.000Z', data: {} }], mapping: {} },
        ACTOR,
      ),
    ).rejects.toThrow();
    expect(await listSessions(db, experimentId)).toHaveLength(0);
  });
});
