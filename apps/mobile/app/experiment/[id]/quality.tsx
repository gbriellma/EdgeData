import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { QcBadge } from '@/components/ui/QcBadge';
import { ReasonModal } from '@/components/ui/ReasonModal';
import { Section } from '@/components/ui/Section';
import { Colors } from '@/constants/colors';
import type { ValueIssue } from '@/core/quality';
import { streamProblems } from '@/core/readings-qc';
import { getDb } from '@/database/connection';
import { loadQualityReport } from '@/database/quality-report';
import { acceptFlaggedValue } from '@/database/repo/quality';
import { useAsync } from '@/hooks/useAsync';
import { formatValue } from '@/lib/format-value';
import { currentActor } from '@/stores/settings';

type Tab = 'pending' | 'flagged' | 'outliers' | 'missing' | 'sensors';

export default function QualityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('pending');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<ValueIssue | null>(null);

  const { data, refresh } = useAsync(async () => loadQualityReport(await getDb(), id), [id]);

  if (!data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }
  const { report, variables, streams, deviceNames, sessionCodes } = data;
  const troubled = streams.filter((s) => streamProblems(s).length > 0);
  const byKey = new Map(variables.map((v) => [v.key, v]));
  const latest = report.pendingBySession[0];

  const openObservation = (observationId: string) =>
    router.push({ pathname: '/experiment/[id]/observations/[observationId]', params: { id, observationId } } as Href);
  const openSample = (sampleId: string) => router.push({ pathname: '/experiment/[id]/samples/[sampleId]', params: { id, sampleId } } as Href);

  const accept = async (note: string) => {
    const issue = accepting;
    setAccepting(null);
    if (!issue) return;
    try {
      await acceptFlaggedValue(await getDb(), { observationId: issue.observationId, variableKey: issue.variableKey, flag: issue.flag, note }, currentActor());
      await refresh();
    } catch (err) {
      Alert.alert('Erro', err instanceof Error ? err.message : String(err));
    }
  };

  const tiles: { key: Tab; label: string; value: number; tone: 'ok' | 'warn' | 'info' }[] = [
    { key: 'pending', label: latest ? `Pendentes em ${latest.code}` : 'Pendentes', value: latest?.pending.length ?? report.neverObserved.length, tone: (latest?.pending.length ?? 0) > 0 ? 'warn' : 'ok' },
    { key: 'flagged', label: 'Sinalizados', value: report.flagged.length, tone: report.flagged.length > 0 ? 'warn' : 'ok' },
    { key: 'outliers', label: 'Atípicos', value: report.outliers.length, tone: report.outliers.length > 0 ? 'info' : 'ok' },
    { key: 'missing', label: 'Campos em branco', value: report.missing.length, tone: report.missing.length > 0 ? 'info' : 'ok' },
    ...(streams.length > 0
      ? [{ key: 'sensors' as const, label: 'Séries de sensores com alerta', value: troubled.length, tone: troubled.length > 0 ? ('warn' as const) : ('ok' as const) }]
      : []),
  ];

  const issueRow = (issue: ValueIssue, canAccept: boolean) => {
    const variable = byKey.get(issue.variableKey);
    return (
      <Card key={`${issue.observationId}-${issue.variableKey}-${issue.flag}`} style={styles.issue}>
        <TouchableOpacity style={styles.issueMain} onPress={() => openObservation(issue.observationId)}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.issueTitle}>
              {issue.sampleCode} · {issue.label}
            </Text>
            <Text style={styles.issueValue}>{variable ? formatValue(variable, issue.value) : String(issue.value ?? '-')}</Text>
            <Text style={styles.meta}>
              Sessão {issue.sessionCode} · {issue.reason}
            </Text>
          </View>
          <QcBadge flag={issue.flag} />
        </TouchableOpacity>
        <View style={styles.issueActions}>
          <TouchableOpacity onPress={() => openObservation(issue.observationId)} style={styles.action}>
            <Ionicons name="create-outline" size={16} color={Colors.primary} />
            <Text style={styles.actionText}>Abrir para corrigir</Text>
          </TouchableOpacity>
          {canAccept ? (
            <TouchableOpacity onPress={() => setAccepting(issue)} style={styles.action}>
              <Ionicons name="checkmark-done-outline" size={16} color={Colors.primary} />
              <Text style={styles.actionText}>Valor conferido</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </Card>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.tiles}>
        {tiles.map((t) => (
          <TouchableOpacity key={t.key} style={[styles.tile, tab === t.key && styles.tileActive]} onPress={() => setTab(t.key)} accessibilityRole="button">
            <Text style={[styles.tileValue, t.tone === 'warn' && t.value > 0 && { color: Colors.warning }]}>{t.value}</Text>
            <Text style={styles.tileLabel}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'pending' ? (
        <>
          <Section title="Pendências por sessão" hint="Amostras ativas sem observação em cada sessão de coleta.">
            {report.pendingBySession.length === 0 ? <Text style={styles.meta}>Nenhuma sessão ainda.</Text> : null}
            {report.pendingBySession.map((s) => (
              <Card key={s.sessionId} style={{ gap: 8 }}>
                <TouchableOpacity style={styles.sessionRow} onPress={() => setExpanded(expanded === s.sessionId ? null : s.sessionId)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.issueTitle}>
                      {s.code} {s.status === 'open' ? '(aberta)' : ''}
                    </Text>
                    <Text style={styles.meta}>
                      {s.observed} observada(s) · {s.pending.length} pendente(s)
                    </Text>
                  </View>
                  {s.pending.length > 0 ? <Ionicons name={expanded === s.sessionId ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.textSecondary} /> : null}
                  {s.pending.length === 0 ? <Ionicons name="checkmark-circle" size={20} color={Colors.primary} /> : null}
                </TouchableOpacity>
                {expanded === s.sessionId ? (
                  <View style={styles.codes}>
                    {s.pending.map((p) => (
                      <TouchableOpacity key={p.id} style={styles.code} onPress={() => openSample(p.id)}>
                        <Text style={styles.codeText}>{p.code}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </Card>
            ))}
          </Section>
          {report.neverObserved.length > 0 ? (
            <Section title="Amostras sem nenhuma observação">
              <View style={styles.codes}>
                {report.neverObserved.map((p) => (
                  <TouchableOpacity key={p.id} style={styles.code} onPress={() => openSample(p.id)}>
                    <Text style={styles.codeText}>{p.code}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Section>
          ) : null}
        </>
      ) : null}

      {tab === 'flagged' ? (
        <Section title="Valores sinalizados" hint="Marcados pelo QC na coleta. Corrija (nova revisão) ou registre que o valor foi conferido; o dado original não muda.">
          {report.flagged.length === 0 ? <Text style={styles.meta}>Nada pendente de revisão.</Text> : null}
          {report.flagged.map((issue) => issueRow(issue, true))}
        </Section>
      ) : null}

      {tab === 'outliers' ? (
        <Section title="Valores atípicos" hint="Muito acima ou abaixo dos demais do mesmo grupo (limites de Tukey, grupos com 5 ou mais valores). Atípico não é erro por definição.">
          {report.outliers.length === 0 ? <Text style={styles.meta}>Nenhum valor atípico.</Text> : null}
          {report.outliers.map((issue) => issueRow(issue, true))}
        </Section>
      ) : null}

      {tab === 'missing' ? (
        <Section title="Campos em branco" hint="Campos opcionais que ficaram vazios, por variável.">
          {report.missingByVariable.length === 0 ? <Text style={styles.meta}>Nenhum campo em branco.</Text> : null}
          {report.missingByVariable.map((m) => (
            <Card key={m.key} style={{ gap: 8 }}>
              <TouchableOpacity style={styles.sessionRow} onPress={() => setExpanded(expanded === m.key ? null : m.key)}>
                <Text style={[styles.issueTitle, { flex: 1 }]}>{m.label}</Text>
                <Text style={styles.meta}>{m.count}</Text>
                <Ionicons name={expanded === m.key ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
              {expanded === m.key ? (
                <View style={styles.codes}>
                  {report.missing
                    .filter((x) => x.variableKey === m.key)
                    .map((x) => (
                      <TouchableOpacity key={x.observationId} style={styles.code} onPress={() => openObservation(x.observationId)}>
                        <Text style={styles.codeText}>
                          {x.sampleCode} · {x.sessionCode}
                        </Text>
                      </TouchableOpacity>
                    ))}
                </View>
              ) : null}
            </Card>
          ))}
        </Section>
      ) : null}

      {tab === 'sensors' ? (
        <Section title="Séries de sensores" hint="Por sensor e sessão: lacunas de tempo, valores repetidos, reinícios, pacotes perdidos e saturação.">
          {streams.map((st) => {
            const problems = streamProblems(st);
            return (
              <Card key={`${st.deviceId}-${st.sensorId}-${st.sessionId}`} style={{ gap: 4 }}>
                <View style={styles.sessionRow}>
                  <Text style={[styles.issueTitle, { flex: 1 }]}>
                    {deviceNames.get(st.deviceId) ?? st.deviceId} · {st.sensorId}
                  </Text>
                  <Ionicons name={problems.length ? 'warning' : 'checkmark-circle'} size={18} color={problems.length ? Colors.warning : Colors.primary} />
                </View>
                <Text style={styles.meta}>
                  Sessão {sessionCodes.get(st.sessionId) ?? '?'} · {st.count} leitura(s)
                  {st.medianIntervalMs ? ` · intervalo típico ${(st.medianIntervalMs / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s` : ''}
                </Text>
                {problems.map((p) => (
                  <Text key={p} style={styles.problem}>
                    - {p}
                  </Text>
                ))}
              </Card>
            );
          })}
        </Section>
      ) : null}

      <ReasonModal
        visible={accepting !== null}
        title="Valor conferido"
        message={accepting ? `${accepting.sampleCode} · ${accepting.label}: explique por que o valor está correto (ex.: planta de bordadura, medida repetida).` : undefined}
        confirmLabel="Registrar"
        onCancel={() => setAccepting(null)}
        onConfirm={(note) => void accept(note)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  meta: { fontSize: 12, color: Colors.textSecondary },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '48%', flexGrow: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, gap: 2 },
  tileActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  tileValue: { fontSize: 22, fontWeight: '800', color: Colors.text },
  tileLabel: { fontSize: 12, color: Colors.textSecondary },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  codes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  code: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  codeText: { fontSize: 12, fontWeight: '600', color: Colors.text },
  issue: { gap: 8 },
  issueMain: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  issueTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  issueValue: { fontSize: 16, fontWeight: '600', color: Colors.text },
  issueActions: { flexDirection: 'row', gap: 16 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  problem: { fontSize: 13, color: Colors.text },
});
