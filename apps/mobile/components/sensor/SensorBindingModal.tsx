import React, { useState, useEffect } from "react";
import {
  View,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from "react-native";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useBLE } from "@/hooks/useBLE";
import { useSensorBindings } from "@/hooks/useSensorBindings";
import { SensorData } from "@/types/ble";
import { Colors } from "@/constants/colors";

interface SensorBindingModalProps {
  isVisible: boolean;
  onClose: () => void;
  onBindingComplete?: () => void;
}

/**
 * Componente para descobrir sensores e fazer binding com campos do dataset
 */
export function SensorBindingModal({
  isVisible,
  onClose,
  onBindingComplete,
}: SensorBindingModalProps) {
  const [sensors, setSensors] = useState<SensorData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { requestSensorData, connectionState, connectedDevice } = useBLE();
  const { bindings, addBinding, removeBinding } = useSensorBindings();

  const fetchSensors = async () => {
    setIsLoading(true);
    try {
      const data = await requestSensorData();
      if (data) {
        setSensors(data.sensors);
      } else {
        Alert.alert(
          "Erro",
          "Não foi possível obter dados dos sensores. Verifique a conexão BLE."
        );
      }
    } catch (error) {
      Alert.alert("Erro", "Falha ao buscar sensores");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isVisible && connectedDevice) {
      fetchSensors();
    }
  }, [isVisible]);

  const getBinding = (sensorId: string) => {
    return bindings.find((b) => b.sensor_id === sensorId);
  };

  const handleBindSensor = (sensor: SensorData) => {
    Alert.prompt(
      "Mapear Sensor",
      `Atribuir "${sensor.label}" a qual campo?`,
      [
        {
          text: "Cancelar",
          onPress: () => {},
          style: "cancel",
        },
        {
          text: "Ok",
          onPress: async (fieldKey: string | undefined) => {
            if (fieldKey) {
              const binding = {
                sensor_id: sensor.id,
                dataset_field_key: fieldKey,
                sensor_label: sensor.label,
              };
              await addBinding(binding);
              Alert.alert("Sucesso", "Sensor mapeado com sucesso");
            }
          },
        },
      ],
      "plain-text"
    );
  };

  const handleUnbindSensor = async (sensorId: string) => {
    await removeBinding(sensorId);
    Alert.alert("Mapeamento removido");
  };

  if (!isVisible) {
    return null;
  }

  return (
    <ThemedView
      style={{
        flex: 1,
        backgroundColor: Colors.background,
      }}
    >
      <ScrollView
        style={{
          flex: 1,
          padding: 16,
        }}
        contentContainerStyle={{
          paddingBottom: 100,
        }}
      >
        {/* Header */}
        <ThemedText
          type="title"
          style={{
            marginBottom: 8,
          }}
        >
          Configurar Sensores
        </ThemedText>

        <ThemedText
          style={{
            marginBottom: 16,
            color: Colors.textSecondary,
          }}
        >
          Conecte sua ESP32 e mapeie os sensores para os campos do dataset
        </ThemedText>

        {/* Status da conexão */}
        <Card
          style={{
            marginBottom: 16,
            backgroundColor:
              connectedDevice?.isConnected ? "#d4edda" : "#f8d7da",
          }}
        >
          <ThemedText
            style={{
              color: connectedDevice?.isConnected ? "#155724" : "#721c24",
              fontWeight: "600",
            }}
          >
            {connectedDevice?.isConnected
              ? `✓ Conectado: ${connectedDevice.name}`
              : "✗ Não conectado"}
          </ThemedText>
        </Card>

        {/* Botão para buscar sensores */}
        <Button
          title={isLoading ? "Buscando..." : "Atualizar Sensores"}
          onPress={fetchSensors}
          disabled={isLoading || !connectedDevice?.isConnected}
          style={{
            marginBottom: 16,
          }}
        />

        {/* Lista de sensores */}
        {isLoading ? (
          <ActivityIndicator size="large" color={Colors.primary} />
        ) : sensors.length === 0 ? (
          <ThemedText
            style={{
              textAlign: "center",
              color: Colors.textSecondary,
              marginVertical: 32,
            }}
          >
            Nenhum sensor encontrado. Pressione "Atualizar Sensores".
          </ThemedText>
        ) : (
          <View>
            <ThemedText
              type="subtitle"
              style={{
                marginBottom: 12,
              }}
            >
              Sensores Disponíveis ({sensors.length})
            </ThemedText>

            {sensors.map((sensor) => {
              const binding = getBinding(sensor.id);

              return (
                <Card
                  key={sensor.id}
                  style={{
                    marginBottom: 12,
                    borderLeftWidth: 4,
                    borderLeftColor: binding
                      ? Colors.success
                      : Colors.border,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: 8,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <ThemedText
                        style={{
                          fontWeight: "600",
                          marginBottom: 4,
                        }}
                      >
                        {sensor.label}
                      </ThemedText>
                      <ThemedText
                        style={{
                          fontSize: 12,
                          color: Colors.textSecondary,
                        }}
                      >
                        ID: {sensor.id}
                      </ThemedText>
                    </View>
                    <ThemedText
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: Colors.primary,
                      }}
                    >
                      {sensor.value} {sensor.unit}
                    </ThemedText>
                  </View>

                  {binding ? (
                    <View
                      style={{
                        backgroundColor: "#d4edda",
                        padding: 8,
                        borderRadius: 4,
                        marginBottom: 8,
                      }}
                    >
                      <ThemedText
                        style={{
                          fontSize: 12,
                          color: "#155724",
                          marginBottom: 8,
                        }}
                      >
                        ✓ Mapeado para: {binding.dataset_field_key}
                      </ThemedText>

                      <TouchableOpacity
                        onPress={() => handleUnbindSensor(sensor.id)}
                      >
                        <ThemedText
                          style={{
                            fontSize: 12,
                            color: "#155724",
                            textDecorationLine: "underline",
                            fontWeight: "600",
                          }}
                        >
                          Remover Mapeamento
                        </ThemedText>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Button
                      title="Mapear para Campo"
                      onPress={() => handleBindSensor(sensor)}
                      variant="secondary"
                      size="small"
                    />
                  )}
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Footer */}
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: Colors.background,
          borderTopWidth: 1,
          borderTopColor: Colors.border,
          padding: 16,
          flexDirection: "row",
          gap: 12,
        }}
      >
        <Button
          title="Fechar"
          onPress={onClose}
          variant="secondary"
          style={{
            flex: 1,
          }}
        />
        <Button
          title="Concluído"
          onPress={() => {
            onBindingComplete?.();
            onClose();
          }}
          style={{
            flex: 1,
          }}
        />
      </View>
    </ThemedView>
  );
}
