// EdgeData — biblioteca de firmware para o EdgeData Device Protocol v1.
//
// O dispositivo se descreve por um manifesto (sensores, unidades UCUM, faixas) e
// troca mensagens JSON, uma por linha, com o app EdgeData por BLE e pela Serial.
// Especificação: docs/PROTOCOLO_DISPOSITIVOS.md
//
// Uso mínimo:
//
//   #include <EdgeData.h>
//   edgedata::Device edge("Estacao01");
//
//   void lerSensores(edgedata::Reading& r) {
//     r.set("temp_ar", lerTemperatura());
//   }
//
//   void setup() {
//     edge.firmware("estacao", "0.1.0");
//     edge.addSensor("temp_ar", "Cel").label("Temperatura do ar").range(-40, 85).resolution(0.1);
//     edge.onRead(lerSensores);
//     edge.begin();
//   }
//
//   void loop() { edge.loop(); }

#pragma once

#include <Arduino.h>
#include <ArduinoJson.h>

#ifndef EDGEDATA_MAX_SENSORS
#define EDGEDATA_MAX_SENSORS 16
#endif

#ifndef EDGEDATA_LINE_BUFFER
#define EDGEDATA_LINE_BUFFER 512
#endif

namespace edgedata {

constexpr uint8_t PROTOCOL_VERSION = 1;
constexpr const char* MANIFEST_SCHEMA = "edgedata.device-manifest/1";
constexpr const char* BLE_SERVICE_UUID = "ed0a0001-abd6-484b-8c0b-c353facbd2c5";
constexpr const char* BLE_RX_UUID = "ed0a0002-abd6-484b-8c0b-c353facbd2c5";  // app -> dispositivo
constexpr const char* BLE_TX_UUID = "ed0a0003-abd6-484b-8c0b-c353facbd2c5";  // dispositivo -> app
constexpr const char* BLE_NAME_PREFIX = "EdgeData-";

// Descrição de um sensor no manifesto. Construída com a API fluente de addSensor().
class Sensor {
 public:
  Sensor& label(const char* value);
  Sensor& quantity(const char* value);
  Sensor& model(const char* value);
  Sensor& type(const char* value);  // float32, int32, bool…
  Sensor& range(float min, float max);
  Sensor& resolution(float value);
  Sensor& accuracy(float value);
  Sensor& intervalMs(uint32_t value);
  Sensor& adc(const char* model, int channel, int bits, float gain = 1.0f, float vref = 0.0f);

  const char* id() const { return id_; }
  void toJson(JsonObject out) const;

 private:
  friend class Device;
  const char* id_ = nullptr;
  const char* unit_ = nullptr;
  const char* label_ = nullptr;
  const char* quantity_ = nullptr;
  const char* model_ = nullptr;
  const char* type_ = "float32";
  float rangeMin_ = 0, rangeMax_ = 0;
  bool hasRange_ = false;
  float resolution_ = 0, accuracy_ = 0;
  uint32_t intervalMs_ = 0;
  const char* adcModel_ = nullptr;
  int adcChannel_ = -1, adcBits_ = 0;
  float adcGain_ = 0, adcVref_ = 0;
};

// Leitura em construção: o callback de leitura preenche os valores por ID de sensor.
class Reading {
 public:
  explicit Reading(JsonObject values) : values_(values) {}
  void set(const char* sensorId, float value);
  void set(const char* sensorId, double value) { set(sensorId, static_cast<float>(value)); }
  void set(const char* sensorId, int32_t value);
  void set(const char* sensorId, bool value);
  void set(const char* sensorId, const char* value);
  // Sensor sem leitura válida nesta rodada (vira MISSING no app)
  void missing(const char* sensorId);

 private:
  JsonObject values_;
};

using ReadCallback = void (*)(Reading&);
using LogCallback = void (*)(const char* line);

class Transport;

class Device {
 public:
  explicit Device(const char* name);

  // Metadados do manifesto
  Device& manufacturer(const char* value);
  Device& model(const char* value);
  Device& serial(const char* value);
  Device& hardware(const char* mcu, const char* revision = nullptr);
  Device& firmware(const char* name, const char* version, const char* commit = nullptr);
  // ID estável; se não informado, é derivado do MAC (ex.: esp32-7c9ebd4a1f20)
  Device& id(const char* value);

  Sensor& addSensor(const char* id, const char* ucumUnit);
  void onRead(ReadCallback callback) { readCallback_ = callback; }

  // Transportes (ambos ligados por padrão)
  Device& useSerial(Stream& stream);
  Device& disableSerial();
  Device& disableBle();

  bool begin();
  void loop();

  // Faz uma leitura agora e envia (também chamado pelo comando "read")
  void sendObservation();
  // Marca um evento do dispositivo (ex.: botão pressionado, válvula aberta)
  void sendEvent(const char* label);
  void sendLog(const char* level, const char* message);

  bool streaming() const { return streaming_; }
  void startStreaming(uint32_t intervalMs);
  void stopStreaming();
  bool bleConnected() const;

  // Usado pelos transportes
  void handleLine(const char* line);

 private:
  void sendHello(const char* replyId);
  void sendStatus();
  void sendAck(const char* id, bool ok, const char* error = nullptr);
  void sendDocument(JsonDocument& doc);
  void fillManifest(JsonObject manifest);
  void addTimestamps(JsonDocument& doc);
  uint32_t defaultIntervalMs() const;

  const char* name_;
  const char* id_ = nullptr;
  char autoId_[24] = {0};
  const char* manufacturer_ = nullptr;
  const char* model_ = nullptr;
  const char* serial_ = nullptr;
  const char* mcu_ = nullptr;
  const char* revision_ = nullptr;
  const char* fwName_ = nullptr;
  const char* fwVersion_ = "0.0.0";
  const char* fwCommit_ = nullptr;

  Sensor sensors_[EDGEDATA_MAX_SENSORS];
  uint8_t sensorCount_ = 0;
  ReadCallback readCallback_ = nullptr;

  Stream* serial_stream_ = &Serial;
  bool serialEnabled_ = true;
  bool bleEnabled_ = true;
  Transport* ble_ = nullptr;

  char serialBuffer_[EDGEDATA_LINE_BUFFER];
  size_t serialLength_ = 0;

  bool streaming_ = false;
  uint32_t intervalMs_ = 1000;
  uint32_t lastSample_ = 0;
  uint32_t seq_ = 0;

  // Relógio: utc_ms = millis() + offset, após o comando "time"
  bool timeSynced_ = false;
  int64_t utcOffsetMs_ = 0;
};

}  // namespace edgedata
