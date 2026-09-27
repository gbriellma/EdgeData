# EdgeData — biblioteca de firmware (Arduino / PlatformIO)

Implementa o **EdgeData Device Protocol v1** para ESP32 (testado no ESP32-S3):

- manifesto do dispositivo (sensores, unidades UCUM, faixas, resolução, ADC);
- leituras sob demanda (`read`) ou periódicas (`start` / `stop`);
- marcadores de evento vindos do hardware (`sendEvent`);
- sincronização de relógio com o celular (`time`);
- transporte **BLE** (NimBLE) e **Serial**, com as mesmas mensagens JSON por linha.

Especificação: [`docs/PROTOCOLO_DISPOSITIVOS.md`](../../docs/PROTOCOLO_DISPOSITIVOS.md).

## Instalação

**PlatformIO**: copie esta pasta para `lib/` do seu projeto ou aponte para ela com
`symlink://` e adicione as dependências (`platformio.ini`):

```ini
lib_deps =
    symlink://../caminho/para/EdgeData/firmware/edgedata-arduino
    bblanchon/ArduinoJson@^7.0.0
    h2zero/NimBLE-Arduino@^2.1.0
```

Um projeto pronto está em [`../exemplo-platformio`](../exemplo-platformio).

**Arduino IDE**: copie a pasta para `Documentos/Arduino/libraries/EdgeData` e instale
ArduinoJson e NimBLE-Arduino pelo Library Manager.

## Uso

```cpp
#include <EdgeData.h>

edgedata::Device edge("Estacao01");   // anuncia "EdgeData-Estacao01"

void lerSensores(edgedata::Reading& r) {
  r.set("temp_ar", lerTemperatura());   // valor na unidade declarada
  if (!sensorOk) r.missing("umidade");   // vira MISSING no app
}

void setup() {
  Serial.begin(115200);
  edge.firmware("estacao", "0.1.0", "0d48b21");         // versão e commit do firmware
  edge.addSensor("temp_ar", "Cel").label("Temperatura do ar").range(-40, 85).resolution(0.1f);
  edge.onRead(lerSensores);
  edge.begin();
}

void loop() { edge.loop(); }
```

Regras importantes:

- **Unidades em UCUM** (`Cel`, `%`, `V`, `mV`, `kPa`, `[ppm]`, `uS/cm`…). O app não converte
  dados brutos: envie o valor na unidade declarada.
- Declare `range` com a faixa real do sensor: valores no limite viram `SATURATED` e fora
  dela, `BAD`.
- Envie também o **valor bruto** quando houver calibração (ex.: tensão do sensor), para
  que o dado possa ser recalculado depois.
- BLE serve para leituras periódicas e preview (tipicamente 20–100 kB/s). Para aquisição
  de alta taxa, grave no dispositivo (SD) e transfira os arquivos por outro meio.

## Sem Bluetooth

Defina `EDGEDATA_NO_BLE` antes de compilar (ex.: `build_flags = -DEDGEDATA_NO_BLE`) para
usar só a Serial — útil para placas sem BLE ou para depuração.
