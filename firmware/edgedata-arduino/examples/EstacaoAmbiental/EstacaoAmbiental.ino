// Estação de solo: temperatura do solo (DS18B20) e umidade do solo (sensor capacitivo).
//
// Dependências extras: OneWire e DallasTemperature (Library Manager / PlatformIO).
// Calibre o sensor capacitivo medindo a tensão no ar (seco) e na água (saturado)
// e ajuste SECO_V e SATURADO_V — registre os valores na aba Protocolo do app.

#include <DallasTemperature.h>
#include <EdgeData.h>
#include <OneWire.h>

constexpr int PINO_ONEWIRE = 4;
constexpr int PINO_UMIDADE = 1;
constexpr float SECO_V = 2.60f;      // leitura no ar
constexpr float SATURADO_V = 1.10f;  // leitura na água

OneWire oneWire(PINO_ONEWIRE);
DallasTemperature ds18b20(&oneWire);
edgedata::Device edge("Solo01");

void lerSensores(edgedata::Reading& leitura) {
  ds18b20.requestTemperatures();
  float temperatura = ds18b20.getTempCByIndex(0);
  if (temperatura == DEVICE_DISCONNECTED_C) leitura.missing("temp_solo");
  else leitura.set("temp_solo", temperatura);

  float tensao = analogReadMilliVolts(PINO_UMIDADE) / 1000.0f;
  float umidade = (SECO_V - tensao) / (SECO_V - SATURADO_V) * 100.0f;
  leitura.set("umidade_solo", constrain(umidade, 0.0f, 100.0f));
  leitura.set("umidade_solo_v", tensao);  // valor bruto, para recalcular depois
}

void setup() {
  Serial.begin(115200);
  ds18b20.begin();
  ds18b20.setResolution(12);

  edge.manufacturer("Laboratório").model("Estação de solo v1").firmware("estacao-solo", "0.1.0");
  edge.addSensor("temp_solo", "Cel").label("Temperatura do solo").model("DS18B20").range(-55, 125).resolution(0.0625f).accuracy(0.5f).intervalMs(5000);
  edge.addSensor("umidade_solo", "%").label("Umidade do solo (calibrada)").quantity("volumetric_water_content").range(0, 100).intervalMs(5000);
  edge.addSensor("umidade_solo_v", "V").label("Umidade do solo — tensão bruta").model("Capacitivo v1.2").range(0, 3.1f).resolution(0.001f).adc("ESP32-S3 ADC1", 0, 12);
  edge.onRead(lerSensores);
  edge.begin();
}

void loop() {
  edge.loop();
}
