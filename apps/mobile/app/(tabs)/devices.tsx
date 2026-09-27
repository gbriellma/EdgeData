import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ConnectionCard } from '@/components/devices/ConnectionCard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Section } from '@/components/ui/Section';
import { Colors } from '@/constants/colors';
import { getDb } from '@/database/connection';
import { listDevices } from '@/database/repo/devices';
import { useAsync } from '@/hooks/useAsync';
import { useDevices } from '@/stores/devices';
import { formatRelative } from '@/utils/formatters';

export default function DevicesScreen() {
  const router = useRouter();
  const { scanning, found, scanError, connections, target, writeError, startScan, stopScan, connect } = useDevices();
  const { data: known, refresh } = useAsync(async () => listDevices(await getDb()), []);

  const active = Object.values(connections);
  const connectedIds = new Set(active.map((c) => c.bleId));
  const available = found.filter((d) => !connectedIds.has(d.id));
  const knownOffline = (known ?? []).filter((d) => !active.some((c) => c.device?.id === d.id));

  const openDevice = (deviceId: string) => router.push({ pathname: '/device/[deviceId]', params: { deviceId } } as Href);

  const connectTo = async (bleId: string, name: string) => {
    await connect(bleId, name);
    void refresh();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {target ? (
        <Card style={styles.recording}>
          <Ionicons name="radio-button-on" size={18} color={Colors.error} />
          <Text style={styles.recordingText}>Leituras e eventos estão sendo gravados na sessão de coleta aberta.</Text>
        </Card>
      ) : null}
      {writeError ? <Text style={styles.error}>{writeError}</Text> : null}

      <Section title="Conectados" hint={active.length === 0 ? 'Nenhum dispositivo conectado.' : undefined}>
        {active.map((connection) => (
          <ConnectionCard
            key={connection.bleId}
            connection={connection}
            onOpenDetails={connection.device ? () => openDevice(connection.device!.id) : undefined}
          />
        ))}
      </Section>

      <Section
        title="Procurar por Bluetooth"
        hint="Dispositivos com firmware EdgeData anunciam o nome “EdgeData-…”. Ligue o dispositivo e mantenha-o perto do celular."
        right={scanning ? <ActivityIndicator color={Colors.primary} /> : null}
      >
        <Button
          title={scanning ? 'Parar busca' : 'Procurar dispositivos'}
          variant={scanning ? 'outline' : 'primary'}
          onPress={() => (scanning ? stopScan() : void startScan())}
          icon={<Ionicons name="bluetooth" size={18} color={scanning ? Colors.primary : Colors.white} />}
        />
        {scanError ? <Text style={styles.error}>{scanError}</Text> : null}
        {available.map((device) => (
          <TouchableOpacity key={device.id} style={styles.item} onPress={() => void connectTo(device.id, device.name)}>
            <Ionicons name="hardware-chip-outline" size={20} color={Colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{device.name}</Text>
              <Text style={styles.meta}>
                {device.id}
                {device.rssi !== null ? ` · sinal ${device.rssi} dBm` : ''}
              </Text>
            </View>
            <Text style={styles.link}>Conectar</Text>
          </TouchableOpacity>
        ))}
        {scanning && available.length === 0 ? <Text style={styles.meta}>Procurando…</Text> : null}
      </Section>

      <Section title="Cadastrados" hint="Dispositivos que já se conectaram a este celular. O manifesto de cada um fica guardado para a proveniência dos dados.">
        {knownOffline.length === 0 ? <Text style={styles.meta}>Nenhum outro dispositivo cadastrado.</Text> : null}
        {knownOffline.map((device) => (
          <TouchableOpacity key={device.id} style={styles.item} onPress={() => openDevice(device.id)}>
            <Ionicons name="hardware-chip-outline" size={20} color={Colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{device.name}</Text>
              <Text style={styles.meta}>
                {device.manifest.sensors.length} sensor(es)
                {device.manifest.firmware ? ` · fw ${device.manifest.firmware.version}` : ''}
                {device.lastSeenAt ? ` · visto ${formatRelative(device.lastSeenAt)}` : ''}
              </Text>
            </View>
            {device.transport === 'ble' && device.address ? (
              <TouchableOpacity onPress={() => void connectTo(device.address!, device.name)} hitSlop={8}>
                <Text style={styles.link}>Conectar</Text>
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>
        ))}
      </Section>

      <Text style={styles.footnote}>
        A conexão Bluetooth exige o app instalado por build próprio (não funciona no Expo Go). O firmware de exemplo para ESP32 está na pasta firmware/ do repositório.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 20, paddingBottom: 40 },
  recording: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: Colors.errorLight, borderColor: Colors.error },
  recordingText: { flex: 1, fontSize: 13, color: Colors.text },
  error: { fontSize: 13, color: Colors.error },
  meta: { fontSize: 12, color: Colors.textSecondary },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  itemTitle: { fontSize: 15, fontWeight: '600', color: Colors.text },
  link: { color: Colors.primary, fontWeight: '700' },
  footnote: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
});
