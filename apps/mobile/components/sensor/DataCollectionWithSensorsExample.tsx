import React, { useState } from "react";
import { View, Alert, ScrollView } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SensorAutoFill } from "@/components/sensor/SensorAutoFill";
import { useSensorFormIntegration } from "@/hooks/useSensorFormIntegration";
import { Colors } from "@/constants/colors";

/**
 * Exemplo de tela de coleta com integração de sensores
 * Use este componente como referência para integrar em suas telas
 */
export function DataCollectionWithSensorsExample() {
  const [formData, setFormData] = useState<Record<string, number | null>>({
    oxigenio: null,
    co2: null,
    umidade_ar: null,
    temperatura_ar: null,
    ponto_orvalho: null,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const { autoFillSensorData, hasSensorBindings, getAutoFillableFields } =
    useSensorFormIntegration();

  const handleAutoFill = async () => {
    try {
      setIsSubmitting(true);
      const filled = await autoFillSensorData(formData);
      setFormData(filled as Record<string, number | null>);
      Alert.alert("Sucesso", "Dados dos sensores carregados");
    } catch (error) {
      Alert.alert("Erro", "Falha ao carregar dados dos sensores");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!Object.values(formData).some((v) => v !== null)) {
      Alert.alert("Erro", "Preencha pelo menos um campo");
      return;
    }

    console.log("[SUBMIT] Dados do formulário:", formData);
    Alert.alert("Sucesso", "Dados coletados com sucesso");

    setFormData({
      oxigenio: null,
      co2: null,
      umidade_ar: null,
      temperatura_ar: null,
      ponto_orvalho: null,
    });
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
        <ThemedText
          type="title"
          style={{
            marginBottom: 8,
          }}
        >
          Coleta de Dados
        </ThemedText>

        <ThemedText
          style={{
            marginBottom: 24,
            color: Colors.textSecondary,
          }}
        >
          Preencha os dados do sujeito. Os sensores podem preencher automaticamente.
        </ThemedText>

        {hasSensorBindings() && (
          <View
            style={{
              marginBottom: 24,
            }}
          >
            <SensorAutoFill
              isEnabled={true}
              onDataFilled={(data) => {
                const updated: Record<string, number | null> = { ...formData };
                for (const [key, val] of Object.entries(data)) {
                  updated[key] = typeof val === 'object' && val !== null
                    ? (val as { value: number | null }).value
                    : (val as number | null);
                }
                setFormData(updated);
              }}
              onError={(error) => {
                Alert.alert("Erro", error);
              }}
            />
          </View>
        )}

        <View
          style={{
            marginBottom: 24,
            gap: 16,
          }}
        >
          {Object.entries(formData).map(([fieldKey, value]) => (
            <Card key={fieldKey}>
              <View>
                <ThemedText
                  style={{
                    fontSize: 12,
                    color: Colors.textSecondary,
                    marginBottom: 4,
                    textTransform: "uppercase",
                  }}
                >
                  {fieldKey}
                </ThemedText>

                <ThemedText
                  style={{
                    fontSize: 18,
                    fontWeight: "600",
                    color: value !== null ? Colors.primary : Colors.textSecondary,
                  }}
                >
                  {value !== null ? String(value) : "Não preenchido"}
                </ThemedText>

                {value !== null && (
                  <ThemedText
                    style={{
                      fontSize: 11,
                      color: Colors.success,
                      marginTop: 4,
                    }}
                  >
                    ✓ Preenchido
                  </ThemedText>
                )}
              </View>
            </Card>
          ))}
        </View>

        {hasSensorBindings() && (
          <Card
            style={{
              backgroundColor: "#d4edda",
              marginBottom: 24,
            }}
          >
            <ThemedText
              style={{
                fontWeight: "600",
                marginBottom: 8,
                color: "#155724",
              }}
            >
              Campos Auto-Preencheníveis
            </ThemedText>

            {getAutoFillableFields().map((field) => (
              <ThemedText
                key={field.fieldKey}
                style={{
                  fontSize: 12,
                  color: "#155724",
                  marginBottom: 4,
                }}
              >
                • {field.fieldKey} ← {field.sensorLabel}
              </ThemedText>
            ))}
          </Card>
        )}

        <View
          style={{
            gap: 12,
          }}
        >
          {hasSensorBindings() && (
            <Button
              title={isSubmitting ? "Carregando..." : "Atualizar Sensores"}
              onPress={handleAutoFill}
              disabled={isSubmitting}
              variant="secondary"
            />
          )}

          <Button
            title="Salvar Coleta"
            onPress={handleSubmit}
            disabled={isSubmitting}
          />
        </View>
      </ScrollView>
    </ThemedView>
  );
}
