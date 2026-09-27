import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { DIMENSION_LABELS, getUnit, searchUnits, type UnitDefinition } from '@/core/units';
import { Colors } from '@/constants/colors';

interface UnitPickerProps {
  value?: string;
  onChange: (code: string | undefined) => void;
  label?: string;
}

/** Seletor de unidade UCUM com busca por nome, símbolo ou grandeza. */
export function UnitPicker({ value, onChange, label = 'Unidade' }: UnitPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const unit = getUnit(value);
  const results = useMemo(() => searchUnits(query), [query]);

  const select = (code: string | undefined) => {
    onChange(code);
    setOpen(false);
    setQuery('');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.button} onPress={() => setOpen(true)}>
        <Text style={unit ? styles.value : styles.placeholder}>
          {unit ? `${unit.symbol} — ${unit.name}` : value ? `${value} (não reconhecida)` : 'Sem unidade'}
        </Text>
        <Ionicons name="chevron-down" size={18} color={Colors.textSecondary} />
      </TouchableOpacity>
      {unit ? <Text style={styles.hint}>UCUM: {unit.code} · {DIMENSION_LABELS[unit.dimension]}</Text> : null}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Escolher unidade</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.search}>
              <Ionicons name="search" size={18} color={Colors.textSecondary} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar: temperatura, kPa, ppm…"
                placeholderTextColor={Colors.textSecondary}
                autoCorrect={false}
              />
            </View>
            <TouchableOpacity style={styles.item} onPress={() => select(undefined)}>
              <Text style={styles.itemName}>Sem unidade</Text>
            </TouchableOpacity>
            <FlatList
              data={results}
              keyExtractor={(item) => item.code}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }: { item: UnitDefinition }) => (
                <TouchableOpacity style={[styles.item, item.code === value && styles.itemSelected]} onPress={() => select(item.code)}>
                  <Text style={styles.itemSymbol}>{item.symbol}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemMeta}>
                      {DIMENSION_LABELS[item.dimension]} · {item.code}
                    </Text>
                  </View>
                  {item.code === value ? <Ionicons name="checkmark" size={20} color={Colors.primary} /> : null}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
  },
  value: { fontSize: 15, color: Colors.text },
  placeholder: { fontSize: 15, color: Colors.textSecondary },
  hint: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  overlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: '85%',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: Colors.text },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  itemSelected: { backgroundColor: Colors.primarySurface },
  itemSymbol: { width: 64, fontSize: 15, fontWeight: '700', color: Colors.primary },
  itemName: { fontSize: 15, color: Colors.text },
  itemMeta: { fontSize: 12, color: Colors.textSecondary },
});
