import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/QcBadge';
import { Colors } from '@/constants/colors';
import { formatReading } from '@/core/device/binding';
import { useDevices, type ConnectionState } from '@/stores/devices';

const STREAM_INTERVALS = [1000, 5000, 60000];
const intervalLabel = (ms: number) => (ms >= 60000 ? `${ms / 60000} min` : `${ms / 1000} s`);

interface Props {
  connection: ConnectionState;
  /** Versão resumida para a tela de coleta */
  compact?: boolean;
  onOpenDetails?: () => void;
}

export function ConnectionCard({ connection, compact, onOpenDetails }: Props) {
  const { readNow, setStreaming, disconnect, connect } = useDevices.getState();
  const [busy, setBusy] = useState(false);
  const { status, manifest } = connection;
  const capabilities = manifest?.capabilities ?? ['read', 'stream'];

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      Alert.alert(connection.name, error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const toggleStream = () => {
    if (connection.streaming) return void run(() => setStreaming(connection.bleId, false));
    Alert.alert('Leitura contínua', 'Intervalo entre leituras', [
      ...STREAM_INTERVALS.map((ms) => ({ text: intervalLabel(ms), onPress: () => void run(() => setStreaming(connection.bleId, true, ms)) })),
      { text: 'Cancelar', style: 'cancel' as const },
    ]);
  };

  const tone = status === 'connected' ? 'ok' : status === 'connecting' ? 'neutral' : status === 'error' ? 'error' : 'warn';
  const statusLabel = { connected: 'Conectado', connecting: 'Conectando…', disconnected: 'Desconectado', error: 'Falhou' }[status];
  const lossPct = connection.received + connection.lost > 0 ? (100 * connection.lost) / (connection.received + connection.lost) : 0;
  const sensors = manifest?.sensors ?? [];

  return (
    <Card style={{ gap: 8 }}>
      <TouchableOpacity style={styles.row} onPress={onOpenDetails} disabled={!onOpenDetails}>
        <Ionicons name="hardware-chip-outline" size={22} color={Colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {connection.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {[
              manifest?.firmware ? `fw ${manifest.firmware.version}` : null,
              connection.batteryPct !== null ? `bateria ${Math.round(connection.batteryPct)}%` : null,
              connection.streaming && connection.intervalMs ? `contínuo ${intervalLabel(connection.intervalMs)}` : null,
              connection.received > 0 ? `${connection.received} pacotes${lossPct > 0 ? ` · perda ${lossPct.toFixed(1)}%` : ''}` : null,
              connection.recorded > 0 ? `${connection.recorded} gravadas` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        {busy || status === 'connecting' ? <ActivityIndicator color={Colors.primary} /> : <StatusBadge label={statusLabel} tone={tone} />}
      </TouchableOpacity>

      {connection.error && status !== 'connected' ? <Text style={styles.error}>{connection.error}</Text> : null}
      {!compact && connection.warnings.length > 0 ? <Text style={styles.warn}>{connection.warnings.join('\n')}</Text> : null}

      {status === 'connected' && sensors.length > 0 ? (
        <View style={styles.values}>
          {sensors.map((sensor) => (
            <View key={sensor.id} style={styles.value}>
              <Text style={styles.valueLabel} numberOfLines={1}>
                {sensor.label ?? sensor.id}
              </Text>
              <Text style={styles.valueText}>{formatReading(connection.latest[sensor.id]?.value, sensor)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        {status === 'connected' ? (
          <>
            {capabilities.includes('read') ? <Action icon="refresh" label="Ler agora" onPress={() => run(() => readNow(connection.bleId))} /> : null}
            {capabilities.includes('stream') ? (
              <Action icon={connection.streaming ? 'pause' : 'play'} label={connection.streaming ? 'Parar' : 'Contínuo'} onPress={toggleStream} />
            ) : null}
          </>
        ) : status !== 'connecting' ? (
          <Action icon="bluetooth" label="Reconectar" onPress={() => void connect(connection.bleId, connection.name)} />
        ) : null}
        <Action icon="close" label="Desconectar" danger onPress={() => void run(() => disconnect(connection.bleId))} />
      </View>
    </Card>
  );
}

function Action({ icon, label, onPress, danger }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; danger?: boolean }) {
  const color = danger ? Colors.error : Colors.primary;
  return (
    <TouchableOpacity style={[styles.action, { borderColor: color }]} onPress={onPress} accessibilityLabel={label}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.actionText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 16, fontWeight: '700', color: Colors.text },
  meta: { fontSize: 12, color: Colors.textSecondary },
  error: { fontSize: 13, color: Colors.error },
  warn: { fontSize: 12, color: Colors.warning },
  values: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  value: { minWidth: '30%', flexGrow: 1, padding: 8, borderRadius: 8, backgroundColor: Colors.primarySurface },
  valueLabel: { fontSize: 11, color: Colors.textSecondary },
  valueText: { fontSize: 16, fontWeight: '700', color: Colors.primaryDark },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1 },
  actionText: { fontSize: 13, fontWeight: '600' },
});
