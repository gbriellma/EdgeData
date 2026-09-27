import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { generateQRLabelPDF } from '@/components/qrcode/QRLabelSheet';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { Colors } from '@/constants/colors';
import { getDb } from '@/database/connection';
import { getExperiment } from '@/database/repo/experiments';
import { listSamples, markQrGenerated } from '@/database/repo/samples';
import { useAsync } from '@/hooks/useAsync';

export default function QrCodesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const { data, refresh } = useAsync(async () => {
    const db = await getDb();
    return { experiment: await getExperiment(db, id), samples: await listSamples(db, id) };
  }, [id]);

  const visible = useMemo(() => (data?.samples ?? []).filter((s) => filter === 'all' || !s.qrGenerated), [data, filter]);

  if (!data?.experiment) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }
  const experiment = data.experiment;
  const allSelected = visible.length > 0 && visible.every((s) => selected.has(s.id));

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(visible.map((s) => s.id)));
  const toggle = (sampleId: string) => {
    const next = new Set(selected);
    if (next.has(sampleId)) next.delete(sampleId);
    else next.add(sampleId);
    setSelected(next);
  };

  const generate = async () => {
    const chosen = data.samples.filter((s) => selected.has(s.id));
    if (chosen.length === 0) return Alert.alert('Selecione amostras', 'Escolha ao menos uma amostra.');
    setBusy(true);
    try {
      const uri = await generateQRLabelPDF(
        chosen.map((s) => ({ id: s.id, code: s.code, label: [experiment.code, s.treatment].filter(Boolean).join(' · ') })),
        `${experiment.name} — etiquetas`,
      );
      await markQrGenerated(await getDb(), chosen.map((s) => s.id));
      setSelected(new Set());
      await refresh();
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Etiquetas QR' });
      else Alert.alert('PDF gerado', uri);
    } catch (err) {
      Alert.alert('Erro', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'pending', label: 'Sem etiqueta' },
            { value: 'all', label: 'Todas' },
          ]}
        />
        <Text style={styles.help}>O QR guarda o identificador permanente da amostra e o código legível. Etiquetas de versões anteriores continuam sendo lidas.</Text>
        <TouchableOpacity style={styles.selectAll} onPress={toggleAll}>
          <Ionicons name={allSelected ? 'checkbox' : 'square-outline'} size={20} color={Colors.primary} />
          <Text style={styles.selectAllText}>Selecionar todas ({visible.length})</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={visible}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
        ListEmptyComponent={<Text style={styles.help}>{filter === 'pending' ? 'Todas as amostras já têm etiqueta.' : 'Nenhuma amostra.'}</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => toggle(item.id)}>
            <Ionicons name={selected.has(item.id) ? 'checkbox' : 'square-outline'} size={20} color={Colors.primary} />
            <Text style={styles.code}>{item.code}</Text>
            <Text style={styles.meta}>{item.treatment ?? ''}</Text>
            {item.qrGenerated ? <Ionicons name="qr-code" size={14} color={Colors.textSecondary} /> : null}
          </TouchableOpacity>
        )}
      />
      <View style={styles.footer}>
        <Button title={`Gerar PDF (${selected.size})`} onPress={generate} loading={busy} disabled={busy || selected.size === 0} icon={<Ionicons name="print-outline" size={18} color={Colors.white} />} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  top: { padding: 16, gap: 10 },
  help: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectAllText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  code: { fontSize: 15, fontWeight: '600', color: Colors.text },
  meta: { flex: 1, fontSize: 12, color: Colors.textSecondary },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: Colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
});
