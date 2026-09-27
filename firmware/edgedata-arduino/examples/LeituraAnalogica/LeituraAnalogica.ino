// Exemplo mínimo: uma entrada analógica e a temperatura interna do ESP32-S3.
//
// - Conecte-se pelo app EdgeData (aba Dispositivos) ou abra o monitor serial a 115200.
// - O botão BOOT (GPIO 0) envia um marcador de evento.

#include <EdgeData.h>

constexpr int PINO_ANALOGICO = 1;  // ADC1_CH0 no ESP32-S3
constexpr int PINO_BOTAO = 0;      // botão BOOT

edgedata::Device edge("Analogico01");

void lerSensores(edgedata::Reading& leitura) {
  // analogReadMilliVolts já aplica a calibração de fábrica do ADC
  leitura.set("tensao_a1", analogReadMilliVolts(PINO_ANALOGICO) / 1000.0f);
  leitura.set("temp_chip", temperatureRead());
}

void setup() {
  Serial.begin(115200);
  pinMode(PINO_BOTAO, INPUT_PULLUP);
  analogReadResolution(12);

  edge.model("ESP32-S3-DevKitC-1").firmware("leitura-analogica", "0.1.0");
  edge.addSensor("tensao_a1", "V")
      .label("Tensão na entrada A1")
      .quantity("voltage")
      .range(0.0f, 3.1f)
      .resolution(0.001f)
      .intervalMs(1000)
      .adc("ESP32-S3 ADC1", 0, 12);
  edge.addSensor("temp_chip", "Cel")
      .label("Temperatura interna do chip")
      .quantity("temperature")
      .range(-40.0f, 125.0f)
      .accuracy(5.0f);
  edge.onRead(lerSensores);
  edge.begin();
}

void loop() {
  edge.loop();

  static bool botaoAnterior = true;
  bool botao = digitalRead(PINO_BOTAO);
  if (botaoAnterior && !botao) edge.sendEvent("botao_pressionado");
  botaoAnterior = botao;
}
