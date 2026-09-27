import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ConnectionCard } from '@/components/devices/ConnectionCard';
import { Card } from '@/components/ui/Card';
import { KeyValue, Section } from '@/components/ui/Section';
import { Colors } from '@/constants/colors';
import { unitSymbol } from '@/core/units';
import { getDb } from '@/database/connection';
import { getDevice } from '@/database/repo/devices';
import { useAsync } from '@/hooks/useAsync';
import { useDevices } from '@/stores/devices';
import { formatDateTime } from '@/utils/formatters';

const TRANSPORTS: Record<string, string> = { ble: 'Bluetooth LE', serial: 'Serial', wifi: 'Wi-Fi' };

export default function DeviceScreen() {
  const { deviceId } = useLocalSearchParams<{ deviceId: string }>();
  const [showJson, setShowJson] = useState(false);
  const { data: device } = useAsync(async () => getDevice(await getDb(), deviceId), [deviceId]);
  const connection = useDevices((s) => Object.values(s.connections).find((c) => c.device?.id === deviceId));

  if (device === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }
  if (!device) {
    return (
      <View style={styles.center}>
        <Text style={styles.meta}>Dispositivo não encontrado.</Text>
      </View>
    );
  }

  const manifest = connection?.manifest ?? device.manifest;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {connection ? <ConnectionCard connection={connection} /> : null}

      <Section title={manifest.name}>
        <Card style={{ gap: 4 }}>
          <KeyValue label="ID" value={manifest.id} />
          <KeyValue label="Fabricante" value={manifest.manufacturer} />
          <KeyValue label="Modelo" value={manifest.model} />
          <KeyValue label="Número de série" value={manifest.serial} />
          <KeyValue label="Microcontrolador" value={[manifest.hardware?.mcu, manifest.hardware?.revision].filter(Boolean).join(' rev. ')} />
          <KeyValue
            label="Firmware"
            value={manifest.firmware ? [manifest.firmware.name, manifest.firmware.version, manifest.firmware.commit ? `(${manifest.firmware.commit})` : null].filter(Boolean).join(' ') : null}
          />
          <KeyValue label="Recursos" value={manifest.capabilities?.join(', ')} />
          <KeyValue label="Conexão" value={`${TRANSPORTS[device.transport] ?? device.transport}${device.address ? ` · ${device.address}` : ''}`} />
          <KeyValue label="Primeira conexão" value={formatDateTime(device.firstSeenAt)} />
          <KeyValue label="Última atividade" value={device.lastSeenAt ? formatDateTime(device.lastSeenAt) : null} />
        </Card>
      </Section>

      <Section title={`Sensores (${manifest.sensors.length})`} hint="Unidades em UCUM, como declaradas pelo firmware.">
        {manifest.sensors.map((sensor) => (
          <Card key={sensor.id} style={{ gap: 4 }}>
            <Text style={styles.sensorTitle}>
              {sensor.label ?? sensor.id} <Text style={styles.meta}>· {sensor.id}</Text>
            </Text>
            <KeyValue label="Unidade" value={`${unitSymbol(sensor.unit)} (${sensor.unit})`} />
            <KeyValue label="Grandeza" value={sensor.quantity} />
            <KeyValue label="Modelo do sensor" value={sensor.model} />
            <KeyValue label="Tipo" value={sensor.type} />
            <KeyValue label="Faixa" value={sensor.range ? `${sensor.range[0]} a ${sensor.range[1]}` : null} />
            <KeyValue label="Resolução" value={sensor.resolution} />
            <KeyValue label="Exatidão (±)" value={sensor.accuracy} />
            <KeyValue label="Intervalo padrão" value={sensor.interval_ms ? `${sensor.interval_ms} ms` : null} />
            <KeyValue
              label="ADC"
              value={
                sensor.adc
                  ? [sensor.adc.model, sensor.adc.channel !== undefined ? `canal ${sensor.adc.channel}` : null, sensor.adc.bits ? `${sensor.adc.bits} bits` : null, sensor.adc.gain ? `ganho ${sensor.adc.gain}` : null]
                      .filter(Boolean)
                      .join(' · ')
                  : null
              }
            />
          </Card>
        ))}
      </Section>

      <TouchableOpacity onPress={() => setShowJson((v) => !v)}>
        <Text style={styles.link}>{showJson ? 'Ocultar manifesto (JSON)' : 'Ver manifesto (JSON)'}</Text>
      </TouchableOpacity>
      {showJson ? (
        <Card>
          <Text style={styles.code} selectable>
            {JSON.stringify(manifest, null, 2)}
          </Text>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 18, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  meta: { fontSize: 12, color: Colors.textSecondary, fontWeight: '400' },
  sensorTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  link: { color: Colors.primary, fontWeight: '600' },
  code: { fontFamily: 'monospace', fontSize: 12, color: Colors.text },
});
