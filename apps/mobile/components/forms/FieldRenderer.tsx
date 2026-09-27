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
import type { GeoPoint, VariableDefinition } from '@/core/types';
import { unitSymbol } from '@/core/units';
import { isGeoPoint } from '@/core/validation';
import { Colors } from '@/constants/colors';
import { formatGeoPoint } from '@/lib/location';
import { resolveMediaUri } from '@/lib/media';
import { MultiAngleCapture, AnglePhoto } from './MultiAngleCapture';

export interface PhotoConfig {
  width?: number;
  height?: number;
}

export interface SensorHint {
  /** Ex.: "Estação 01 · soil_temp" */
  source: string;
  /** Última leitura disponível, se houver */
  latest?: string;
  onRead: () => void;
}

interface FieldRendererProps {
  field: VariableDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  /** Mostra faixa esperada, resolução e descrição (modo científico) */
  detailed?: boolean;
  sensor?: SensorHint;
  onCaptureImage?: (key: string, angle?: string, photoConfig?: PhotoConfig) => void;
  onScanCode?: (key: string) => void;
  onCaptureLocation?: (key: string) => void;
}

export function FieldRenderer({
  field,
  value,
  onChange,
  error,
  detailed,
  sensor,
  onCaptureImage,
  onScanCode,
  onCaptureLocation,
}: FieldRendererProps) {
  const { type, label, required, config } = field;
  const unit = field.unit && field.unit !== '{score}' ? unitSymbol(field.unit) : '';

  const renderLabel = () => (
    <View>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
        {unit ? <Text style={styles.unit}> ({unit})</Text> : null}
      </Text>
      {detailed && (field.description || field.expectedMin !== undefined || field.expectedMax !== undefined || field.resolution) ? (
        <Text style={styles.detail}>
          {[
            field.description,
            field.expectedMin !== undefined || field.expectedMax !== undefined
              ? `esperado ${field.expectedMin ?? '−∞'} a ${field.expectedMax ?? '+∞'}${unit ? ` ${unit}` : ''}`
              : undefined,
            field.resolution ? `resolução ${field.resolution}` : undefined,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}
    </View>
  );

  const renderError = () => (error ? <Text style={styles.error}>{error}</Text> : null);

  const renderSensor = () =>
    sensor ? (
      <TouchableOpacity style={styles.sensorBtn} onPress={sensor.onRead}>
        <Ionicons name="bluetooth" size={16} color={Colors.primary} />
        <Text style={styles.sensorText} numberOfLines={1}>
          Ler do sensor · {sensor.source}
          {sensor.latest ? ` (${sensor.latest})` : ''}
        </Text>
      </TouchableOpacity>
    ) : null;

  const outOfExpected = (() => {
    const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(',', '.')) : NaN;
    if (!Number.isFinite(n)) return false;
    return (field.expectedMin !== undefined && n < field.expectedMin) || (field.expectedMax !== undefined && n > field.expectedMax);
  })();

  switch (type) {
    case 'short_text':
    case 'long_text':
      return (
        <View style={styles.container}>
          {renderLabel()}
          <TextInput
            style={[styles.input, type === 'long_text' && styles.multiline, error && styles.inputError]}
            value={(value as string) ?? ''}
            onChangeText={onChange}
            maxLength={type === 'short_text' ? 256 : undefined}
            multiline={type === 'long_text'}
            textAlignVertical={type === 'long_text' ? 'top' : 'center'}
            placeholderTextColor={Colors.textSecondary}
            placeholder={`Inserir ${label.toLowerCase()}`}
          />
          {renderError()}
        </View>
      );

    case 'barcode':
      return (
        <View style={styles.container}>
          {renderLabel()}
          <View style={styles.inlineRow}>
            <TextInput
              style={[styles.input, { flex: 1 }, error && styles.inputError]}
              value={(value as string) ?? ''}
              onChangeText={onChange}
              autoCapitalize="characters"
              placeholderTextColor={Colors.textSecondary}
              placeholder="Ler ou digitar código"
            />
            <TouchableOpacity style={styles.iconBtn} onPress={() => onScanCode?.(field.key)} accessibilityLabel="Ler código com a câmera">
              <Ionicons name="barcode-outline" size={24} color={Colors.primary} />
            </TouchableOpacity>
          </View>
          {renderError()}
        </View>
      );

    case 'integer':
    case 'decimal':
      return (
        <View style={styles.container}>
          {renderLabel()}
          <TextInput
            style={[styles.input, error && styles.inputError, !error && outOfExpected && styles.inputWarning]}
            value={value !== undefined && value !== null ? String(value) : ''}
            onChangeText={(text) => {
              const cleaned = type === 'integer' ? text.replace(/[^0-9-]/g, '') : text.replace(/[^0-9.,-]/g, '').replace(',', '.');
              onChange(cleaned);
            }}
            keyboardType={type === 'integer' ? 'number-pad' : 'decimal-pad'}
            placeholderTextColor={Colors.textSecondary}
            placeholder={
              config.min !== undefined && config.max !== undefined ? `${config.min} – ${config.max}` : `Inserir ${label.toLowerCase()}`
            }
          />
          {renderSensor()}
          {!error && outOfExpected ? <Text style={styles.warning}>Fora da faixa esperada — será marcado para revisão</Text> : null}
          {renderError()}
        </View>
      );

    case 'category':
      return <CategoryPicker field={field} value={value as string | undefined} onChange={onChange} error={error} />;

    case 'multi_category':
      return <MultiCategoryPicker field={field} value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} error={error} />;

    case 'boolean':
      return (
        <View style={styles.container}>
          <View style={styles.boolRow}>
            <View style={{ flex: 1 }}>{renderLabel()}</View>
            <Switch
              value={value === true}
              onValueChange={onChange}
              trackColor={{ false: Colors.border, true: Colors.primaryLight }}
              thumbColor={value ? Colors.primary : '#f4f3f4'}
            />
          </View>
          {renderSensor()}
          {renderError()}
        </View>
      );

    case 'image': {
      const uri = typeof value === 'string' && value ? resolveMediaUri(value) : null;
      return (
        <View style={styles.container}>
          {renderLabel()}
          <View style={styles.singleImageContainer}>
            {uri ? (
              <View style={styles.imagePreviewWrapper}>
                <RNImage source={{ uri }} style={styles.singleImagePreview} />
                <TouchableOpacity style={styles.imageRemoveBtn} onPress={() => onChange(null)}>
                  <Ionicons name="close-circle" size={22} color={Colors.error} />
                </TouchableOpacity>
              </View>
            ) : null}
            <TouchableOpacity
              style={styles.captureButton}
              onPress={() => onCaptureImage?.(field.key, undefined, { width: config.photoWidth, height: config.photoHeight })}
            >
              <Ionicons name={uri ? 'refresh' : 'camera'} size={22} color={Colors.primary} />
              <Text style={styles.captureButtonText}>{uri ? 'Fotografar de novo' : 'Fotografar'}</Text>
            </TouchableOpacity>
          </View>
          {renderError()}
        </View>
      );
    }

    case 'multi_image': {
      const photos: AnglePhoto[] = Array.isArray(value)
        ? (value as AnglePhoto[]).map((p) => ({ ...p, uri: resolveMediaUri(p.uri) }))
        : [];
      return (
        <MultiAngleCapture
          label={label}
          required={required}
          photos={photos}
          angles={config.angles ?? []}
          error={error}
          onCapture={(angle) => onCaptureImage?.(field.key, angle, { width: config.photoWidth, height: config.photoHeight })}
          onRemove={(angle) => onChange((Array.isArray(value) ? (value as AnglePhoto[]) : []).filter((p) => p.angle !== angle))}
        />
      );
    }

    case 'gps': {
      const point = isGeoPoint(value) ? (value as GeoPoint) : null;
      return (
        <View style={styles.container}>
          {renderLabel()}
          <TouchableOpacity style={[styles.captureButton, error && styles.inputError]} onPress={() => onCaptureLocation?.(field.key)}>
            <Ionicons name={point ? 'refresh' : 'navigate'} size={20} color={Colors.primary} />
            <Text style={styles.captureButtonText}>{point ? formatGeoPoint(point) : 'Capturar localização'}</Text>
          </TouchableOpacity>
          {point?.accuracy && point.accuracy > 20 ? <Text style={styles.warning}>Precisão baixa (±{Math.round(point.accuracy)} m) — tente de novo em céu aberto</Text> : null}
          {renderError()}
        </View>
      );
    }

    case 'date':
      return <DateField field={field} value={value as string | undefined} onChange={onChange} error={error} />;

    case 'time':
      return <TimeField field={field} value={value as string | undefined} onChange={onChange} error={error} />;

    case 'scale':
      return <ScaleField field={field} value={typeof value === 'number' ? value : value !== undefined && value !== '' ? Number(value) : undefined} onChange={onChange} error={error} />;

    case 'auto_timestamp':
    case 'auto_gps':
    case 'auto_uuid': {
      const icon = type === 'auto_timestamp' ? 'time-outline' : type === 'auto_gps' ? 'location-outline' : 'finger-print-outline';
      const text = type === 'auto_gps' && isGeoPoint(value) ? formatGeoPoint(value) : typeof value === 'string' ? value : 'Preenchido ao salvar';
      return (
        <View style={styles.container}>
          {renderLabel()}
          <View style={styles.autoField}>
            <Ionicons name={icon} size={18} color={Colors.textSecondary} />
            <Text style={styles.autoText}>{text}</Text>
          </View>
        </View>
      );
    }

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
  field: VariableDefinition;
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
  field: VariableDefinition;
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

// ── Date Field (exibe DD/MM/AAAA, grava AAAA-MM-DD) ──
function formatDateMask(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  let result = '';
  for (let i = 0; i < digits.length; i++) {
    if (i === 2 || i === 4) result += '/';
    result += digits[i];
  }
  return result;
}

function displayToIso(display: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : display;
}

function isoToDisplay(value: string | undefined): string {
  if (!value) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function DateField({
  field,
  value,
  onChange,
  error,
}: {
  field: VariableDefinition;
  value: string | undefined;
  onChange: (v: string) => void;
  error?: string;
}) {
  const [displayValue, setDisplayValue] = useState(isoToDisplay(value));

  React.useEffect(() => {
    setDisplayValue((current) => (displayToIso(current) === value ? current : isoToDisplay(value)));
  }, [value]);

  const handleChangeText = (text: string) => {
    const masked = formatDateMask(text);
    setDisplayValue(masked);
    onChange(displayToIso(masked));
  };

  return (
    <View style={styles.container}>
      <View style={styles.dateLabelRow}>
        <Text style={[styles.label, { marginBottom: 0 }]}>
          {field.label}
          {field.required && <Text style={styles.required}> *</Text>}
        </Text>
        <TouchableOpacity onPress={() => onChange(todayIso())} style={styles.todayBtn}>
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
  field: VariableDefinition;
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
  field: VariableDefinition;
  value: string | undefined;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.dateLabelRow}>
        <Text style={[styles.label, { marginBottom: 0 }]}>
          {field.label}
          {field.required && <Text style={styles.required}> *</Text>}
        </Text>
        <TouchableOpacity onPress={() => onChange(getNowFormatted())} style={styles.todayBtn}>
          <Text style={styles.todayBtnText}>Agora</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={[styles.input, error ? styles.inputError : undefined]}
        value={value ?? ''}
        onChangeText={(text) => onChange(formatTimeMask(text))}
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
  detail: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: -2,
    marginBottom: 6,
  },
  inputWarning: {
    borderColor: Colors.warning,
  },
  warning: {
    fontSize: 12,
    color: Colors.warning,
    marginTop: 4,
  },
  inlineRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sensorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingVertical: 6,
  },
  sensorText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
    flex: 1,
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
