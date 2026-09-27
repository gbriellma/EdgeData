import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useProjectDetail } from '@/hooks/useProject';
import { formatDateTime } from '@/utils/formatters';
import { exportTemplate, saveCustomTemplate, TemplateFile } from '@/utils/templateManager';
import { Schema } from '@/types/schema';

export default function ProjectDashboard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { project, stats, loading, refresh } = useProjectDetail(id);
  const [exporting, setExporting] = useState(false);

  const handleExportTemplate = async () => {
    if (!project) return;
    setExporting(true);
    try {
      const subjectSchema: Schema = JSON.parse(project.subject_schema);
      const collectionSchema: Schema = JSON.parse(project.collection_schema);
      await exportTemplate(project.name, project.description ?? '', subjectSchema, collectionSchema);

      // Also save locally
      const tpl: TemplateFile = {
        version: 1,
        type: 'edgedata-template',
        name: project.name,
        description: project.description ?? '',
        subjectSchema,
        collectionSchema,
        createdAt: new Date().toISOString(),
      };
      await saveCustomTemplate(tpl);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao exportar template';
      Alert.alert('Erro', message);
    } finally {
      setExporting(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  React.useEffect(() => {
    if (project) {
      navigation.setOptions({ title: project.name });
    }
  }, [project, navigation]);

  if (loading && !project) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!project) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>Projeto não encontrado</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {project.description ? (
        <Text style={styles.description}>{project.description}</Text>
      ) : null}

      <Card style={styles.statsCard}>
        <Text style={styles.statsTitle}>Estatísticas</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats?.total_subjects ?? 0}</Text>
            <Text style={styles.statLabel}>Sujeitos</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats?.total_collections ?? 0}</Text>
            <Text style={styles.statLabel}>Coletas</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats?.total_images ?? 0}</Text>
            <Text style={styles.statLabel}>Imagens</Text>
          </View>
        </View>
        {stats?.last_collection_at && (
          <Text style={styles.lastCollection}>
            Última coleta: {formatDateTime(stats.last_collection_at)}
          </Text>
        )}
      </Card>

      <Button
        title="Iniciar Coleta"
        onPress={() => router.push({ pathname: '/project/[id]/collect', params: { id: id! } })}
        size="large"
        icon={<Ionicons name="scan" size={22} color={Colors.white} />}
        style={styles.collectBtn}
      />

      <View style={styles.actions}>
        <Button
          title="Sujeitos"
          onPress={() => router.push({ pathname: '/project/[id]/subjects', params: { id: id! } })}
          variant="outline"
          icon={<Ionicons name="leaf-outline" size={18} color={Colors.primary} />}
          style={styles.actionBtn}
        />
        <Button
          title="Coletas"
          onPress={() => router.push({ pathname: '/project/[id]/collections', params: { id: id! } })}
          variant="outline"
          icon={<Ionicons name="grid-outline" size={18} color={Colors.primary} />}
          style={styles.actionBtn}
        />
      </View>

      <View style={styles.actions}>
        <Button
          title="QR Codes"
          onPress={() => router.push({ pathname: '/project/[id]/qr-codes', params: { id: id! } })}
          variant="secondary"
          icon={<Ionicons name="qr-code-outline" size={18} color={Colors.primary} />}
          style={styles.actionBtn}
        />
        <Button
          title="Exportar"
          onPress={() => router.push({ pathname: '/project/[id]/export', params: { id: id! } })}
          variant="secondary"
          icon={<Ionicons name="download-outline" size={18} color={Colors.primary} />}
          style={styles.actionBtn}
        />
      </View>

      <Button
        title={exporting ? 'Exportando...' : 'Exportar como Template'}
        onPress={handleExportTemplate}
        variant="outline"
        loading={exporting}
        disabled={exporting}
        icon={<Ionicons name="share-outline" size={18} color={Colors.primary} />}
      />
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
  description: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  errorText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  statsCard: {
    gap: 12,
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.primary,
  },
  statLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  lastCollection: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  collectBtn: {
    marginVertical: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
  },
});
