import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Colors } from '@/constants/colors';
import { sensorCompatibility } from '@/core/device/binding';
import type { ProtocolVariable } from '@/core/types';
import { unitSymbol } from '@/core/units';
import { sortVariables } from '@/core/variables';
import { getDb } from '@/database/connection';
import { listBindings, listDevices, removeBinding, setBinding } from '@/database/repo/devices';
import { getCurrentProtocol } from '@/database/repo/experiments';
import { useAsync } from '@/hooks/useAsync';
import { currentActor } from '@/stores/settings';

const BINDABLE = new Set(['integer', 'decimal', 'short_text', 'barcode', 'boolean']);

export default function SensorsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [picking, setPicking] = useState<ProtocolVariable | null>(null);

  const { data, refresh } = useAsync(async () => {
    const db = await getDb();
    const [protocol, devices, bindings] = await Promise.all([getCurrentProtocol(db, id), listDevices(db), listBindings(db, id)]);
    const variables = sortVariables(protocol.variables.filter((v) => v.scope === 'observation' && BINDABLE.has(v.type)));
    return { variables, devices, bindings: new Map(bindings.map((b) => [b.variableKey, b])) };
  }, [id]);

  if (!data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  const deviceName = (deviceId: string) => data.devices.find((d) => d.id === deviceId)?.name ?? deviceId;
  const sensorLabel = (deviceId: string, sensorId: string) =>
    data.devices.find((d) => d.id === deviceId)?.manifest.sensors.find((s) => s.id === sensorId)?.label ?? sensorId;

  const bind = async (variable: ProtocolVariable, deviceId: string, sensorId: string) => {
    try {
      await setBinding(await getDb(), id, variable.key, deviceId, sensorId, currentActor());
      setPicking(null);
      await refresh();
    } catch (error) {
      Alert.alert('Erro', error instanceof Error ? error.message : String(error));
    }
  };

  const unbind = async (variable: ProtocolVariable) => {
    await removeBinding(await getDb(), id, variable.key, currentActor());
    setPicking(null);
    await refresh();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.help}>
        Vincule uma variável a um sensor para preenchê-la com um toque durante a coleta. A leitura bruta fica gravada e ligada à observação. Unidades diferentes são convertidas
        automaticamente quando compatíveis (ex.: mV → V); dimensões diferentes são bloqueadas.
      </Text>

      {data.devices.length === 0 ? (
        <Card style={{ gap: 8 }}>
          <Text style={styles.title}>Nenhum dispositivo cadastrado</Text>
          <Text style={styles.help}>Conecte um dispositivo uma vez na aba Dispositivos; o manifesto dele (sensores e unidades) fica guardado para os vínculos.</Text>
          <Button title="Ir para Dispositivos" variant="outline" onPress={() => router.push('/devices' as Href)} />
        </Card>
      ) : null}

      {data.variables.length === 0 ? <Text style={styles.help}>O protocolo não tem variáveis numéricas, de texto curto ou sim/não por observação.</Text> : null}

      {data.variables.map((variable) => {
        const binding = data.bindings.get(variable.key);
        return (
          <Card key={variable.key} onPress={data.devices.length > 0 ? () => setPicking(variable) : undefined} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                {variable.label}
                {variable.unit ? <Text style={styles.meta}> ({unitSymbol(variable.unit)})</Text> : null}
              </Text>
              <Text style={binding ? styles.bound : styles.meta}>
                {binding ? `${deviceName(binding.deviceId)} · ${sensorLabel(binding.deviceId, binding.sensorId)}` : 'Digitação manual'}
              </Text>
            </View>
            <Ionicons name={binding ? 'link' : 'add-circle-outline'} size={22} color={Colors.primary} />
          </Card>
        );
      })}

      <Modal visible={picking !== null} animationType="slide" onRequestClose={() => setPicking(null)}>
        <SafeAreaView style={styles.container}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{picking?.label}</Text>
            <TouchableOpacity onPress={() => setPicking(null)} accessibilityLabel="Fechar">
              <Ionicons name="close" size={26} color={Colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            {picking && data.bindings.has(picking.key) ? <Button title="Remover vínculo (digitação manual)" variant="outline" onPress={() => void unbind(picking)} /> : null}
            {picking
              ? data.devices.map((device) => (
                  <View key={device.id} style={{ gap: 6 }}>
                    <Text style={styles.deviceTitle}>{device.name}</Text>
                    {device.manifest.sensors.map((sensor) => {
                      const compat = sensorCompatibility(sensor, picking);
                      const current = data.bindings.get(picking.key);
                      const selected = current?.deviceId === device.id && current.sensorId === sensor.id;
                      return (
                        <TouchableOpacity
                          key={sensor.id}
                          style={[styles.option, selected && styles.optionSelected, !compat.ok && styles.optionDisabled]}
                          disabled={!compat.ok}
                          onPress={() => void bind(picking, device.id, sensor.id)}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.optionTitle}>
                              {sensor.label ?? sensor.id} · {unitSymbol(sensor.unit)}
                            </Text>
                            <Text style={compat.ok ? styles.meta : styles.reason}>
                              {compat.ok ? (compat.convertFrom ? `Convertido de ${unitSymbol(compat.convertFrom)} para ${unitSymbol(picking.unit)}` : sensor.id) : compat.reason}
                            </Text>
                          </View>
                          {selected ? <Ionicons name="checkmark-circle" size={22} color={Colors.primary} /> : null}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))
              : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  help: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.text },
  meta: { fontSize: 12, color: Colors.textSecondary, fontWeight: '400' },
  bound: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  deviceTitle: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary, marginTop: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  optionSelected: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  optionDisabled: { opacity: 0.55 },
  optionTitle: { fontSize: 14, fontWeight: '600', color: Colors.text },
  reason: { fontSize: 12, color: Colors.error },
});
