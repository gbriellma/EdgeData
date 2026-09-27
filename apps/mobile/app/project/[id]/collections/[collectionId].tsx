import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Colors } from '@/constants/colors';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DynamicForm } from '@/components/forms/DynamicForm';
import { useProjectDetail } from '@/hooks/useProject';
import { useCollectionDetail, useCollectionActions } from '@/hooks/useCollections';
import { validateFormData } from '@/utils/validation';
import { formatDateTime, formatCoordinate } from '@/utils/formatters';
import { Schema } from '@/types/schema';

export default function CollectionDetailScreen() {
  const { id, collectionId } = useLocalSearchParams<{ id: string; collectionId: string }>();
  const router = useRouter();
  const { project } = useProjectDetail(id);
  const { collection, images, loading, refresh } = useCollectionDetail(collectionId);
  const { update, remove } = useCollectionActions();

  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<{ field: string; message: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const handleCaptureImage = useCallback(async (
    fieldName: string,
    angle?: string,
    photoConfig?: { width?: number; height?: number }
  ) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Permita o acesso à câmera para capturar fotos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      let uri = result.assets[0].uri;

      // Resize to configured dimensions if specified
      if (photoConfig?.width || photoConfig?.height) {
        const resize: { width?: number; height?: number } = {};
        if (photoConfig.width) resize.width = photoConfig.width;
        if (photoConfig.height) resize.height = photoConfig.height;
        const manipulated = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize }],
          { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
        );
        uri = manipulated.uri;
      }
      if (angle) {
        setEditData((prev) => {
          const existing = Array.isArray(prev[fieldName])
            ? (prev[fieldName] as { angle: string; uri: string }[])
            : [];
          const updated = existing.filter((p) => p.angle !== angle);
          updated.push({ angle, uri });
          return { ...prev, [fieldName]: updated };
        });
      } else {
        setEditData((prev) => ({ ...prev, [fieldName]: uri }));
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  React.useEffect(() => {
    if (collection) {
      setEditData(JSON.parse(collection.data));
    }
  }, [collection]);

  if (loading || !project) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!collection) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.emptyText}>Coleta não encontrada</Text>
      </View>
    );
  }

  const collectionSchema: Schema = JSON.parse(project.collection_schema);
  const colData: Record<string, unknown> = JSON.parse(collection.data);

  const handleSave = async () => {
    const validationErrors = validateFormData(collectionSchema, editData);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      await update(collectionId, editData, collection.latitude, collection.longitude);
      await refresh();
      setEditing(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar';
      Alert.alert('Erro', message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Excluir Coleta',
      'Tem certeza? Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await remove(collectionId);
              router.back();
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : 'Erro ao excluir';
              Alert.alert('Erro', message);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Metadata */}
      <Card style={styles.metaCard}>
        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={16} color={Colors.textSecondary} />
          <Text style={styles.metaText}>
            Coletado em: {formatDateTime(collection.collected_at)}
          </Text>
        </View>
        {collection.modified_at && (
          <View style={styles.metaRow}>
            <Ionicons name="create-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.metaText}>
              Modificado em: {formatDateTime(collection.modified_at)}
            </Text>
          </View>
        )}
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={16} color={Colors.textSecondary} />
          <Text style={styles.metaText}>
            {formatCoordinate(collection.latitude, collection.longitude)}
          </Text>
        </View>
      </Card>

      {/* Data */}
      <Card style={styles.dataCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.sectionTitle}>Dados da Coleta</Text>
          <TouchableOpacity
            onPress={() => {
              if (editing) {
                setEditData(colData);
                setErrors([]);
              }
              setEditing(!editing);
            }}
          >
            <Ionicons
              name={editing ? 'close-circle-outline' : 'create-outline'}
              size={24}
              color={Colors.primary}
            />
          </TouchableOpacity>
        </View>

        {editing ? (
          <>
            <DynamicForm
              schema={collectionSchema}
              data={editData}
              onChange={(name, value) =>
                setEditData((prev) => ({ ...prev, [name]: value }))
              }
              errors={errors}
              onCaptureImage={handleCaptureImage}
            />
            <Button
              title="Salvar Alterações"
              onPress={handleSave}
              loading={saving}
              disabled={saving}
            />
          </>
        ) : (
          <View style={styles.dataList}>
            {collectionSchema.fields
              .sort((a, b) => a.order - b.order)
              .map((field) => {
                const val = colData[field.name];
                if (field.type === 'image' || field.type === 'multi_image') return null;
                let displayVal = '—';
                if (val !== undefined && val !== null && val !== '') {
                  if (Array.isArray(val)) {
                    displayVal = val.join(', ');
                  } else {
                    displayVal = String(val);
                  }
                }
                return (
                  <View key={field.name} style={styles.dataRow}>
                    <Text style={styles.dataLabel}>{field.label}</Text>
                    <Text style={styles.dataValue}>{displayVal}</Text>
                  </View>
                );
              })}
          </View>
        )}
      </Card>

      {/* Images */}
      {images.length > 0 && (
        <Card style={styles.imagesCard}>
          <Text style={styles.sectionTitle}>Imagens ({images.length})</Text>
          <View style={styles.imageGrid}>
            {images.map((img) => (
              <View key={img.id} style={styles.imageWrapper}>
                <Image
                  source={{ uri: img.file_path }}
                  style={styles.image}
                  resizeMode="cover"
                />
                <Text style={styles.imageLabel}>{img.field_name}</Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      {/* Danger zone */}
      <View style={styles.dangerZone}>
        <Button
          title="Excluir Coleta"
          onPress={handleDelete}
          variant="danger"
          icon={<Ionicons name="trash-outline" size={18} color={Colors.white} />}
        />
      </View>
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
    gap: 12,
    paddingBottom: 40,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  metaCard: {
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  dataCard: {
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  dataList: {
    gap: 8,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dataLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    flex: 1,
  },
  dataValue: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
    flex: 1,
    textAlign: 'right',
  },
  imagesCard: {
    gap: 12,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  imageWrapper: {
    width: '48%' as unknown as number,
    gap: 4,
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: Colors.border,
  },
  imageLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  dangerZone: {
    marginTop: 24,
  },
});
