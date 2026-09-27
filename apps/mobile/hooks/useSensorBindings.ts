import { useState, useCallback, useEffect } from "react";
import { getDatabase } from "@/database/database";
import { SensorBinding } from "@/types/ble";

/**
 * Hook para gerenciar o mapeamento entre sensores e campos do dataset
 * Persiste no SQLite (tabela sensor_bindings)
 */
export function useSensorBindings() {
  const [bindings, setBindings] = useState<SensorBinding[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Carregar bindings ao montar o hook
  useEffect(() => {
    loadBindings();
  }, []);

  const loadBindings = useCallback(async () => {
    try {
      setIsLoading(true);
      const db = await getDatabase();
      const rows = await db.getAllAsync<{
        sensor_id: string;
        sensor_label: string | null;
        dataset_field_key: string;
      }>(
        "SELECT sensor_id, sensor_label, dataset_field_key FROM sensor_bindings ORDER BY created_at"
      );
      setBindings(
        rows.map((r) => ({
          sensor_id: r.sensor_id,
          sensor_label: r.sensor_label ?? undefined,
          dataset_field_key: r.dataset_field_key,
        }))
      );
    } catch (error) {
      console.error("[BINDINGS] Erro ao carregar bindings:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addBinding = useCallback(
    async (binding: SensorBinding) => {
      try {
        const db = await getDatabase();
        await db.runAsync(
          "INSERT OR REPLACE INTO sensor_bindings (sensor_id, sensor_label, dataset_field_key) VALUES (?, ?, ?)",
          [binding.sensor_id, binding.sensor_label ?? '', binding.dataset_field_key]
        );
        setBindings((prev) => {
          const filtered = prev.filter((b) => b.sensor_id !== binding.sensor_id);
          return [...filtered, binding];
        });
      } catch (error) {
        console.error("[BINDINGS] Erro ao adicionar binding:", error);
        throw error;
      }
    },
    []
  );

  const updateBinding = useCallback(
    async (sensorId: string, newFieldKey: string) => {
      try {
        const db = await getDatabase();
        await db.runAsync(
          "UPDATE sensor_bindings SET dataset_field_key = ? WHERE sensor_id = ?",
          [newFieldKey, sensorId]
        );
        setBindings((prev) =>
          prev.map((b) =>
            b.sensor_id === sensorId ? { ...b, dataset_field_key: newFieldKey } : b
          )
        );
      } catch (error) {
        console.error("[BINDINGS] Erro ao atualizar binding:", error);
        throw error;
      }
    },
    []
  );

  const removeBinding = useCallback(
    async (sensorId: string) => {
      try {
        const db = await getDatabase();
        await db.runAsync(
          "DELETE FROM sensor_bindings WHERE sensor_id = ?",
          [sensorId]
        );
        setBindings((prev) => prev.filter((b) => b.sensor_id !== sensorId));
      } catch (error) {
        console.error("[BINDINGS] Erro ao remover binding:", error);
        throw error;
      }
    },
    []
  );

  const getBindingByFieldKey = useCallback(
    (fieldKey: string) => {
      return bindings.find((b) => b.dataset_field_key === fieldKey);
    },
    [bindings]
  );

  const getBindingBySensorId = useCallback(
    (sensorId: string) => {
      return bindings.find((b) => b.sensor_id === sensorId);
    },
    [bindings]
  );

  const clearAllBindings = useCallback(async () => {
    try {
      const db = await getDatabase();
      await db.runAsync("DELETE FROM sensor_bindings");
      setBindings([]);
    } catch (error) {
      console.error("[BINDINGS] Erro ao limpar bindings:", error);
      throw error;
    }
  }, []);

  return {
    bindings,
    isLoading,
    addBinding,
    updateBinding,
    removeBinding,
    getBindingByFieldKey,
    getBindingBySensorId,
    clearAllBindings,
    loadBindings,
  };
}
