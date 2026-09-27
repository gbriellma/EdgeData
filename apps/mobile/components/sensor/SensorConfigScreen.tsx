import React, { useState } from "react";
import { View, ScrollView, Alert } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useBLE } from "@/hooks/useBLE";
import { useSensorBindings } from "@/hooks/useSensorBindings";
import { BLEConnectionState } from "@/types/ble";
import { Colors } from "@/constants/colors";

/**
 * Tela de configuração de sensores BLE
 * Usuário pode descobrir e mapear sensores aqui
 */
export function SensorConfigScreen() {
  const [isConfiguring, setIsConfiguring] = useState(false);
  const {
    connectionState,
    connectedDevice,
    startScan,
    connectToDevice,
    disconnect,
  } = useBLE();
  const { bindings, clearAllBindings } = useSensorBindings();

  const handleStartSetup = async () => {
    try {
      setIsConfiguring(true);
      await startScan();
    } catch (error) {
      Alert.alert("Erro", "Falha ao iniciar configuração");
      console.error(error);
      setIsConfiguring(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      Alert.alert("Desconectado", "Dispositivo BLE desconectado");
    } catch (error) {
      Alert.alert("Erro", "Falha ao desconectar");
    }
  };

  const handleClearBindings = () => {
    Alert.alert(
      "Limpar Mapeamentos?",
      "Esta ação vai remover todos os mapeamentos de sensores.",
      [
        {
          text: "Cancelar",
          style: "cancel",
        },
        {
          text: "Limpar",
          style: "destructive",
          onPress: async () => {
            await clearAllBindings();
            Alert.alert("Sucesso", "Mapeamentos removidos");
          },
        },
      ]
    );
  };

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
          paddingBottom: 24,
        }}
      >
        {/* Title */}
        <ThemedText
          type="title"
          style={{
            marginBottom: 8,
          }}
        >
          Configuração de Sensores
        </ThemedText>

        <ThemedText
          style={{
            marginBottom: 24,
            color: Colors.textSecondary,
          }}
        >
          Configure seus sensores ESP32 para auto-preencher dados na coleta
        </ThemedText>

        {/* Status Card */}
        <Card
          style={{
            marginBottom: 24,
            backgroundColor:
              connectionState === BLEConnectionState.CONNECTED
                ? "#d4edda"
                : "#f8d7da",
          }}
        >
          <View
            style={{
              marginBottom: 12,
            }}
          >
            <ThemedText
              style={{
                fontWeight: "600",
                marginBottom: 4,
                color:
                  connectionState === BLEConnectionState.CONNECTED
                    ? "#155724"
                    : "#721c24",
              }}
            >
              {connectionState === BLEConnectionState.CONNECTED
                ? "✓ Conectado"
                : "✗ Não Conectado"}
            </ThemedText>

            {connectedDevice && (
              <ThemedText
                style={{
                  fontSize: 14,
                  color:
                    connectionState === BLEConnectionState.CONNECTED
                      ? "#155724"
                      : "#721c24",
                }}
              >
                Dispositivo: {connectedDevice.name}
              </ThemedText>
            )}
          </View>

          <ThemedText
            style={{
              fontSize: 12,
              color:
                connectionState === BLEConnectionState.CONNECTED
                  ? "#155724"
                  : "#721c24",
            }}
          >
            Estado: {connectionState}
          </ThemedText>
        </Card>

        {/* Connection Controls */}
        <View
          style={{
            marginBottom: 24,
            gap: 12,
          }}
        >
          {connectionState !== BLEConnectionState.CONNECTED ? (
            <Button
              title="Conectar a Dispositivo BLE"
              onPress={handleStartSetup}
              disabled={isConfiguring}
            />
          ) : (
            <Button
              title="Desconectar"
              onPress={handleDisconnect}
              variant="secondary"
            />
          )}
        </View>

        {/* Bindings Section */}
        <View
          style={{
            marginBottom: 24,
          }}
        >
          <ThemedText
            type="subtitle"
            style={{
              marginBottom: 12,
            }}
          >
            Sensores Mapeados ({bindings.length})
          </ThemedText>

          {bindings.length === 0 ? (
            <Card
              style={{
                backgroundColor: Colors.border,
              }}
            >
              <ThemedText
                style={{
                  textAlign: "center",
                  color: Colors.textSecondary,
                }}
              >
                Nenhum sensor mapeado ainda
              </ThemedText>
            </Card>
          ) : (
            <View>
              {bindings.map((binding, index) => (
                <Card
                  key={binding.sensor_id}
                  style={{
                    marginBottom: index === bindings.length - 1 ? 0 : 8,
                  }}
                >
                  <View
                    style={{
                      marginBottom: 8,
                    }}
                  >
                    <ThemedText
                      style={{
                        fontWeight: "600",
                        marginBottom: 4,
                      }}
                    >
                      {binding.sensor_label}
                    </ThemedText>
                    <ThemedText
                      style={{
                        fontSize: 12,
                        color: Colors.textSecondary,
                      }}
                    >
                      → {binding.dataset_field_key}
                    </ThemedText>
                  </View>
                  <ThemedText
                    style={{
                      fontSize: 11,
                      color: Colors.textSecondary,
                    }}
                  >
                    ID: {binding.sensor_id}
                  </ThemedText>
                </Card>
              ))}

              <Button
                title="Limpar Todos os Mapeamentos"
                onPress={handleClearBindings}
                variant="secondary"
                style={{
                  marginTop: 12,
                }}
              />
            </View>
          )}
        </View>

        {/* Info Section */}
        <Card
          style={{
            backgroundColor: "#e7f3ff",
          }}
        >
          <ThemedText
            style={{
              fontWeight: "600",
              marginBottom: 8,
              color: "#004085",
            }}
          >
            ℹ️ Como funciona
          </ThemedText>

          <ThemedText
            style={{
              fontSize: 12,
              color: "#004085",
              lineHeight: 18,
            }}
          >
            1. Conecte sua ESP32 com sensores I2C{"\n"}
            2. O aplicativo descobrirá os sensores disponíveis{"\n"}
            3. Mapeie cada sensor para um campo do seu dataset{"\n"}
            4. Durante a coleta, os dados serão preenchidos automaticamente
          </ThemedText>
        </Card>
      </ScrollView>
    </ThemedView>
  );
}
