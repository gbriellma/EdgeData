import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter, type Href } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/QcBadge';
import { Colors } from '@/constants/colors';
import { describeDesign } from '@/core/design';
import type { ExperimentTemplate } from '@/core/templates';
import { getDb } from '@/database/connection';
import { getCurrentProtocol, getExperiment, getExperimentStats, setExperimentArchived, setExperimentStatus } from '@/database/repo/experiments';
import { loadQualityReport } from '@/database/quality-report';
import { countDrafts } from '@/database/repo/drafts';
import { getOpenSession } from '@/database/repo/sessions';
import { useAsync } from '@/hooks/useAsync';
import { saveCustomTemplate, shareTemplate } from '@/lib/templates';
import { currentActor } from '@/stores/settings';
import { formatDateTime, formatRelative } from '@/utils/formatters';

type Action = { label: string; icon: keyof typeof Ionicons.glyphMap; href: Href; hint?: string };

export default function ExperimentDashboard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();

  const { data, loading, error, refresh } = useAsync(async () => {
    const db = await getDb();
    const experiment = await getExperiment(db, id);
    if (!experiment) return null;
    const [stats, protocol, openSession, quality, drafts] = await Promise.all([
      getExperimentStats(db, experiment),
      getCurrentProtocol(db, id),
      getOpenSession(db, id),
      loadQualityReport(db, id),
      countDrafts(db, id),
    ]);
    return { experiment, stats, protocol, openSession, quality: quality.report, drafts };
  }, [id]);

  useEffect(() => {
    if (data?.experiment) navigation.setOptions({ title: data.experiment.code });
  }, [data?.experiment, navigation]);

  if (loading && !data) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }
  if (!data) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.error}>{error ?? 'Experimento não encontrado'}</Text>
      </View>
    );
  }

  const { experiment, stats, protocol, openSession, quality, drafts } = data;
  const current = quality.pendingBySession[0];
  const progress = stats.expectedObservations > 0 ? Math.min(1, stats.observations / stats.expectedObservations) : 0;

  const actions: Action[] = [
    { label: 'Amostras', icon: 'leaf-outline', href: { pathname: '/experiment/[id]/samples', params: { id } }, hint: `${stats.samples}` },
    { label: 'Observações', icon: 'list-outline', href: { pathname: '/experiment/[id]/observations', params: { id } }, hint: `${stats.observations}` },
    { label: 'Sessões e eventos', icon: 'time-outline', href: { pathname: '/experiment/[id]/sessions', params: { id } }, hint: `${stats.sessions}` },
    { label: 'Análise', icon: 'stats-chart-outline', href: { pathname: '/experiment/[id]/analysis', params: { id } } as Href },
    { label: 'Importar planilha', icon: 'document-attach-outline', href: { pathname: '/experiment/[id]/import', params: { id } } as Href },
    { label: 'Protocolo', icon: 'options-outline', href: { pathname: '/experiment/[id]/variables', params: { id } }, hint: `v${protocol.version}` },
    { label: 'Etiquetas QR', icon: 'qr-code-outline', href: { pathname: '/experiment/[id]/qr-codes', params: { id } } as Href },
    { label: 'Sensores', icon: 'bluetooth-outline', href: { pathname: '/experiment/[id]/sensors', params: { id } } as Href },
    { label: 'Dados do experimento', icon: 'document-text-outline', href: { pathname: '/experiment/[id]/details', params: { id } } as Href },
    { label: 'Exportar dataset', icon: 'cloud-download-outline', href: { pathname: '/experiment/[id]/export', params: { id } } as Href },
  ];

  const exportAsTemplate = async () => {
    const template: ExperimentTemplate = {
      version: 2,
      type: 'edgedata-template',
      id: `${experiment.code.toLowerCase()}-${Date.now()}`,
      name: experiment.name,
      description: experiment.metadata.description ?? experiment.metadata.objective ?? '',
      metadata: { objective: experiment.metadata.objective, methodology: experiment.metadata.methodology, hypothesis: experiment.metadata.hypothesis },
      design: experiment.design,
      variables: protocol.variables,
      createdAt: new Date().toISOString(),
    };
    try {
      await saveCustomTemplate(template);
      await shareTemplate(template);
    } catch (err) {
      Alert.alert('Erro', err instanceof Error ? err.message : String(err));
    }
  };

  const moreActions = () => {
    Alert.alert(experiment.name, undefined, [
      { text: 'Salvar e compartilhar como template', onPress: exportAsTemplate },
      {
        text: experiment.status === 'completed' ? 'Reabrir experimento' : 'Marcar como concluído',
        onPress: async () => {
          await setExperimentStatus(await getDb(), id, experiment.status === 'completed' ? 'active' : 'completed', currentActor());
          await refresh();
        },
      },
      {
        text: 'Arquivar',
        style: 'destructive',
        onPress: async () => {
          await setExperimentArchived(await getDb(), id, true, currentActor());
          router.back();
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{experiment.name}</Text>
          <Text style={styles.meta}>
            {experiment.projectName} · {experiment.code}
          </Text>
        </View>
        <TouchableOpacity onPress={moreActions} hitSlop={10} accessibilityLabel="Mais opções">
          <Ionicons name="ellipsis-horizontal-circle-outline" size={28} color={Colors.primary} />
        </TouchableOpacity>
      </View>
      {experiment.status === 'completed' ? <StatusBadge label="Concluído" tone="warn" /> : null}

      <Card style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressTitle}>Progresso da coleta</Text>
          <Text style={styles.progressValue}>
            {stats.observations}/{stats.expectedObservations || '-'}
          </Text>
        </View>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <Text style={styles.meta}>{describeDesign(experiment.design)}</Text>
        <View style={styles.statsRow}>
          <Stat label="Amostras" value={stats.samples} />
          <Stat label="Sessões" value={stats.sessions} />
          <Stat label="Eventos" value={stats.events} />
          <Stat label="Leituras" value={stats.readings} />
          <Stat label="Arquivos" value={stats.files} />
        </View>
        {stats.retracted > 0 ? <Text style={styles.meta}>{stats.retracted} observação(ões) retratada(s)</Text> : null}
        {stats.lastCollectionAt ? <Text style={styles.meta}>Última coleta: {formatDateTime(stats.lastCollectionAt)}</Text> : null}
      </Card>

      {openSession ? (
        <Card style={styles.sessionCard}>
          <Ionicons name="radio-button-on" size={18} color={Colors.primary} />
          <Text style={styles.sessionText}>
            Sessão {openSession.code} aberta {formatRelative(openSession.startedAt)}
          </Text>
        </Card>
      ) : null}

      <Button
        title={openSession ? 'Continuar coleta' : 'Iniciar coleta'}
        size="large"
        onPress={() => router.push({ pathname: '/experiment/[id]/collect', params: { id } })}
        disabled={experiment.status === 'completed'}
        icon={<Ionicons name="scan" size={22} color={Colors.white} />}
      />

      <Card style={{ gap: 10 }} onPress={() => router.push({ pathname: '/experiment/[id]/quality', params: { id } } as Href)}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressTitle}>Pendências e qualidade</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
        </View>
        <View style={styles.statsRow}>
          <Stat label={current ? `Pendentes ${current.code}` : 'Sem coleta'} value={current?.pending.length ?? quality.neverObserved.length} warn={(current?.pending.length ?? 0) > 0} />
          <Stat label="Sinalizados" value={quality.flagged.length} warn={quality.flagged.length > 0} />
          <Stat label="Atípicos" value={quality.outliers.length} />
          <Stat label="Em branco" value={quality.missing.length} />
        </View>
        {current && current.pending.length > 0 ? (
          <Text style={styles.meta} numberOfLines={2}>
            Faltam em {current.code}: {current.pending.slice(0, 8).map((p) => p.code).join(', ')}
            {current.pending.length > 8 ? ` e mais ${current.pending.length - 8}` : ''}
          </Text>
        ) : null}
        {drafts > 0 ? <Text style={styles.warn}>Há uma coleta não salva. Abra a coleta para recuperá-la.</Text> : null}
      </Card>

      <View style={styles.grid}>
        {actions.map((action) => (
          <TouchableOpacity key={action.label} style={styles.tile} onPress={() => router.push(action.href)}>
            <Ionicons name={action.icon} size={24} color={Colors.primary} />
            <Text style={styles.tileLabel}>{action.label}</Text>
            {action.hint ? <Text style={styles.tileHint}>{action.hint}</Text> : null}
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, warn && { color: Colors.warning }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  error: { color: Colors.error },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.text },
  meta: { fontSize: 13, color: Colors.textSecondary },
  warn: { fontSize: 13, color: Colors.warning, fontWeight: '600' },
  progressCard: { gap: 10 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  progressTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  progressValue: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  bar: { height: 8, borderRadius: 4, backgroundColor: Colors.border, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: Colors.primary },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 18, fontWeight: '800', color: Colors.text },
  statLabel: { fontSize: 11, color: Colors.textSecondary, textAlign: 'center' },
  sessionCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primarySurface, borderColor: Colors.primaryLight },
  sessionText: { fontSize: 14, color: Colors.primaryDark, fontWeight: '600', flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  tileLabel: { fontSize: 14, fontWeight: '600', color: Colors.text },
  tileHint: { fontSize: 12, color: Colors.textSecondary },
});
