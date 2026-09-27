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
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Schema, SchemaField, FieldType, FieldConfig } from '@/types/schema';
import { FIELD_TYPES, getFieldTypeDef } from '@/constants/fieldTypes';
import { Colors } from '@/constants/colors';

interface SchemaBuilderProps {
  schema: Schema;
  onChange: (schema: Schema) => void;
  locked?: boolean; // true when collections exist - can't remove fields
}

export function SchemaBuilder({ schema, onChange, locked = false }: SchemaBuilderProps) {
  const [showAddField, setShowAddField] = useState(false);
  const [editingField, setEditingField] = useState<SchemaField | null>(null);

  const addField = (type: FieldType) => {
    const def = getFieldTypeDef(type);
    const count = schema.fields.length;
    const newField: SchemaField = {
      name: `campo_${count + 1}`,
      label: `${def.label} ${count + 1}`,
      type,
      required: false,
      order: count,
      config: { ...def.defaultConfig },
    };
    setShowAddField(false);
    setEditingField(newField);
  };

  const saveField = (field: SchemaField, originalName: string) => {
    const existing = schema.fields.findIndex((f) => f.name === originalName);
    let newFields: SchemaField[];
    if (existing >= 0) {
      newFields = schema.fields.map((f, i) => (i === existing ? field : f));
    } else {
      newFields = [...schema.fields, field];
    }
    onChange({ fields: newFields });
    setEditingField(null);
  };

  const removeField = (name: string) => {
    if (locked) {
      Alert.alert('Não é possível', 'Campos não podem ser removidos após existirem coletas.');
      return;
    }
    Alert.alert('Remover campo', 'Tem certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () => {
          const newFields = schema.fields
            .filter((f) => f.name !== name)
            .map((f, i) => ({ ...f, order: i }));
          onChange({ fields: newFields });
        },
      },
    ]);
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= schema.fields.length) return;
    const sorted = [...schema.fields].sort((a, b) => a.order - b.order);
    const temp = sorted[index];
    sorted[index] = sorted[newIndex];
    sorted[newIndex] = temp;
    const reordered = sorted.map((f, i) => ({ ...f, order: i }));
    onChange({ fields: reordered });
  };

  const sortedFields = [...schema.fields].sort((a, b) => a.order - b.order);

  return (
    <View style={styles.container}>
      {sortedFields.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="list-outline" size={36} color={Colors.textSecondary} />
          <Text style={styles.emptyText}>Nenhum campo definido</Text>
          <Text style={styles.emptyHint}>Adicione campos para definir a estrutura de dados</Text>
        </View>
      ) : (
        sortedFields.map((field, index) => (
          <View key={field.name} style={styles.fieldCard}>
            <View style={styles.fieldHeader}>
              <View style={styles.fieldInfo}>
                <Ionicons
                  name={(getFieldTypeDef(field.type).icon as any)}
                  size={18}
                  color={Colors.primary}
                />
                <View style={styles.fieldLabels}>
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  <Text style={styles.fieldMeta}>
                    {getFieldTypeDef(field.type).label}
                    {field.required ? ' • Obrigatório' : ''}
                  </Text>
                </View>
              </View>
              <View style={styles.fieldActions}>
                <TouchableOpacity onPress={() => moveField(index, 'up')} disabled={index === 0}>
                  <Ionicons name="chevron-up" size={20} color={index === 0 ? Colors.border : Colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => moveField(index, 'down')} disabled={index === sortedFields.length - 1}>
                  <Ionicons name="chevron-down" size={20} color={index === sortedFields.length - 1 ? Colors.border : Colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setEditingField(field)}>
                  <Ionicons name="pencil" size={18} color={Colors.primary} />
                </TouchableOpacity>
                {!locked && (
                  <TouchableOpacity onPress={() => removeField(field.name)}>
                    <Ionicons name="trash-outline" size={18} color={Colors.error} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        ))
      )}

      <TouchableOpacity style={styles.addButton} onPress={() => setShowAddField(true)}>
        <Ionicons name="add-circle-outline" size={22} color={Colors.primary} />
        <Text style={styles.addText}>Adicionar campo</Text>
      </TouchableOpacity>

      {/* Add Field Type Modal */}
      <Modal visible={showAddField} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowAddField(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Tipo de campo</Text>
            <FlatList
              data={FIELD_TYPES}
              keyExtractor={(item) => item.type}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.typeItem}
                  onPress={() => addField(item.type)}
                >
                  <Ionicons name={(item.icon as any)} size={22} color={Colors.primary} />
                  <View style={styles.typeInfo}>
                    <Text style={styles.typeName}>{item.label}</Text>
                    <Text style={styles.typeDesc}>{item.description}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Edit Field Modal */}
      {editingField && (
        <FieldEditor
          field={editingField}
          onSave={saveField}
          onCancel={() => setEditingField(null)}
          existingNames={schema.fields.map((f) => f.name).filter((n) => n !== editingField.name)}
        />
      )}
    </View>
  );
}

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

// ── Field Editor Modal ──
function FieldEditor({
  field,
  onSave,
  onCancel,
  existingNames,
}: {
  field: SchemaField;
  onSave: (f: SchemaField, originalName: string) => void;
  onCancel: () => void;
  existingNames: string[];
}) {
  const [originalName] = useState(field.name);
  const [name, setName] = useState(field.name);
  const [label, setLabel] = useState(field.label);
  const [userEditedName, setUserEditedName] = useState(
    // If the name is not a generic placeholder, the user has customized it
    !/^campo_\d+$/.test(field.name)
  );
  const [required, setRequired] = useState(field.required);
  const [config, setConfig] = useState<FieldConfig>({ ...field.config });
  const [optionsText, setOptionsText] = useState(
    (field.config.options ?? []).join('\n')
  );
  // Local string states for numeric config fields to avoid NaN on intermediate input
  const [minText, setMinText] = useState(field.config.min !== undefined ? String(field.config.min) : '');
  const [maxText, setMaxText] = useState(field.config.max !== undefined ? String(field.config.max) : '');
  const [decimalsText, setDecimalsText] = useState(field.config.decimals !== undefined ? String(field.config.decimals) : '');

  const [anglesConfig, setAnglesConfig] = useState<Array<{ key: string; label: string }>>(
    field.config.angles ?? []
  );
  const [photoWidthText, setPhotoWidthText] = useState(
    field.config.photoWidth !== undefined ? String(field.config.photoWidth) : ''
  );
  const [photoHeightText, setPhotoHeightText] = useState(
    field.config.photoHeight !== undefined ? String(field.config.photoHeight) : ''
  );

  const needsOptions = field.type === 'category' || field.type === 'multi_category';
  const needsMinMax = field.type === 'integer' || field.type === 'decimal' || field.type === 'scale';
  const needsDecimals = field.type === 'decimal';
  const needsUnit = field.type === 'decimal';
  const needsLabels = field.type === 'scale';
  const needsAngles = field.type === 'multi_image';
  const needsPhotoConfig = field.type === 'image' || field.type === 'multi_image';

  const handleSave = () => {
    const cleanName = slugify(name.trim());
    if (!cleanName) {
      Alert.alert('Erro', 'Nome do campo é obrigatório');
      return;
    }
    if (!label.trim()) {
      Alert.alert('Erro', 'Rótulo do campo é obrigatório');
      return;
    }
    if (existingNames.includes(cleanName)) {
      Alert.alert('Erro', 'Já existe um campo com este nome');
      return;
    }

    const finalConfig = { ...config };
    if (needsOptions) {
      finalConfig.options = optionsText
        .split('\n')
        .map((o) => o.trim())
        .filter((o) => o !== '');
    }
    if (needsMinMax) {
      finalConfig.min = minText.trim() === '' ? undefined : Number(minText);
      finalConfig.max = maxText.trim() === '' ? undefined : Number(maxText);
    }
    if (needsDecimals) {
      finalConfig.decimals = decimalsText.trim() === '' ? undefined : Number(decimalsText);
    }
    if (needsAngles) {
      finalConfig.angles = anglesConfig
        .filter((a) => a.label.trim() !== '')
        .map((a) => ({
          key: a.label.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
          label: a.label.trim(),
        }));
    }
    if (needsPhotoConfig) {
      finalConfig.photoWidth = photoWidthText.trim() === '' ? undefined : Number(photoWidthText);
      finalConfig.photoHeight = photoHeightText.trim() === '' ? undefined : Number(photoHeightText);
    }

    onSave({
      ...field,
      name: cleanName,
      label: label.trim(),
      required,
      config: finalConfig,
    }, originalName);
  };

  return (
    <Modal visible transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { maxHeight: '80%' }]}>
          <Text style={styles.modalTitle}>
            Configurar: {getFieldTypeDef(field.type).label}
          </Text>

          <ScrollView>
            <View style={styles.editorField}>
              <Text style={styles.editorLabel}>Rótulo (exibido ao usuário)</Text>
              <TextInput
                style={styles.editorInput}
                value={label}
                onChangeText={(text) => {
                  setLabel(text);
                  if (!userEditedName) {
                    setName(slugify(text));
                  }
                }}
                placeholder="Ex: Nome da Planta"
                placeholderTextColor={Colors.textSecondary}
              />
            </View>

            <View style={styles.editorField}>
              <Text style={styles.editorLabel}>Nome interno (snake_case)</Text>
              <TextInput
                style={styles.editorInput}
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  setUserEditedName(true);
                }}
                placeholder="Ex: nome_planta"
                placeholderTextColor={Colors.textSecondary}
                autoCapitalize="none"
              />
            </View>

            <View style={[styles.editorField, styles.editorRow]}>
              <Text style={styles.editorLabel}>Obrigatório</Text>
              <Switch
                value={required}
                onValueChange={setRequired}
                trackColor={{ false: Colors.border, true: Colors.primaryLight }}
                thumbColor={required ? Colors.primary : '#f4f3f4'}
              />
            </View>

            {needsMinMax && (
              <View style={styles.editorRow}>
                <View style={[styles.editorField, { flex: 1 }]}>
                  <Text style={styles.editorLabel}>Mínimo</Text>
                  <TextInput
                    style={styles.editorInput}
                    value={minText}
                    onChangeText={setMinText}
                    keyboardType="numeric"
                    placeholder="Min"
                    placeholderTextColor={Colors.textSecondary}
                  />
                </View>
                <View style={[styles.editorField, { flex: 1 }]}>
                  <Text style={styles.editorLabel}>Máximo</Text>
                  <TextInput
                    style={styles.editorInput}
                    value={maxText}
                    onChangeText={setMaxText}
                    keyboardType="numeric"
                    placeholder="Max"
                    placeholderTextColor={Colors.textSecondary}
                  />
                </View>
              </View>
            )}

            {needsDecimals && (
              <View style={styles.editorField}>
                <Text style={styles.editorLabel}>Casas decimais</Text>
                <TextInput
                  style={styles.editorInput}
                  value={decimalsText}
                  onChangeText={setDecimalsText}
                  keyboardType="numeric"
                  placeholder="2"
                  placeholderTextColor={Colors.textSecondary}
                />
              </View>
            )}

            {needsUnit && (
              <View style={styles.editorField}>
                <Text style={styles.editorLabel}>Unidade de medida</Text>
                <TextInput
                  style={styles.editorInput}
                  value={config.unit ?? ''}
                  onChangeText={(t) => setConfig({ ...config, unit: t || undefined })}
                  placeholder="Ex: cm, kg, °C"
                  placeholderTextColor={Colors.textSecondary}
                />
              </View>
            )}

            {needsOptions && (
              <View style={styles.editorField}>
                <Text style={styles.editorLabel}>Opções (uma por linha)</Text>
                <TextInput
                  style={[styles.editorInput, { minHeight: 100, textAlignVertical: 'top' }]}
                  value={optionsText}
                  onChangeText={setOptionsText}
                  multiline
                  placeholder={'Opção 1\nOpção 2\nOpção 3'}
                  placeholderTextColor={Colors.textSecondary}
                />
              </View>
            )}

            {needsLabels && (
              <View style={styles.editorRow}>
                <View style={[styles.editorField, { flex: 1 }]}>
                  <Text style={styles.editorLabel}>Label mín</Text>
                  <TextInput
                    style={styles.editorInput}
                    value={(config.labels as Record<number, string>)?.[config.min ?? 0] ?? ''}
                    onChangeText={(t) =>
                      setConfig({
                        ...config,
                        labels: { ...(config.labels ?? {}), [config.min ?? 0]: t },
                      })
                    }
                    placeholder="Ex: Saudável"
                    placeholderTextColor={Colors.textSecondary}
                  />
                </View>
                <View style={[styles.editorField, { flex: 1 }]}>
                  <Text style={styles.editorLabel}>Label máx</Text>
                  <TextInput
                    style={styles.editorInput}
                    value={(config.labels as Record<number, string>)?.[config.max ?? 9] ?? ''}
                    onChangeText={(t) =>
                      setConfig({
                        ...config,
                        labels: { ...(config.labels ?? {}), [config.max ?? 9]: t },
                      })
                    }
                    placeholder="Ex: Severo"
                    placeholderTextColor={Colors.textSecondary}
                  />
                </View>
              </View>
            )}

            {needsAngles && (
              <View style={styles.editorField}>
                <Text style={styles.editorLabel}>Ângulos / entradas de foto</Text>
                {anglesConfig.map((angle, idx) => (
                  <View key={idx} style={[styles.editorRow, { marginBottom: 8 }]}>
                    <TextInput
                      style={[styles.editorInput, { flex: 1 }]}
                      value={angle.label}
                      onChangeText={(t) => {
                        const updated = [...anglesConfig];
                        updated[idx] = {
                          key: t.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
                          label: t,
                        };
                        setAnglesConfig(updated);
                      }}
                      placeholder="Nome do ângulo"
                      placeholderTextColor={Colors.textSecondary}
                    />
                    <TouchableOpacity onPress={() => {
                      setAnglesConfig(anglesConfig.filter((_, i) => i !== idx));
                    }}>
                      <Ionicons name="close-circle" size={24} color={Colors.error} />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity
                  style={styles.addAngleBtn}
                  onPress={() => setAnglesConfig([...anglesConfig, { key: '', label: '' }])}
                >
                  <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
                  <Text style={styles.addAngleText}>Adicionar ângulo</Text>
                </TouchableOpacity>
              </View>
            )}

            {needsPhotoConfig && (
              <>
                <Text style={[styles.editorLabel, { marginTop: 8 }]}>Padronização de foto</Text>
                <View style={styles.editorRow}>
                  <View style={[styles.editorField, { flex: 1 }]}>
                    <Text style={styles.editorLabel}>Largura (px)</Text>
                    <TextInput
                      style={styles.editorInput}
                      value={photoWidthText}
                      onChangeText={setPhotoWidthText}
                      keyboardType="numeric"
                      placeholder="Auto"
                      placeholderTextColor={Colors.textSecondary}
                    />
                  </View>
                  <View style={[styles.editorField, { flex: 1 }]}>
                    <Text style={styles.editorLabel}>Altura (px)</Text>
                    <TextInput
                      style={styles.editorInput}
                      value={photoHeightText}
                      onChangeText={setPhotoHeightText}
                      keyboardType="numeric"
                      placeholder="Auto"
                      placeholderTextColor={Colors.textSecondary}
                    />
                  </View>
                </View>
              </>
            )}
          </ScrollView>

          <View style={styles.editorActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveText}>Salvar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  emptyState: {
    backgroundColor: Colors.primarySurface,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  emptyHint: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  fieldCard: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fieldHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fieldInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  fieldLabels: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  fieldMeta: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  fieldActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySurface,
  },
  addText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.primary,
  },
  // Modals
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
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  typeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  typeInfo: {
    flex: 1,
  },
  typeName: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
  },
  typeDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  // Field Editor
  editorField: {
    marginBottom: 16,
  },
  editorLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  editorInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.text,
  },
  editorRow: {
    flexDirection: 'row',
    gap: 12,
  },
  editorActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.white,
  },
  addAngleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  addAngleText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '500',
  },
});
