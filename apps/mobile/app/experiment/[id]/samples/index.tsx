import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { EmptyState } from '@/components/ui/EmptyState';
import { Colors } from '@/constants/colors';
import { expectedCounts } from '@/core/design';
import { getDb } from '@/database/connection';
import { getExperiment } from '@/database/repo/experiments';
import { listSamples, observationCountsBySample } from '@/database/repo/samples';
import { useAsync } from '@/hooks/useAsync';

export default function SamplesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const [query, setQuery] = useState('');

  const { data, loading } = useAsync(async () => {
    const db = await getDb();
    const [experiment, samples, counts] = await Promise.all([getExperiment(db, id), listSamples(db, id), observationCountsBySample(db, id)]);
    return { experiment, samples, counts };
  }, [id]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => router.push({ pathname: '/experiment/[id]/samples/new', params: { id } })} hitSlop={10} accessibilityLabel="Adicionar amostras">
          <Ionicons name="add-circle" size={28} color={Colors.primary} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, router, id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!data) return [];
    if (!q) return data.samples;
    return data.samples.filter(
      (s) =>
        s.code.toLowerCase().includes(q) ||
        (s.treatment ?? '').toLowerCase().includes(q) ||
        Object.values(s.data).some((v) => typeof v === 'string' && v.toLowerCase().includes(q)),
    );
  }, [data, query]);

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  const sessions = data?.experiment ? expectedCounts(data.experiment.design).sessions : 1;

  return (
    <View style={styles.container}>
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={Colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar por código, tratamento ou atributo"
          placeholderTextColor={Colors.textSecondary}
          autoCorrect={false}
        />
      </View>
      {data && data.samples.length === 0 ? (
        <EmptyState
          title="Nenhuma amostra"
          description="Gere as amostras pelo desenho experimental, cadastre manualmente ou importe um CSV."
          actionLabel="Adicionar amostras"
          onAction={() => router.push({ pathname: '/experiment/[id]/samples/new', params: { id } })}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: 16, paddingTop: 0 }}
          ListHeaderComponent={<Text style={styles.count}>{filtered.length} amostra(s)</Text>}
          renderItem={({ item }) => {
            const n = data?.counts.get(item.id) ?? 0;
            const done = n >= sessions;
            return (
              <TouchableOpacity style={styles.row} onPress={() => router.push({ pathname: '/experiment/[id]/samples/[sampleId]', params: { id, sampleId: item.id } })}>
                <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={done ? Colors.primary : Colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.code}>{item.code}</Text>
                  <Text style={styles.meta}>
                    {[item.treatment, item.replicate ? `réplica ${item.replicate}` : null, item.block ? `bloco ${item.block}` : null].filter(Boolean).join(' · ') || 'sem tratamento'}
                  </Text>
                </View>
                <Text style={styles.obs}>
                  {n}/{sessions}
                </Text>
                {item.qrGenerated ? <Ionicons name="qr-code" size={14} color={Colors.textSecondary} /> : null}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: Colors.text },
  count: { fontSize: 12, color: Colors.textSecondary, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  code: { fontSize: 15, fontWeight: '700', color: Colors.text },
  meta: { fontSize: 12, color: Colors.textSecondary },
  obs: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
});
