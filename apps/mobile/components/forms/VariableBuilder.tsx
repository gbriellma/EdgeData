import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, FlatList, Modal, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { ConditionOperator, FieldType, ProtocolVariable, VariableRole, VariableScope, VisibilityCondition } from '@/core/types';
import { unitSymbol } from '@/core/units';
import {
  createVariable,
  describeCondition,
  FIELD_TYPES,
  fieldTypeInfo,
  isValidKey,
  ROLE_LABELS,
  slugifyKey,
  sortVariables,
} from '@/core/variables';
import { Colors } from '@/constants/colors';
import { Chip } from '@/components/ui/Chip';
import { UnitPicker } from './UnitPicker';

interface VariableBuilderProps {
  scope: VariableScope;
  variables: ProtocolVariable[];
  onChange: (variables: ProtocolVariable[]) => void;
  /** Modo científico: papel, faixa esperada, resolução, exatidão, dado sensível */
  detailed?: boolean;
  /** IDs com dados coletados: não podem ser renomeados */
  lockedKeys?: string[];
}

export function VariableBuilder({ scope, variables, onChange, detailed, lockedKeys = [] }: VariableBuilderProps) {
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<{ variable: ProtocolVariable; originalKey: string | null } | null>(null);
  const sorted = sortVariables(variables);

  const add = (type: FieldType) => {
    setPicking(false);
    const base = createVariable(type, fieldTypeInfo(type).label, variables.map((v) => v.key), sorted.length + 1);
    setEditing({ variable: { ...base, scope }, originalKey: null });
  };

  const save = (variable: ProtocolVariable, originalKey: string | null) => {
    const next = originalKey === null ? [...variables, variable] : variables.map((v) => (v.key === originalKey ? variable : v));
    // Se o ID mudou, atualiza condições que dependiam do ID antigo
    const renamed = originalKey !== null && originalKey !== variable.key;
    onChange(
      renamed
        ? next.map((v) => (v.showIf?.variable === originalKey ? { ...v, showIf: { ...v.showIf, variable: variable.key } } : v))
        : next,
    );
    setEditing(null);
  };

  const remove = (key: string) => {
    const dependents = variables.filter((v) => v.showIf?.variable === key);
    Alert.alert(
      'Remover variável',
      dependents.length
        ? `As condições de ${dependents.map((d) => d.label).join(', ')} dependem dela e serão removidas.`
        : lockedKeys.includes(key)
          ? 'Já existem dados desta variável. Eles continuam guardados na versão anterior do protocolo.'
          : 'Tem certeza?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () =>
            onChange(
              sortVariables(variables.filter((v) => v.key !== key)).map((v, i) => ({
                ...v,
                order: i + 1,
                showIf: v.showIf?.variable === key ? undefined : v.showIf,
              })),
            ),
        },
      ],
    );
  };

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= sorted.length) return;
    const list = [...sorted];
    [list[index], list[target]] = [list[target], list[index]];
    onChange(list.map((v, i) => ({ ...v, order: i + 1 })));
  };

  return (
    <View>
      {sorted.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="options-outline" size={32} color={Colors.textSecondary} />
          <Text style={styles.emptyText}>Nenhuma variável</Text>
        </View>
      ) : (
        sorted.map((v, index) => {
          const info = fieldTypeInfo(v.type);
          const meta = [
            info.label,
            v.unit && v.unit !== '{score}' ? unitSymbol(v.unit) : undefined,
            v.required ? 'obrigatória' : undefined,
            detailed && v.role ? ROLE_LABELS[v.role] : undefined,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <View key={v.key} style={styles.card}>
              <TouchableOpacity style={styles.cardMain} onPress={() => setEditing({ variable: v, originalKey: v.key })}>
                <Ionicons name={info.icon as keyof typeof Ionicons.glyphMap} size={20} color={Colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{v.label}</Text>
                  <Text style={styles.cardMeta}>{meta}</Text>
                  <Text style={styles.cardKey}>{v.key}</Text>
                  {v.showIf ? <Text style={styles.cardCondition}>Aparece {describeCondition(v.showIf, variables)}</Text> : null}
                </View>
              </TouchableOpacity>
              <View style={styles.cardActions}>
                <TouchableOpacity onPress={() => move(index, -1)} disabled={index === 0} hitSlop={6}>
                  <Ionicons name="chevron-up" size={20} color={index === 0 ? Colors.border : Colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => move(index, 1)} disabled={index === sorted.length - 1} hitSlop={6}>
                  <Ionicons name="chevron-down" size={20} color={index === sorted.length - 1 ? Colors.border : Colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => remove(v.key)} hitSlop={6}>
                  <Ionicons name="trash-outline" size={18} color={Colors.error} />
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}

      <TouchableOpacity style={styles.addButton} onPress={() => setPicking(true)}>
        <Ionicons name="add-circle-outline" size={22} color={Colors.primary} />
        <Text style={styles.addText}>Nova variável</Text>
      </TouchableOpacity>

      <Modal visible={picking} transparent animationType="slide" onRequestClose={() => setPicking(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setPicking(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Tipo da variável</Text>
            <FlatList
              data={FIELD_TYPES}
              keyExtractor={(item) => item.type}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.typeItem} onPress={() => add(item.type)}>
                  <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={22} color={Colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.typeName}>{item.label}</Text>
                    <Text style={styles.typeDesc}>{item.description}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {editing ? (
        <VariableEditor
          variable={editing.variable}
          siblings={variables.filter((v) => v.key !== editing.originalKey)}
          keyLocked={editing.originalKey !== null && lockedKeys.includes(editing.originalKey)}
          detailed={detailed}
          onCancel={() => setEditing(null)}
          onSave={(variable) => save(variable, editing.originalKey)}
        />
      ) : null}
    </View>
  );
}

// ── Editor de uma variável ───────────────────────────────────────────────────

const numberOrUndefined = (text: string): number | undefined => {
  const t = text.trim().replace(',', '.');
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};
const numberText = (n: number | undefined) => (n === undefined ? '' : String(n));

const OPERATORS: { op: ConditionOperator; label: string; needsValue: boolean }[] = [
  { op: 'truthy', label: 'preenchido / sim', needsValue: false },
  { op: 'falsy', label: 'vazio / não', needsValue: false },
  { op: 'equals', label: 'igual a', needsValue: true },
  { op: 'not_equals', label: 'diferente de', needsValue: true },
  { op: 'gt', label: 'maior que', needsValue: true },
  { op: 'lt', label: 'menor que', needsValue: true },
];

function VariableEditor({
  variable,
  siblings,
  keyLocked,
  detailed,
  onSave,
  onCancel,
}: {
  variable: ProtocolVariable;
  siblings: ProtocolVariable[];
  keyLocked: boolean;
  detailed?: boolean;
  onSave: (variable: ProtocolVariable) => void;
  onCancel: () => void;
}) {
  const info = fieldTypeInfo(variable.type);
  const [draft, setDraft] = useState<ProtocolVariable>({ ...variable, config: { ...variable.config } });
  const [keyEdited, setKeyEdited] = useState(variable.label !== info.label);
  const [texts, setTexts] = useState({
    min: numberText(variable.config.min),
    max: numberText(variable.config.max),
    decimals: numberText(variable.config.decimals),
    expectedMin: numberText(variable.expectedMin),
    expectedMax: numberText(variable.expectedMax),
    resolution: numberText(variable.resolution),
    accuracy: numberText(variable.accuracy),
    options: (variable.config.options ?? []).join('\n'),
    angles: (variable.config.angles ?? []).map((a) => a.label).join('\n'),
    photoWidth: numberText(variable.config.photoWidth),
    scaleMinLabel: variable.config.labels?.[variable.config.min ?? 0] ?? '',
    scaleMaxLabel: variable.config.labels?.[variable.config.max ?? 9] ?? '',
    conditionValue: variable.showIf?.value !== undefined ? String(variable.showIf.value) : '',
  });
  const set = <K extends keyof ProtocolVariable>(key: K, value: ProtocolVariable[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setText = (key: keyof typeof texts, value: string) => setTexts((t) => ({ ...t, [key]: value }));

  const numeric = ['integer', 'decimal', 'scale'].includes(draft.type);
  const conditionCandidates = siblings.filter((s) => !fieldTypeInfo(s.type).automatic && s.type !== 'image' && s.type !== 'multi_image' && s.type !== 'gps');

  const handleSave = () => {
    const label = draft.label.trim();
    const key = draft.key.trim();
    if (!label) return Alert.alert('Atenção', 'Informe o rótulo');
    if (!isValidKey(key)) return Alert.alert('Atenção', 'ID inválido: use letras minúsculas, números e _ (começando por letra)');
    if (siblings.some((s) => s.key === key)) return Alert.alert('Atenção', `Já existe uma variável com o ID ${key}`);

    const config = { ...draft.config };
    if (numeric) {
      config.min = numberOrUndefined(texts.min);
      config.max = numberOrUndefined(texts.max);
    }
    if (draft.type === 'decimal') config.decimals = numberOrUndefined(texts.decimals);
    if (draft.type === 'category' || draft.type === 'multi_category') {
      config.options = [...new Set(texts.options.split('\n').map((o) => o.trim()).filter(Boolean))];
      if (config.options.length === 0) return Alert.alert('Atenção', 'Informe ao menos uma opção (uma por linha)');
    }
    if (draft.type === 'scale') {
      const min = config.min ?? 0;
      const max = config.max ?? 9;
      if (max - min > 20) return Alert.alert('Atenção', 'Escalas podem ter no máximo 21 pontos');
      config.labels = {
        ...(texts.scaleMinLabel.trim() ? { [min]: texts.scaleMinLabel.trim() } : {}),
        ...(texts.scaleMaxLabel.trim() ? { [max]: texts.scaleMaxLabel.trim() } : {}),
      };
    }
    if (draft.type === 'multi_image') {
      const labels = [...new Set(texts.angles.split('\n').map((a) => a.trim()).filter(Boolean))];
      if (labels.length === 0) return Alert.alert('Atenção', 'Informe ao menos um ângulo (um por linha)');
      config.angles = labels.map((l) => ({ key: slugifyKey(l), label: l }));
    }
    if (draft.type === 'image' || draft.type === 'multi_image') config.photoWidth = numberOrUndefined(texts.photoWidth);

    let showIf: VisibilityCondition | undefined = draft.showIf;
    if (showIf) {
      const needsValue = OPERATORS.find((o) => o.op === showIf!.op)?.needsValue;
      if (needsValue) {
        const raw = texts.conditionValue.trim();
        if (!raw) return Alert.alert('Atenção', 'Informe o valor da condição');
        showIf = { ...showIf, value: showIf.op === 'gt' || showIf.op === 'lt' ? Number(raw.replace(',', '.')) : raw };
      } else {
        showIf = { variable: showIf.variable, op: showIf.op };
      }
    }

    onSave({
      ...draft,
      label,
      key,
      description: draft.description?.trim() || undefined,
      expectedMin: numeric ? numberOrUndefined(texts.expectedMin) : undefined,
      expectedMax: numeric ? numberOrUndefined(texts.expectedMax) : undefined,
      resolution: numeric ? numberOrUndefined(texts.resolution) : undefined,
      accuracy: numeric ? numberOrUndefined(texts.accuracy) : undefined,
      showIf,
      config,
    });
  };

  const parent = draft.showIf ? siblings.find((s) => s.key === draft.showIf!.variable) : undefined;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { maxHeight: '92%' }]}>
          <View style={styles.sheetHeaderRow}>
            <Text style={styles.sheetTitle}>{info.label}</Text>
            <TouchableOpacity onPress={onCancel} hitSlop={10}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Field label="Nome exibido">
              <TextInput
                style={styles.input}
                value={draft.label}
                onChangeText={(text) => {
                  set('label', text);
                  if (!keyEdited && !keyLocked) set('key', slugifyKey(text));
                }}
                placeholder="Ex.: Temperatura do solo"
                placeholderTextColor={Colors.textSecondary}
              />
            </Field>
            <Field label="ID (nome da coluna no dataset)" hint={keyLocked ? 'Já há dados com este ID — não pode ser renomeado.' : 'snake_case, estável'}>
              <TextInput
                style={[styles.input, keyLocked && styles.inputDisabled]}
                value={draft.key}
                editable={!keyLocked}
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(text) => {
                  setKeyEdited(true);
                  set('key', text);
                }}
              />
            </Field>
            <Field label="Descrição (opcional)">
              <TextInput
                style={[styles.input, { minHeight: 60 }]}
                multiline
                value={draft.description ?? ''}
                onChangeText={(text) => set('description', text)}
                placeholder="Como é medida, com qual instrumento…"
                placeholderTextColor={Colors.textSecondary}
              />
            </Field>
            {!info.automatic ? (
              <View style={styles.switchRow}>
                <Text style={styles.fieldLabel}>Obrigatória</Text>
                <Switch value={draft.required} onValueChange={(v) => set('required', v)} />
              </View>
            ) : null}

            {info.measurable ? <UnitPicker value={draft.unit} onChange={(code) => set('unit', code)} /> : null}

            {numeric ? (
              <>
                <View style={styles.row2}>
                  <Field label="Mínimo aceito" style={{ flex: 1 }}>
                    <TextInput style={styles.input} keyboardType="numbers-and-punctuation" value={texts.min} onChangeText={(t) => setText('min', t)} />
                  </Field>
                  <Field label="Máximo aceito" style={{ flex: 1 }}>
                    <TextInput style={styles.input} keyboardType="numbers-and-punctuation" value={texts.max} onChangeText={(t) => setText('max', t)} />
                  </Field>
                </View>
                {draft.type === 'decimal' ? (
                  <Field label="Casas decimais">
                    <TextInput style={styles.input} keyboardType="number-pad" value={texts.decimals} onChangeText={(t) => setText('decimals', t)} />
                  </Field>
                ) : null}
                {draft.type === 'scale' ? (
                  <View style={styles.row2}>
                    <Field label="Rótulo do mínimo" style={{ flex: 1 }}>
                      <TextInput style={styles.input} value={texts.scaleMinLabel} onChangeText={(t) => setText('scaleMinLabel', t)} placeholder="Ex.: Sem sintomas" placeholderTextColor={Colors.textSecondary} />
                    </Field>
                    <Field label="Rótulo do máximo" style={{ flex: 1 }}>
                      <TextInput style={styles.input} value={texts.scaleMaxLabel} onChangeText={(t) => setText('scaleMaxLabel', t)} placeholder="Ex.: Muito severo" placeholderTextColor={Colors.textSecondary} />
                    </Field>
                  </View>
                ) : null}
                {detailed ? (
                  <>
                    <View style={styles.row2}>
                      <Field label="Esperado de" style={{ flex: 1 }} hint="Fora da faixa: aceito, mas sinalizado">
                        <TextInput style={styles.input} keyboardType="numbers-and-punctuation" value={texts.expectedMin} onChangeText={(t) => setText('expectedMin', t)} />
                      </Field>
                      <Field label="até" style={{ flex: 1 }}>
                        <TextInput style={styles.input} keyboardType="numbers-and-punctuation" value={texts.expectedMax} onChangeText={(t) => setText('expectedMax', t)} />
                      </Field>
                    </View>
                    <View style={styles.row2}>
                      <Field label="Resolução" style={{ flex: 1 }}>
                        <TextInput style={styles.input} keyboardType="decimal-pad" value={texts.resolution} onChangeText={(t) => setText('resolution', t)} placeholder="0,1" placeholderTextColor={Colors.textSecondary} />
                      </Field>
                      <Field label="Exatidão (±)" style={{ flex: 1 }}>
                        <TextInput style={styles.input} keyboardType="decimal-pad" value={texts.accuracy} onChangeText={(t) => setText('accuracy', t)} placeholder="0,5" placeholderTextColor={Colors.textSecondary} />
                      </Field>
                    </View>
                  </>
                ) : null}
              </>
            ) : null}

            {draft.type === 'category' || draft.type === 'multi_category' ? (
              <Field label="Opções (uma por linha)">
                <TextInput style={[styles.input, { minHeight: 100 }]} multiline value={texts.options} onChangeText={(t) => setText('options', t)} textAlignVertical="top" />
              </Field>
            ) : null}

            {draft.type === 'multi_image' ? (
              <Field label="Ângulos (um por linha)">
                <TextInput style={[styles.input, { minHeight: 80 }]} multiline value={texts.angles} onChangeText={(t) => setText('angles', t)} placeholder={'Superior\nLateral'} placeholderTextColor={Colors.textSecondary} textAlignVertical="top" />
              </Field>
            ) : null}
            {draft.type === 'image' || draft.type === 'multi_image' ? (
              <Field label="Largura da foto em pixels (opcional)" hint="Vazio = resolução original da câmera">
                <TextInput style={styles.input} keyboardType="number-pad" value={texts.photoWidth} onChangeText={(t) => setText('photoWidth', t)} />
              </Field>
            ) : null}

            {detailed ? (
              <Field label="Papel no experimento">
                <View style={styles.chips}>
                  {(Object.keys(ROLE_LABELS) as VariableRole[]).map((role) => (
                    <Chip key={role} label={ROLE_LABELS[role]} selected={draft.role === role} onPress={() => set('role', draft.role === role ? undefined : role)} />
                  ))}
                </View>
              </Field>
            ) : null}

            {!info.automatic && conditionCandidates.length > 0 ? (
              <Field label="Mostrar somente quando…" hint="Deixe sem condição para mostrar sempre">
                <View style={styles.chips}>
                  <Chip label="Sempre" selected={!draft.showIf} onPress={() => set('showIf', undefined)} />
                  {conditionCandidates.map((c) => (
                    <Chip
                      key={c.key}
                      label={c.label}
                      selected={draft.showIf?.variable === c.key}
                      onPress={() => set('showIf', { variable: c.key, op: c.type === 'boolean' ? 'truthy' : 'equals' })}
                    />
                  ))}
                </View>
                {draft.showIf && parent ? (
                  <View style={{ marginTop: 10, gap: 8 }}>
                    <View style={styles.chips}>
                      {OPERATORS.filter((o) => (o.op === 'gt' || o.op === 'lt' ? ['integer', 'decimal', 'scale'].includes(parent.type) : true)).map((o) => (
                        <Chip key={o.op} label={o.label} selected={draft.showIf?.op === o.op} onPress={() => set('showIf', { ...draft.showIf!, op: o.op })} />
                      ))}
                    </View>
                    {OPERATORS.find((o) => o.op === draft.showIf?.op)?.needsValue ? (
                      parent.config.options?.length ? (
                        <View style={styles.chips}>
                          {parent.config.options.map((opt) => (
                            <Chip key={opt} label={opt} selected={texts.conditionValue === opt} onPress={() => setText('conditionValue', opt)} />
                          ))}
                        </View>
                      ) : (
                        <TextInput style={styles.input} value={texts.conditionValue} onChangeText={(t) => setText('conditionValue', t)} placeholder="Valor" placeholderTextColor={Colors.textSecondary} />
                      )
                    ) : null}
                  </View>
                ) : null}
              </Field>
            ) : null}

            {detailed && !info.automatic ? (
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Dado pessoal ou sensível (LGPD)</Text>
                  <Text style={styles.hint}>Sinalizado no dicionário de dados</Text>
                </View>
                <Switch value={!!draft.sensitive} onValueChange={(v) => set('sensitive', v || undefined)} />
              </View>
            ) : null}
          </ScrollView>
          <View style={styles.footer}>
            <TouchableOpacity style={[styles.footerBtn, styles.footerCancel]} onPress={onCancel}>
              <Text style={styles.footerCancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.footerBtn, styles.footerSave]} onPress={handleSave}>
              <Text style={styles.footerSaveText}>Salvar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Field({ label, hint, children, style }: { label: string; hint?: string; children: React.ReactNode; style?: object }) {
  return (
    <View style={[{ marginBottom: 14 }, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', padding: 24, gap: 6 },
  emptyText: { color: Colors.textSecondary, fontSize: 14 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  cardMain: { flex: 1, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: Colors.text },
  cardMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  cardKey: { fontSize: 11, color: Colors.textSecondary, fontFamily: 'monospace', marginTop: 2 },
  cardCondition: { fontSize: 12, color: Colors.primary, marginTop: 4 },
  cardActions: { gap: 10, alignItems: 'center' },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    backgroundColor: Colors.primarySurface,
  },
  addText: { color: Colors.primary, fontWeight: '600', fontSize: 15 },
  overlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '75%' },
  sheetHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  typeItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  typeName: { fontSize: 15, fontWeight: '600', color: Colors.text },
  typeDesc: { fontSize: 12, color: Colors.textSecondary },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  hint: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  inputDisabled: { backgroundColor: Colors.background, color: Colors.textSecondary },
  row2: { flexDirection: 'row', gap: 10 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  footer: { flexDirection: 'row', gap: 10, paddingTop: 12 },
  footerBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  footerCancel: { borderWidth: 1, borderColor: Colors.border },
  footerSave: { backgroundColor: Colors.primary },
  footerCancelText: { color: Colors.text, fontWeight: '600' },
  footerSaveText: { color: Colors.white, fontWeight: '700' },
});
