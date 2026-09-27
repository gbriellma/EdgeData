import { beforeEach, describe, expect, it } from 'vitest';
import { emptyDesign, planSamples } from '@/core/design';
import { BUILTIN_TEMPLATES } from '@/core/templates';
import type { Db } from './db';
import { migrate } from './migrate';
import { LATEST_SCHEMA_VERSION } from './migrations';
import { listAudit } from './repo/common';
import { createExperiment, getCurrentProtocol, getExperiment, getExperimentStats, listProtocols, saveVariables, updateExperimentMetadata } from './repo/experiments';
import { createObservation, getObservationHistory, listObservations, ObservationValidationError, retractObservation, reviseObservation } from './repo/observations';
import { createSamples, createSamplesFromPlan, findSampleByCode, listSamples } from './repo/samples';
import { closeSession, getOpenSession, listEvents, openSession, recordEvent } from './repo/sessions';
import { ensureDataset, listReleases, recordReadings, recordRelease, upsertDevice } from './repo/devices';
import { createMigratedDb } from './testing/node-db';

const ACTOR = 'Gabriel';
const template = BUILTIN_TEMPLATES.find((t) => t.id === 'fitopatologia-severidade')!;

async function setup(db: Db) {
  const experimentId = await createExperiment(
    db,
    {
      newProjectName: 'Tese',
      metadata: { name: 'Ferrugem 2026', code: 'FER-2026', team: [{ name: ACTOR }] },
      design: template.design,
      variables: template.variables,
    },
    ACTOR,
  );
  const experiment = (await getExperiment(db, experimentId))!;
  await createSamplesFromPlan(db, experimentId, planSamples(experiment.design), [], ACTOR);
  const sample = (await findSampleByCode(db, experimentId, 'f1_r1'))!;
  const session = await openSession(db, experimentId, { operator: ACTOR });
  return { experimentId, experiment, sample, session };
}

let db: Awaited<ReturnType<typeof createMigratedDb>>;
beforeEach(async () => {
  db = await createMigratedDb();
});

describe('migrações', () => {
  it('são idempotentes', async () => {
    expect(await migrate(db)).toBe(LATEST_SCHEMA_VERSION);
    const row = await db.first<{ user_version: number }>('PRAGMA user_version');
    expect(row?.user_version).toBe(LATEST_SCHEMA_VERSION);
  });
});

describe('experimentos e amostras', () => {
  it('cria experimento com protocolo v1 e amostras do desenho', async () => {
    const { experimentId, sample } = await setup(db);
    const protocol = await getCurrentProtocol(db, experimentId);
    expect(protocol.version).toBe(1);
    expect(protocol.variables).toHaveLength(template.variables.length);
    const samples = await listSamples(db, experimentId);
    expect(samples).toHaveLength(15); // 2 tratamentos + controle × 5 réplicas
    expect(sample.code).toBe('F1_R1');
    const again = await createSamplesFromPlan(db, experimentId, planSamples(template.design), [], ACTOR);
    expect(again).toEqual({ created: 0, skipped: 15 });
  });

  it('recusa códigos repetidos', async () => {
    const { experimentId } = await setup(db);
    await expect(createSamples(db, experimentId, [{ code: 'x1' }, { code: 'X1' }], ACTOR)).rejects.toThrow(/repetido/);
    await expect(createSamples(db, experimentId, [{ code: 'f1_r1' }], ACTOR)).rejects.toThrow(/Já existe/);
  });

  it('audita mudanças de metadados', async () => {
    const { experimentId, experiment } = await setup(db);
    await updateExperimentMetadata(db, experimentId, { ...experiment.metadata, hypothesis: 'F1 reduz a severidade' }, ACTOR);
    const audit = await listAudit(db, { entity: 'experiment', entityId: experimentId });
    expect(audit.at(-1)).toMatchObject({ action: 'update_metadata', details: { hypothesis: [null, 'F1 reduz a severidade'] } });
  });
});

describe('observações imutáveis', () => {
  it('valida, normaliza e calcula QC', async () => {
    const { session, sample } = await setup(db);
    await expect(createObservation(db, { sessionId: session.id, sampleId: sample.id, data: { ha_doenca: true } }, ACTOR)).rejects.toBeInstanceOf(ObservationValidationError);
    const obs = await createObservation(db, { sessionId: session.id, sampleId: sample.id, data: { ha_doenca: true, doenca: 'Ferrugem', severidade: '4' } }, ACTOR);
    expect(obs.data).toEqual({ ha_doenca: true, doenca: 'Ferrugem', severidade: 4 });
    expect(obs.qc).toMatchObject({ ha_doenca: 'GOOD', severidade: 'GOOD', foto_lesao: 'MISSING' });
    expect(obs.status).toBe('current');
  });

  it('o banco recusa UPDATE nos valores e DELETE', async () => {
    const { session, sample } = await setup(db);
    const obs = await createObservation(db, { sessionId: session.id, sampleId: sample.id, data: { ha_doenca: false } }, ACTOR);
    await expect(db.run('UPDATE observations SET data = ? WHERE id = ?', ['{}', obs.id])).rejects.toThrow(/imutáveis/);
    await expect(db.run('DELETE FROM observations WHERE id = ?', [obs.id])).rejects.toThrow(/retratação/);
  });

  it('correção cria revisão e mantém o original', async () => {
    const { session, sample } = await setup(db);
    const original = await createObservation(db, { sessionId: session.id, sampleId: sample.id, data: { ha_doenca: true, doenca: 'Ferrugem', severidade: 4 } }, ACTOR);
    const revised = await reviseObservation(db, original.id, { data: { ha_doenca: true, doenca: 'Ferrugem', severidade: 6 }, reason: 'Erro de digitação' }, ACTOR);
    expect(revised).toMatchObject({ revision: 2, supersedesId: original.id, status: 'current' });
    const history = await getObservationHistory(db, revised.id);
    expect(history.map((o) => [o.revision, o.status, o.data.severidade])).toEqual([[1, 'superseded', 4], [2, 'current', 6]]);
    await expect(reviseObservation(db, original.id, { data: {}, reason: 'x' }, ACTOR)).rejects.toThrow(/vigente/);
    const audit = await listAudit(db, { entity: 'observation', entityId: original.id });
    expect(audit[0]).toMatchObject({ action: 'revise', details: { reason: 'Erro de digitação', diff: { severidade: [4, 6] } } });
    expect(await listObservations(db, { experimentId: session.experimentId })).toHaveLength(1);
    expect(await listObservations(db, { experimentId: session.experimentId, status: 'all' })).toHaveLength(2);
  });

  it('retratação exige motivo e não apaga', async () => {
    const { session, sample, experiment } = await setup(db);
    const obs = await createObservation(db, { sessionId: session.id, sampleId: sample.id, data: { ha_doenca: false } }, ACTOR);
    await expect(retractObservation(db, obs.id, '  ', ACTOR)).rejects.toThrow(/motivo/);
    await retractObservation(db, obs.id, 'Amostra trocada', ACTOR);
    await expect(retractObservation(db, obs.id, 'de novo', ACTOR)).rejects.toThrow();
    const stats = await getExperimentStats(db, experiment);
    expect(stats).toMatchObject({ observations: 0, retracted: 1, samples: 15, expectedObservations: 60 });
  });

  it('a auditoria é append-only', async () => {
    await setup(db);
    await expect(db.run('DELETE FROM audit_log')).rejects.toThrow(/inclusão/);
    await expect(db.run("UPDATE audit_log SET actor = 'x'")).rejects.toThrow(/inclusão/);
  });
});

describe('versionamento do protocolo', () => {
  it('atualiza no lugar antes de haver sessões', async () => {
    const experimentId = await createExperiment(db, { metadata: { name: 'E', code: 'E', team: [] }, design: emptyDesign(), variables: [] }, ACTOR);
    const result = await saveVariables(db, experimentId, [{ scope: 'observation', key: 'altura', label: 'Altura', type: 'decimal', unit: 'cm', required: false, order: 1, config: {} }], ACTOR);
    expect(result).toMatchObject({ version: 1, newVersion: false });
  });

  it('cria nova versão depois que uma sessão usou o protocolo', async () => {
    const { experimentId, session, sample } = await setup(db);
    await createObservation(db, { sessionId: session.id, sampleId: sample.id, data: { ha_doenca: false } }, ACTOR);
    const current = await getCurrentProtocol(db, experimentId);
    await expect(db.run("UPDATE protocols SET variables = '[]' WHERE id = ?", [current.id])).rejects.toThrow(/nova versão/);

    const variables = [...current.variables, { scope: 'observation' as const, key: 'temp_folha', label: 'Temperatura da folha', type: 'decimal' as const, unit: 'Cel', required: false, order: 10, config: {} }];
    const result = await saveVariables(db, experimentId, variables, ACTOR, 'Inclui temperatura');
    expect(result).toMatchObject({ version: 2, newVersion: true });
    expect((await listProtocols(db, experimentId)).map((p) => p.version)).toEqual([1, 2]);

    // A sessão aberta continua na v1; a próxima usa a v2
    expect((await getOpenSession(db, experimentId))?.protocolId).toBe(current.id);
    await closeSession(db, session.id, ACTOR);
    const next = await openSession(db, experimentId, { operator: ACTOR });
    expect(next.code).toBe('S002');
    expect(next.protocolId).toBe(result.protocolId);

    const unchanged = await saveVariables(db, experimentId, variables, ACTOR);
    expect(unchanged.newVersion).toBe(false);
  });

  it('não coleta em sessão encerrada', async () => {
    const { session, sample } = await setup(db);
    await closeSession(db, session.id, ACTOR);
    await expect(createObservation(db, { sessionId: session.id, sampleId: sample.id, data: { ha_doenca: false } }, ACTOR)).rejects.toThrow(/encerrada/);
  });
});

describe('eventos, dispositivos e releases', () => {
  const manifest = {
    schema: 'edgedata.device-manifest/1' as const,
    id: 'esp32-01',
    name: 'Estação 01',
    firmware: { version: '0.1.0' },
    sensors: [{ id: 'soil_temp', unit: 'Cel', range: [-10, 85] as [number, number] }],
  };

  it('registra eventos e leituras imutáveis', async () => {
    const { experimentId, session } = await setup(db);
    await recordEvent(db, { experimentId, sessionId: session.id, label: 'Chuva começou' }, ACTOR);
    expect((await listEvents(db, { sessionId: session.id })).map((e) => e.label)).toEqual(['Chuva começou']);

    const device = await upsertDevice(db, manifest, 'ble', 'AA:BB', ACTOR);
    const ids = await recordReadings(db, { experimentId, sessionId: session.id, device, readings: [{ sensorId: 'soil_temp', value: 85, seq: 1 }, { sensorId: 'soil_temp', value: null, seq: 2 }] });
    const rows = await db.all<{ qc: string; unit: string }>('SELECT qc, unit FROM readings ORDER BY seq');
    expect(rows).toEqual([{ qc: 'SATURATED', unit: 'Cel' }, { qc: 'MISSING', unit: 'Cel' }]);
    await expect(db.run('UPDATE readings SET value = 1 WHERE id = ?', [ids[0]])).rejects.toThrow(/imutáveis/);

    await upsertDevice(db, { ...manifest, firmware: { version: '0.2.0' } }, 'ble', 'AA:BB', ACTOR);
    const audit = await listAudit(db, { entity: 'device', entityId: 'esp32-01' });
    expect(audit.map((a) => a.action)).toEqual(['register', 'manifest_changed']);
  });

  it('releases são congeladas', async () => {
    const { experimentId } = await setup(db);
    const datasetId = await ensureDataset(db, experimentId, 'Ferrugem 2026');
    expect(await ensureDataset(db, experimentId, 'outro')).toBe(datasetId);
    await recordRelease(db, { datasetId, version: '1.0.0', formats: ['csv'], checksums: 'abc  README.md\n', fileCount: 1, totalBytes: 10, createdAt: new Date().toISOString() }, ACTOR);
    expect((await listReleases(db, experimentId)).map((r) => r.version)).toEqual(['1.0.0']);
    await expect(db.run("UPDATE dataset_releases SET version = '9'")).rejects.toThrow(/imutáveis/);
    await expect(recordRelease(db, { datasetId, version: '1.0.0', formats: [], checksums: '', fileCount: 0, totalBytes: 0, createdAt: '' }, ACTOR)).rejects.toThrow();
  });
});

describe('consultas auxiliares', () => {
  it('lista IDs de variáveis com dados', async () => {
    const { experimentId, session, sample } = await setup(db);
    const { usedVariableKeys, sessionsPerProtocol } = await import('./repo/experiments');
    await createObservation(db, { sessionId: session.id, sampleId: sample.id, data: { ha_doenca: true, doenca: 'Ferrugem', severidade: 2 } }, ACTOR);
    expect((await usedVariableKeys(db, experimentId)).sort()).toEqual(['doenca', 'ha_doenca', 'severidade']);
    expect([...(await sessionsPerProtocol(db, experimentId)).values()]).toEqual([1]);
  });
});
