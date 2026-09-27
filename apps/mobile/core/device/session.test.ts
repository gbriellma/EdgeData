import { describe, expect, it } from 'vitest';
import { chunkUtf8 } from './protocol';
import { DeviceCommandError, DeviceSession, type DeviceLink } from './session';

/** Simula o firmware EdgeData: responde como a biblioteca Arduino, em pedaços de 20 bytes. */
function fakeDevice(options: { silent?: string[] } = {}) {
  let listener: ((chunk: string) => void) | null = null;
  let seq = 0;
  let offset: number | null = null;
  const sent: string[] = [];
  const emit = (message: object) => {
    const line = `${JSON.stringify(message)}\n`;
    for (const chunk of chunkUtf8(line, 20)) setTimeout(() => listener?.(chunk), 0);
  };
  const obs = () => {
    seq += 1;
    const ms = 1000 * seq;
    emit({ t: 'obs', seq, ms, ...(offset !== null ? { utc_ms: offset + ms } : {}), values: { temp_ar: 23.5 + seq, umidade: null } });
  };
  const link: DeviceLink = {
    async write(text) {
      sent.push(text);
      const command = JSON.parse(text);
      if (options.silent?.includes(command.cmd)) return;
      switch (command.cmd) {
        case 'hello':
          emit({ t: 'hello', proto: 1, id: command.id, manifest: { schema: 'edgedata.device-manifest/1', id: 'esp32-aabbcc', name: 'Estação °1', firmware: { version: '0.1.0' }, sensors: [{ id: 'temp_ar', unit: 'Cel', range: [-40, 85] }, { id: 'umidade', unit: '%' }] } });
          break;
        case 'read':
          emit({ t: 'ack', id: command.id, ok: true });
          obs();
          break;
        case 'time':
          offset = command.utc_ms - 1000 * seq;
          emit({ t: 'ack', id: command.id, ok: true });
          break;
        default:
          emit({ t: 'err', id: command.id, msg: 'comando desconhecido' });
      }
    },
    onText(fn) {
      listener = fn;
      return () => (listener = null);
    },
    async close() {},
  };
  return { link, sent, pushObs: obs };
}

describe('sessão com dispositivo', () => {
  it('lê manifesto, leituras e sincroniza relógio', async () => {
    const device = fakeDevice();
    const session = new DeviceSession(device.link, { timeoutMs: 500, now: () => 1_790_000_000_000 });
    const manifest = await session.hello();
    expect(manifest.name).toBe('Estação °1');
    expect(manifest.sensors.map((s) => s.id)).toEqual(['temp_ar', 'umidade']);

    const first = await session.read();
    expect(first.values).toEqual({ temp_ar: 24.5, umidade: null });
    expect(session.latest.get('temp_ar')?.value).toBe(24.5);

    await session.syncTime();
    const second = await session.read();
    expect(second.utc_ms).toBe(1_790_000_000_000 + 1000);
    expect(device.sent.map((s) => JSON.parse(s).cmd)).toEqual(['hello', 'read', 'time', 'read']);
  });

  it('rejeita erros e tempo esgotado', async () => {
    const device = fakeDevice({ silent: ['ping'] });
    const session = new DeviceSession(device.link, { timeoutMs: 50 });
    await expect(session.start()).rejects.toBeInstanceOf(DeviceCommandError);
    await expect(session.ping()).rejects.toThrow(/não respondeu/);
  });

  it('notifica ouvintes e conta perdas', async () => {
    const device = fakeDevice();
    const session = new DeviceSession(device.link, { timeoutMs: 200 });
    const seen: string[] = [];
    session.on((message) => seen.push(message.t));
    device.pushObs();
    device.pushObs();
    await new Promise((r) => setTimeout(r, 20));
    expect(seen).toEqual(['obs', 'obs']);
    expect(session.tracker.lost).toBe(0);
  });
});
