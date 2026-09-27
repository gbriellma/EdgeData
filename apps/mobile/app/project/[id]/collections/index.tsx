import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { useProjectDetail } from '@/hooks/useProject';
import { useCollectionsByProject } from '@/hooks/useCollections';
import { formatDateTime } from '@/utils/formatters';
import { Schema } from '@/types/schema';

export default function CollectionsGalleryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { project } = useProjectDetail(id);
  const { collections, loading, refresh } = useCollectionsByProject(id);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  if (loading && collections.length === 0) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (collections.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          title="Nenhuma coleta realizada"
          description="Inicie uma coleta pelo dashboard do projeto para registrar observações."
          actionLabel="Voltar"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  const collectionSchema: Schema | null = project
    ? JSON.parse(project.collection_schema)
    : null;

  return (
    <View style={styles.container}>
      <FlatList
        data={collections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const data: Record<string, unknown> = JSON.parse(item.data);
          const firstField = collectionSchema?.fields.sort(
            (a, b) => a.order - b.order
          )[0];
          const preview = firstField ? String(data[firstField.name] ?? '') : '';

          // Check for image fields
          const imageFields = collectionSchema?.fields.filter(
            (f) => f.type === 'image'
          );
          const firstImagePath = imageFields?.[0]
            ? (data[imageFields[0].name] as string | undefined)
            : undefined;

          return (
            <Card
              onPress={() =>
                router.push({
                  pathname: '/project/[id]/collections/[collectionId]',
                  params: { id: id!, collectionId: item.id },
                })
              }
              style={styles.collectionCard}
            >
              <View style={styles.cardRow}>
                {firstImagePath ? (
                  <Image
                    source={{ uri: firstImagePath }}
                    style={styles.thumbnail}
                  />
                ) : (
                  <View style={styles.thumbnailPlaceholder}>
                    <Ionicons
                      name="clipboard-outline"
                      size={24}
                      color={Colors.textSecondary}
                    />
                  </View>
                )}
                <View style={styles.cardInfo}>
                  <Text style={styles.cardDate}>
                    {formatDateTime(item.collected_at)}
                  </Text>
                  {preview ? (
                    <Text style={styles.cardPreview} numberOfLines={1}>
                      {firstField!.label}: {preview}
                    </Text>
                  ) : null}
                  {item.latitude !== null && item.longitude !== null && (
                    <Text style={styles.cardGps}>
                      GPS: {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                    </Text>
                  )}
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={Colors.textSecondary}
                />
              </View>
            </Card>
          );
        }}
      />
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
  listContent: {
    padding: 16,
    gap: 8,
  },
  collectionCard: {
    padding: 0,
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: Colors.border,
  },
  thumbnailPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: Colors.primarySurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardInfo: {
    flex: 1,
    gap: 2,
  },
  cardDate: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  cardPreview: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  cardGps: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
});
