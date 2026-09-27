import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { Colors } from '@/constants/colors';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useProjectDetail } from '@/hooks/useProject';
import { useSubjects } from '@/hooks/useSubjects';
import { getSubjectDisplayLabel } from '@/utils/formatters';
import { Schema } from '@/types/schema';
import { generateQRLabelPDF } from '@/components/qrcode/QRLabelSheet';

export default function QRCodesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { project } = useProjectDetail(id);
  const { subjects, loading, refresh, markQR } = useSubjects(id);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  if (loading && subjects.length === 0) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (subjects.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          title="Nenhum sujeito cadastrado"
          description="Cadastre sujeitos primeiro para gerar QR Codes."
        />
      </View>
    );
  }

  const schema: Schema = project ? JSON.parse(project.subject_schema) : { fields: [] };
  const fieldNames = schema.fields.map((f) => f.name);

  const toggleSelect = (subjectId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(subjectId)) {
        next.delete(subjectId);
      } else {
        next.add(subjectId);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === subjects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(subjects.map((s) => s.id)));
    }
  };

  const handleGenerate = async () => {
    if (selectedIds.size === 0) {
      Alert.alert('Seleção vazia', 'Selecione pelo menos um sujeito para gerar QR Codes.');
      return;
    }

    setGenerating(true);
    try {
      const selectedSubjects = subjects
        .filter((s) => selectedIds.has(s.id))
        .map((s) => {
          const data: Record<string, unknown> = JSON.parse(s.data);
          return {
            id: s.id,
            label: getSubjectDisplayLabel(data, fieldNames, schema),
          };
        });

      const pdfUri = await generateQRLabelPDF(selectedSubjects);

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(pdfUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Exportar etiquetas QR code',
          UTI: 'com.adobe.pdf',
        });
      }

      // Mark as QR generated
      await markQR(Array.from(selectedIds));

      Alert.alert('Sucesso', `PDF gerado com ${selectedSubjects.length} etiquetas.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao gerar PDF';
      Alert.alert('Erro', message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header actions */}
      <View style={styles.headerActions}>
        <TouchableOpacity onPress={selectAll} style={styles.selectAllBtn}>
          <Ionicons
            name={selectedIds.size === subjects.length ? 'checkbox' : 'square-outline'}
            size={22}
            color={Colors.primary}
          />
          <Text style={styles.selectAllText}>
            {selectedIds.size === subjects.length ? 'Desmarcar todos' : 'Selecionar todos'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.selectedCount}>
          {selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Subject list */}
      <FlatList
        data={subjects}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const data: Record<string, unknown> = JSON.parse(item.data);
          const label = getSubjectDisplayLabel(data, fieldNames, schema);
          const isSelected = selectedIds.has(item.id);

          return (
            <TouchableOpacity
              style={[styles.subjectRow, isSelected && styles.subjectRowSelected]}
              onPress={() => toggleSelect(item.id)}
            >
              <Ionicons
                name={isSelected ? 'checkbox' : 'square-outline'}
                size={22}
                color={isSelected ? Colors.primary : Colors.textSecondary}
              />
              <View style={styles.subjectInfo}>
                <Text style={styles.subjectLabel}>{label}</Text>
                <Text style={styles.subjectId}>{item.id.slice(0, 12)}...</Text>
              </View>
              {item.qr_generated === 1 && (
                <View style={styles.qrBadge}>
                  <Ionicons name="qr-code" size={12} color={Colors.primary} />
                  <Text style={styles.qrBadgeText}>Gerado</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />

      {/* Generate button */}
      <View style={styles.footer}>
        <Button
          title={generating ? 'Gerando...' : `Gerar PDF (${selectedIds.size})`}
          onPress={handleGenerate}
          size="large"
          loading={generating}
          disabled={generating || selectedIds.size === 0}
          icon={<Ionicons name="print-outline" size={20} color={Colors.white} />}
        />
      </View>
    </View>
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
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectAllText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '500',
  },
  selectedCount: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  listContent: {
    padding: 16,
    gap: 6,
  },
  subjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  subjectRowSelected: {
    backgroundColor: Colors.primarySurface,
    borderColor: Colors.primary,
  },
  subjectInfo: {
    flex: 1,
  },
  subjectLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text,
  },
  subjectId: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  qrBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primarySurface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  qrBadgeText: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: '500',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
});
