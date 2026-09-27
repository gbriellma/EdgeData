import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from 'expo-location';
import { Colors } from '@/constants/colors';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DynamicForm } from '@/components/forms/DynamicForm';
import QRScanner from '@/components/qrcode/QRScanner';
import { useProjectDetail } from '@/hooks/useProject';
import { useSubjects } from '@/hooks/useSubjects';
import { useCollectionActions } from '@/hooks/useCollections';
import { useCollectionStore } from '@/stores/collectionStore';
import { validateFormData } from '@/utils/validation';
import { getSubjectDisplayLabel } from '@/utils/formatters';
import { Schema } from '@/types/schema';
import { Subject, getSubjectById } from '@/database/db-helpers';
import { persistFormImages } from '@/utils/imagePersist';

type CollectStep = 'scan' | 'confirm' | 'form';

export default function CollectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { project } = useProjectDetail(id);
  const { subjects } = useSubjects(id);
  const { create, update } = useCollectionActions();
  const collectionStore = useCollectionStore();

  const [step, setStep] = useState<CollectStep>('scan');
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<{ field: string; message: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);

  const handleQRScanned = useCallback(
    async (subjectId: string) => {
      setScannerActive(false);
      try {
        const subject = await getSubjectById(subjectId);
        if (!subject) {
          Alert.alert('Erro', 'Sujeito não encontrado no banco de dados.');
          return;
        }
        if (subject.project_id !== id) {
          Alert.alert('Erro', 'Este sujeito pertence a outro projeto.');
          return;
        }
        setSelectedSubject(subject);
        setStep('confirm');
      } catch {
        Alert.alert('Erro', 'Falha ao buscar sujeito.');
      }
    },
    [id]
  );

  const handleManualSelect = (subject: Subject) => {
    setSelectedSubject(subject);
    setStep('confirm');
  };

  const handleConfirm = () => {
    if (!selectedSubject || !project) return;
    const collectionSchema: Schema = JSON.parse(project.collection_schema);
    const initialData: Record<string, unknown> = {};
    collectionSchema.fields.forEach((field) => {
      if (field.type === 'auto_timestamp') {
        initialData[field.name] = new Date().toISOString();
      } else if (field.type === 'auto_uuid') {
        initialData[field.name] = selectedSubject.id;
      } else if (field.type === 'boolean') {
        initialData[field.name] = field.config.defaultValue ?? false;
      }
    });
    setFormData(initialData);
    setErrors([]);
    setStep('form');
  };

  const handleCaptureImage = useCallback(async (
    fieldName: string,
    angle?: string,
    photoConfig?: { width?: number; height?: number }
  ) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permissão necessária',
        'Permita o acesso à câmera para capturar fotos.'
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      let uri = result.assets[0].uri;

      // Resize to configured dimensions if specified
      if (photoConfig?.width || photoConfig?.height) {
        const actions: ImageManipulator.Action[] = [];
        const resize: { width?: number; height?: number } = {};
        if (photoConfig.width) resize.width = photoConfig.width;
        if (photoConfig.height) resize.height = photoConfig.height;
        actions.push({ resize });

        const manipulated = await ImageManipulator.manipulateAsync(
          uri,
          actions,
          { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
        );
        uri = manipulated.uri;
      }

      if (angle) {
        // Multi-angle: value is AnglePhoto[]
        setFormData((prev) => {
          const existing = Array.isArray(prev[fieldName])
            ? (prev[fieldName] as { angle: string; uri: string }[])
            : [];
          const updated = existing.filter((p) => p.angle !== angle);
          updated.push({ angle, uri });
          return { ...prev, [fieldName]: updated };
        });
      } else {
        setFormData((prev) => ({ ...prev, [fieldName]: uri }));
      }
    }
  }, []);

  const handleSave = async () => {
    if (!selectedSubject || !project || !id) return;

    const collectionSchema: Schema = JSON.parse(project.collection_schema);
    const validationErrors = validateFormData(collectionSchema, formData);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors([]);
    setSaving(true);

    try {
      let latitude: number | null = null;
      let longitude: number | null = null;
      const hasAutoGPS = collectionSchema.fields.some(f => f.type === 'auto_gps');

      if (hasAutoGPS) {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const loc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.High,
            });
            latitude = loc.coords.latitude;
            longitude = loc.coords.longitude;
          }
        } catch {
          // GPS unavailable, proceed without
        }
      }

      const finalData = { ...formData };
      collectionSchema.fields.forEach((field) => {
        if (field.type === 'auto_gps' && latitude !== null && longitude !== null) {
          finalData[field.name] = `${latitude},${longitude}`;
        }
      });

      const collectionId = await create(selectedSubject.id, id, finalData, latitude, longitude);

      // Persist images from temp cache to permanent storage
      // Pass subject data + schema so images are named from subject fields
      const subjectData: Record<string, unknown> = JSON.parse(selectedSubject.data);
      const persistedData = await persistFormImages(
        'collection',
        collectionId,
        collectionSchema,
        finalData,
        subjectData,
        subjectSchema,
      );
      if (JSON.stringify(persistedData) !== JSON.stringify(finalData)) {
        await update(collectionId, persistedData, latitude, longitude);
      }

      collectionStore.reset();

      Alert.alert('Sucesso', 'Coleta registrada com sucesso!', [
        {
          text: 'Nova Coleta',
          onPress: () => {
            setSelectedSubject(null);
            setFormData({});
            setErrors([]);
            setStep('scan');
          },
        },
        {
          text: 'Voltar',
          onPress: () => router.back(),
        },
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar coleta';
      Alert.alert('Erro', message);
    } finally {
      setSaving(false);
    }
  };

  // Full-screen QR scanner overlay
  if (scannerActive) {
    return (
      <QRScanner
        onScanned={handleQRScanned}
        onClose={() => setScannerActive(false)}
      />
    );
  }

  if (!project) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const subjectSchema: Schema = JSON.parse(project.subject_schema);
  const collectionSchema: Schema = JSON.parse(project.collection_schema);
  const subjectFieldNames = subjectSchema.fields.map((f) => f.name);

  const filteredSubjects = searchQuery.trim()
    ? subjects.filter((s) => {
        const data: Record<string, unknown> = JSON.parse(s.data);
        const label = getSubjectDisplayLabel(data, subjectFieldNames, subjectSchema).toLowerCase();
        return label.includes(searchQuery.toLowerCase()) || s.id.includes(searchQuery);
      })
    : subjects;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {step === 'scan'
            ? 'Identificar Sujeito'
            : step === 'confirm'
            ? 'Confirmar Sujeito'
            : 'Registrar Coleta'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Step indicator */}
      <View style={styles.stepIndicator}>
        {(['scan', 'confirm', 'form'] as const).map((s, i) => (
          <View
            key={s}
            style={[
              styles.stepDot,
              step === s && styles.stepDotActive,
              (['scan', 'confirm', 'form'] as const).indexOf(step) > i && styles.stepDotDone,
            ]}
          />
        ))}
      </View>

      {/* STEP: Scan / Manual Search */}
      {step === 'scan' && (
        <View style={styles.scanContainer}>
          <Button
            title="Escanear QR Code"
            onPress={() => setScannerActive(true)}
            size="large"
            icon={<Ionicons name="qr-code-outline" size={22} color={Colors.white} />}
          />

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>ou busca manual</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={20} color={Colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar sujeito por nome ou ID..."
              placeholderTextColor={Colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={filteredSubjects}
            keyExtractor={(item) => item.id}
            style={styles.subjectList}
            renderItem={({ item }) => {
              const data: Record<string, unknown> = JSON.parse(item.data);
              const label = getSubjectDisplayLabel(data, subjectFieldNames, subjectSchema);
              return (
                <TouchableOpacity
                  style={styles.subjectItem}
                  onPress={() => handleManualSelect(item)}
                >
                  <Ionicons name="leaf" size={18} color={Colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subjectLabel}>{label}</Text>
                    <Text style={styles.subjectId}>{item.id.slice(0, 8)}...</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {searchQuery ? 'Nenhum sujeito encontrado' : 'Nenhum sujeito cadastrado'}
              </Text>
            }
          />
        </View>
      )}

      {/* STEP: Confirm Subject */}
      {step === 'confirm' && selectedSubject && (
        <ScrollView style={styles.confirmContainer} contentContainerStyle={styles.confirmContent}>
          <Card style={styles.confirmCard}>
            <View style={styles.confirmHeader}>
              <Ionicons name="checkmark-circle" size={32} color={Colors.primary} />
              <Text style={styles.confirmTitle}>Sujeito Identificado</Text>
            </View>

            <View style={styles.confirmData}>
              {(() => {
                const confirmData: Record<string, unknown> = JSON.parse(selectedSubject.data);
                return subjectSchema.fields
                .sort((a, b) => a.order - b.order)
                .map((field) => {
                  const val = confirmData[field.name];
                  if (val === undefined || val === null || val === '') return null;
                  return (
                    <View key={field.name} style={styles.confirmRow}>
                      <Text style={styles.confirmLabel}>{field.label}</Text>
                      <Text style={styles.confirmValue}>
                        {Array.isArray(val) ? val.join(', ') : String(val)}
                      </Text>
                    </View>
                  );
                });
              })()}
            </View>
          </Card>

          <View style={styles.confirmActions}>
            <Button
              title="Voltar"
              onPress={() => {
                setSelectedSubject(null);
                setStep('scan');
              }}
              variant="outline"
              style={{ flex: 1 }}
            />
            <Button
              title="Confirmar e Coletar"
              onPress={handleConfirm}
              style={{ flex: 1 }}
            />
          </View>
        </ScrollView>
      )}

      {/* STEP: Collection Form */}
      {step === 'form' && selectedSubject && (
        <KeyboardAwareScrollView
          style={styles.formContainer}
          contentContainerStyle={styles.formContent}
          keyboardShouldPersistTaps="handled"
          bottomOffset={50}
          extraKeyboardSpace={20}
        >
          <Card style={styles.subjectBanner}>
            <Ionicons name="leaf" size={18} color={Colors.primary} />
            <Text style={styles.bannerText}>
              Coletando para:{' '}
              {getSubjectDisplayLabel(
                JSON.parse(selectedSubject.data),
                subjectFieldNames,
                subjectSchema,
              )}
            </Text>
          </Card>

          <DynamicForm
            schema={collectionSchema}
            data={formData}
            onChange={(name, value) =>
              setFormData((prev) => ({ ...prev, [name]: value }))
            }
            errors={errors}
            onCaptureImage={handleCaptureImage}
          />

          <View style={styles.formActions}>
            <Button
              title="Voltar"
              onPress={() => setStep('confirm')}
              variant="outline"
              style={{ flex: 1 }}
            />
            <Button
              title="Salvar Coleta"
              onPress={handleSave}
              loading={saving}
              disabled={saving}
              style={{ flex: 1 }}
              icon={<Ionicons name="checkmark" size={20} color={Colors.white} />}
            />
          </View>
        </KeyboardAwareScrollView>
      )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  closeBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  stepDot: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
  },
  stepDotActive: {
    backgroundColor: Colors.primary,
  },
  stepDotDone: {
    backgroundColor: Colors.primaryLight,
  },
  scanContainer: {
    flex: 1,
    padding: 16,
    gap: 16,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text,
  },
  subjectList: {
    flex: 1,
  },
  subjectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
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
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 32,
  },
  confirmContainer: {
    flex: 1,
  },
  confirmContent: {
    padding: 16,
    gap: 16,
  },
  confirmCard: {
    gap: 16,
  },
  confirmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  confirmData: {
    gap: 8,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  confirmLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  confirmValue: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 12,
  },
  formContainer: {
    flex: 1,
  },
  formContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  subjectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primarySurface,
  },
  bannerText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.primary,
    flex: 1,
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
});
