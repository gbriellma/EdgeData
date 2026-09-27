# Firmware

| Pasta | Conteúdo |
|---|---|
| [`edgedata-arduino/`](edgedata-arduino) | Biblioteca Arduino/PlatformIO que implementa o EdgeData Device Protocol v1 (BLE + Serial) |
| [`edgedata-arduino/examples/`](edgedata-arduino/examples) | `LeituraAnalogica` (ADC + temperatura interna) e `EstacaoAmbiental` (DS18B20 + umidade do solo capacitiva) |
| [`exemplo-platformio/`](exemplo-platformio) | Projeto PlatformIO pronto para ESP32-S3 usando a biblioteca local |

Compilação verificada para ESP32-S3 com arduino-esp32 2.0.9, NimBLE-Arduino 2.3.6 e
ArduinoJson 7.4.2 (com e sem `EDGEDATA_NO_BLE`).

Para testar sem o app, abra o monitor serial (115200) e envie comandos, um por linha:

```json
{"id":"1","cmd":"hello"}
{"id":"2","cmd":"read"}
{"id":"3","cmd":"start","interval_ms":2000}
{"id":"4","cmd":"stop"}
```
