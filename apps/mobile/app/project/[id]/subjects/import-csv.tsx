import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors } from '@/constants/colors';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useProjectDetail } from '@/hooks/useProject';
import { useSubjects } from '@/hooks/useSubjects';
import { parseCSV } from '@/utils/csv-parser';
import { Schema } from '@/types/schema';

export default function ImportCSVScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { project } = useProjectDetail(id);
  const { importBatch } = useSubjects(id);

  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState(false);

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/octet-stream'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];
      setFileName(file.name);

      const content = await FileSystem.readAsStringAsync(file.uri);
      const parsed = parseCSV(content);

      if (parsed.rows.length === 0) {
        Alert.alert('Arquivo vazio', 'O CSV não contém dados para importar.');
        return;
      }

      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setPreview(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao ler arquivo';
      Alert.alert('Erro', message);
    }
  };

  const handleImport = async () => {
    if (!project || rows.length === 0) return;

    const schema: Schema = JSON.parse(project.subject_schema);
    const schemaFieldNames = schema.fields.map((f) => f.name);

    // Map CSV columns to schema fields
    const dataList: Record<string, unknown>[] = rows.map((row) => {
      const data: Record<string, unknown> = {};
      schemaFieldNames.forEach((fieldName) => {
        const field = schema.fields.find((f) => f.name === fieldName);
        if (!field) return;

        // Try to match by field name or label (case-insensitive)
        let csvValue: string | undefined;
        for (const header of headers) {
          if (
            header.toLowerCase() === fieldName.toLowerCase() ||
            header.toLowerCase() === field.label.toLowerCase()
          ) {
            csvValue = row[header];
            break;
          }
        }

        if (csvValue === undefined || csvValue === '') return;

        // Convert types
        if (field.type === 'integer') {
          const n = parseInt(csvValue, 10);
          if (!isNaN(n)) data[fieldName] = n;
        } else if (field.type === 'decimal') {
          const n = parseFloat(csvValue.replace(',', '.'));
          if (!isNaN(n)) data[fieldName] = n;
        } else if (field.type === 'boolean') {
          data[fieldName] = ['true', '1', 'sim', 'yes', 's', 'v'].includes(
            csvValue.toLowerCase()
          );
        } else if (field.type === 'multi_category') {
          data[fieldName] = csvValue.split(';').map((v) => v.trim());
        } else {
          data[fieldName] = csvValue;
        }
      });
      return data;
    });

    setImporting(true);
    try {
      const ids = await importBatch(dataList);
      Alert.alert(
        'Importação concluída',
        `${ids.length} sujeitos importados com sucesso.`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao importar';
      Alert.alert('Erro', message);
    } finally {
      setImporting(false);
    }
  };

  if (!project) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const schema: Schema = JSON.parse(project.subject_schema);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {!preview ? (
        <>
          <View style={styles.dropZone}>
            <Ionicons name="document-text-outline" size={48} color={Colors.primary} />
            <Text style={styles.dropTitle}>Importar arquivo CSV</Text>
            <Text style={styles.dropDesc}>
              O CSV deve ter colunas com os mesmos nomes dos campos do schema de sujeito.
            </Text>
            <Button
              title="Selecionar Arquivo"
              onPress={handlePickFile}
              variant="outline"
              style={styles.button}
              icon={<Ionicons name="folder-open-outline" size={18} color={Colors.primary} />}
            />
          </View>

          <Card style={styles.hintCard}>
            <Text style={styles.hintTitle}>Campos esperados:</Text>
            {schema.fields
              .sort((a, b) => a.order - b.order)
              .map((field) => (
                <Text key={field.name} style={styles.hintField}>
                  • {field.label} ({field.name}){field.required ? ' *' : ''}
                </Text>
              ))}
          </Card>
        </>
      ) : (
        <>
          <Card style={styles.fileCard}>
            <Ionicons name="document-text" size={24} color={Colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.fileName}>{fileName}</Text>
              <Text style={styles.fileInfo}>
                {rows.length} linha{rows.length !== 1 ? 's' : ''} • {headers.length} coluna{headers.length !== 1 ? 's' : ''}
              </Text>
            </View>
            <Button
              title="Trocar"
              onPress={() => {
                setPreview(false);
                setHeaders([]);
                setRows([]);
                setFileName(null);
              }}
              variant="outline"
              size="small"
            />
          </Card>

          <Card style={styles.mappingCard}>
            <Text style={styles.mappingTitle}>Mapeamento de colunas</Text>
            {schema.fields
              .sort((a, b) => a.order - b.order)
              .map((field) => {
                const matched = headers.some(
                  (h) =>
                    h.toLowerCase() === field.name.toLowerCase() ||
                    h.toLowerCase() === field.label.toLowerCase()
                );
                return (
                  <View key={field.name} style={styles.mappingRow}>
                    <Ionicons
                      name={matched ? 'checkmark-circle' : 'alert-circle'}
                      size={18}
                      color={matched ? Colors.primary : Colors.warning}
                    />
                    <Text style={styles.mappingField}>{field.label}</Text>
                    <Text
                      style={[
                        styles.mappingStatus,
                        matched ? styles.mappingMatched : styles.mappingMissing,
                      ]}
                    >
                      {matched ? 'Encontrado' : 'Não encontrado'}
                    </Text>
                  </View>
                );
              })}
          </Card>

          <Card style={styles.previewCard}>
            <Text style={styles.previewTitle}>
              Preview (primeiras {Math.min(3, rows.length)} linhas)
            </Text>
            {rows.slice(0, 3).map((row, i) => (
              <View key={i} style={styles.previewRow}>
                <Text style={styles.previewIndex}>#{i + 1}</Text>
                <Text style={styles.previewData} numberOfLines={2}>
                  {Object.entries(row)
                    .slice(0, 3)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(' | ')}
                </Text>
              </View>
            ))}
          </Card>

          <Button
            title={`Importar ${rows.length} Sujeito${rows.length !== 1 ? 's' : ''}`}
            onPress={handleImport}
            size="large"
            loading={importing}
            disabled={importing}
            icon={<Ionicons name="cloud-upload-outline" size={20} color={Colors.white} />}
          />
        </>
      )}
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
  dropZone: {
    backgroundColor: Colors.primarySurface,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: Colors.primary,
    gap: 12,
  },
  dropTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  dropDesc: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    marginTop: 8,
  },
  hintCard: {
    gap: 8,
  },
  hintTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  hintField: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fileName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  fileInfo: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  mappingCard: {
    gap: 8,
  },
  mappingTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  mappingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  mappingField: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
  },
  mappingStatus: {
    fontSize: 12,
    fontWeight: '500',
  },
  mappingMatched: {
    color: Colors.primary,
  },
  mappingMissing: {
    color: Colors.warning,
  },
  previewCard: {
    gap: 8,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  previewIndex: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
    width: 28,
  },
  previewData: {
    flex: 1,
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
});
