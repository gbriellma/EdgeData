import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parquetReadObjects } from 'hyparquet';
import { describe, expect, it } from 'vitest';
import { emptyDesign } from '../design';
import type { ExportInput } from './model';
import { base64ToBytes, bytesToBase64, parseChecksumFile, sha256Hex } from './checksums';
import { buildDatasetPackage, nextReleaseVersion } from './package';

function fixture(): ExportInput {
  const protocolV1 = {
    id: 'p1',
    version: 1,
    title: 'Protocolo de crescimento',
    createdAt: '2026-02-01T12:00:00.000Z',
    variables: [
      { scope: 'sample' as const, key: 'variedade', label: 'Variedade', type: 'category' as const, required: true, order: 1, role: 'independent' as const, config: { options: ['T1', 'T2'] } },
      { scope: 'observation' as const, key: 'altura', label: 'Altura', type: 'decimal' as const, unit: 'cm', required: true, order: 1, expectedMin: 5, expectedMax: 120, resolution: 0.1, config: { decimals: 1 } },
      { scope: 'observation' as const, key: 'foto', label: 'Foto da planta', type: 'image' as const, required: false, order: 2, config: {} },
      { scope: 'observation' as const, key: 'local', label: 'Local', type: 'gps' as const, required: false, order: 3, config: {} },
    ],
  };
  const protocolV2 = {
    ...protocolV1,
    id: 'p2',
    version: 2,
    createdAt: '2026-03-01T12:00:00.000Z',
    variables: [
      ...protocolV1.variables,
      { scope: 'observation' as const, key: 'temp_solo', label: 'Temperatura do solo', type: 'decimal' as const, unit: 'Cel', required: false, order: 4, config: {} },
    ],
  };
  return {
    experiment: {
      id: 'e1',
      projectName: 'Tese',
      createdAt: '2026-02-01T12:00:00.000Z',
      metadata: {
        name: 'Feijão — estresse hídrico',
        code: 'FEIJAO-2026',
        objective: 'Avaliar crescimento sob déficit hídrico',
        team: [{ name: 'Gabriel Lima', role: 'Pesquisador', orcid: '0000-0002-1825-0097' }],
        license: 'CC-BY-4.0',
      },
      design: {
        ...emptyDesign(),
        treatmentMode: 'explicit',
        treatments: [{ code: 'DH', label: 'Déficit hídrico' }],
        controls: [{ code: 'C', label: 'Controle' }],
        replicates: 2,
        sessionsExpected: 2,
      },
    },
    protocols: [protocolV1, protocolV2],
    samples: [
      { id: 's1', code: 'DH_R1', treatment: 'DH', replicate: 1, data: { variedade: 'T1' }, createdAt: '2026-02-01T12:10:00.000Z' },
      { id: 's2', code: 'C_R1', treatment: 'C', replicate: 1, data: { variedade: 'T2' }, createdAt: '2026-02-01T12:10:00.000Z' },
    ],
    sessions: [{ id: 'ss1', code: 'S001', protocolId: 'p1', operator: 'Gabriel Lima', status: 'closed', startedAt: '2026-02-15T10:00:00.000Z', endedAt: '2026-02-15T11:00:00.000Z' }],
    observations: [
      { id: 'o1', sampleId: 's1', sessionId: 'ss1', protocolId: 'p1', data: { altura: 18.5, foto: 'file:///data/o1.jpg', local: { latitude: -8.05, longitude: -34.9, accuracy: 4 } }, qc: { altura: 'GOOD', foto: 'GOOD', local: 'GOOD' }, collectedAt: '2026-02-15T10:05:00.000Z', source: 'manual', revision: 1, status: 'superseded' },
      { id: 'o1r2', sampleId: 's1', sessionId: 'ss1', protocolId: 'p1', data: { altura: 19.5, foto: 'file:///data/o1.jpg' }, qc: { altura: 'GOOD', foto: 'GOOD', local: 'MISSING' }, collectedAt: '2026-02-15T10:05:00.000Z', source: 'manual', revision: 2, supersedesId: 'o1', status: 'current' },
      { id: 'o2', sampleId: 's2', sessionId: 'ss1', protocolId: 'p1', data: { altura: 300 }, qc: { altura: 'OUT_OF_RANGE' }, collectedAt: '2026-02-15T10:10:00.000Z', source: 'manual', revision: 1, status: 'current' },
      { id: 'o3', sampleId: 's2', sessionId: 'ss1', protocolId: 'p1', data: { altura: 1 }, qc: { altura: 'OUT_OF_RANGE' }, collectedAt: '2026-02-15T10:11:00.000Z', source: 'manual', revision: 1, status: 'retracted', retractionReason: 'Amostra errada' },
    ],
    events: [{ id: 'ev1', sessionId: 'ss1', occurredAt: '2026-02-15T10:30:00.000Z', label: 'Irrigação iniciada', kind: 'manual' }],
    readings: [{ id: 'r1', sessionId: 'ss1', deviceId: 'esp32-01', sensorId: 'soil_temp', value: 23.4, unit: 'Cel', qc: 'GOOD', seq: 1, deviceMs: 1000, receivedAt: '2026-02-15T10:05:01.000Z' }],
    devices: [{ id: 'esp32-01', name: 'Estação 01', manifest: { schema: 'edgedata.device-manifest/1', id: 'esp32-01', name: 'Estação 01', firmware: { version: '0.1.0' }, sensors: [{ id: 'soil_temp', unit: 'Cel', range: [-10, 85] }] } }],
    audit: [{ id: 'a1', at: '2026-02-15T10:20:00.000Z', actor: 'Gabriel Lima', entity: 'observation', entityId: 'o1', action: 'revise', details: { altura: [18.5, 19.5] } }],
    release: { version: '1.0.0', createdAt: '2026-03-02T09:00:00.000Z', createdBy: 'Gabriel Lima' },
    software: { name: 'EdgeData', version: '0.1.0' },
    fileMap: new Map([['file:///data/o1.jpg', 'files/FEIJAO-2026_DH_R1_foto.jpg']]),
  };
}

describe('pacote de dataset', () => {
  const media = [{ path: 'files/FEIJAO-2026_DH_R1_foto.jpg', sha256: sha256Hex('jpeg-bytes'), bytes: 10 }];
  const pkg = buildDatasetPackage(fixture(), ['csv', 'jsonl', 'parquet'], media);
  const file = (path: string) => pkg.files.find((f) => f.path === path)?.data;

  it('contém todos os arquivos esperados', () => {
    const paths = pkg.files.map((f) => f.path);
    for (const table of ['samples', 'observations', 'observations_history', 'sessions', 'events', 'readings']) {
      for (const ext of ['csv', 'jsonl', 'parquet']) expect(paths).toContain(`data/${table}.${ext}`);
    }
    expect(paths).toEqual(expect.arrayContaining(['README.md', 'metadata.json', 'datapackage.json', 'data_dictionary.csv', 'provenance.json', 'checksums.sha256']));
    expect(pkg.name).toBe('FEIJAO-2026-v1.0.0');
  });

  it('observations tem só a versão vigente e o histórico tem todas', () => {
    const current = (file('data/observations.jsonl') as string).trim().split('\n').map((l) => JSON.parse(l));
    expect(current.map((o) => o.observation_id)).toEqual(['o1r2', 'o2']);
    expect(current[0]).toMatchObject({ altura: 19.5, foto: 'files/FEIJAO-2026_DH_R1_foto.jpg', sample_code: 'DH_R1', qc_altura: 'GOOD', revision: 2 });
    const history = (file('data/observations_history.jsonl') as string).trim().split('\n').map((l) => JSON.parse(l));
    expect(history.map((o) => o.status)).toEqual(['superseded', 'current', 'current', 'retracted']);
    expect(history[0]).toMatchObject({ altura: 18.5, local_lat: -8.05, local_accuracy: 4 });
  });

  it('inclui colunas de todas as versões do protocolo', () => {
    const header = (file('data/observations.csv') as string).split('\r\n')[0];
    expect(header).toContain('temp_solo');
    expect(header).toContain('local_lat,local_lon,local_alt,local_accuracy');
  });

  it('Parquet é legível', async () => {
    const bytes = file('data/observations.parquet') as Uint8Array;
    const rows = await parquetReadObjects({ file: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer });
    expect(rows.map((r) => r.altura)).toEqual([19.5, 300]);
  });

  it('datapackage descreve recursos com unidade e hash', () => {
    const dp = JSON.parse(file('datapackage.json') as string);
    expect(dp.profile).toBe('tabular-data-package');
    expect(dp.version).toBe('1.0.0');
    expect(dp.licenses).toEqual([{ name: 'CC-BY-4.0' }]);
    const obs = dp.resources.find((r: { name: string }) => r.name === 'observations-csv');
    expect(obs.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(obs.schema.fields.find((f: { name: string }) => f.name === 'altura')).toMatchObject({ type: 'number', unit: 'cm' });
  });

  it('README usa apenas metadados registrados', () => {
    const readme = file('README.md') as string;
    expect(readme).toContain('# Feijão — estresse hídrico');
    expect(readme).toContain('2 tratamentos × 2 réplicas × 2 sessões = 8 observações previstas');
    expect(readme).toContain('ORCID [0000-0002-1825-0097]');
    expect(readme).toContain('Observações coletadas: 2 de 8');
    expect(readme).toContain('Observações retratadas: 1.');
    expect(readme).not.toContain('Hipótese'); // não registrada → seção omitida
  });

  it('dicionário expande GPS e traz unidades', () => {
    const dictionary = file('data_dictionary.csv') as string;
    expect(dictionary).toContain('observations,altura,altura,Altura,,decimal,number,cm,cm');
    expect(dictionary).toContain('local_accuracy');
  });

  it('proveniência liga sessão ao protocolo e registra auditoria', () => {
    const prov = JSON.parse(file('provenance.json') as string);
    expect(prov.used['_:u_ss1']).toEqual({ 'prov:activity': 'edgedata:session/ss1', 'prov:entity': 'edgedata:protocol/p1' });
    expect(prov['edgedata:auditLog'][0]).toMatchObject({ action: 'revise', entity: 'observation/o1' });
  });

  it('checksums conferem com sha256sum', () => {
    const dir = mkdtempSync(join(tmpdir(), 'edgedata-'));
    for (const f of pkg.files) {
      mkdirSync(dirname(join(dir, f.path)), { recursive: true });
      writeFileSync(join(dir, f.path), f.data);
    }
    mkdirSync(join(dir, 'files'), { recursive: true });
    writeFileSync(join(dir, media[0].path), 'jpeg-bytes');
    const out = execFileSync('sha256sum', ['-c', 'checksums.sha256'], { cwd: dir }).toString();
    expect(out).not.toContain('FAILED');
    expect(parseChecksumFile(file('checksums.sha256') as string).size).toBe(pkg.checksums.length);
  });
});

describe('calibração, revisões de QC e importações', () => {
  const input: ExportInput = {
    ...fixture(),
    readings: [{ ...fixture().readings[0], valueCorrected: 23.9, calibrationId: 'cal1' }],
    calibrations: [
      {
        id: 'cal1', deviceId: 'esp32-01', sensorId: 'soil_temp', method: 'linear', points: [{ raw: 0, reference: 0.5 }, { raw: 50, reference: 50.5 }],
        coefficients: [0.5, 1], r2: 1, rmse: 0, unit: 'Cel', referenceInstrument: 'Termômetro padrão', certificate: null,
        validFrom: '2026-01-01T00:00:00.000Z', validUntil: '2027-01-01T00:00:00.000Z', revokedAt: null, revokedReason: null, createdBy: 'Gabriel', createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    qcReviews: [{ id: 'q1', observationId: 'o2', variableKey: 'altura', flag: 'OUT_OF_RANGE', decision: 'accepted', note: 'conferido', createdBy: 'Gabriel', createdAt: '2026-02-20T00:00:00.000Z' }],
    imports: [{ id: 'i1', sessionId: 'ss1', fileName: 'antigo.xlsx', sha256: 'ab'.repeat(32), rowsTotal: 3, rowsImported: 2, mapping: {}, createdBy: 'Gabriel', createdAt: '2026-02-21T00:00:00.000Z' }],
  };
  const pkg = buildDatasetPackage(input, ['jsonl']);
  const file = (path: string) => pkg.files.find((f) => f.path === path)?.data as string;

  it('exporta valor bruto e corrigido lado a lado', () => {
    const reading = JSON.parse(file('data/readings.jsonl').trim());
    expect(reading).toMatchObject({ value: 23.4, value_corrected: 23.9, calibration_id: 'cal1' });
    const cal = JSON.parse(file('data/calibrations.jsonl').trim());
    expect(cal).toMatchObject({ c0: 0.5, c1: 1, c2: 0, method: 'linear' });
    expect(JSON.parse(file('data/qc_reviews.jsonl').trim())).toMatchObject({ variable: 'altura', decision: 'accepted' });
  });

  it('documenta calibração e importação no README e na proveniência', () => {
    expect(file('README.md')).toMatch(/## Calibração/);
    expect(file('README.md')).toMatch(/antigo\.xlsx/);
    const prov = JSON.parse(file('provenance.json'));
    expect(Object.keys(prov.entity)).toEqual(expect.arrayContaining([`edgedata:file/${'ab'.repeat(32)}`, 'edgedata:calibration/cal1']));
  });
});

describe('utilidades', () => {
  it('versões', () => {
    expect(nextReleaseVersion([])).toBe('1.0.0');
    expect(nextReleaseVersion(['1.0.0', '1.2.0', '1.1.0'])).toBe('1.3.0');
  });

  it('base64 ida e volta', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253]);
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    expect([...base64ToBytes(Buffer.from(bytes).toString('base64'))]).toEqual([...bytes]);
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
