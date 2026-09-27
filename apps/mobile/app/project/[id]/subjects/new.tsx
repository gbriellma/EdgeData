import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Colors } from '@/constants/colors';
import { Button } from '@/components/ui/Button';
import { DynamicForm } from '@/components/forms/DynamicForm';
import { useProjectDetail } from '@/hooks/useProject';
import { useSubjects } from '@/hooks/useSubjects';
import { validateFormData } from '@/utils/validation';
import { Schema } from '@/types/schema';
import { persistFormImages } from '@/utils/imagePersist';

export default function NewSubjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { project } = useProjectDetail(id);
  const { create, update } = useSubjects(id);
  const [data, setData] = useState<Record<string, unknown>>({});
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
        setData((prev) => {
          const existing = Array.isArray(prev[fieldName])
            ? (prev[fieldName] as { angle: string; uri: string }[])
            : [];
          const updated = existing.filter((p) => p.angle !== angle);
          updated.push({ angle, uri });
          return { ...prev, [fieldName]: updated };
        });
      } else {
        setData((prev) => ({ ...prev, [fieldName]: uri }));
      }
    }
  }, []);

  if (!project) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const schema: Schema = JSON.parse(project.subject_schema);

  // Initialize boolean fields with default values so they are never undefined
  useEffect(() => {
    if (Object.keys(data).length === 0 && schema.fields.length > 0) {
      const boolDefaults: Record<string, unknown> = {};
      schema.fields.forEach((f) => {
        if (f.type === 'boolean') {
          boolDefaults[f.name] = f.config.defaultValue ?? false;
        }
      });
      if (Object.keys(boolDefaults).length > 0) {
        setData((prev) => ({ ...boolDefaults, ...prev }));
      }
    }
  }, [schema.fields.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    const validationErrors = validateFormData(schema, data);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      const subjectId = await create(data);

      // Persist images from temp cache to permanent storage
      const persistedData = await persistFormImages('subject', subjectId, schema, data);
      if (JSON.stringify(persistedData) !== JSON.stringify(data)) {
        await update(subjectId, persistedData);
      }

      router.back();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar';
      Alert.alert('Erro', message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      bottomOffset={50}
      extraKeyboardSpace={20}
    >
        <DynamicForm
          schema={schema}
          data={data}
          onChange={(name, value) => setData((prev) => ({ ...prev, [name]: value }))}
          errors={errors}
          onCaptureImage={handleCaptureImage}
        />

        <Button
          title="Salvar Sujeito"
          onPress={handleSave}
          size="large"
          loading={saving}
          disabled={saving}
        />
    </KeyboardAwareScrollView>
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
    paddingBottom: 40,
  },
});
