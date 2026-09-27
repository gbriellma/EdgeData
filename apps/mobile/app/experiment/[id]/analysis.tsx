import { useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { BoxPlot } from '@/components/charts/BoxPlot';
import { Legend, LineChart } from '@/components/charts/LineChart';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Section } from '@/components/ui/Section';
import { Colors } from '@/constants/colors';
import { analyzeVariable, describeAnova, groupingOptions, type ComparisonScope } from '@/core/analysis';
import { seriesColor } from '@/core/chart-scale';
import { unitSymbol } from '@/core/units';
import { sortVariables } from '@/core/variables';
import { getDb } from '@/database/connection';
import { tzOffsetMinutes } from '@/database/db';
import { getExperiment, listProtocols } from '@/database/repo/experiments';
import { listObservations } from '@/database/repo/observations';
import { listSamples } from '@/database/repo/samples';
import { listSessions } from '@/database/repo/sessions';
import { useAsync } from '@/hooks/useAsync';

const NUMERIC = new Set(['integer', 'decimal', 'scale']);

export default function AnalysisScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [variableKey, setVariableKey] = useState<string | null>(null);
  const [grouping, setGrouping] = useState('treatment');
  const [scope, setScope] = useState<ComparisonScope>('latest');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [selectedBox, setSelectedBox] = useState<number | null>(null);
  const [showError, setShowError] = useState(true);

  const { data } = useAsync(async () => {
    const db = await getDb();
    const [experiment, protocols, samples, observations, sessions] = await Promise.all([
      getExperiment(db, id),
      listProtocols(db, id),
      listSamples(db, id, { includeArchived: true }),
      listObservations(db, { experimentId: id, order: 'asc' }),
      listSessions(db, id),
    ]);
    const seen = new Set<string>();
    const variables = sortVariables(
      [...protocols]
        .sort((a, b) => b.version - a.version)
        .flatMap((p) => p.variables)
        .filter((v) => v.scope === 'observation' && NUMERIC.has(v.type) && !seen.has(v.key) && seen.add(v.key)),
    );
    return { experiment, variables, samples, observations, sessions };
  }, [id]);

  const variable = data?.variables.find((v) => v.key === (variableKey ?? data.variables[0]?.key)) ?? null;

  const result = useMemo(() => {
    if (!data?.experiment || !variable) return null;
    return analyzeVariable(variable.key, data.observations, data.samples, data.experiment.design, { grouping, scope, tzOffsetMin: tzOffsetMinutes(), exclude: excluded });
  }, [data, variable, grouping, scope, excluded]);

  const allGroups = useMemo(() => {
    if (!data?.experiment || !variable) return [];
    return analyzeVariable(variable.key, data.observations, data.samples, data.experiment.design, { grouping }).groups;
  }, [data, variable, grouping]);

  if (!data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }
  if (!data.experiment || data.variables.length === 0 || !variable) {
    return (
      <View style={styles.center}>
        <Text style={styles.help}>O protocolo não tem variáveis numéricas por observação.</Text>
      </View>
    );
  }

  const unit = variable.unit && variable.unit !== '{score}' && variable.unit !== '{count}' ? unitSymbol(variable.unit) : '';
  const decimals = variable.config.decimals ?? (variable.type === 'decimal' ? 2 : 1);
  const fmt = (v: number | null | undefined, extra = 0) =>
    v === null || v === undefined ? '-' : v.toLocaleString('pt-BR', { maximumFractionDigits: decimals + extra, minimumFractionDigits: 0 });
  const sessionsWithData = data.sessions.filter((s) => data.observations.some((o) => o.sessionId === s.id && o.data[variable.key] !== undefined));
  const groups = result?.groups ?? [];
  const selected = selectedBox !== null ? groups[selectedBox] : null;

  const toggleGroup = (key: string) => {
    const next = new Set(excluded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExcluded(next);
    setSelectedBox(null);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {data.variables.map((v) => (
          <Chip
            key={v.key}
            label={v.label}
            selected={v.key === variable.key}
            onPress={() => {
              setVariableKey(v.key);
              setSelectedBox(null);
            }}
          />
        ))}
      </ScrollView>

      <View style={styles.filters}>
        {groupingOptions(data.experiment.design).length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Text style={styles.filterLabel}>Agrupar por</Text>
            {groupingOptions(data.experiment.design).map((g) => (
              <Chip
                key={g.key}
                label={g.label}
                selected={grouping === g.key}
                onPress={() => {
                  setGrouping(g.key);
                  setExcluded(new Set());
                  setSelectedBox(null);
                }}
              />
            ))}
          </ScrollView>
        ) : null}
        {allGroups.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Text style={styles.filterLabel}>Grupos</Text>
            {allGroups.map((g) => (
              <Chip key={g.key} label={g.label} selected={!excluded.has(g.key)} onPress={() => toggleGroup(g.key)} />
            ))}
          </ScrollView>
        ) : null}
      </View>

      <Section title="Evolução no tempo" hint="Média por dia de cada grupo; barras finas mostram ±1 erro padrão.">
        <Card>
          <Legend items={groups.filter((g) => g.series.length > 0).map((g) => ({ label: g.label, colorIndex: g.colorIndex }))} />
          {groups.some((g) => g.series.length > 0) ? (
            <LineChart
              series={groups.map((g) => ({ key: g.key, label: g.label, colorIndex: g.colorIndex, points: g.series.map((p) => ({ ...p, t: Date.parse(p.at) })) }))}
              unit={unit}
              showError={showError}
              formatValue={(v) => fmt(v, 1)}
            />
          ) : (
            <Text style={styles.help}>Ainda não há valores para esta variável.</Text>
          )}
          <View style={styles.switchRow}>
            <Text style={styles.help}>Mostrar erro padrão</Text>
            <Switch value={showError} onValueChange={setShowError} />
          </View>
        </Card>
      </Section>

      <Section title="Comparação entre grupos" hint="Caixa = 50% centrais; traço = mediana; círculos vazados = atípicos.">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="Última medida de cada amostra" selected={scope === 'latest'} onPress={() => setScope('latest')} />
          {sessionsWithData.map((s) => (
            <Chip key={s.id} label={s.code} selected={typeof scope === 'object' && scope.sessionId === s.id} onPress={() => setScope({ sessionId: s.id })} />
          ))}
        </ScrollView>
        <Card>
          <BoxPlot groups={groups.map((g) => ({ label: g.label, values: g.values }))} unit={unit} selected={selectedBox} onSelect={setSelectedBox} />
          {selected?.summary ? (
            <View style={styles.detail}>
              <View style={[styles.dot, { backgroundColor: seriesColor(selected.colorIndex) }]} />
              <Text style={styles.detailText}>
                {selected.label}: média {fmt(selected.summary.mean, 1)} · mediana {fmt(selected.summary.median)} · {fmt(selected.summary.min)} a {fmt(selected.summary.max)} {unit}
              </Text>
            </View>
          ) : (
            <Text style={styles.help}>Toque numa caixa para ver os números do grupo.</Text>
          )}
        </Card>
        <Card style={{ gap: 6 }}>
          <Text style={styles.anova}>{describeAnova(result?.anova ?? null)}</Text>
          <Text style={styles.caveat}>
            A ANOVA supõe resíduos aproximadamente normais, variâncias parecidas e unidades independentes. Com blocos ou medidas repetidas, use o modelo adequado na
            análise final (exportação em CSV/Parquet).
          </Text>
        </Card>
      </Section>

      <Section title="Estatística descritiva">
        <Card style={{ padding: 0 }}>
          <View style={[styles.row, styles.headerRow]}>
            <Text style={[styles.cell, styles.groupCell, styles.th]}>Grupo</Text>
            <Text style={[styles.cell, styles.th]}>n</Text>
            <Text style={[styles.cell, styles.th]}>Média</Text>
            <Text style={[styles.cell, styles.th]}>DP</Text>
            <Text style={[styles.cell, styles.th]}>Mediana</Text>
            <Text style={[styles.cell, styles.th]}>CV%</Text>
          </View>
          {groups.map((g) => (
            <View key={g.key} style={styles.row}>
              <View style={[styles.cell, styles.groupCell, styles.groupLabel]}>
                <View style={[styles.dot, { backgroundColor: seriesColor(g.colorIndex) }]} />
                <Text style={styles.td} numberOfLines={1}>
                  {g.label}
                </Text>
              </View>
              <Text style={[styles.cell, styles.td]}>{g.summary?.n ?? 0}</Text>
              <Text style={[styles.cell, styles.td]}>{fmt(g.summary?.mean, 1)}</Text>
              <Text style={[styles.cell, styles.td]}>{fmt(g.summary?.sd, 1)}</Text>
              <Text style={[styles.cell, styles.td]}>{fmt(g.summary?.median)}</Text>
              <Text style={[styles.cell, styles.td]}>{g.summary?.cv === null || g.summary?.cv === undefined ? '-' : g.summary.cv.toFixed(1).replace('.', ',')}</Text>
            </View>
          ))}
        </Card>
        <Text style={styles.help}>
          {result?.total ?? 0} valor(es) na comparação{unit ? `, em ${unit}` : ''}. Observações corrigidas entram só na versão mais recente; retratadas ficam de fora.
        </Text>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 18, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  help: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  chips: { gap: 8, alignItems: 'center', paddingRight: 16 },
  filters: { gap: 8 },
  filterLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  detail: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  detailText: { flex: 1, fontSize: 13, color: Colors.text },
  dot: { width: 10, height: 10, borderRadius: 5 },
  anova: { fontSize: 13, color: Colors.text, lineHeight: 19 },
  caveat: { fontSize: 11, color: Colors.textSecondary, lineHeight: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  headerRow: { backgroundColor: Colors.background },
  cell: { flex: 1, textAlign: 'right' },
  groupCell: { flex: 2, textAlign: 'left' },
  groupLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  th: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  td: { fontSize: 12, color: Colors.text, fontVariant: ['tabular-nums'] },
});
