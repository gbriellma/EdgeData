import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/QcBadge';
import { Colors } from '@/constants/colors';
import { describeDesign } from '@/core/design';
import { getDb } from '@/database/connection';
import type { Experiment } from '@/database/models';
import { listExperiments } from '@/database/repo/experiments';
import { useAsync } from '@/hooks/useAsync';
import { formatDateTime } from '@/utils/formatters';

const STATUS_LABEL: Record<Experiment['status'], { label: string; tone: 'ok' | 'warn' | 'neutral' }> = {
  draft: { label: 'Rascunho', tone: 'neutral' },
  active: { label: 'Em andamento', tone: 'ok' },
  completed: { label: 'Concluído', tone: 'warn' },
};

export default function ExperimentsScreen() {
  const router = useRouter();
  const { data, loading, error } = useAsync(async () => listExperiments(await getDb()), []);

  if (loading && !data) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const byProject = new Map<string, Experiment[]>();
  for (const experiment of data ?? []) {
    const list = byProject.get(experiment.projectName) ?? [];
    list.push(experiment);
    byProject.set(experiment.projectName, list);
  }
  const sections = [...byProject.entries()].map(([title, items]) => ({ title, data: items }));

  return (
    <View style={styles.container}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {sections.length === 0 ? (
        <EmptyState
          title="Nenhum experimento"
          description="Crie um experimento do zero ou a partir de um template. Tudo funciona sem internet."
          actionLabel="Criar experimento"
          onAction={() => router.push('/experiment/new')}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Ionicons name="folder-open-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <Card style={styles.card} onPress={() => router.push({ pathname: '/experiment/[id]', params: { id: item.id } })}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.code}>{item.code}</Text>
                </View>
                <StatusBadge label={STATUS_LABEL[item.status].label} tone={STATUS_LABEL[item.status].tone} />
              </View>
              {item.metadata.objective ? (
                <Text style={styles.description} numberOfLines={2}>
                  {item.metadata.objective}
                </Text>
              ) : null}
              <Text style={styles.meta}>{describeDesign(item.design)}</Text>
              <Text style={styles.meta}>Atualizado em {formatDateTime(item.updatedAt)}</Text>
            </Card>
          )}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => router.push('/experiment/new')} activeOpacity={0.8} accessibilityLabel="Novo experimento">
        <Ionicons name="add" size={28} color={Colors.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, paddingBottom: 96 },
  error: { color: Colors.error, padding: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { marginBottom: 12, gap: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  name: { fontSize: 17, fontWeight: '700', color: Colors.text },
  code: { fontSize: 12, color: Colors.textSecondary, fontFamily: 'monospace' },
  description: { fontSize: 14, color: Colors.textSecondary, marginTop: 4, lineHeight: 20 },
  meta: { fontSize: 12, color: Colors.textSecondary },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
});
