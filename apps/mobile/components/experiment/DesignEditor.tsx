import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { describeDesign, expandTreatments, validateDesign } from '@/core/design';
import type { ExperimentalDesign, Factor } from '@/core/types';
import { slugifyKey, uniqueKey } from '@/core/variables';
import { Colors } from '@/constants/colors';
import { Chip } from '@/components/ui/Chip';
import { Segmented } from '@/components/ui/Segmented';

interface DesignEditorProps {
  design: ExperimentalDesign;
  onChange: (design: ExperimentalDesign) => void;
  detailed?: boolean;
}

function intText(n: number | undefined): string {
  return n === undefined || n === null ? '' : String(n);
}

function parseIntSafe(text: string, fallback: number): number {
  const n = parseInt(text.replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Editor do desenho experimental com prévia da estrutura esperada. */
export function DesignEditor({ design, onChange, detailed }: DesignEditorProps) {
  const set = <K extends keyof ExperimentalDesign>(key: K, value: ExperimentalDesign[K]) => onChange({ ...design, [key]: value });
  const problems = validateDesign(design);
  const treatments = expandTreatments(design);

  return (
    <View style={{ gap: 18 }}>
      <View>
        <Text style={styles.label}>Como os tratamentos são definidos?</Text>
        <Segmented
          value={design.treatmentMode}
          onChange={(mode) => set('treatmentMode', mode)}
          options={[
            { value: 'explicit', label: 'Lista de tratamentos' },
            { value: 'factorial', label: 'Fatores (fatorial)' },
          ]}
        />
      </View>

      {design.treatmentMode === 'factorial' ? (
        <FactorsEditor factors={design.factors} onChange={(factors) => set('factors', factors)} />
      ) : (
        <ListEditor
          title="Tratamentos"
          placeholder="Ex.: A — Fungicida 1"
          items={design.treatments.map((t) => (t.label && t.label !== t.code ? `${t.code} — ${t.label}` : t.code))}
          onChange={(items) => set('treatments', items.map(parseCodeLabel))}
        />
      )}

      <ListEditor
        title="Controles"
        placeholder="Ex.: C — Testemunha"
        items={design.controls.map((c) => (c.label && c.label !== c.code ? `${c.code} — ${c.label}` : c.code))}
        onChange={(items) => set('controls', items.map(parseCodeLabel))}
      />

      <View style={styles.grid}>
        <NumberField label="Réplicas" value={design.replicates} onChange={(n) => set('replicates', Math.max(1, n))} />
        <NumberField label="Sessões previstas" value={design.sessionsExpected} onChange={(n) => set('sessionsExpected', Math.max(1, n))} />
        {detailed ? <NumberField label="Blocos" value={design.blocks} onChange={(n) => set('blocks', Math.max(0, n))} /> : null}
      </View>

      <View style={styles.grid}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Frequência de coleta</Text>
          <TextInput
            style={styles.input}
            value={design.collectionFrequency ?? ''}
            onChangeText={(text) => set('collectionFrequency', text || undefined)}
            placeholder="Ex.: semanal"
            placeholderTextColor={Colors.textSecondary}
          />
        </View>
        {detailed ? (
          <NumberField label="Duração/sessão (min)" value={design.sessionDurationMin ?? 0} allowEmpty onChange={(n) => set('sessionDurationMin', n || undefined)} />
        ) : null}
      </View>
      {detailed ? (
        <View>
          <Text style={styles.label}>Taxa de aquisição de sensores (Hz)</Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={design.samplingRateHz ? String(design.samplingRateHz) : ''}
            onChangeText={(text) => {
              const n = Number(text.replace(',', '.'));
              set('samplingRateHz', text && Number.isFinite(n) && n > 0 ? n : undefined);
            }}
            placeholder="Ex.: 10000"
            placeholderTextColor={Colors.textSecondary}
          />
        </View>
      ) : null}

      <View style={styles.preview}>
        <Ionicons name="grid-outline" size={18} color={Colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.previewTitle}>{describeDesign(design)}</Text>
          {treatments.length > 0 ? (
            <Text style={styles.previewText} numberOfLines={3}>
              {treatments.map((t) => t.code).join(', ')}
            </Text>
          ) : null}
          {problems.map((p) => (
            <Text key={p} style={styles.problem}>
              • {p}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

function parseCodeLabel(text: string): { code: string; label?: string } {
  const [code, ...rest] = text.split(/\s+[—-]\s+/);
  const label = rest.join(' - ').trim();
  return { code: code.trim(), ...(label ? { label } : {}) };
}

function NumberField({ label, value, onChange, allowEmpty }: { label: string; value: number; onChange: (n: number) => void; allowEmpty?: boolean }) {
  const [text, setText] = useState(allowEmpty && !value ? '' : intText(value));
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        value={text}
        onChangeText={(t) => {
          setText(t);
          onChange(parseIntSafe(t, 0));
        }}
      />
    </View>
  );
}

function ListEditor({ title, items, onChange, placeholder }: { title: string; items: string[]; onChange: (items: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const value = draft.trim();
    if (!value) return;
    onChange([...items, value]);
    setDraft('');
  };
  return (
    <View>
      <Text style={styles.label}>{title}</Text>
      <View style={styles.chips}>
        {items.map((item, index) => (
          <Chip key={`${item}-${index}`} label={item} onRemove={() => onChange(items.filter((_, i) => i !== index))} />
        ))}
      </View>
      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          placeholder={placeholder}
          placeholderTextColor={Colors.textSecondary}
          returnKeyType="done"
        />
        <TouchableOpacity style={styles.addBtn} onPress={add}>
          <Ionicons name="add" size={22} color={Colors.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function FactorsEditor({ factors, onChange }: { factors: Factor[]; onChange: (factors: Factor[]) => void }) {
  const [name, setName] = useState('');
  const addFactor = () => {
    const label = name.trim();
    if (!label) return;
    onChange([...factors, { key: uniqueKey(slugifyKey(label), factors.map((f) => f.key)), label, levels: [] }]);
    setName('');
  };
  return (
    <View style={{ gap: 12 }}>
      {factors.map((factor, index) => (
        <View key={factor.key} style={styles.factorCard}>
          <View style={styles.factorHeader}>
            <Text style={styles.factorTitle}>{factor.label}</Text>
            <TouchableOpacity onPress={() => onChange(factors.filter((_, i) => i !== index))} hitSlop={8}>
              <Ionicons name="trash-outline" size={18} color={Colors.error} />
            </TouchableOpacity>
          </View>
          <ListEditor
            title="Níveis"
            placeholder="Ex.: Déficit hídrico"
            items={factor.levels}
            onChange={(levels) => onChange(factors.map((f, i) => (i === index ? { ...f, levels } : f)))}
          />
        </View>
      ))}
      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={name}
          onChangeText={setName}
          onSubmitEditing={addFactor}
          placeholder="Novo fator (ex.: Irrigação)"
          placeholderTextColor={Colors.textSecondary}
        />
        <TouchableOpacity style={styles.addBtn} onPress={addFactor}>
          <Ionicons name="add" size={22} color={Colors.white} />
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>Todas as combinações de níveis viram tratamentos. Crie variáveis de amostra com o mesmo ID do fator para preenchê-las automaticamente.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  hint: { fontSize: 12, color: Colors.textSecondary },
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
  grid: { flexDirection: 'row', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  factorCard: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 12, backgroundColor: Colors.surface },
  factorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  factorTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  preview: { flexDirection: 'row', gap: 10, backgroundColor: Colors.primarySurface, borderRadius: 12, padding: 12 },
  previewTitle: { fontSize: 14, fontWeight: '700', color: Colors.primaryDark },
  previewText: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  problem: { fontSize: 12, color: Colors.error, marginTop: 4 },
});
