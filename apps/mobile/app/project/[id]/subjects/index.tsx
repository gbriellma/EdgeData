import React, { useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { EmptyState } from '@/components/ui/EmptyState';
import { useSubjects } from '@/hooks/useSubjects';
import { useProjectDetail } from '@/hooks/useProject';
import { Schema } from '@/types/schema';
import { getSubjectDisplayLabel } from '@/utils/formatters';

export default function SubjectsListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { subjects, loading, refresh } = useSubjects(id);
  const { project } = useProjectDetail(id);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => { refresh(); });
    return unsubscribe;
  }, [navigation, refresh]);

  const subjectSchema: Schema | null = project
    ? JSON.parse(project.subject_schema)
    : null;
  const fieldNames = subjectSchema?.fields.map((f) => f.name) ?? [];

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {subjects.length === 0 ? (
        <EmptyState
          title="Nenhum sujeito cadastrado"
          description="Cadastre sujeitos manualmente ou importe de um arquivo CSV."
          actionLabel="Cadastrar Sujeito"
          onAction={() => router.push({ pathname: '/project/[id]/subjects/new', params: { id: id! } })}
        />
      ) : (
        <FlatList
          data={subjects}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const data = JSON.parse(item.data) as Record<string, unknown>;
            const label = getSubjectDisplayLabel(data, fieldNames, subjectSchema ?? undefined);
            return (
              <TouchableOpacity
                style={styles.subjectCard}
                onPress={() =>
                  router.push({
                    pathname: '/project/[id]/subjects/[subjectId]',
                    params: { id: id!, subjectId: item.id },
                  })
                }
              >
                <View style={styles.subjectInfo}>
                  <Text style={styles.subjectLabel}>{label}</Text>
                  <Text style={styles.subjectMeta}>
                    {item.qr_generated ? 'QR gerado' : 'Sem QR'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            );
          }}
        />
      )}

      <View style={styles.bottomActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push({ pathname: '/project/[id]/subjects/new', params: { id: id! } })}
        >
          <Ionicons name="add-circle" size={22} color={Colors.primary} />
          <Text style={styles.actionText}>Manual</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push({ pathname: '/project/[id]/subjects/batch', params: { id: id! } })}
        >
          <Ionicons name="rocket-outline" size={22} color={Colors.primary} />
          <Text style={styles.actionText}>Em Lote</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push({ pathname: '/project/[id]/subjects/import-csv', params: { id: id! } })}
        >
          <Ionicons name="document-text" size={22} color={Colors.primary} />
          <Text style={styles.actionText}>CSV</Text>
        </TouchableOpacity>
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
  list: {
    padding: 16,
  },
  subjectCard: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  subjectInfo: {
    flex: 1,
  },
  subjectLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
  },
  subjectMeta: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  bottomActions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.primarySurface,
  },
  actionText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.primary,
  },
});
