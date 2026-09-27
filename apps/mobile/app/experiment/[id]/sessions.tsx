import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { EventModal } from '@/components/collection/EventModal';
import { ReasonModal } from '@/components/ui/ReasonModal';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/QcBadge';
import { Colors } from '@/constants/colors';
import { getDb } from '@/database/connection';
import { listProtocols } from '@/database/repo/experiments';
import { closeSession, listEvents, listSessions, recordEvent, retractEvent, sessionCounts } from '@/database/repo/sessions';
import { useAsync } from '@/hooks/useAsync';
import { currentActor } from '@/stores/settings';
import { formatDateTime } from '@/utils/formatters';

export default function SessionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [eventFor, setEventFor] = useState<{ sessionId: string; at: string } | null>(null);
  const [retracting, setRetracting] = useState<string | null>(null);

  const { data, refresh } = useAsync(async () => {
    const db = await getDb();
    const [sessions, counts, events, protocols] = await Promise.all([
      listSessions(db, id),
      sessionCounts(db, id),
      listEvents(db, { experimentId: id, includeRetracted: true }),
      listProtocols(db, id),
    ]);
    return { sessions, counts, events, versions: new Map(protocols.map((p) => [p.id, p.version])) };
  }, [id]);

  if (!data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {data.sessions.length === 0 ? <Text style={styles.help}>Nenhuma sessão ainda. Toque em “Iniciar coleta” no painel do experimento.</Text> : null}
      {data.sessions.map((session) => {
        const counts = data.counts.get(session.id);
        const events = data.events.filter((e) => e.sessionId === session.id);
        const open = session.status === 'open';
        return (
          <Card key={session.id} style={{ gap: 8 }}>
            <TouchableOpacity style={styles.row} onPress={() => setExpanded(expanded === session.id ? null : session.id)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>
                  {session.code} · protocolo v{data.versions.get(session.protocolId) ?? '?'}
                </Text>
                <Text style={styles.meta}>
                  {formatDateTime(session.startedAt)}
                  {session.endedAt ? ` → ${formatDateTime(session.endedAt)}` : ''}
                  {session.operator ? ` · ${session.operator}` : ''}
                </Text>
                <Text style={styles.meta}>
                  {counts?.observations ?? 0} observações · {counts?.events ?? 0} eventos · {counts?.readings ?? 0} leituras
                </Text>
              </View>
              <StatusBadge label={open ? 'Aberta' : 'Encerrada'} tone={open ? 'ok' : 'neutral'} />
            </TouchableOpacity>

            {expanded === session.id ? (
              <View style={{ gap: 8 }}>
                {session.notes ? <Text style={styles.notes}>{session.notes}</Text> : null}
                {session.deviceSnapshot.length > 0 ? (
                  <Text style={styles.meta}>
                    Dispositivos: {session.deviceSnapshot.map((d) => `${d.name} (fw ${d.manifest.firmware?.version ?? '?'})`).join(', ')}
                  </Text>
                ) : null}
                <Text style={styles.subtitle}>Eventos</Text>
                {events.length === 0 ? <Text style={styles.meta}>Nenhum evento.</Text> : null}
                {events.map((event) => (
                  <View key={event.id} style={styles.event}>
                    <Ionicons name={event.kind === 'device' ? 'hardware-chip-outline' : 'flag-outline'} size={16} color={event.retractedAt ? Colors.textSecondary : Colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.eventLabel, event.retractedAt && styles.retracted]}>{event.label}</Text>
                      <Text style={styles.meta}>
                        {formatDateTime(event.occurredAt)}
                        {event.retractedAt ? ` · retratado: ${event.retractionReason}` : ''}
                      </Text>
                    </View>
                    {!event.retractedAt ? (
                      <TouchableOpacity onPress={() => setRetracting(event.id)} hitSlop={8}>
                        <Ionicons name="remove-circle-outline" size={18} color={Colors.textSecondary} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ))}
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.action} onPress={() => setEventFor({ sessionId: session.id, at: new Date().toISOString() })}>
                    <Ionicons name="flag-outline" size={16} color={Colors.primary} />
                    <Text style={styles.actionText}>Marcar evento agora</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.action} onPress={() => router.push({ pathname: '/experiment/[id]/observations', params: { id, sessionId: session.id } })}>
                    <Ionicons name="list-outline" size={16} color={Colors.primary} />
                    <Text style={styles.actionText}>Ver observações</Text>
                  </TouchableOpacity>
                  {open ? (
                    <TouchableOpacity
                      style={styles.action}
                      onPress={() =>
                        Alert.alert(`Encerrar ${session.code}?`, undefined, [
                          { text: 'Cancelar', style: 'cancel' },
                          {
                            text: 'Encerrar',
                            style: 'destructive',
                            onPress: async () => {
                              await closeSession(await getDb(), session.id, currentActor());
                              await refresh();
                            },
                          },
                        ])
                      }
                    >
                      <Ionicons name="stop-circle-outline" size={16} color={Colors.error} />
                      <Text style={[styles.actionText, { color: Colors.error }]}>Encerrar</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ) : null}
          </Card>
        );
      })}
      <ReasonModal
        visible={retracting !== null}
        title="Retratar evento"
        message="O evento continua no histórico, marcado como retratado."
        confirmLabel="Retratar"
        destructive
        onCancel={() => setRetracting(null)}
        onConfirm={async (reason) => {
          if (!retracting) return;
          await retractEvent(await getDb(), retracting, reason, currentActor());
          setRetracting(null);
          await refresh();
        }}
      />
      <EventModal
        visible={eventFor !== null}
        onClose={() => setEventFor(null)}
        onSubmit={async (label) => {
          if (!eventFor) return;
          await recordEvent(await getDb(), { experimentId: id, sessionId: eventFor.sessionId, label, occurredAt: eventFor.at }, currentActor());
          setEventFor(null);
          await refresh();
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { fontSize: 16, fontWeight: '700', color: Colors.text },
  subtitle: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, marginTop: 4 },
  meta: { fontSize: 12, color: Colors.textSecondary },
  help: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginTop: 24 },
  notes: { fontSize: 13, color: Colors.text },
  event: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  eventLabel: { fontSize: 14, color: Colors.text, fontWeight: '500' },
  retracted: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 4 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
});
