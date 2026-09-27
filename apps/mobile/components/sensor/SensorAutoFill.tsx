import React from "react";
import { View, ActivityIndicator } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useBLE } from "@/hooks/useBLE";
import { useSensorBindings } from "@/hooks/useSensorBindings";
import { Colors } from "@/constants/colors";

interface SensorAutoFillProps {
  isEnabled?: boolean;
  onDataFilled?: (data: Record<string, any>) => void;
  onError?: (error: string) => void;
}

/**
 * Componente para auto-preencher campos com dados dos sensores
 * Usado durante a coleta de dados de um sujeito
 */
export function SensorAutoFill({
  isEnabled = true,
  onDataFilled,
  onError,
}: SensorAutoFillProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const { requestSensorData, connectedDevice, connectionState } = useBLE();
  const { bindings, getBindingByFieldKey } = useSensorBindings();

  const fetchAndFillData = async () => {
    if (!connectedDevice?.isConnected) {
      const msg = "Dispositivo BLE não conectado";
      onError?.(msg);
      return;
    }

    if (bindings.length === 0) {
      const msg = "Nenhum sensor mapeado. Configure os sensores primeiro.";
      onError?.(msg);
      return;
    }

    setIsLoading(true);
    try {
      const sensorData = await requestSensorData();

      if (!sensorData) {
        throw new Error("Falha ao obter dados dos sensores");
      }

      // Montar objeto com dados preenchidos
      const filledData: Record<string, any> = {};

      for (const sensor of sensorData.sensors) {
        const binding = bindings.find((b) => b.sensor_id === sensor.id);

        if (binding) {
          // Converter valor para número se for float/int
          let value: any = sensor.value;

          if (sensor.type === "float" || sensor.type === "int") {
            value = parseFloat(String(value));
          }

          filledData[binding.dataset_field_key] = {
            value,
            sensor_id: sensor.id,
            sensor_label: sensor.label,
            unit: sensor.unit,
            timestamp: new Date().toISOString(),
          };
        }
      }

      onDataFilled?.(filledData);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido";
      onError?.(message);
      console.error("[AUTOFILL] Erro:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isEnabled) {
    return null;
  }

  return (
    <ThemedView>
      <Card
        style={{
          backgroundColor:
            connectedDevice?.isConnected && bindings.length > 0
              ? "#d4edda"
              : "#fff3cd",
        }}
      >
        {/* Status */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <View>
            <ThemedText
              style={{
                fontWeight: "600",
                marginBottom: 4,
              }}
            >
              {connectedDevice?.isConnected ? "✓ Sensores Conectados" : "Sensores Offline"}
            </ThemedText>
            <ThemedText
              style={{
                fontSize: 12,
                color: Colors.textSecondary,
              }}
            >
              {bindings.length} sensor(es) mapeado(s)
            </ThemedText>
          </View>
        </View>

        {/* Botão de atualizar */}
        <Button
          title={isLoading ? "Atualizando..." : "Atualizar Dados dos Sensores"}
          onPress={fetchAndFillData}
          disabled={
            isLoading ||
            !connectedDevice?.isConnected ||
            bindings.length === 0
          }
          size="small"
        />

        {/* Mensagens de status */}
        {!connectedDevice?.isConnected && (
          <ThemedText
            style={{
              fontSize: 12,
              color: "#856404",
              marginTop: 8,
            }}
          >
            Conecte a um dispositivo BLE para auto-preencher os dados.
          </ThemedText>
        )}

        {connectedDevice?.isConnected && bindings.length === 0 && (
          <ThemedText
            style={{
              fontSize: 12,
              color: "#856404",
              marginTop: 8,
            }}
          >
            Configure os sensores nas configurações antes de usar esta funcionalidade.
          </ThemedText>
        )}
      </Card>
    </ThemedView>
  );
}
