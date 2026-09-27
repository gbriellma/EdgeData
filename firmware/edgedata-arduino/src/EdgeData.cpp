#include "EdgeData.h"

#ifndef EDGEDATA_NO_BLE
#include <NimBLEDevice.h>
#endif

namespace edgedata {

// ── Sensor ──────────────────────────────────────────────────────────────────

Sensor& Sensor::label(const char* value) { label_ = value; return *this; }
Sensor& Sensor::quantity(const char* value) { quantity_ = value; return *this; }
Sensor& Sensor::model(const char* value) { model_ = value; return *this; }
Sensor& Sensor::type(const char* value) { type_ = value; return *this; }
Sensor& Sensor::range(float min, float max) {
  rangeMin_ = min;
  rangeMax_ = max;
  hasRange_ = true;
  return *this;
}
Sensor& Sensor::resolution(float value) { resolution_ = value; return *this; }
Sensor& Sensor::accuracy(float value) { accuracy_ = value; return *this; }
Sensor& Sensor::intervalMs(uint32_t value) { intervalMs_ = value; return *this; }
Sensor& Sensor::adc(const char* model, int channel, int bits, float gain, float vref) {
  adcModel_ = model;
  adcChannel_ = channel;
  adcBits_ = bits;
  adcGain_ = gain;
  adcVref_ = vref;
  return *this;
}

void Sensor::toJson(JsonObject out) const {
  out["id"] = id_;
  out["unit"] = unit_;
  if (label_) out["label"] = label_;
  if (quantity_) out["quantity"] = quantity_;
  if (type_) out["type"] = type_;
  if (model_) out["model"] = model_;
  if (hasRange_) {
    JsonArray r = out["range"].to<JsonArray>();
    r.add(rangeMin_);
    r.add(rangeMax_);
  }
  if (resolution_ > 0) out["resolution"] = resolution_;
  if (accuracy_ > 0) out["accuracy"] = accuracy_;
  if (intervalMs_ > 0) out["interval_ms"] = intervalMs_;
  if (adcModel_) {
    JsonObject a = out["adc"].to<JsonObject>();
    a["model"] = adcModel_;
    if (adcChannel_ >= 0) a["channel"] = adcChannel_;
    if (adcBits_ > 0) a["bits"] = adcBits_;
    if (adcGain_ > 0) a["gain"] = adcGain_;
    if (adcVref_ > 0) a["vref"] = adcVref_;
  }
}

// ── Reading ─────────────────────────────────────────────────────────────────

void Reading::set(const char* sensorId, float value) {
  if (isnan(value) || isinf(value)) values_[sensorId] = nullptr;
  else values_[sensorId] = value;
}
void Reading::set(const char* sensorId, int32_t value) { values_[sensorId] = value; }
void Reading::set(const char* sensorId, bool value) { values_[sensorId] = value; }
void Reading::set(const char* sensorId, const char* value) { values_[sensorId] = value; }
void Reading::missing(const char* sensorId) { values_[sensorId] = nullptr; }

// ── Transporte BLE ──────────────────────────────────────────────────────────

class Transport {
 public:
  virtual ~Transport() = default;
  virtual bool begin(const char* advertisedName) = 0;
  virtual bool connected() const = 0;
  virtual void sendLine(const char* data, size_t length) = 0;
  virtual void poll() = 0;
};

#ifndef EDGEDATA_NO_BLE

class BleTransport : public Transport, public NimBLEServerCallbacks, public NimBLECharacteristicCallbacks {
 public:
  explicit BleTransport(Device& device) : device_(device) {}

  bool begin(const char* advertisedName) override {
    NimBLEDevice::init(advertisedName);
    NimBLEDevice::setMTU(247);
    server_ = NimBLEDevice::createServer();
    server_->setCallbacks(this);
    NimBLEService* service = server_->createService(BLE_SERVICE_UUID);
    tx_ = service->createCharacteristic(BLE_TX_UUID, NIMBLE_PROPERTY::NOTIFY);
    NimBLECharacteristic* rx = service->createCharacteristic(BLE_RX_UUID, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
    rx->setCallbacks(this);
    service->start();
    NimBLEAdvertising* advertising = NimBLEDevice::getAdvertising();
    advertising->setName(advertisedName);
    advertising->addServiceUUID(BLE_SERVICE_UUID);
    advertising->enableScanResponse(true);
    return advertising->start();
  }

  bool connected() const override { return server_ != nullptr && server_->getConnectedCount() > 0; }

  // Divide a linha em pedaços de (MTU - 3) bytes; o app remonta pelo '\n'.
  void sendLine(const char* data, size_t length) override {
    if (!connected() || tx_ == nullptr) return;
    const size_t chunk = mtu_ > 3 ? mtu_ - 3 : 20;
    for (size_t offset = 0; offset < length; offset += chunk) {
      size_t size = length - offset < chunk ? length - offset : chunk;
      tx_->notify(reinterpret_cast<const uint8_t*>(data + offset), size);
    }
  }

  // Comandos chegam no callback do BLE; são processados no loop() para não
  // bloquear a pilha Bluetooth.
  void poll() override {
    if (!pendingReady_) return;
    pendingReady_ = false;
    device_.handleLine(pending_);
  }

  void onConnect(NimBLEServer*, NimBLEConnInfo&) override { mtu_ = 23; }

  void onDisconnect(NimBLEServer*, NimBLEConnInfo&, int) override {
    rxLength_ = 0;
    NimBLEDevice::startAdvertising();
  }

  void onMTUChange(uint16_t mtu, NimBLEConnInfo&) override { mtu_ = mtu; }

  void onWrite(NimBLECharacteristic* characteristic, NimBLEConnInfo&) override {
    NimBLEAttValue value = characteristic->getValue();
    for (size_t i = 0; i < value.size(); i++) {
      char c = static_cast<char>(value[i]);
      if (c == '\n') {
        rxBuffer_[rxLength_] = '\0';
        if (!pendingReady_) {
          memcpy(pending_, rxBuffer_, rxLength_ + 1);
          pendingReady_ = true;
        }
        rxLength_ = 0;
      } else if (c != '\r' && rxLength_ < EDGEDATA_LINE_BUFFER - 1) {
        rxBuffer_[rxLength_++] = c;
      }
    }
  }

 private:
  Device& device_;
  NimBLEServer* server_ = nullptr;
  NimBLECharacteristic* tx_ = nullptr;
  uint16_t mtu_ = 23;
  char rxBuffer_[EDGEDATA_LINE_BUFFER];
  size_t rxLength_ = 0;
  char pending_[EDGEDATA_LINE_BUFFER];
  volatile bool pendingReady_ = false;
};

#endif

// ── Device ──────────────────────────────────────────────────────────────────

Device::Device(const char* name) : name_(name) {}

Device& Device::manufacturer(const char* value) { manufacturer_ = value; return *this; }
Device& Device::model(const char* value) { model_ = value; return *this; }
Device& Device::serial(const char* value) { serial_ = value; return *this; }
Device& Device::hardware(const char* mcu, const char* revision) {
  mcu_ = mcu;
  revision_ = revision;
  return *this;
}
Device& Device::firmware(const char* name, const char* version, const char* commit) {
  fwName_ = name;
  fwVersion_ = version;
  fwCommit_ = commit;
  return *this;
}
Device& Device::id(const char* value) { id_ = value; return *this; }
Device& Device::useSerial(Stream& stream) {
  serial_stream_ = &stream;
  serialEnabled_ = true;
  return *this;
}
Device& Device::disableSerial() { serialEnabled_ = false; return *this; }
Device& Device::disableBle() { bleEnabled_ = false; return *this; }

Sensor& Device::addSensor(const char* id, const char* ucumUnit) {
  static Sensor overflow;  // devolvido quando o limite é excedido (ignorado no manifesto)
  if (sensorCount_ >= EDGEDATA_MAX_SENSORS) return overflow;
  Sensor& sensor = sensors_[sensorCount_++];
  sensor.id_ = id;
  sensor.unit_ = ucumUnit;
  return sensor;
}

bool Device::begin() {
  if (id_ == nullptr) {
    uint64_t mac = ESP.getEfuseMac();
    snprintf(autoId_, sizeof(autoId_), "esp32-%012llx", static_cast<unsigned long long>(mac & 0xFFFFFFFFFFFFULL));
    id_ = autoId_;
  }
  if (mcu_ == nullptr) mcu_ = CONFIG_IDF_TARGET;
  intervalMs_ = defaultIntervalMs();

  bool ok = true;
#ifndef EDGEDATA_NO_BLE
  if (bleEnabled_) {
    char advertised[32];
    snprintf(advertised, sizeof(advertised), "%s%s", BLE_NAME_PREFIX, name_);
    ble_ = new BleTransport(*this);
    ok = ble_->begin(advertised);
  }
#endif
  if (serialEnabled_) sendHello(nullptr);
  return ok;
}

bool Device::bleConnected() const { return ble_ != nullptr && ble_->connected(); }

uint32_t Device::defaultIntervalMs() const {
  uint32_t best = 0;
  for (uint8_t i = 0; i < sensorCount_; i++) {
    uint32_t v = sensors_[i].intervalMs_;
    if (v > 0 && (best == 0 || v < best)) best = v;
  }
  return best > 0 ? best : 1000;
}

void Device::loop() {
  if (ble_) ble_->poll();

  if (serialEnabled_ && serial_stream_ != nullptr) {
    while (serial_stream_->available() > 0) {
      char c = static_cast<char>(serial_stream_->read());
      if (c == '\n') {
        serialBuffer_[serialLength_] = '\0';
        if (serialLength_ > 0) handleLine(serialBuffer_);
        serialLength_ = 0;
      } else if (c != '\r' && serialLength_ < EDGEDATA_LINE_BUFFER - 1) {
        serialBuffer_[serialLength_++] = c;
      }
    }
  }

  if (streaming_ && millis() - lastSample_ >= intervalMs_) {
    lastSample_ = millis();
    sendObservation();
  }
}

void Device::startStreaming(uint32_t intervalMs) {
  intervalMs_ = intervalMs > 0 ? intervalMs : defaultIntervalMs();
  streaming_ = true;
  lastSample_ = millis() - intervalMs_;
}

void Device::stopStreaming() { streaming_ = false; }

void Device::handleLine(const char* line) {
  JsonDocument doc;
  if (deserializeJson(doc, line) != DeserializationError::Ok) {
    sendLog("warn", "comando com JSON inválido");
    return;
  }
  const char* cmd = doc["cmd"] | "";
  const char* id = doc["id"] | "";

  if (strcmp(cmd, "hello") == 0) {
    sendHello(id);
  } else if (strcmp(cmd, "read") == 0) {
    sendAck(id, true);
    sendObservation();
  } else if (strcmp(cmd, "start") == 0) {
    startStreaming(doc["interval_ms"] | 0u);
    sendAck(id, true);
    sendStatus();
  } else if (strcmp(cmd, "stop") == 0) {
    stopStreaming();
    sendAck(id, true);
    sendStatus();
  } else if (strcmp(cmd, "time") == 0) {
    double utc = doc["utc_ms"] | 0.0;
    if (utc > 0) {
      utcOffsetMs_ = static_cast<int64_t>(utc) - static_cast<int64_t>(millis());
      timeSynced_ = true;
      sendAck(id, true);
    } else {
      sendAck(id, false, "utc_ms ausente");
    }
  } else if (strcmp(cmd, "ping") == 0) {
    JsonDocument reply;
    reply["t"] = "pong";
    reply["id"] = id;
    reply["ms"] = millis();
    sendDocument(reply);
  } else {
    sendAck(id, false, "comando desconhecido");
  }
}

void Device::fillManifest(JsonObject manifest) {
  manifest["schema"] = MANIFEST_SCHEMA;
  manifest["id"] = id_;
  manifest["name"] = name_;
  if (manufacturer_) manifest["manufacturer"] = manufacturer_;
  if (model_) manifest["model"] = model_;
  if (serial_) manifest["serial"] = serial_;
  JsonObject hw = manifest["hardware"].to<JsonObject>();
  hw["mcu"] = mcu_;
  if (revision_) hw["revision"] = revision_;
  JsonObject fw = manifest["firmware"].to<JsonObject>();
  if (fwName_) fw["name"] = fwName_;
  fw["version"] = fwVersion_;
  if (fwCommit_) fw["commit"] = fwCommit_;
  JsonArray caps = manifest["capabilities"].to<JsonArray>();
  caps.add("read");
  caps.add("stream");
  caps.add("time");
  caps.add("events");
  JsonArray sensors = manifest["sensors"].to<JsonArray>();
  for (uint8_t i = 0; i < sensorCount_; i++) sensors_[i].toJson(sensors.add<JsonObject>());
}

void Device::sendHello(const char* replyId) {
  JsonDocument doc;
  doc["t"] = "hello";
  doc["proto"] = PROTOCOL_VERSION;
  if (replyId && *replyId) doc["id"] = replyId;
  fillManifest(doc["manifest"].to<JsonObject>());
  sendDocument(doc);
}

void Device::sendStatus() {
  JsonDocument doc;
  doc["t"] = "status";
  doc["ms"] = millis();
  doc["streaming"] = streaming_;
  doc["interval_ms"] = intervalMs_;
  doc["time_synced"] = timeSynced_;
  doc["free_heap"] = ESP.getFreeHeap();
  sendDocument(doc);
}

void Device::addTimestamps(JsonDocument& doc) {
  uint32_t now = millis();
  doc["ms"] = now;
  if (timeSynced_) doc["utc_ms"] = static_cast<double>(static_cast<int64_t>(now) + utcOffsetMs_);
}

void Device::sendObservation() {
  JsonDocument doc;
  doc["t"] = "obs";
  doc["seq"] = ++seq_;
  addTimestamps(doc);
  JsonObject values = doc["values"].to<JsonObject>();
  if (readCallback_) {
    Reading reading(values);
    readCallback_(reading);
  }
  sendDocument(doc);
}

void Device::sendEvent(const char* label) {
  JsonDocument doc;
  doc["t"] = "evt";
  addTimestamps(doc);
  doc["label"] = label;
  sendDocument(doc);
}

void Device::sendLog(const char* level, const char* message) {
  JsonDocument doc;
  doc["t"] = "log";
  doc["level"] = level;
  doc["msg"] = message;
  sendDocument(doc);
}

void Device::sendAck(const char* id, bool ok, const char* error) {
  if (id == nullptr || *id == '\0') return;
  JsonDocument doc;
  if (ok) {
    doc["t"] = "ack";
    doc["id"] = id;
    doc["ok"] = true;
  } else {
    doc["t"] = "err";
    doc["id"] = id;
    doc["msg"] = error ? error : "erro";
  }
  sendDocument(doc);
}

void Device::sendDocument(JsonDocument& doc) {
  String line;
  serializeJson(doc, line);
  line += '\n';
  if (serialEnabled_ && serial_stream_ != nullptr) serial_stream_->print(line);
  if (ble_ != nullptr) ble_->sendLine(line.c_str(), line.length());
}

}  // namespace edgedata
