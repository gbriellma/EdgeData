import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Schema } from '@/types/schema';
import { FieldRenderer } from './FieldRenderer';
import { ValidationError } from '@/utils/validation';

export interface PhotoConfig {
  width?: number;
  height?: number;
}

interface DynamicFormProps {
  schema: Schema;
  data: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
  errors?: ValidationError[];
  onCaptureImage?: (fieldName: string, angle?: string, photoConfig?: PhotoConfig) => void;
  scrollable?: boolean;
}

export function DynamicForm({
  schema,
  data,
  onChange,
  errors = [],
  onCaptureImage,
  scrollable = false,
}: DynamicFormProps) {
  const sortedFields = [...schema.fields].sort((a, b) => a.order - b.order);
  const errorMap = new Map(errors.map((e) => [e.field, e.message]));

  const content = (
    <View style={styles.form}>
      {sortedFields.map((field) => (
        <FieldRenderer
          key={field.name}
          field={field}
          value={data[field.name]}
          onChange={(value) => onChange(field.name, value)}
          error={errorMap.get(field.name)}
          onCaptureImage={onCaptureImage}
        />
      ))}
    </View>
  );

  if (scrollable) {
    return (
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {content}
      </ScrollView>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  form: {
    gap: 0,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
});
