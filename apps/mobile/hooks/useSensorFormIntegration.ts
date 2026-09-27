import { useSensorBindings } from "@/hooks/useSensorBindings";
import { useBLE } from "@/hooks/useBLE";

/**
 * Helper para integrar auto-preenchimento de sensores num formulário
 */
export function useSensorFormIntegration() {
  const { bindings } = useSensorBindings();
  const { requestSensorData, connectedDevice } = useBLE();

  /**
   * Preencher valores de um formulário com dados dos sensores
   * @param formData - objeto atual do formulário
   * @returns objeto com campos preenchidos pelos sensores
   */
  const autoFillSensorData = async (
    formData: Record<string, any>
  ): Promise<Record<string, any>> => {
    if (!connectedDevice?.isConnected || bindings.length === 0) {
      return formData;
    }

    try {
      const sensorData = await requestSensorData();

      if (!sensorData) {
        console.warn("[SENSOR_FORM] Falha ao obter dados dos sensores");
        return formData;
      }

      const updated = { ...formData };

      // Iterar pelos sensores e preencher campos mapeados
      for (const sensor of sensorData.sensors) {
        const binding = bindings.find((b) => b.sensor_id === sensor.id);

        if (binding) {
          let value: any = sensor.value;

          // Converter para número se necessário
          if (sensor.type === "float" || sensor.type === "int") {
            value = parseFloat(String(value));
          }

          // Atribuir ao campo mapeado
          updated[binding.dataset_field_key] = value;

          console.log(
            `[SENSOR_FORM] Preenchido ${binding.dataset_field_key} = ${value}`
          );
        }
      }

      return updated;
    } catch (error) {
      console.error("[SENSOR_FORM] Erro ao preencher dados:", error);
      return formData;
    }
  };

  /**
   * Verificar se há sensores mapeados
   */
  const hasSensorBindings = () => bindings.length > 0;

  /**
   * Obter lista de campos que podem ser preenchidos automaticamente
   */
  const getAutoFillableFields = () => {
    return bindings.map((b) => ({
      fieldKey: b.dataset_field_key,
      sensorId: b.sensor_id,
      sensorLabel: b.sensor_label,
    }));
  };

  return {
    autoFillSensorData,
    hasSensorBindings,
    getAutoFillableFields,
    isConnected: connectedDevice?.isConnected || false,
  };
}
