import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ManifestError, parseManifest } from './manifest';
import { chunkUtf8, encodeCommand, LineAssembler, parseDeviceLine, SequenceTracker, utf8Length } from './protocol';

const exampleManifest = {
  schema: 'edgedata.device-manifest/1',
  id: 'esp32s3-7c9ebd4a1f20',
  name: 'Estação de Solo 01',
  model: 'ESP32-S3-DevKitC-1',
  firmware: { name: 'soil-station', version: '0.1.0', commit: '0d48b21' },
  capabilities: ['read', 'stream', 'time', 'foo'],
  sensors: [
    { id: 'soil_temp', label: 'Temperatura do solo', unit: 'Cel', type: 'float32', range: [-10, 85], resolution: 0.0625 },
    { id: 'soil_rh', unit: '%', range: [0, 100] },
  ],
};

describe('manifesto', () => {
  it('aceita o exemplo da documentação', () => {
    const { manifest, warnings } = parseManifest(exampleManifest);
    expect(manifest.sensors.map((s) => s.id)).toEqual(['soil_temp', 'soil_rh']);
    expect(manifest.capabilities).toEqual(['read', 'stream', 'time']);
    expect(manifest.firmware?.commit).toBe('0d48b21');
    expect(warnings).toEqual([]);
  });

  it('rejeita problemas estruturais', () => {
    expect(() => parseManifest({ ...exampleManifest, sensors: [] })).toThrow(ManifestError);
    try {
      parseManifest({ schema: 'x', id: 'com espaço', sensors: [{ id: 'Temp' }] });
    } catch (error) {
      expect((error as ManifestError).problems.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('avisa sobre unidades fora do catálogo sem rejeitar', () => {
    const { warnings } = parseManifest({ ...exampleManifest, sensors: [{ id: 'x', unit: 'furlong' }] });
    expect(warnings[0]).toMatch(/furlong/);
  });

  it('está alinhado ao JSON Schema publicado', () => {
    // os testes rodam a partir de apps/mobile
    const schemaPath = resolve(process.cwd(), '../../schemas/device-manifest.schema.json');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    expect(schema.properties.schema.const).toBe('edgedata.device-manifest/1');
    expect(schema.required).toEqual(['schema', 'id', 'name', 'sensors']);
  });
});

describe('protocolo NDJSON', () => {
  it('codifica comandos com id e nova linha', () => {
    expect(encodeCommand({ cmd: 'start', interval_ms: 1000 }, 'c1')).toBe('{"id":"c1","cmd":"start","interval_ms":1000}\n');
  });

  it('remonta linhas a partir de pedaços', () => {
    const assembler = new LineAssembler();
    const line = JSON.stringify({ t: 'obs', seq: 1, values: { soil_temp: 23.4 } });
    const chunks = chunkUtf8(`${line}\n{"t":"pong"}\n`, 20);
    const lines = chunks.flatMap((chunk) => assembler.push(chunk));
    expect(lines).toEqual([line, '{"t":"pong"}']);
  });

  it('não quebra caracteres multibyte', () => {
    const chunks = chunkUtf8('Temperatura °C — ação', 5);
    expect(chunks.join('')).toBe('Temperatura °C — ação');
    for (const chunk of chunks) expect(utf8Length(chunk)).toBeLessThanOrEqual(5);
  });

  it('interpreta mensagens', () => {
    const obs = parseDeviceLine('{"t":"obs","seq":3,"ms":100,"values":{"soil_temp":23.4,"soil_rh":null}}');
    expect(obs.ok && obs.message.t === 'obs' && obs.message.values.soil_rh).toBeNull();
    const hello = parseDeviceLine(JSON.stringify({ t: 'hello', proto: 1, manifest: exampleManifest }));
    expect(hello.ok && hello.message.t).toBe('hello');
    expect(parseDeviceLine('não é json').ok).toBe(false);
    expect(parseDeviceLine('{"t":"xyz"}').ok).toBe(false);
    expect(parseDeviceLine('{"t":"blk","sensor":"p","v":[1]}').ok).toBe(false);
  });

  it('contabiliza perda de pacotes', () => {
    const tracker = new SequenceTracker();
    [1, 2, 5, 6].forEach((s) => tracker.track(s));
    expect(tracker.lost).toBe(2);
    expect(tracker.lossRatio).toBeCloseTo(2 / 6, 10);
    tracker.track(1); // reinício
    expect(tracker.lost).toBe(2);
  });
});

describe('UTF-8 em pacotes', () => {
  it('codifica igual ao TextEncoder e remonta caracteres cortados', async () => {
    const { utf8Encode, Utf8StreamDecoder, textToBase64 } = await import('./utf8');
    const text = '{"label":"Temperatura °C — ação 🌱"}\n';
    expect([...utf8Encode(text)]).toEqual([...new TextEncoder().encode(text)]);
    const bytes = utf8Encode(text);
    const decoder = new Utf8StreamDecoder();
    let out = '';
    for (let i = 0; i < bytes.length; i += 5) out += decoder.decode(bytes.slice(i, i + 5));
    expect(out).toBe(text);
    expect(textToBase64('ok\n')).toBe(Buffer.from('ok\n').toString('base64'));
  });
});
