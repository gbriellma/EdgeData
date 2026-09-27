import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useBLE } from '@/hooks/useBLE';
import { useSensorBindings } from '@/hooks/useSensorBindings';
import {
  BLEConnectionState,
  SensorData,
  SensorBinding,
  EZO_SENSOR_IDS,
} from '@/types/ble';

// ============================================================================
//  Tela de Configuração de Sensores BLE
//  Acessada via Configurações → Sensores Bluetooth
// ============================================================================
export default function SensorsScreen() {
  const {
    connectionState,
    connectedDevice,
    lastSensorData,
    error: bleError,
    startScan,
    stopScan,
    connectToDevice,
    disconnect,
    requestSensorData,
  } = useBLE();

  const {
    bindings,
    addBinding,
    removeBinding,
    clearAllBindings,
    isLoading: bindingsLoading,
  } = useSensorBindings();

  const [sensors, setSensors] = useState<SensorData[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isFetchingSensors, setIsFetchingSensors] = useState(false);
  const [bindingModalVisible, setBindingModalVisible] = useState(false);
  const [selectedSensor, setSelectedSensor] = useState<SensorData | null>(null);
  const [fieldKeyInput, setFieldKeyInput] = useState('');

  // Buscar dados dos sensores quando conectar
  useEffect(() => {
    if (connectionState === BLEConnectionState.CONNECTED) {
      fetchSensorData();
    }
  }, [connectionState]);

  const handleConnect = async () => {
    try {
      setIsScanning(true);
      await startScan();
      // Mock: conectar diretamente ao dispositivo simulado
      // Em produção: mostraria lista de dispositivos encontrados
      setTimeout(async () => {
        await connectToDevice('mock-folden-sensor-01');
        setIsScanning(false);
      }, 1500);
    } catch (err) {
      setIsScanning(false);
      Alert.alert('Erro', 'Não foi possível escanear dispositivos BLE');
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    setSensors([]);
  };

  const fetchSensorData = async () => {
    setIsFetchingSensors(true);
    try {
      const data = await requestSensorData();
      if (data) {
        setSensors(data.sensors);
      }
    } catch {
      Alert.alert('Erro', 'Falha ao ler sensores');
    } finally {
      setIsFetchingSensors(false);
    }
  };

  const handleOpenBinding = (sensor: SensorData) => {
    setSelectedSensor(sensor);
    const existing = bindings.find((b) => b.sensor_id === sensor.id);
    setFieldKeyInput(existing?.dataset_field_key || '');
    setBindingModalVisible(true);
  };

  const handleSaveBinding = async () => {
    if (!selectedSensor || !fieldKeyInput.trim()) {
      Alert.alert('Erro', 'Digite o nome do campo do formulário');
      return;
    }
    // Remover binding anterior se existir
    const existing = bindings.find((b) => b.sensor_id === selectedSensor.id);
    if (existing) {
      await removeBinding(selectedSensor.id);
    }
    await addBinding({
      sensor_id: selectedSensor.id,
      dataset_field_key: fieldKeyInput.trim(),
      sensor_label: selectedSensor.label,
    });
    setBindingModalVisible(false);
    setSelectedSensor(null);
    setFieldKeyInput('');
  };

  const handleRemoveBinding = async (sensorId: string) => {
    await removeBinding(sensorId);
  };

  const handleClearAll = () => {
    if (bindings.length === 0) return;
    Alert.alert(
      'Limpar Mapeamentos',
      'Remover todos os mapeamentos de sensores?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpar',
          style: 'destructive',
          onPress: () => clearAllBindings(),
        },
      ]
    );
  };

  const getBindingForSensor = (sensorId: string): SensorBinding | undefined =>
    bindings.find((b) => b.sensor_id === sensorId);

  const isConnected = connectionState === BLEConnectionState.CONNECTED;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Status da Conexão */}
      <Card style={[styles.statusCard, isConnected ? styles.statusConnected : styles.statusDisconnected]}>
        <View style={styles.statusRow}>
          <Ionicons
            name={isConnected ? 'bluetooth' : 'bluetooth-outline'}
            size={28}
            color={isConnected ? Colors.success : Colors.error}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusTitle, { color: isConnected ? '#155724' : '#721c24' }]}>
              {isConnected ? 'Conectado' : 'Desconectado'}
            </Text>
            {connectedDevice && (
              <Text style={[styles.statusDetail, { color: isConnected ? '#155724' : '#721c24' }]}>
                {connectedDevice.name} ({connectedDevice.id})
              </Text>
            )}
            {!isConnected && (
              <Text style={[styles.statusDetail, { color: '#721c24' }]}>
                Nenhum dispositivo conectado
              </Text>
            )}
          </View>
        </View>
      </Card>

      {/* Botões de Conexão */}
      <View style={styles.connectionActions}>
        {!isConnected ? (
          <Button
            title={isScanning ? 'Escaneando...' : 'Escanear Dispositivos'}
            onPress={handleConnect}
            loading={isScanning}
            disabled={isScanning}
            icon={<Ionicons name="search-outline" size={18} color={Colors.white} />}
          />
        ) : (
          <View style={styles.connectedActions}>
            <Button
              title={isFetchingSensors ? 'Lendo...' : 'Ler Sensores'}
              onPress={fetchSensorData}
              variant="outline"
              loading={isFetchingSensors}
              disabled={isFetchingSensors}
              icon={<Ionicons name="refresh-outline" size={18} color={Colors.primary} />}
              style={{ flex: 1 }}
            />
            <Button
              title="Desconectar"
              onPress={handleDisconnect}
              variant="danger"
              icon={<Ionicons name="close-circle-outline" size={18} color={Colors.white} />}
              style={{ flex: 1 }}
            />
          </View>
        )}
      </View>

      {/* Erro BLE */}
      {bleError && (
        <Card style={styles.errorCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="warning-outline" size={18} color={Colors.error} />
            <Text style={styles.errorText}>{bleError}</Text>
          </View>
        </Card>
      )}

      {/* Leituras dos Sensores */}
      {isConnected && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Sensores Detectados ({sensors.length})
          </Text>

          {isFetchingSensors && sensors.length === 0 ? (
            <Card>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={[styles.emptyText, { marginTop: 8 }]}>
                Lendo sensores...
              </Text>
            </Card>
          ) : sensors.length === 0 ? (
            <Card>
              <Text style={styles.emptyText}>
                Nenhum sensor detectado. Toque em "Ler Sensores".
              </Text>
            </Card>
          ) : (
            sensors.map((sensor) => {
              const binding = getBindingForSensor(sensor.id);
              return (
                <Card
                  key={sensor.id}
                  style={[
                    styles.sensorCard,
                    binding && styles.sensorCardMapped,
                  ]}
                >
                  <View style={styles.sensorHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sensorLabel}>{sensor.label}</Text>
                      <Text style={styles.sensorId}>ID: {sensor.id}</Text>
                    </View>
                    <View style={styles.sensorValueContainer}>
                      <Text style={styles.sensorValue}>
                        {typeof sensor.value === 'number'
                          ? sensor.value.toFixed(sensor.unit === 'ppm' ? 0 : 1)
                          : sensor.value}
                      </Text>
                      <Text style={styles.sensorUnit}>{sensor.unit}</Text>
                    </View>
                  </View>

                  {/* Status ready */}
                  {sensor.ready === false && (
                    <View style={styles.notReadyBadge}>
                      <Ionicons name="time-outline" size={14} color={Colors.warning} />
                      <Text style={styles.notReadyText}>Aguardando leitura...</Text>
                    </View>
                  )}

                  {/* Binding info */}
                  {binding ? (
                    <View style={styles.bindingInfo}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.bindingLabel}>
                          Mapeado para: <Text style={{ fontWeight: '700' }}>{binding.dataset_field_key}</Text>
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleRemoveBinding(sensor.id)}
                        hitSlop={8}
                      >
                        <Ionicons name="close-circle" size={22} color={Colors.error} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Button
                      title="Mapear para Campo"
                      onPress={() => handleOpenBinding(sensor)}
                      variant="outline"
                      size="small"
                      style={{ marginTop: 8 }}
                      icon={<Ionicons name="link-outline" size={16} color={Colors.primary} />}
                    />
                  )}
                </Card>
              );
            })
          )}
        </View>
      )}

      {/* Mapeamentos Salvos */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>
            Mapeamentos Salvos ({bindings.length})
          </Text>
          {bindings.length > 0 && (
            <TouchableOpacity onPress={handleClearAll} hitSlop={8}>
              <Text style={styles.clearAllText}>Limpar tudo</Text>
            </TouchableOpacity>
          )}
        </View>

        {bindingsLoading ? (
          <Card>
            <ActivityIndicator size="small" color={Colors.primary} />
          </Card>
        ) : bindings.length === 0 ? (
          <Card>
            <View style={{ alignItems: 'center', paddingVertical: 12 }}>
              <Ionicons name="link-outline" size={32} color={Colors.border} />
              <Text style={[styles.emptyText, { marginTop: 8 }]}>
                Nenhum mapeamento configurado
              </Text>
              <Text style={styles.emptySubtext}>
                Conecte ao dispositivo, leia os sensores e mapeie cada sensor para um campo do formulário de coleta.
              </Text>
            </View>
          </Card>
        ) : (
          bindings.map((binding) => (
            <Card key={binding.sensor_id} style={styles.bindingCard}>
              <View style={styles.bindingCardContent}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bindingCardSensor}>
                    {binding.sensor_label || binding.sensor_id}
                  </Text>
                  <View style={styles.bindingArrow}>
                    <Ionicons name="arrow-forward" size={14} color={Colors.primary} />
                    <Text style={styles.bindingCardField}>
                      {binding.dataset_field_key}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => handleRemoveBinding(binding.sensor_id)}
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={18} color={Colors.error} />
                </TouchableOpacity>
              </View>
            </Card>
          ))
        )}
      </View>

      {/* Info */}
      <Card style={styles.infoCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.primary} />
          <Text style={styles.infoTitle}>Como funciona</Text>
        </View>
        <Text style={styles.infoText}>
          1. Conecte ao dispositivo ESP32 com sensores Atlas Scientific EZO{'\n'}
          2. Os sensores disponíveis aparecerão com suas leituras atuais{'\n'}
          3. Mapeie cada sensor para o campo correspondente do formulário de coleta{'\n'}
          4. Na coleta, toque em "Atualizar Sensores" para auto-preencher
        </Text>
      </Card>

      {/* Binding Modal */}
      <Modal
        visible={bindingModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBindingModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Mapear Sensor</Text>

            {selectedSensor && (
              <Card style={{ marginBottom: 16, backgroundColor: Colors.primarySurface }}>
                <Text style={{ fontWeight: '600', color: Colors.primaryDark }}>
                  {selectedSensor.label}
                </Text>
                <Text style={{ fontSize: 13, color: Colors.textSecondary, marginTop: 2 }}>
                  Valor atual: {selectedSensor.value} {selectedSensor.unit}
                </Text>
              </Card>
            )}

            <Text style={styles.modalLabel}>
              Nome do campo no formulário de coleta:
            </Text>
            <TextInput
              style={styles.modalInput}
              value={fieldKeyInput}
              onChangeText={setFieldKeyInput}
              placeholder="Ex: temperatura_ar, co2, umidade_ar"
              placeholderTextColor={Colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.modalHint}>
              Use o mesmo nome do campo definido no schema de coleta do projeto.
            </Text>

            <View style={styles.modalActions}>
              <Button
                title="Cancelar"
                onPress={() => {
                  setBindingModalVisible(false);
                  setSelectedSensor(null);
                  setFieldKeyInput('');
                }}
                variant="secondary"
                style={{ flex: 1 }}
              />
              <Button
                title="Salvar"
                onPress={handleSaveBinding}
                style={{ flex: 1 }}
                disabled={!fieldKeyInput.trim()}
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ============================================================================
//  Estilos
// ============================================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  // Status
  statusCard: {
    borderWidth: 1,
  },
  statusConnected: {
    backgroundColor: '#d4edda',
    borderColor: '#c3e6cb',
  },
  statusDisconnected: {
    backgroundColor: '#f8d7da',
    borderColor: '#f5c6cb',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  statusDetail: {
    fontSize: 13,
    marginTop: 2,
  },
  // Connection
  connectionActions: {
    gap: 8,
  },
  connectedActions: {
    flexDirection: 'row',
    gap: 8,
  },
  // Error
  errorCard: {
    backgroundColor: Colors.errorLight,
    borderColor: Colors.error,
    borderWidth: 1,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: Colors.error,
  },
  // Sections
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clearAllText: {
    fontSize: 13,
    color: Colors.error,
    fontWeight: '600',
  },
  // Sensors
  sensorCard: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.border,
  },
  sensorCardMapped: {
    borderLeftColor: Colors.success,
  },
  sensorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  sensorLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  sensorId: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  sensorValueContainer: {
    alignItems: 'flex-end',
  },
  sensorValue: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.primary,
  },
  sensorUnit: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  notReadyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    backgroundColor: Colors.warningLight,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  notReadyText: {
    fontSize: 12,
    color: Colors.warning,
  },
  // Binding info inline
  bindingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    backgroundColor: Colors.successLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  bindingLabel: {
    fontSize: 13,
    color: '#155724',
  },
  // Binding cards
  bindingCard: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  bindingCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bindingCardSensor: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  bindingArrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  bindingCardField: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  // Empty states
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
    paddingHorizontal: 16,
  },
  // Info card
  infoCard: {
    backgroundColor: Colors.primarySurface,
    borderColor: Colors.primary,
    borderWidth: 1,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  infoText: {
    fontSize: 13,
    color: Colors.primaryDark,
    lineHeight: 22,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  modalHint: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 8,
    lineHeight: 18,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
});
