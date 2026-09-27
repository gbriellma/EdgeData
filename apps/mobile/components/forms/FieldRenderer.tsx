import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Switch,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
  Image as RNImage,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SchemaField } from '@/types/schema';
import { Colors } from '@/constants/colors';
import { MultiAngleCapture, AnglePhoto } from './MultiAngleCapture';

interface PhotoConfig {
  width?: number;
  height?: number;
}

interface FieldRendererProps {
  field: SchemaField;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  onCaptureImage?: (fieldName: string, angle?: string, photoConfig?: PhotoConfig) => void;
}

export function FieldRenderer({
  field,
  value,
  onChange,
  error,
  onCaptureImage,
}: FieldRendererProps) {
  const { type, label, required, config } = field;

  const renderLabel = () => (
    <Text style={styles.label}>
      {label}
      {required && <Text style={styles.required}> *</Text>}
      {config.unit && <Text style={styles.unit}> ({config.unit})</Text>}
    </Text>
  );

  const renderError = () =>
    error ? <Text style={styles.error}>{error}</Text> : null;

  switch (type) {
    case 'short_text':
      return (
        <View style={styles.container}>
          {renderLabel()}
          <TextInput
            style={[styles.input, error && styles.inputError]}
            value={(value as string) ?? ''}
            onChangeText={onChange}
            maxLength={256}
            placeholderTextColor={Colors.textSecondary}
            placeholder={`Inserir ${label.toLowerCase()}`}
          />
          {renderError()}
        </View>
      );

    case 'long_text':
      return (
        <View style={styles.container}>
          {renderLabel()}
          <TextInput
            style={[styles.input, styles.multiline, error && styles.inputError]}
            value={(value as string) ?? ''}
            onChangeText={onChange}
            multiline
            textAlignVertical="top"
            placeholderTextColor={Colors.textSecondary}
            placeholder={`Inserir ${label.toLowerCase()}`}
          />
          {renderError()}
        </View>
      );

    case 'integer':
      return (
        <View style={styles.container}>
          {renderLabel()}
          <TextInput
            style={[styles.input, error && styles.inputError]}
            value={value !== undefined && value !== null ? String(value) : ''}
            onChangeText={(text) => {
              const cleaned = text.replace(/[^0-9-]/g, '');
              onChange(cleaned === '' ? '' : cleaned);
            }}
            keyboardType="number-pad"
            placeholderTextColor={Colors.textSecondary}
            placeholder={
              config.min !== undefined && config.max !== undefined
                ? `${config.min} - ${config.max}`
                : `Inserir ${label.toLowerCase()}`
            }
          />
          {renderError()}
        </View>
      );

    case 'decimal':
      return (
        <View style={styles.container}>
          {renderLabel()}
          <TextInput
            style={[styles.input, error && styles.inputError]}
            value={value !== undefined && value !== null ? String(value) : ''}
            onChangeText={(text) => {
              const cleaned = text.replace(/[^0-9.,-]/g, '').replace(',', '.');
              onChange(cleaned === '' ? '' : cleaned);
            }}
            keyboardType="decimal-pad"
            placeholderTextColor={Colors.textSecondary}
            placeholder={
              config.min !== undefined && config.max !== undefined
                ? `${config.min} - ${config.max}`
                : `Inserir ${label.toLowerCase()}`
            }
          />
          {renderError()}
        </View>
      );

    case 'category':
      return (
        <CategoryPicker
          field={field}
          value={value as string | undefined}
          onChange={onChange}
          error={error}
        />
      );

    case 'multi_category':
      return (
        <MultiCategoryPicker
          field={field}
          value={(value as string[]) ?? []}
          onChange={onChange}
          error={error}
        />
      );

    case 'boolean':
      return (
        <View style={styles.container}>
          <View style={styles.boolRow}>
            {renderLabel()}
            <Switch
              value={!!value}
              onValueChange={onChange}
              trackColor={{ false: Colors.border, true: Colors.primaryLight }}
              thumbColor={value ? Colors.primary : '#f4f3f4'}
            />
          </View>
          {renderError()}
        </View>
      );

    case 'image': {
      // Single photo capture: value is a string URI or null
      const uri = typeof value === 'string' ? value : null;
      return (
        <View style={styles.container}>
          {renderLabel()}
          <View style={styles.singleImageContainer}>
            {uri ? (
              <View style={styles.imagePreviewWrapper}>
                <RNImage source={{ uri }} style={styles.singleImagePreview} />
                <TouchableOpacity
                  style={styles.imageRemoveBtn}
                  onPress={() => onChange(null)}
                >
                  <Ionicons name="close-circle" size={22} color={Colors.error} />
                </TouchableOpacity>
              </View>
            ) : null}
            <TouchableOpacity
              style={styles.captureButton}
              onPress={() => onCaptureImage?.(field.name, undefined, {
                width: config.photoWidth,
                height: config.photoHeight,
              })}
            >
              <Ionicons name={uri ? 'refresh' : 'camera'} size={22} color={Colors.primary} />
              <Text style={styles.captureButtonText}>
                {uri ? 'Recapturar' : 'Capturar foto'}
              </Text>
            </TouchableOpacity>
          </View>
          {renderError()}
        </View>
      );
    }

    case 'multi_image': {
      // Multi-angle photo capture: value is AnglePhoto[]
      const photos: AnglePhoto[] = Array.isArray(value)
        ? (value as AnglePhoto[])
        : [];
      const angles = field.config.angles ?? [];

      return (
        <MultiAngleCapture
          label={label}
          required={required}
          photos={photos}
          angles={angles}
          error={error}
          onCapture={(angle) => onCaptureImage?.(field.name, angle, {
            width: config.photoWidth,
            height: config.photoHeight,
          })}
          onRemove={(angle) => {
            const updated = photos.filter((p) => p.angle !== angle);
            onChange(updated);
          }}
        />
      );
    }

    case 'date':
      return (
        <DateField
          field={field}
          value={value as string | undefined}
          onChange={onChange}
          error={error}
        />
      );

    case 'time':
      return (
        <TimeField
          field={field}
          value={value as string | undefined}
          onChange={onChange}
          error={error}
        />
      );

    case 'scale':
      return (
        <ScaleField
          field={field}
          value={value as number | undefined}
          onChange={onChange}
          error={error}
        />
      );

    case 'auto_timestamp':
      return (
        <View style={styles.container}>
          {renderLabel()}
          <View style={styles.autoField}>
            <Ionicons name="time-outline" size={18} color={Colors.textSecondary} />
            <Text style={styles.autoText}>{(value as string) ?? 'Preenchido automaticamente'}</Text>
          </View>
        </View>
      );

    case 'auto_gps':
      return (
        <View style={styles.container}>
          {renderLabel()}
          <View style={styles.autoField}>
            <Ionicons name="location-outline" size={18} color={Colors.textSecondary} />
            <Text style={styles.autoText}>{(value as string) ?? 'Preenchido automaticamente'}</Text>
          </View>
        </View>
      );

    case 'auto_uuid':
      return (
        <View style={styles.container}>
          {renderLabel()}
          <View style={styles.autoField}>
            <Ionicons name="finger-print-outline" size={18} color={Colors.textSecondary} />
            <Text style={styles.autoText}>{(value as string) ?? 'Preenchido automaticamente'}</Text>
          </View>
        </View>
      );

    default:
      return (
        <View style={styles.container}>
          <Text style={styles.label}>{label} (tipo não suportado: {type})</Text>
        </View>
      );
  }
}

// ── Category Picker ──
function CategoryPicker({
  field,
  value,
  onChange,
  error,
}: {
  field: SchemaField;
  value: string | undefined;
  onChange: (v: unknown) => void;
  error?: string;
}) {
  const [showModal, setShowModal] = useState(false);
  const options = field.config.options ?? [];

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {field.label}
        {field.required && <Text style={styles.required}> *</Text>}
      </Text>
      <TouchableOpacity
        style={[styles.input, styles.pickerBtn, error && styles.inputError]}
        onPress={() => setShowModal(true)}
      >
        <Text style={value ? styles.pickerValue : styles.pickerPlaceholder}>
          {value ?? `Selecionar ${field.label.toLowerCase()}`}
        </Text>
        <Ionicons name="chevron-down" size={20} color={Colors.textSecondary} />
      </TouchableOpacity>
      {error && <Text style={styles.error}>{error}</Text>}

      <Modal visible={showModal} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowModal(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{field.label}</Text>
            <FlatList
              data={options}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.optionItem, item === value && styles.optionSelected]}
                  onPress={() => {
                    onChange(item);
                    setShowModal(false);
                  }}
                >
                  <Text style={[styles.optionText, item === value && styles.optionTextSelected]}>
                    {item}
                  </Text>
                  {item === value && (
                    <Ionicons name="checkmark" size={20} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ── Multi Category Picker ──
function MultiCategoryPicker({
  field,
  value,
  onChange,
  error,
}: {
  field: SchemaField;
  value: string[];
  onChange: (v: unknown) => void;
  error?: string;
}) {
  const options = field.config.options ?? [];

  const toggle = (option: string) => {
    if (value.includes(option)) {
      onChange(value.filter((v) => v !== option));
    } else {
      onChange([...value, option]);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {field.label}
        {field.required && <Text style={styles.required}> *</Text>}
      </Text>
      <View style={styles.multiOptions}>
        {options.map((option) => {
          const selected = value.includes(option);
          return (
            <TouchableOpacity
              key={option}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => toggle(option)}
            >
              <Ionicons
                name={selected ? 'checkbox' : 'square-outline'}
                size={18}
                color={selected ? Colors.primary : Colors.textSecondary}
              />
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {option}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

// ── Date Field ──
function formatDateMask(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  let result = '';
  for (let i = 0; i < digits.length; i++) {
    if (i === 2 || i === 4) result += '/';
    result += digits[i];
  }
  return result;
}

function getTodayFormatted(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function DateField({
  field,
  value,
  onChange,
  error,
}: {
  field: SchemaField;
  value: string | undefined;
  onChange: (v: string) => void;
  error?: string;
}) {
  // Auto-fill with today if no value set
  const initialValue = value ?? getTodayFormatted();
  const [displayValue, setDisplayValue] = useState(initialValue);

  // Notify parent of initial auto-fill
  React.useEffect(() => {
    if (!value && initialValue) {
      onChange(initialValue);
    }
  }, []);

  const handleChangeText = (text: string) => {
    const masked = formatDateMask(text);
    setDisplayValue(masked);
    onChange(masked);
  };

  const handleToday = () => {
    const today = getTodayFormatted();
    setDisplayValue(today);
    onChange(today);
  };

  return (
    <View style={styles.container}>
      <View style={styles.dateLabelRow}>
        <Text style={[styles.label, { marginBottom: 0 }]}>
          {field.label}
          {field.required && <Text style={styles.required}> *</Text>}
        </Text>
        <TouchableOpacity onPress={handleToday} style={styles.todayBtn}>
          <Text style={styles.todayBtnText}>Hoje</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={[styles.input, error ? styles.inputError : undefined]}
        value={displayValue}
        onChangeText={handleChangeText}
        placeholder="DD/MM/AAAA"
        placeholderTextColor={Colors.textSecondary}
        keyboardType="numeric"
        maxLength={10}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

// ── Scale Field ──
function ScaleField({
  field,
  value,
  onChange,
  error,
}: {
  field: SchemaField;
  value: number | undefined;
  onChange: (v: unknown) => void;
  error?: string;
}) {
  const min = field.config.min ?? 0;
  const max = field.config.max ?? 9;
  const labels = field.config.labels ?? {};
  const range = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {field.label}
        {field.required && <Text style={styles.required}> *</Text>}
      </Text>
      <View style={styles.scaleContainer}>
        {labels[min] && <Text style={styles.scaleLabel}>{labels[min]}</Text>}
        <View style={styles.scaleButtons}>
          {range.map((n) => (
            <TouchableOpacity
              key={n}
              style={[styles.scaleBtn, value === n && styles.scaleBtnSelected]}
              onPress={() => onChange(n)}
            >
              <Text style={[styles.scaleBtnText, value === n && styles.scaleBtnTextSelected]}>
                {n}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {labels[max] && <Text style={styles.scaleLabel}>{labels[max]}</Text>}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

// ── Time Field ──
function formatTimeMask(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  let result = '';
  for (let i = 0; i < digits.length; i++) {
    if (i === 2) result += ':';
    result += digits[i];
  }
  return result;
}

function getNowFormatted(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function TimeField({
  field,
  value,
  onChange,
  error,
}: {
  field: SchemaField;
  value: string | undefined;
  onChange: (v: string) => void;
  error?: string;
}) {
  const initialValue = value ?? getNowFormatted();
  const [displayValue, setDisplayValue] = useState(initialValue);

  // Notify parent of initial auto-fill
  React.useEffect(() => {
    if (!value && initialValue) {
      onChange(initialValue);
    }
  }, []);

  const handleChangeText = (text: string) => {
    const masked = formatTimeMask(text);
    setDisplayValue(masked);
    onChange(masked);
  };

  const handleNow = () => {
    const now = getNowFormatted();
    setDisplayValue(now);
    onChange(now);
  };

  return (
    <View style={styles.container}>
      <View style={styles.dateLabelRow}>
        <Text style={[styles.label, { marginBottom: 0 }]}>
          {field.label}
          {field.required && <Text style={styles.required}> *</Text>}
        </Text>
        <TouchableOpacity onPress={handleNow} style={styles.todayBtn}>
          <Text style={styles.todayBtnText}>Agora</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={[styles.input, error ? styles.inputError : undefined]}
        value={displayValue}
        onChangeText={handleChangeText}
        placeholder="HH:MM"
        placeholderTextColor={Colors.textSecondary}
        keyboardType="numeric"
        maxLength={5}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 6,
  },
  required: {
    color: Colors.error,
  },
  unit: {
    color: Colors.textSecondary,
    fontWeight: '400',
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.text,
    minHeight: 48,
  },
  inputError: {
    borderColor: Colors.error,
  },
  multiline: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  error: {
    fontSize: 12,
    color: Colors.error,
    marginTop: 4,
  },
  boolRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  singleImageContainer: {
    gap: 10,
  },
  imagePreviewWrapper: {
    position: 'relative',
    width: 120,
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  singleImagePreview: {
    width: '100%',
    height: '100%',
  },
  imageRemoveBtn: {
    position: 'absolute',
    top: -2,
    right: -2,
    zIndex: 1,
  },
  captureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primarySurface,
    borderRadius: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
  },
  captureButtonText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '500',
  },
  autoField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primarySurface,
    borderRadius: 10,
    padding: 14,
    minHeight: 48,
  },
  autoText: {
    fontSize: 14,
    color: Colors.textSecondary,
    flex: 1,
  },
  // Category picker
  pickerBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerValue: {
    fontSize: 16,
    color: Colors.text,
  },
  pickerPlaceholder: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '60%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  optionSelected: {
    backgroundColor: Colors.primarySurface,
    borderRadius: 8,
    marginHorizontal: -4,
    paddingHorizontal: 8,
  },
  optionText: {
    fontSize: 16,
    color: Colors.text,
  },
  optionTextSelected: {
    color: Colors.primary,
    fontWeight: '600',
  },
  // Multi category
  multiOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySurface,
  },
  chipText: {
    fontSize: 14,
    color: Colors.text,
  },
  chipTextSelected: {
    color: Colors.primary,
    fontWeight: '500',
  },
  // Date
  dateLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  todayBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.primarySurface,
  },
  todayBtnText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
  },
  // Scale
  scaleContainer: {
    gap: 8,
  },
  scaleLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  scaleButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
  },
  scaleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scaleBtnSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  scaleBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  scaleBtnTextSelected: {
    color: Colors.white,
  },
});
