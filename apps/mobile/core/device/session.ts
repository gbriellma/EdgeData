import { parseManifest, type DeviceManifest } from './manifest';
import {
  encodeCommand,
  LineAssembler,
  parseDeviceLine,
  SequenceTracker,
  type DeviceCommand,
  type DeviceMessage,
  type ObsMessage,
} from './protocol';

/** Canal de bytes já decodificados em texto (BLE, Serial, TCP…). */
export interface DeviceLink {
  write(text: string): Promise<void>;
  /** Registra o receptor de texto; devolve a função para cancelar. */
  onText(listener: (chunk: string) => void): () => void;
  close(): Promise<void>;
}

export interface LatestValue {
  value: number | string | boolean | null;
  receivedAt: string;
  deviceMs?: number;
  utcMs?: number;
  seq?: number;
}

export class DeviceCommandError extends Error {}

type Listener = (message: DeviceMessage, receivedAt: string) => void;

interface Pending {
  resolve: (message: DeviceMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Conversa com um dispositivo EdgeData: comandos com confirmação, manifesto,
 * últimas leituras e contagem de perda de pacotes. Independente do transporte.
 */
export class DeviceSession {
  manifest: DeviceManifest | null = null;
  manifestWarnings: string[] = [];
  readonly latest = new Map<string, LatestValue>();
  readonly tracker = new SequenceTracker();
  errors = 0;

  private readonly assembler = new LineAssembler();
  private readonly listeners = new Set<Listener>();
  private readonly pending = new Map<string, Pending>();
  private readonly obsWaiters: ((message: ObsMessage) => void)[] = [];
  private counter = 0;
  private unsubscribe: () => void;

  constructor(
    private readonly link: DeviceLink,
    private readonly options: { timeoutMs?: number; now?: () => number } = {},
  ) {
    this.unsubscribe = link.onText((chunk) => {
      for (const line of this.assembler.push(chunk)) this.handleLine(line);
    });
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private handleLine(line: string): void {
    const parsed = parseDeviceLine(line);
    if (!parsed.ok) {
      this.errors += 1;
      return;
    }
    const message = parsed.message;
    const receivedAt = new Date(this.now()).toISOString();

    if (message.t === 'hello') {
      try {
        const { manifest, warnings } = parseManifest(message.manifest);
        this.manifest = manifest;
        this.manifestWarnings = warnings;
      } catch (error) {
        this.manifestWarnings = [error instanceof Error ? error.message : String(error)];
      }
    }
    if (message.t === 'obs') {
      this.tracker.track(message.seq);
      for (const [sensorId, value] of Object.entries(message.values)) {
        this.latest.set(sensorId, { value, receivedAt, deviceMs: message.ms, utcMs: message.utc_ms, seq: message.seq });
      }
      this.obsWaiters.splice(0).forEach((resolve) => resolve(message));
    }

    const id = 'id' in message ? (message as { id?: string }).id : undefined;
    if (id && this.pending.has(id)) {
      const entry = this.pending.get(id)!;
      this.pending.delete(id);
      clearTimeout(entry.timer);
      if (message.t === 'err') entry.reject(new DeviceCommandError(message.msg));
      else entry.resolve(message);
    }

    this.listeners.forEach((listener) => listener(message, receivedAt));
  }

  private request(command: DeviceCommand): Promise<DeviceMessage> {
    this.counter += 1;
    const id = `c${this.counter}`;
    const timeoutMs = this.options.timeoutMs ?? 5000;
    return new Promise<DeviceMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new DeviceCommandError(`O dispositivo não respondeu ao comando "${command.cmd}"`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.link.write(encodeCommand(command, id)).catch((error: unknown) => {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  /** Pede o manifesto. */
  async hello(): Promise<DeviceManifest> {
    await this.request({ cmd: 'hello' });
    if (!this.manifest) throw new DeviceCommandError(`Manifesto inválido: ${this.manifestWarnings.join('; ')}`);
    return this.manifest;
  }

  /** Faz uma leitura agora e devolve a mensagem `obs` correspondente. */
  async read(): Promise<ObsMessage> {
    const timeoutMs = this.options.timeoutMs ?? 5000;
    const next = new Promise<ObsMessage>((resolve, reject) => {
      const timer = setTimeout(() => reject(new DeviceCommandError('O dispositivo não enviou a leitura')), timeoutMs);
      this.obsWaiters.push((message) => {
        clearTimeout(timer);
        resolve(message);
      });
    });
    await this.request({ cmd: 'read' });
    return next;
  }

  async start(intervalMs?: number): Promise<void> {
    await this.request(intervalMs ? { cmd: 'start', interval_ms: intervalMs } : { cmd: 'start' });
  }

  async stop(): Promise<void> {
    await this.request({ cmd: 'stop' });
  }

  /** Informa o horário UTC do celular; o dispositivo passa a enviar utc_ms. */
  async syncTime(): Promise<void> {
    await this.request({ cmd: 'time', utc_ms: this.now() });
  }

  async ping(): Promise<number> {
    const started = this.now();
    await this.request({ cmd: 'ping' });
    return this.now() - started;
  }

  async close(): Promise<void> {
    this.unsubscribe();
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new DeviceCommandError('Conexão encerrada'));
    }
    this.pending.clear();
    await this.link.close();
  }
}
