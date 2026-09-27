import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { useProjectDetail } from '@/hooks/useProject';
import { useSubjects } from '@/hooks/useSubjects';
import { Schema, SchemaField } from '@/types/schema';

type Mode = 'sequential' | 'factorial';

export default function BatchSubjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { project } = useProjectDetail(id);
  const { importBatch } = useSubjects(id);

  const [mode, setMode] = useState<Mode>('sequential');
  const [saving, setSaving] = useState(false);

  // ── Sequential mode state ──
  const [seqPrefix, setSeqPrefix] = useState('');
  const [seqStart, setSeqStart] = useState('1');
  const [seqCount, setSeqCount] = useState('10');
  const [seqPadding, setSeqPadding] = useState('3');
  const [seqTargetField, setSeqTargetField] = useState<string>('');

  // ── Factorial mode state ──
  const [factorialValues, setFactorialValues] = useState<Record<string, string>>({});

  // ── Derived schema data (safe to compute even when project is null) ──
  const schema = useMemo<Schema | null>(() => {
    if (!project?.subject_schema) return null;
    try {
      return JSON.parse(project.subject_schema);
    } catch {
      return null;
    }
  }, [project?.subject_schema]);

  const textFields = useMemo(
    () => schema?.fields.filter((f) => f.type === 'short_text' || f.type === 'long_text') ?? [],
    [schema]
  );

  const factorialEligible = useMemo(
    () =>
      schema?.fields.filter(
        (f) => f.type === 'short_text' || f.type === 'category' || f.type === 'integer'
      ) ?? [],
    [schema]
  );

  // Default target field to first text field or 'nome' — via useEffect, never in render body
  useEffect(() => {
    if (seqTargetField || textFields.length === 0) return;
    const nome = textFields.find(
      (f) => f.name === 'nome' || f.name === 'name' || f.name === 'identificador'
    );
    setSeqTargetField(nome?.name ?? textFields[0].name);
  }, [textFields, seqTargetField]);

  // ── Sequential generation ──
  const generateSequential = useCallback((): Record<string, unknown>[] => {
    if (!schema) return [];
    const start = parseInt(seqStart, 10) || 1;
    const count = Math.min(parseInt(seqCount, 10) || 1, 5000);
    const padding = parseInt(seqPadding, 10) || 1;
    const prefix = seqPrefix.trim();

    const subjects: Record<string, unknown>[] = [];
    for (let i = 0; i < count; i++) {
      const num = (start + i).toString().padStart(padding, '0');
      const value = prefix ? `${prefix}_${num}` : num;
      const data: Record<string, unknown> = {};

      if (seqTargetField) {
        data[seqTargetField] = value;
      }

      schema.fields.forEach((f) => {
        if (f.type === 'boolean') {
          data[f.name] = f.config.defaultValue ?? false;
        }
      });

      subjects.push(data);
    }
    return subjects;
  }, [schema, seqStart, seqCount, seqPadding, seqPrefix, seqTargetField]);

  // ── Factorial generation ──
  const generateFactorial = useCallback((): Record<string, unknown>[] => {
    if (!schema) return [];
    const fieldArrays: { field: SchemaField; values: string[] }[] = [];

    for (const field of factorialEligible) {
      const raw = factorialValues[field.name];
      if (!raw || raw.trim() === '') continue;

      let values: string[];
      if (field.type === 'category' && field.config.options) {
        if (raw.trim() === '*') {
          values = [...field.config.options];
        } else {
          values = raw.split(',').map((v) => v.trim()).filter(Boolean);
        }
      } else {
        values = raw.split(',').map((v) => v.trim()).filter(Boolean);
      }

      if (values.length > 0) {
        fieldArrays.push({ field, values });
      }
    }

    if (fieldArrays.length === 0) return [];

    const totalCombinations = fieldArrays.reduce((acc, fa) => acc * fa.values.length, 1);
    if (totalCombinations > 5000) return [];

    const subjects: Record<string, unknown>[] = [];
    const indices = new Array(fieldArrays.length).fill(0);

    for (let i = 0; i < totalCombinations; i++) {
      const data: Record<string, unknown> = {};

      for (let j = 0; j < fieldArrays.length; j++) {
        const { field, values } = fieldArrays[j];
        const value = values[indices[j]];
        if (field.type === 'integer') {
          data[field.name] = parseInt(value, 10) || 0;
        } else {
          data[field.name] = value;
        }
      }

      const nomeField = schema.fields.find(
        (f) => f.name === 'nome' || f.name === 'name'
      );
      if (nomeField && !data[nomeField.name]) {
        data[nomeField.name] = fieldArrays
          .map((fa, idx) => fa.values[indices[idx]])
          .join('_');
      }

      schema.fields.forEach((f) => {
        if (f.type === 'boolean') {
          data[f.name] = f.config.defaultValue ?? false;
        }
      });

      subjects.push(data);

      for (let j = fieldArrays.length - 1; j >= 0; j--) {
        indices[j]++;
        if (indices[j] < fieldArrays[j].values.length) break;
        indices[j] = 0;
      }
    }

    return subjects;
  }, [schema, factorialEligible, factorialValues]);

  const previewCount = useMemo(() => {
    if (mode === 'sequential') {
      return Math.min(parseInt(seqCount, 10) || 0, 5000);
    }
    const arrays: number[] = [];
    for (const field of factorialEligible) {
      const raw = factorialValues[field.name];
      if (!raw || raw.trim() === '') continue;
      let count: number;
      if (field.type === 'category' && field.config.options && raw.trim() === '*') {
        count = field.config.options.length;
      } else {
        count = raw.split(',').filter((v) => v.trim()).length;
      }
      if (count > 0) arrays.push(count);
    }
    const total = arrays.length > 0 ? arrays.reduce((a, b) => a * b, 1) : 0;
    return Math.min(total, 5000);
  }, [mode, seqCount, factorialValues, factorialEligible]);

  // ── Early return AFTER all hooks ──
  if (!project || !schema) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const handleGenerate = async () => {
    let subjects: Record<string, unknown>[];
    if (mode === 'sequential') {
      subjects = generateSequential();
    } else {
      subjects = generateFactorial();
    }

    if (subjects.length === 0) {
      Alert.alert('Nenhum sujeito', 'Configure os valores para gerar sujeitos.');
      return;
    }

    if (subjects.length > 500) {
      Alert.alert(
        'Muitos sujeitos',
        `Serão criados ${subjects.length} sujeitos. Continuar?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Continuar', onPress: () => doImport(subjects) },
        ]
      );
      return;
    }

    doImport(subjects);
  };

  const doImport = async (subjects: Record<string, unknown>[]) => {
    setSaving(true);
    try {
      const ids = await importBatch(subjects);
      Alert.alert(
        'Sucesso',
        `${ids.length} sujeito${ids.length !== 1 ? 's' : ''} criado${ids.length !== 1 ? 's' : ''}.`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao criar sujeitos';
      Alert.alert('Erro', message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Mode selector */}
      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'sequential' && styles.modeBtnActive]}
          onPress={() => setMode('sequential')}
        >
          <Ionicons
            name="list-outline"
            size={20}
            color={mode === 'sequential' ? Colors.white : Colors.primary}
          />
          <Text style={[styles.modeText, mode === 'sequential' && styles.modeTextActive]}>
            Sequencial
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'factorial' && styles.modeBtnActive]}
          onPress={() => setMode('factorial')}
        >
          <Ionicons
            name="grid-outline"
            size={20}
            color={mode === 'factorial' ? Colors.white : Colors.primary}
          />
          <Text style={[styles.modeText, mode === 'factorial' && styles.modeTextActive]}>
            Fatorial
          </Text>
        </TouchableOpacity>
      </View>

      {/* Sequential mode */}
      {mode === 'sequential' && (
        <Card style={styles.formCard}>
          <Text style={styles.cardTitle}>Geração Sequencial</Text>
          <Text style={styles.cardDesc}>
            Cria sujeitos com numeração automática. Ex: Planta_001, Planta_002...
          </Text>

          {textFields.length > 1 && (
            <>
              <Text style={styles.fieldLabel}>Campo destino</Text>
              <View style={styles.chipRow}>
                {textFields.map((f) => (
                  <TouchableOpacity
                    key={f.name}
                    style={[styles.chip, seqTargetField === f.name && styles.chipActive]}
                    onPress={() => setSeqTargetField(f.name)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        seqTargetField === f.name && styles.chipTextActive,
                      ]}
                    >
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <Input
            label="Prefixo"
            placeholder="Ex: Planta, Amostra, Parcela"
            value={seqPrefix}
            onChangeText={setSeqPrefix}
          />

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Input
                label="Início"
                placeholder="1"
                value={seqStart}
                onChangeText={setSeqStart}
                keyboardType="number-pad"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label="Quantidade"
                placeholder="10"
                value={seqCount}
                onChangeText={setSeqCount}
                keyboardType="number-pad"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label="Dígitos"
                placeholder="3"
                value={seqPadding}
                onChangeText={setSeqPadding}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <View style={styles.previewBox}>
            <Text style={styles.previewLabel}>Preview:</Text>
            <Text style={styles.previewText}>
              {(() => {
                const start = parseInt(seqStart, 10) || 1;
                const padding = parseInt(seqPadding, 10) || 1;
                const prefix = seqPrefix.trim();
                const examples = [0, 1, 2].map((i) => {
                  const num = (start + i).toString().padStart(padding, '0');
                  return prefix ? `${prefix}_${num}` : num;
                });
                return `${examples.join(', ')}...`;
              })()}
            </Text>
          </View>
        </Card>
      )}

      {/* Factorial mode */}
      {mode === 'factorial' && (
        <Card style={styles.formCard}>
          <Text style={styles.cardTitle}>Geração Fatorial</Text>
          <Text style={styles.cardDesc}>
            Define valores para cada campo e gera todas as combinações possíveis.
            Separe valores por vírgula. Para campos de categoria, use * para incluir todas as opções.
          </Text>

          {factorialEligible.map((field) => (
            <View key={field.name} style={styles.factorialField}>
              <View style={styles.factorialHeader}>
                <Text style={styles.factorialLabel}>{field.label}</Text>
                <Text style={styles.factorialType}>
                  {field.type === 'category' ? 'categoria' : field.type}
                </Text>
              </View>
              {field.type === 'category' && field.config.options && (
                <View style={styles.optionHint}>
                  <Text style={styles.optionHintText}>
                    Opções: {field.config.options.join(', ')}
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      setFactorialValues((prev) => ({
                        ...prev,
                        [field.name]: '*',
                      }))
                    }
                  >
                    <Text style={styles.useAllBtn}>Usar todas</Text>
                  </TouchableOpacity>
                </View>
              )}
              <Input
                placeholder={
                  field.type === 'category'
                    ? 'valor1, valor2 ou *'
                    : field.type === 'integer'
                    ? '1, 2, 3'
                    : 'valor1, valor2, valor3'
                }
                value={factorialValues[field.name] ?? ''}
                onChangeText={(text) =>
                  setFactorialValues((prev) => ({ ...prev, [field.name]: text }))
                }
              />
            </View>
          ))}

          {factorialEligible.length === 0 && (
            <Text style={styles.noFieldsText}>
              Nenhum campo de texto, categoria ou inteiro no schema de sujeitos.
            </Text>
          )}
        </Card>
      )}

      {/* Count + Generate */}
      <Card style={styles.resultCard}>
        <View style={styles.resultRow}>
          <Ionicons name="people-outline" size={24} color={Colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.resultCount}>{previewCount}</Text>
            <Text style={styles.resultLabel}>
              sujeito{previewCount !== 1 ? 's' : ''} {previewCount !== 1 ? 'serão' : 'será'} criado{previewCount !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
        <Button
          title={saving ? 'Criando...' : `Criar ${previewCount} Sujeito${previewCount !== 1 ? 's' : ''}`}
          onPress={handleGenerate}
          size="large"
          loading={saving}
          disabled={saving || previewCount === 0}
          icon={<Ionicons name="rocket-outline" size={20} color={Colors.white} />}
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.primarySurface,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  modeBtnActive: {
    backgroundColor: Colors.primary,
  },
  modeText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.primary,
  },
  modeTextActive: {
    color: Colors.white,
  },
  formCard: {
    gap: 12,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  cardDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.text,
  },
  chipTextActive: {
    color: Colors.white,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  previewBox: {
    backgroundColor: Colors.primarySurface,
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  previewText: {
    fontSize: 14,
    color: Colors.text,
    fontFamily: 'monospace',
  },
  factorialField: {
    gap: 4,
  },
  factorialHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  factorialLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  factorialType: {
    fontSize: 11,
    color: Colors.textSecondary,
    backgroundColor: Colors.border,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  optionHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionHintText: {
    fontSize: 12,
    color: Colors.textSecondary,
    flex: 1,
  },
  useAllBtn: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
    paddingHorizontal: 8,
  },
  noFieldsText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 16,
  },
  resultCard: {
    gap: 16,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  resultCount: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.primary,
  },
  resultLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
});
