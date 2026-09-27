# Protocolo de dispositivos (EdgeData Device Protocol v1)

Protocolo de aplicação entre um sistema embarcado e o EdgeData. É o mesmo em todos os
transportes: o dispositivo e o app trocam **objetos JSON, um por linha** (NDJSON, terminados em
`\n`, UTF-8).

- Fácil de depurar (abra o monitor serial e leia).
- Independente do transporte: BLE, USB Serial, TCP e WebSocket carregam os mesmos bytes.
- Evolutivo: campos desconhecidos são ignorados; `proto` indica a versão.

## 1. Transporte BLE

| Item | Valor |
|---|---|
| Serviço | `ed0a0001-abd6-484b-8c0b-c353facbd2c5` |
| RX (app → dispositivo) | `ed0a0002-abd6-484b-8c0b-c353facbd2c5` — *write* / *write without response* |
| TX (dispositivo → app) | `ed0a0003-abd6-484b-8c0b-c353facbd2c5` — *notify* |
| Nome anunciado | prefixo `EdgeData-` (ex.: `EdgeData-Solo01`) |

Uma linha JSON pode ser maior que o MTU. O remetente divide a linha em pedaços de até `MTU − 3`
bytes; o receptor concatena e separa por `\n`. O app pede MTU 247 (Android) ao conectar.

**Limite de banda.** BLE entrega na prática 20–100 kB/s num celular. Use-o para leituras
periódicas, blocos pequenos e preview. Aquisição de alta taxa (kS/s por canal) deve gravar no
dispositivo (SD/flash) e transferir arquivos por outro meio.

## 2. Comandos (app → dispositivo)

```json
{"id":"c1","cmd":"hello"}
```

| `cmd` | Parâmetros | Efeito |
|---|---|---|
| `hello` | — | Dispositivo responde `hello` com o manifesto |
| `read` | — | Faz uma leitura de todos os sensores e envia `obs` |
| `start` | `interval_ms` (opcional) | Inicia leituras periódicas (`obs` a cada intervalo) |
| `stop` | — | Para as leituras periódicas |
| `time` | `utc_ms` | Informa o horário UTC atual; o dispositivo guarda o offset do relógio |
| `ping` | — | Dispositivo responde `pong` |

Todo comando com `id` recebe `ack` (`{"t":"ack","id":"c1","ok":true}`) ou `err`.

## 3. Mensagens (dispositivo → app)

Toda mensagem tem o campo `t` (tipo). `ms` é o relógio monotônico do dispositivo (milissegundos
desde o boot); `utc_ms` só aparece depois de um comando `time`.

| `t` | Exemplo |
|---|---|
| `hello` | `{"t":"hello","proto":1,"manifest":{…}}` |
| `obs` | `{"t":"obs","seq":42,"ms":81234,"utc_ms":1790500000123,"values":{"soil_temp":23.44,"soil_rh":31.2}}` |
| `blk` | `{"t":"blk","seq":43,"sensor":"piezo01","ms":81250,"fs":500,"v":[0.012,0.013,…]}` |
| `status` | `{"t":"status","ms":81300,"battery_pct":86,"rssi":-57,"streaming":true,"interval_ms":1000}` |
| `evt` | `{"t":"evt","ms":81400,"label":"botao_pressionado"}` |
| `ack` / `err` | `{"t":"err","id":"c7","msg":"comando desconhecido"}` |
| `pong` | `{"t":"pong","id":"c9","ms":81500}` |
| `log` | `{"t":"log","level":"warn","msg":"sensor CO2 sem resposta"}` |

Regras:

- `seq` cresce de 1 em 1 por mensagem de dados (`obs`, `blk`). Saltos indicam perda de pacotes.
- Um valor `null` em `values` significa “sensor sem leitura válida” (vira flag `MISSING` no app).
- Valores são enviados **na unidade declarada no manifesto**. O app não converte dados brutos.

## 4. Manifesto

O manifesto descreve o dispositivo e seus sensores. Schema:
[`schemas/device-manifest.schema.json`](../schemas/device-manifest.schema.json).

```json
{
  "schema": "edgedata.device-manifest/1",
  "id": "esp32s3-7c9ebd4a1f20",
  "name": "Estação de Solo 01",
  "manufacturer": "Laboratório X",
  "model": "ESP32-S3-DevKitC-1",
  "hardware": { "mcu": "ESP32-S3", "revision": "A" },
  "firmware": { "name": "soil-station", "version": "0.1.0", "commit": "0d48b21" },
  "capabilities": ["read", "stream", "time"],
  "sensors": [
    {
      "id": "soil_temp",
      "label": "Temperatura do solo",
      "quantity": "temperature",
      "unit": "Cel",
      "type": "float32",
      "model": "DS18B20",
      "range": [-10, 85],
      "resolution": 0.0625,
      "accuracy": 0.5,
      "interval_ms": 1000
    }
  ]
}
```

- `unit` é um código **UCUM** (`Cel`, `%`, `V`, `mV`, `kPa`, `[ppm]`, `uS/cm`…).
- `id` do dispositivo deve ser estável (ex.: derivado do MAC); `id` do sensor é único no dispositivo
  e usa `snake_case`.
- `range`, `resolution` e `accuracy` alimentam o QC e a documentação do dataset.

## 5. Tempo

O app envia `time` logo após conectar. Cada leitura guarda três relógios:

| Campo | Origem |
|---|---|
| `device_ms` | Relógio monotônico do dispositivo |
| `device_utc` | `utc_ms` do dispositivo (se sincronizado) |
| `received_at` | Horário UTC do celular ao receber |

Com isso é possível estimar o atraso de transmissão e a deriva do relógio de cada dispositivo.

## 6. Evolução planejada

- Codificação binária (CBOR) negociada no `hello` para blocos de alta taxa.
- CRC por bloco para transportes sem verificação de integridade (UART, LoRa).
- Transportes adicionais: USB Serial, MQTT (tópicos `edgedata/<device>/obs`), LoRaWAN.
