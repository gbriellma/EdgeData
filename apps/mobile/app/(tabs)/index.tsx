import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { useProjects } from '@/hooks/useProject';
import { formatDateTime } from '@/utils/formatters';
import { Schema } from '@/types/schema';

export default function HomeScreen() {
  const router = useRouter();
  const { projects, loading, refresh } = useProjects();

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {projects.length === 0 ? (
        <EmptyState
          title="Nenhum projeto"
          description="Crie seu primeiro projeto para começar a coletar dados em campo."
          actionLabel="Criar Projeto"
          onAction={() => router.push('/project/new')}
        />
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const subjectSchema: Schema = JSON.parse(item.subject_schema);
            const collectionSchema: Schema = JSON.parse(item.collection_schema);
            return (
              <Card
                onPress={() =>
                  router.push({ pathname: '/project/[id]', params: { id: item.id } })
                }
                style={styles.card}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.projectName}>{item.name}</Text>
                  <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
                </View>
                {item.description ? (
                  <Text style={styles.projectDesc} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
                <View style={styles.cardMeta}>
                  <Text style={styles.metaText}>
                    {subjectSchema.fields.length} campos sujeito
                  </Text>
                  <Text style={styles.metaDot}>·</Text>
                  <Text style={styles.metaText}>
                    {collectionSchema.fields.length} campos coleta
                  </Text>
                  <Text style={styles.metaDot}>·</Text>
                  <Text style={styles.metaText}>
                    {formatDateTime(item.updated_at)}
                  </Text>
                </View>
              </Card>
            );
          }}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/project/new')}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color={Colors.white} />
      </TouchableOpacity>
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
  card: {
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  projectName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
  },
  projectDesc: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
    lineHeight: 20,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  metaText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  metaDot: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginHorizontal: 6,
  },
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
