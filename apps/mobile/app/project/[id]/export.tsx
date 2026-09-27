import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator, Switch } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { Colors } from '@/constants/colors';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useProjectDetail } from '@/hooks/useProject';
import {
  exportProjectToDirectory,
  exportProjectZIP,
  isSAFAvailable,
  isNativeZipAvailable,
} from '@/database/export-csv';
import type { ExportOptions } from '@/database/export-csv';

type ExportFormat = 'saf' | 'zip' | 'coco';

export default function ExportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { project, stats, loading } = useProjectDetail(id);
  const [exporting, setExporting] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);

  const hasNativeZip = useMemo(() => isNativeZipAvailable(), []);
  const hasSAF = useMemo(() => isSAFAvailable(), []);

  const [format, setFormat] = useState<ExportFormat>(hasNativeZip ? 'zip' : 'saf');
  const [groupByDate, setGroupByDate] = useState(false);

  const exportOptions: ExportOptions = { groupByDate: format !== 'saf' && groupByDate };

  const handleExportSAF = async () => {
    if (!id || !hasSAF) return;

    setExporting(true);
    setProgressLabel('Preparando...');
    setProgressPercent(0);

    try {
      const result = await exportProjectToDirectory(id, (current, total, label) => {
        setProgressLabel(label);
        setProgressPercent(total > 0 ? Math.round((current / total) * 100) : 0);
      }, exportOptions);

      Alert.alert(
        'Exportação concluída',
        `${result.fileCount} arquivo(s) salvos na pasta escolhida.`,
      );
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'CANCELLED') return;
      const message = err instanceof Error ? err.message : 'Erro ao exportar';
      Alert.alert('Erro', message);
    } finally {
      setExporting(false);
      setProgressLabel('');
      setProgressPercent(0);
    }
  };

  const handleExportZIP = async () => {
    if (!id) return;

    setExporting(true);
    setProgressLabel('Preparando...');
    setProgressPercent(0);

    try {
      const zipPath = await exportProjectZIP(id, (current, total, label) => {
        setProgressLabel(label);
        setProgressPercent(total > 0 ? Math.round((current / total) * 100) : 0);
      }, exportOptions);

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(zipPath, {
          mimeType: 'application/zip',
          dialogTitle: `Exportar ${project?.name ?? 'Projeto'}`,
        });
      } else {
        Alert.alert('Exportado', `ZIP salvo em: ${zipPath}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao exportar';
      Alert.alert('Erro', message);
    } finally {
      setExporting(false);
      setProgressLabel('');
      setProgressPercent(0);
    }
  };

  const handleExport = () => {
    if (format === 'zip') {
      handleExportZIP();
    } else {
      handleExportSAF();
    }
  };

  if (loading && !project) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Formato de Exportação</Text>

      {hasNativeZip && (
        <Card
          onPress={() => setFormat('zip')}
          style={[styles.formatCard, format === 'zip' && styles.formatCardActive]}
        >
          <Ionicons
            name="archive-outline"
            size={28}
            color={format === 'zip' ? Colors.primary : Colors.textSecondary}
          />
          <View style={styles.formatInfo}>
            <Text style={[styles.formatTitle, format === 'zip' && styles.formatTitleActive]}>
              ZIP (CSV + Imagens)
            </Text>
            <Text style={styles.formatDesc}>
              Arquivo ZIP compactado com CSVs e todas as imagens. Ideal para compartilhar.
            </Text>
          </View>
        </Card>
      )}

      {hasSAF && (
        <Card
          onPress={() => setFormat('saf')}
          style={[styles.formatCard, format === 'saf' && styles.formatCardActive]}
        >
          <Ionicons
            name="folder-open-outline"
            size={28}
            color={format === 'saf' ? Colors.primary : Colors.textSecondary}
          />
          <View style={styles.formatInfo}>
            <Text style={[styles.formatTitle, format === 'saf' && styles.formatTitleActive]}>
              Salvar em Pasta
            </Text>
            <Text style={styles.formatDesc}>
              CSVs e imagens salvos diretamente na pasta escolhida. Sem limite de imagens.
            </Text>
          </View>
        </Card>
      )}

      <Card
        onPress={() => setFormat('coco')}
        style={[styles.formatCard, format === 'coco' && styles.formatCardActive]}
      >
        <Ionicons
          name="code-slash-outline"
          size={28}
          color={format === 'coco' ? Colors.primary : Colors.textSecondary}
        />
        <View style={styles.formatInfo}>
          <Text style={[styles.formatTitle, format === 'coco' && styles.formatTitleActive]}>
            COCO JSON (Fase 2)
          </Text>
          <Text style={styles.formatDesc}>
            Formato padrão para pipelines de visão computacional — em breve
          </Text>
        </View>
      </Card>

      <Card style={styles.previewCard}>
        <Text style={styles.previewTitle}>Conteúdo da Exportação</Text>
        <View style={styles.previewRow}>
          <Ionicons name="people-outline" size={18} color={Colors.primary} />
          <Text style={styles.previewText}>
            {stats?.total_subjects ?? 0} sujeitos
          </Text>
        </View>
        <View style={styles.previewRow}>
          <Ionicons name="clipboard-outline" size={18} color={Colors.primary} />
          <Text style={styles.previewText}>
            {stats?.total_collections ?? 0} coletas
          </Text>
        </View>
        <View style={styles.previewRow}>
          <Ionicons name="image-outline" size={18} color={Colors.primary} />
          <Text style={styles.previewText}>
            {stats?.total_images ?? 0} imagens
          </Text>
        </View>
      </Card>

      <Card style={styles.optionCard}>
        <View style={styles.optionRow}>
          <View style={styles.optionInfo}>
            <Text style={styles.optionTitle}>Organizar imagens por data</Text>
            <Text style={styles.optionDesc}>
              {format === 'saf'
                ? 'Não disponível no modo Salvar em Pasta (limitação do Android)'
                : 'Cria subpastas por data de coleta (ex: images/2026-02-15/)'}
            </Text>
          </View>
          <Switch
            value={groupByDate && format !== 'saf'}
            onValueChange={setGroupByDate}
            disabled={format === 'saf'}
            trackColor={{ false: Colors.border, true: Colors.primaryLight }}
            thumbColor={groupByDate && format !== 'saf' ? Colors.primary : Colors.textSecondary}
          />
        </View>
      </Card>

      <Button
        title={
          exporting
            ? progressLabel || 'Preparando...'
            : 'Exportar Dataset'
        }
        onPress={handleExport}
        size="large"
        loading={exporting}
        disabled={exporting || format === 'coco'}
        icon={
          <Ionicons
            name={format === 'zip' ? 'archive-outline' : 'folder-open-outline'}
            size={20}
            color={Colors.white}
          />
        }
      />

      {exporting && progressPercent > 0 && (
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
        </View>
      )}

      {format === 'coco' && (
        <Text style={styles.cocoNote}>
          O formato COCO JSON estará disponível na Fase 2 do projeto.
        </Text>
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
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  formatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  formatCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySurface,
  },
  formatInfo: {
    flex: 1,
    gap: 4,
  },
  formatTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  formatTitleActive: {
    color: Colors.primary,
  },
  formatDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  previewCard: {
    gap: 10,
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  previewText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  optionCard: {
    gap: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  optionInfo: {
    flex: 1,
    gap: 2,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  optionDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  cocoNote: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
