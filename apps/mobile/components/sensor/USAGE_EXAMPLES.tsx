import React, { useState } from "react";
import { View, ScrollView, Alert } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SensorAutoFill } from "@/components/sensor/SensorAutoFill";
import { useSensorFormIntegration } from "@/hooks/useSensorFormIntegration";
import { Colors } from "@/constants/colors";

type SensorFormData = Record<string, number | null>;

/**
 * EXEMPLO DE CASO DE USO 1:
 * Integração em formulário dinâmico com campos opcionais
 */
export function DynamicFormWithSensorsExample() {
  const [formData, setFormData] = useState<SensorFormData>({
    oxigenio: null,
    co2: null,
    umidade_ar: null,
    temperatura_ar: null,
    ponto_orvalho: null,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedData, setSubmittedData] = useState<SensorFormData | null>(null);

  const { autoFillSensorData, hasSensorBindings, getAutoFillableFields } =
    useSensorFormIntegration();

  const handleManualInput = (fieldKey: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [fieldKey]: value ? parseFloat(value) : null,
    }));
  };

  const handleAutoFill = async () => {
    try {
      setIsSubmitting(true);
      const filled = await autoFillSensorData(formData);
      setFormData(filled as SensorFormData);
      Alert.alert("Sucesso", "Dados dos sensores carregados");
    } catch {
      Alert.alert("Erro", "Falha ao carregar dados dos sensores");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    const filledFields = Object.values(formData).filter((v) => v !== null);
    if (filledFields.length === 0) {
      Alert.alert("Aviso", "Preencha pelo menos um campo");
      return;
    }

    setIsSubmitting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setSubmittedData(formData);
      Alert.alert("Sucesso", "Formulário salvo com sucesso");
      setFormData({ oxigenio: null, co2: null, umidade_ar: null, temperatura_ar: null, ponto_orvalho: null });
    } catch {
      Alert.alert("Erro", "Falha ao salvar");
    } finally {
      setIsSubmitting(false);
    }
  };

  const autoFillableFields = getAutoFillableFields();

  return (
    <ThemedView style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView style={{ flex: 1, padding: 16 }} contentContainerStyle={{ paddingBottom: 24 }}>
        <ThemedText type="title" style={{ marginBottom: 8 }}>
          Coleta de Dados - Experimento
        </ThemedText>

        <ThemedText style={{ marginBottom: 24, color: Colors.textSecondary }}>
          Preencha os dados do experimento. Use "Atualizar Sensores" para auto-preencher campos com dispositivos BLE configurados.
        </ThemedText>

        {hasSensorBindings() && (
          <View style={{ marginBottom: 24 }}>
            <SensorAutoFill
              onDataFilled={(data) => {
                const updated: SensorFormData = { ...formData };
                for (const [key, val] of Object.entries(data)) {
                  if (Object.prototype.hasOwnProperty.call(updated, key)) {
                    updated[key] = typeof val === 'object' && val !== null
                      ? (val as { value: number | null }).value
                      : (val as number | null);
                  }
                }
                setFormData(updated);
              }}
              onError={(error) => Alert.alert("Erro", error)}
            />
            <Card style={{ marginTop: 12, backgroundColor: "#d4edda" }}>
              <ThemedText style={{ fontWeight: "600", marginBottom: 8, color: "#155724" }}>
                Campos Preencheníveis:
              </ThemedText>
              {autoFillableFields.map((field) => (
                <ThemedText key={field.fieldKey} style={{ fontSize: 12, color: "#155724", marginBottom: 4 }}>
                  • {field.fieldKey} ← {field.sensorLabel}
                </ThemedText>
              ))}
            </Card>
          </View>
        )}

        <View style={{ marginBottom: 24, gap: 16 }}>
          {Object.entries(formData).map(([fieldKey, value]) => {
            const binding = autoFillableFields.find((f) => f.fieldKey === fieldKey);
            return (
              <Card key={fieldKey}>
                <View style={{ marginBottom: 8 }}>
                  <ThemedText style={{ fontSize: 12, color: Colors.textSecondary, textTransform: "uppercase", fontWeight: "600", marginBottom: 4 }}>
                    {fieldKey}{binding ? " 📡" : ""}
                  </ThemedText>
                  {value !== null ? (
                    <View>
                      <ThemedText style={{ fontSize: 18, fontWeight: "600", color: Colors.primary, marginBottom: 8 }}>
                        {value}
                      </ThemedText>
                      <Button title="Limpar" onPress={() => handleManualInput(fieldKey, "")} variant="secondary" size="small" />
                    </View>
                  ) : (
                    <Input
                      placeholder="Digite um valor ou use sensores"
                      value=""
                      onChangeText={(val) => handleManualInput(fieldKey, val)}
                      keyboardType="decimal-pad"
                    />
                  )}
                </View>
              </Card>
            );
          })}
        </View>

        <Button title={isSubmitting ? "Salvando..." : "Salvar Coleta"} onPress={handleSubmit} disabled={isSubmitting} style={{ marginBottom: 12 }} />

        {submittedData && (
          <Card style={{ backgroundColor: "#d4edda" }}>
            <ThemedText style={{ fontWeight: "600", color: "#155724", marginBottom: 8 }}>
              Última coleta salva:
            </ThemedText>
            <ThemedText style={{ fontSize: 12, color: "#155724" }}>
              {JSON.stringify(submittedData, null, 2)}
            </ThemedText>
          </Card>
        )}
      </ScrollView>
    </ThemedView>
  );
}

/**
 * EXEMPLO DE CASO DE USO 2:
 * Integração em página de settings com debug
 */
export function SensorSettingsPageExample() {
  const [debugInfo, setDebugInfo] = useState<ReturnType<typeof getAutoFillableFields> | null>(null);
  const { getAutoFillableFields } = useSensorFormIntegration();

  return (
    <ThemedView style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView style={{ flex: 1, padding: 16 }} contentContainerStyle={{ paddingBottom: 24 }}>
        <ThemedText type="title" style={{ marginBottom: 8 }}>Sensor Settings</ThemedText>
        <ThemedText style={{ marginBottom: 24, color: Colors.textSecondary }}>
          Gerencie sua integração com sensores BLE
        </ThemedText>

        <Card style={{ backgroundColor: "#f0f0f0", marginBottom: 16 }}>
          <ThemedText style={{ fontWeight: "600", marginBottom: 8 }}>Debug Info</ThemedText>
          <Button
            title={debugInfo ? "Ocultar Info" : "Mostrar Info"}
            onPress={() => setDebugInfo(debugInfo ? null : getAutoFillableFields())}
            variant="secondary"
            size="small"
          />
          {debugInfo && (
            <ThemedText style={{ fontSize: 11, marginTop: 12, color: Colors.textSecondary }}>
              {JSON.stringify(debugInfo, null, 2)}
            </ThemedText>
          )}
        </Card>

        <ThemedText type="subtitle" style={{ marginBottom: 12 }}>Funcionalidades</ThemedText>
        <View style={{ gap: 8, marginBottom: 24 }}>
          {[
            "Conexão BLE automática",
            "Mapeamento dinâmico de sensores",
            "Auto-preenchimento de formulários",
            "Persistência de bindings",
            "Recuperação de erros",
          ].map((feature, idx) => (
            <Card key={idx}><ThemedText>✓ {feature}</ThemedText></Card>
          ))}
        </View>

        <ThemedText type="subtitle" style={{ marginBottom: 12 }}>Ações</ThemedText>
        <View style={{ gap: 8 }}>
          <Button title="Configurar Sensores" onPress={() => {}} />
          <Button title="Testar Conexão BLE" onPress={() => {}} variant="secondary" />
          <Button title="Limpar Mapeamentos" onPress={() => {}} variant="secondary" />
        </View>
      </ScrollView>
    </ThemedView>
  );
}

interface SchemaField { key: string; label: string; }
interface Schema { fields: SchemaField[]; }

/**
 * EXEMPLO DE CASO DE USO 3:
 * Hook customizado para usar em múltiplos componentes
 */
export function useFormWithSensors(initialSchema: Schema) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const { autoFillSensorData, hasSensorBindings } = useSensorFormIntegration();

  React.useEffect(() => {
    const initial: Record<string, null> = {};
    for (const field of initialSchema.fields) {
      initial[field.key] = null;
    }
    setFormData(initial);
  }, [initialSchema]);

  const fillFromSensors = async () => {
    const filled = await autoFillSensorData(formData);
    setFormData(filled);
  };

  const updateField = (fieldKey: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [fieldKey]: value }));
  };

  const resetForm = () => {
    const reset: Record<string, null> = {};
    for (const field of initialSchema.fields) {
      reset[field.key] = null;
    }
    setFormData(reset);
  };

  const getFilledCount = () => Object.values(formData).filter((v) => v !== null).length;

  return { formData, updateField, fillFromSensors, resetForm, getFilledCount, hasSensorBindings };
}

/**
 * EXEMPLO DE CASO DE USO 4:
 * Uso do hook customizado
 */
export function CollectionFormWithHookExample() {
  const schema: Schema = {
    fields: [
      { key: "oxigenio", label: "Oxigênio (%)" },
      { key: "co2", label: "CO₂ (ppm)" },
      { key: "umidade_ar", label: "Umidade Relativa (%)" },
      { key: "temperatura_ar", label: "Temperatura do Ar (°C)" },
      { key: "ponto_orvalho", label: "Ponto de Orvalho (°C)" },
    ],
  };

  const { formData, updateField, fillFromSensors, resetForm, getFilledCount, hasSensorBindings } =
    useFormWithSensors(schema);

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1, padding: 16 }}>
        <ThemedText type="title" style={{ marginBottom: 8 }}>Coleta Simplificada</ThemedText>
        <ThemedText style={{ marginBottom: 16, color: Colors.textSecondary }}>
          Campos preenchidos: {getFilledCount()} / {schema.fields.length}
        </ThemedText>

        {hasSensorBindings() && (
          <Button title="Auto-preencher com Sensores" onPress={fillFromSensors} style={{ marginBottom: 16 }} />
        )}

        {schema.fields.map((field) => (
          <Card key={field.key} style={{ marginBottom: 8 }}>
            <ThemedText style={{ fontWeight: "600", marginBottom: 4 }}>{field.label}</ThemedText>
            {formData[field.key] !== null ? (
              <ThemedText style={{ fontSize: 16, color: Colors.primary }}>
                {String(formData[field.key])}
              </ThemedText>
            ) : (
              <Input
                placeholder="Digite ou use sensores"
                onChangeText={(val) => updateField(field.key, val)}
                keyboardType="decimal-pad"
              />
            )}
          </Card>
        ))}

        <View style={{ gap: 8, marginTop: 16 }}>
          <Button title="Salvar" onPress={() => {}} />
          <Button title="Limpar" onPress={resetForm} variant="secondary" />
        </View>
      </ScrollView>
    </ThemedView>
  );
}
