import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { QcBadge } from '@/components/ui/QcBadge';
import { Segmented } from '@/components/ui/Segmented';
import { Colors } from '@/constants/colors';
import { worstFlag } from '@/core/qc';
import { getDb } from '@/database/connection';
import { listObservations } from '@/database/repo/observations';
import { listSamples } from '@/database/repo/samples';
import { listSessions } from '@/database/repo/sessions';
import { useAsync } from '@/hooks/useAsync';
import { formatDateTime } from '@/utils/formatters';

type StatusFilter = 'current' | 'retracted' | 'all';

export default function ObservationsScreen() {
  const { id, sessionId } = useLocalSearchParams<{ id: string; sessionId?: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<StatusFilter>('current');
  const [query, setQuery] = useState('');

  const { data, loading } = useAsync(async () => {
    const db = await getDb();
    const [observations, samples, sessions] = await Promise.all([
      listObservations(db, { experimentId: id, sessionId, status }),
      listSamples(db, id, { includeArchived: true }),
      listSessions(db, id),
    ]);
    return { observations, samples: new Map(samples.map((s) => [s.id, s])), sessions: new Map(sessions.map((s) => [s.id, s])) };
  }, [id, sessionId, status]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.observations;
    return data.observations.filter((o) => (data.samples.get(o.sampleId)?.code ?? '').toLowerCase().includes(q));
  }, [data, query]);

  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <Segmented<StatusFilter>
          value={status}
          onChange={setStatus}
          options={[
            { value: 'current', label: 'Vigentes' },
            { value: 'retracted', label: 'Retratadas' },
            { value: 'all', label: 'Todas as versões' },
          ]}
        />
        {sessionId && data?.sessions.get(sessionId) ? <Text style={styles.filter}>Sessão {data.sessions.get(sessionId)!.code}</Text> : null}
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={Colors.textSecondary} />
          <TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Filtrar por código da amostra" placeholderTextColor={Colors.textSecondary} autoCapitalize="characters" />
        </View>
      </View>
      {loading && !data ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          ListHeaderComponent={<Text style={styles.count}>{filtered.length} registro(s)</Text>}
          ListEmptyComponent={<Text style={styles.empty}>Nenhuma observação.</Text>}
          renderItem={({ item }) => {
            const sample = data?.samples.get(item.sampleId);
            const session = data?.sessions.get(item.sessionId);
            return (
              <TouchableOpacity style={styles.row} onPress={() => router.push({ pathname: '/experiment/[id]/observations/[observationId]', params: { id, observationId: item.id } })}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.code}>{sample?.code ?? '—'}</Text>
                  <Text style={styles.meta}>
                    {formatDateTime(item.collectedAt)} · {session?.code ?? ''}
                    {item.revision > 1 ? ` · rev. ${item.revision}` : ''}
                    {item.status === 'superseded' ? ' · substituída' : ''}
                    {item.source === 'device' ? ' · sensor' : ''}
                  </Text>
                </View>
                {item.status === 'retracted' ? <Text style={styles.retracted}>Retratada</Text> : <QcBadge flag={worstFlag(item.qc)} />}
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
  top: { padding: 16, gap: 10 },
  filter: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: Colors.text },
  count: { fontSize: 12, color: Colors.textSecondary, marginBottom: 8 },
  empty: { textAlign: 'center', color: Colors.textSecondary, marginTop: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, marginBottom: 6 },
  code: { fontSize: 15, fontWeight: '700', color: Colors.text },
  meta: { fontSize: 12, color: Colors.textSecondary },
  retracted: { fontSize: 11, fontWeight: '700', color: Colors.error },
});
