import { describe, expect, it } from 'vitest';
import { emptyDesign } from '@/core/design';
import { buildDatasetPackage } from '@/core/export/package';
import type { ProtocolVariable } from '@/core/types';
import { loadExportInput } from './export-input';
import { recordReadings, upsertDevice } from './repo/devices';
import { createExperiment } from './repo/experiments';
import { createObservation } from './repo/observations';
import { createSamples } from './repo/samples';
import { openSession, recordEvent, retractEvent } from './repo/sessions';
import { createMigratedDb } from './testing/node-db';

const variables: ProtocolVariable[] = [
  { scope: 'observation', key: 'altura', label: 'Altura', type: 'decimal', unit: 'cm', required: true, order: 1, config: {} },
  { scope: 'observation', key: 'foto', label: 'Foto', type: 'image', required: false, order: 2, config: {} },
  { scope: 'observation', key: 'fotos', label: 'Fotos', type: 'multi_image', required: false, order: 3, config: { angles: [{ key: 'topo', label: 'Topo' }] } },
];

describe('carga do dataset para exportação', () => {
  it('monta o pacote completo a partir do banco', async () => {
    const db = await createMigratedDb();
    const experimentId = await createExperiment(db, { metadata: { name: 'Teste', code: 'TST', team: [{ name: 'Ana' }] }, design: { ...emptyDesign(), treatmentMode: 'explicit', treatments: [{ code: 'A' }], replicates: 2 }, variables }, 'Ana');
    const [s1, s2] = await createSamples(db, experimentId, [{ code: 'A_R1', treatment: 'A' }, { code: 'A_R2', treatment: 'A' }], 'Ana');
    const session = await openSession(db, experimentId, { operator: 'Ana' });
    await createObservation(db, { sessionId: session.id, sampleId: s1, data: { altura: 10, foto: 'media/e/foto.jpg', fotos: [{ angle: 'topo', uri: 'media/e/foto.jpg' }] }, files: [{ variableKey: 'foto', path: 'media/e/foto.jpg', sha256: 'a'.repeat(64), bytes: 3 }] }, 'Ana');
    await createObservation(db, { sessionId: session.id, sampleId: s2, data: { altura: 11, foto: 'file:///old/dir/foto.jpg' } }, 'Ana');
    const eventId = await recordEvent(db, { experimentId, sessionId: session.id, label: 'Chuva' }, 'Ana');
    await retractEvent(db, eventId, 'engano', 'Ana');
    const device = await upsertDevice(db, { schema: 'edgedata.device-manifest/1', id: 'dev1', name: 'Dev', sensors: [{ id: 't', unit: 'Cel' }] }, 'ble', null, 'Ana');
    await recordReadings(db, { experimentId, sessionId: session.id, device, readings: [{ sensorId: 't', value: 20.5, seq: 1 }] });

    const { input, media } = await loadExportInput(db, experimentId, { version: '1.0.0', createdAt: '2026-09-27T00:00:00.000Z' }, { name: 'EdgeData', version: 'test' });
    expect(media.map((m) => [m.source, m.target, m.sha256])).toEqual([
      ['media/e/foto.jpg', 'files/foto.jpg', 'a'.repeat(64)],
      ['file:///old/dir/foto.jpg', 'files/foto_2.jpg', null],
    ]);
    expect(input.devices.map((d) => d.id)).toEqual(['dev1']);
    expect(input.events[0].retractionReason).toBe('engano');
    expect(input.audit.some((a) => a.action === 'retract')).toBe(true);

    const pkg = buildDatasetPackage(input, ['csv'], media.map((m) => ({ path: m.target, sha256: m.sha256 ?? 'b'.repeat(64), bytes: m.bytes ?? 0 })));
    const observations = pkg.files.find((f) => f.path === 'data/observations.csv')!.data as string;
    expect(observations).toContain('files/foto.jpg');
    expect(observations).toContain('files/foto_2.jpg');
    const readme = pkg.files.find((f) => f.path === 'README.md')!.data as string;
    expect(readme).toContain('Observações coletadas: 2 de 2');
  });
});
