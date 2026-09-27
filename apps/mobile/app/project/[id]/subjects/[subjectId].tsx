import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Colors } from '@/constants/colors';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DynamicForm } from '@/components/forms/DynamicForm';
import { useProjectDetail } from '@/hooks/useProject';
import { useSubjects } from '@/hooks/useSubjects';
import { useCollectionsBySubject } from '@/hooks/useCollections';
import { getSubjectById, Subject } from '@/database/db-helpers';
import { Schema } from '@/types/schema';
import { formatDateTime, getSubjectDisplayLabel } from '@/utils/formatters';
import { validateFormData } from '@/utils/validation';

export default function SubjectDetailScreen() {
  const { id, subjectId } = useLocalSearchParams<{ id: string; subjectId: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { project } = useProjectDetail(id);
  const { update, remove } = useSubjects(id);
  const { collections, loading: collectionsLoading, refresh: refreshCollections } = useCollectionsBySubject(subjectId);

  const [subject, setSubject] = useState<Subject | null>(null);
  const [loading, setLoading] = useState(true);
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

  const loadSubject = useCallback(async () => {
    if (!subjectId) return;
    setLoading(true);
    try {
      const s = await getSubjectById(subjectId);
      setSubject(s);
      if (s) {
        setEditData(JSON.parse(s.data));
      }
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useFocusEffect(
    useCallback(() => {
      loadSubject();
      refreshCollections();
    }, [loadSubject, refreshCollections])
  );

  useEffect(() => {
    if (subject && project) {
      const schema: Schema = JSON.parse(project.subject_schema);
      const fieldNames = schema.fields.map((f) => f.name);
      const data = JSON.parse(subject.data);
      const label = getSubjectDisplayLabel(data, fieldNames, schema);
      navigation.setOptions({ title: label });
    }
  }, [subject, project, navigation]);

  if (loading || !project) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!subject) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.emptyText}>Sujeito não encontrado</Text>
      </View>
    );
  }

  const schema: Schema = JSON.parse(project.subject_schema);
  const subjectData: Record<string, unknown> = JSON.parse(subject.data);

  const handleSave = async () => {
    const validationErrors = validateFormData(schema, editData);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      await update(subjectId, editData);
      await loadSubject();
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
      'Excluir Sujeito',
      'Tem certeza? Todas as coletas vinculadas também serão excluídas.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await remove(subjectId);
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
      <Card style={styles.infoCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.sectionTitle}>Dados do Sujeito</Text>
          <TouchableOpacity onPress={() => {
            if (editing) {
              setEditData(subjectData);
              setErrors([]);
            }
            setEditing(!editing);
          }}>
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
              schema={schema}
              data={editData}
              onChange={(name, value) => setEditData((prev) => ({ ...prev, [name]: value }))}
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
            {schema.fields
              .sort((a, b) => a.order - b.order)
              .map((field) => {
                const val = subjectData[field.name];
                if (field.type === 'image' || field.type === 'multi_image') return null;
                let displayVal = '—';
                if (val !== undefined && val !== null && val !== '') {
                  if (Array.isArray(val)) {
                    displayVal = (val as unknown[]).map((v) =>
                      typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)
                    ).join(', ');
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

        <Text style={styles.meta}>
          Criado em: {formatDateTime(subject.created_at)}
        </Text>
        {subject.qr_generated === 1 && (
          <View style={styles.qrBadge}>
            <Ionicons name="qr-code" size={14} color={Colors.primary} />
            <Text style={styles.qrBadgeText}>QR Code gerado</Text>
          </View>
        )}
      </Card>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          Histórico de Coletas ({collections.length})
        </Text>
      </View>

      {collectionsLoading ? (
        <ActivityIndicator color={Colors.primary} />
      ) : collections.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Ionicons name="clipboard-outline" size={32} color={Colors.textSecondary} />
          <Text style={styles.emptyText}>Nenhuma coleta registrada</Text>
        </Card>
      ) : (
        (() => {
          const colSchema: Schema = JSON.parse(project.collection_schema);
          const firstField = colSchema.fields.sort((a, b) => a.order - b.order)[0];
          return collections.map((col) => {
          const colData: Record<string, unknown> = JSON.parse(col.data);
          const preview = firstField ? String(colData[firstField.name] ?? '') : '';

          return (
            <Card
              key={col.id}
              onPress={() =>
                router.push({
                  pathname: '/project/[id]/collections/[collectionId]',
                  params: { id: id!, collectionId: col.id },
                })
              }
              style={styles.collectionCard}
            >
              <View style={styles.collectionRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.collectionDate}>
                    {formatDateTime(col.collected_at)}
                  </Text>
                  {preview ? (
                    <Text style={styles.collectionPreview} numberOfLines={1}>
                      {firstField!.label}: {preview}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
              </View>
              {col.latitude !== null && col.longitude !== null && (
                <Text style={styles.collectionGps}>
                  GPS: {col.latitude.toFixed(5)}, {col.longitude.toFixed(5)}
                </Text>
              )}
            </Card>
          );
        });
        })()
      )}

      <View style={styles.dangerZone}>
        <Button
          title="Excluir Sujeito"
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
  infoCard: {
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionHeader: {
    marginTop: 8,
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
  meta: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  qrBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primarySurface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  qrBadgeText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '500',
  },
  collectionCard: {
    gap: 4,
  },
  collectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  collectionDate: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  collectionPreview: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  collectionGps: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  emptyCard: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  dangerZone: {
    marginTop: 24,
  },
});
