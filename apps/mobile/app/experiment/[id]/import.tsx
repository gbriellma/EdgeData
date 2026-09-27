import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Section } from '@/components/ui/Section';
import { Segmented } from '@/components/ui/Segmented';
import { Colors } from '@/constants/colors';
import { DATE_FORMAT_LABELS, inferDateFormat, parseDateTime, type DateFormat } from '@/core/import/dates';
import { buildImportPlan, importableVariables, suggestMapping, tableFromRecords, type ImportMapping, type ImportTable, type VariableMapping } from '@/core/import/plan';
import type { ProtocolVariable } from '@/core/types';
import { areCompatible, unitSymbol, UNITS } from '@/core/units';
import { getDb } from '@/database/connection';
import { tzOffsetMinutes } from '@/database/db';
import { getCurrentProtocol } from '@/database/repo/experiments';
import { importObservations, listImports } from '@/database/repo/imports';
import { listSamples } from '@/database/repo/samples';
import { useAsync } from '@/hooks/useAsync';
import { pickSpreadsheet, type PickedSpreadsheet } from '@/lib/spreadsheet';
import { currentActor } from '@/stores/settings';
import { formatDateTime } from '@/utils/formatters';

type Picking = { kind: 'sample' } | { kind: 'date' } | { kind: 'time' } | { kind: 'variable'; key: string } | null;

export default function ImportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [file, setFile] = useState<PickedSpreadsheet | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [defaultDate, setDefaultDate] = useState('');
  const [picking, setPicking] = useState<Picking>(null);
  const [showPlan, setShowPlan] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data, refresh } = useAsync(async () => {
    const db = await getDb();
    const [protocol, samples, imports] = await Promise.all([getCurrentProtocol(db, id), listSamples(db, id), listImports(db, id)]);
    return { variables: protocol.variables, samples, imports };
  }, [id]);

  const table: ImportTable | null = useMemo(() => (file ? tableFromRecords(file.sheets[sheetIndex]?.rows ?? []) : null), [file, sheetIndex]);
  const importable = useMemo(() => importableVariables(data?.variables ?? []), [data]);

  const effectiveMapping = useMemo((): ImportMapping | null => {
    if (!mapping) return null;
    if (mapping.dateColumn) return mapping;
    const parsed = defaultDate.trim() ? parseDateTime(defaultDate, 'dmy', tzOffsetMinutes()) : null;
    return { ...mapping, defaultDate: parsed ?? undefined };
  }, [mapping, defaultDate]);

  const plan = useMemo(
    () => (table && effectiveMapping && data ? buildImportPlan(table, effectiveMapping, data.variables, data.samples) : null),
    [table, effectiveMapping, data],
  );

  const applyTable = (next: ImportTable, variables: ProtocolVariable[]) => {
    const suggested = suggestMapping(next, variables, tzOffsetMinutes());
    const dateIdx = suggested.dateColumn ? next.headers.indexOf(suggested.dateColumn) : -1;
    const format: DateFormat = dateIdx >= 0 ? inferDateFormat(next.rows.map((r) => r[dateIdx] ?? '')) : 'dmy';
    setMapping({ ...suggested, dateFormat: format });
    setShowPlan(false);
  };

  const choose = async () => {
    try {
      const picked = await pickSpreadsheet();
      if (!picked || !data) return;
      const nonEmpty = picked.sheets.findIndex((s) => s.rows.length > 1);
      if (nonEmpty < 0) return Alert.alert('Planilha vazia', 'Não encontrei linhas com dados abaixo do cabeçalho.');
      setFile(picked);
      setSheetIndex(nonEmpty);
      applyTable(tableFromRecords(picked.sheets[nonEmpty].rows), data.variables);
    } catch (err) {
      Alert.alert('Não foi possível ler o arquivo', err instanceof Error ? err.message : String(err));
    }
  };

  const setColumn = (column: string | undefined) => {
    if (!mapping || !picking || !table) return;
    if (picking.kind === 'sample' && column) setMapping({ ...mapping, sampleColumn: column });
    if (picking.kind === 'date') {
      const idx = column ? table.headers.indexOf(column) : -1;
      setMapping({ ...mapping, dateColumn: column, dateFormat: idx >= 0 ? inferDateFormat(table.rows.map((r) => r[idx] ?? '')) : mapping.dateFormat });
    }
    if (picking.kind === 'time') setMapping({ ...mapping, timeColumn: column });
    if (picking.kind === 'variable') {
      const variables = { ...mapping.variables };
      const variable = importable.find((v) => v.key === picking.key);
      if (column) variables[picking.key] = { column, unit: variables[picking.key]?.unit ?? variable?.unit };
      else delete variables[picking.key];
      setMapping({ ...mapping, variables });
    }
    setPicking(null);
    setShowPlan(false);
  };

  const run = async () => {
    if (!plan || !file || !effectiveMapping) return;
    setBusy(true);
    try {
      const result = await importObservations(
        await getDb(),
        {
          experimentId: id,
          fileName: file.fileName,
          sha256: file.sha256,
          rowsTotal: plan.rows.length,
          rows: plan.valid.map((r) => ({ sampleId: r.sampleId!, collectedAt: r.collectedAt!, data: r.data })),
          mapping: { sheet: file.sheets[sheetIndex]?.name, ...effectiveMapping },
        },
        currentActor(),
      );
      await refresh();
      setFile(null);
      setMapping(null);
      Alert.alert('Importação concluída', `${result.imported} observação(ões) importada(s) numa sessão própria, marcada como importação.`, [
        { text: 'Ver observações', onPress: () => router.replace({ pathname: '/experiment/[id]/observations', params: { id } } as Href) },
        { text: 'OK' },
      ]);
    } catch (err) {
      Alert.alert('Importação cancelada', `Nada foi gravado. ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  const column = (name?: string) => name ?? 'Não usar';
  const preview = (name?: string) => {
    if (!table || !name) return '';
    const idx = table.headers.indexOf(name);
    return table.rows
      .slice(0, 3)
      .map((r) => r[idx])
      .filter(Boolean)
      .join(' · ');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {!file ? (
        <>
          <Card style={{ gap: 8 }}>
            <Text style={styles.title}>Trazer medições anteriores</Text>
            <Text style={styles.help}>
              Use uma planilha (.xlsx, CSV ou TSV) com uma linha por medição: o código da amostra, a data e uma coluna por variável. As amostras precisam existir no
              experimento. Tudo entra numa sessão própria de importação, com o nome e o SHA-256 do arquivo registrados.
            </Text>
          </Card>
          <Button title="Escolher arquivo" size="large" onPress={choose} icon={<Ionicons name="document-attach-outline" size={20} color={Colors.white} />} />
          {data.imports.length > 0 ? (
            <Section title="Importações anteriores">
              {data.imports.map((imp) => (
                <View key={imp.id} style={styles.history}>
                  <Text style={styles.label}>{imp.fileName}</Text>
                  <Text style={styles.help}>
                    {formatDateTime(imp.createdAt)} · {imp.rowsImported} de {imp.rowsTotal} linhas · {imp.createdBy ?? ''}
                  </Text>
                </View>
              ))}
            </Section>
          ) : null}
        </>
      ) : null}

      {file && table && mapping ? (
        <>
          <Card style={{ gap: 4 }}>
            <Text style={styles.title}>{file.fileName}</Text>
            <Text style={styles.help}>
              {table.rows.length} linha(s) · {table.headers.length} coluna(s)
            </Text>
            {file.sheets.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 6 }}>
                {file.sheets.map((s, i) => (
                  <Chip
                    key={s.name}
                    label={s.name}
                    selected={i === sheetIndex}
                    onPress={() => {
                      setSheetIndex(i);
                      applyTable(tableFromRecords(s.rows), data.variables);
                    }}
                  />
                ))}
              </ScrollView>
            ) : null}
            <TouchableOpacity onPress={choose}>
              <Text style={styles.link}>Trocar arquivo</Text>
            </TouchableOpacity>
          </Card>

          <Section title="Identificação e data">
            <MappingRow label="Amostra (código)" value={column(mapping.sampleColumn)} preview={preview(mapping.sampleColumn)} onPress={() => setPicking({ kind: 'sample' })} />
            <MappingRow label="Data da medição" value={column(mapping.dateColumn)} preview={preview(mapping.dateColumn)} onPress={() => setPicking({ kind: 'date' })} />
            {mapping.dateColumn ? (
              <>
                <MappingRow label="Hora (opcional)" value={column(mapping.timeColumn)} preview={preview(mapping.timeColumn)} onPress={() => setPicking({ kind: 'time' })} />
                <Text style={styles.label}>Formato da data</Text>
                <Segmented
                  value={mapping.dateFormat}
                  options={(Object.keys(DATE_FORMAT_LABELS) as DateFormat[]).map((f) => ({ value: f, label: f === 'excel' ? 'Excel' : DATE_FORMAT_LABELS[f].replace(' (ISO)', '') }))}
                  onChange={(dateFormat) => setMapping({ ...mapping, dateFormat })}
                />
                <Text style={styles.help}>Horários sem fuso são lidos no fuso deste celular.</Text>
              </>
            ) : (
              <View style={{ gap: 6 }}>
                <Text style={styles.label}>Data para todas as linhas (DD/MM/AAAA)</Text>
                <TextInput style={styles.input} value={defaultDate} onChangeText={setDefaultDate} placeholder="01/03/2025" placeholderTextColor={Colors.textSecondary} keyboardType="numbers-and-punctuation" />
              </View>
            )}
          </Section>

          <Section title="Variáveis" hint="Números em unidade diferente são convertidos para a unidade do protocolo.">
            {importable.map((v) => {
              const m = mapping.variables[v.key];
              return (
                <View key={v.key} style={{ gap: 6 }}>
                  <MappingRow
                    label={`${v.label}${v.required ? ' *' : ''}${v.unit && v.unit !== '{score}' ? ` (${unitSymbol(v.unit)})` : ''}`}
                    value={column(m?.column)}
                    preview={preview(m?.column)}
                    onPress={() => setPicking({ kind: 'variable', key: v.key })}
                  />
                  {m && v.unit && ['integer', 'decimal', 'scale'].includes(v.type) ? (
                    <UnitChoice variableUnit={v.unit} mapping={m} onChange={(unit) => setMapping({ ...mapping, variables: { ...mapping.variables, [v.key]: { ...m, unit } } })} />
                  ) : null}
                </View>
              );
            })}
          </Section>

          <Button title="Conferir linhas" variant="secondary" onPress={() => setShowPlan(true)} />

          {showPlan && plan ? (
            <Section title="Resultado da conferência">
              <Card style={{ gap: 6 }}>
                <Text style={styles.label}>
                  {plan.valid.length} linha(s) prontas · {plan.invalid.length} com problema
                </Text>
                {plan.unknownSamples.length > 0 ? (
                  <Text style={styles.warn}>
                    Amostras que não existem no experimento: {plan.unknownSamples.slice(0, 10).join(', ')}
                    {plan.unknownSamples.length > 10 ? '…' : ''}. Cadastre-as em Amostras antes, se forem válidas.
                  </Text>
                ) : null}
              </Card>
              {plan.invalid.slice(0, 50).map((r) => (
                <View key={r.line} style={styles.problem}>
                  <Text style={styles.problemLine}>Linha {r.line}</Text>
                  <Text style={styles.problemText}>{r.errors.join('; ')}</Text>
                </View>
              ))}
              {plan.invalid.length > 50 ? <Text style={styles.help}>E mais {plan.invalid.length - 50} linha(s) com problema.</Text> : null}
              {plan.valid.some((r) => r.warnings.length > 0) ? (
                <Text style={styles.help}>{plan.valid.filter((r) => r.warnings.length > 0).length} linha(s) válidas com aviso (datas futuras ou repetidas).</Text>
              ) : null}
              <Button
                title={`Importar ${plan.valid.length} observação(ões)`}
                size="large"
                onPress={run}
                loading={busy}
                disabled={busy || plan.valid.length === 0}
                icon={<Ionicons name="cloud-upload-outline" size={20} color={Colors.white} />}
              />
              {plan.invalid.length > 0 ? <Text style={styles.help}>Só as linhas prontas são importadas; as demais ficam de fora.</Text> : null}
            </Section>
          ) : null}
        </>
      ) : null}

      <Modal visible={picking !== null} animationType="slide" onRequestClose={() => setPicking(null)}>
        <SafeAreaView style={styles.container}>
          <View style={styles.modalHeader}>
            <Text style={styles.title}>Escolha a coluna</Text>
            <TouchableOpacity onPress={() => setPicking(null)} accessibilityLabel="Fechar">
              <Ionicons name="close" size={26} color={Colors.text} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={[...(picking?.kind === 'sample' ? [] : [undefined]), ...(table?.headers ?? [])]}
            keyExtractor={(h) => h ?? '__none'}
            contentContainerStyle={{ padding: 16, gap: 8 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.option} onPress={() => setColumn(item)}>
                <Text style={styles.label}>{item ?? 'Não usar'}</Text>
                {item ? <Text style={styles.help}>{preview(item) || '(vazia nas primeiras linhas)'}</Text> : null}
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
    </ScrollView>
  );
}

function MappingRow({ label, value, preview, onPress }: { label: string; value: string; preview?: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.mapping} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        {preview ? (
          <Text style={styles.help} numberOfLines={1}>
            {preview}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.mappingValue, value === 'Não usar' && { color: Colors.textSecondary }]} numberOfLines={1}>
        {value}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
    </TouchableOpacity>
  );
}

function UnitChoice({ variableUnit, mapping, onChange }: { variableUnit: string; mapping: VariableMapping; onChange: (unit: string) => void }) {
  const options = UNITS.filter((u) => areCompatible(u.code, variableUnit));
  if (options.length <= 1) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingLeft: 12 }}>
      <Text style={styles.help}>Unidade na planilha:</Text>
      {options.map((u) => (
        <Chip key={u.code} label={u.symbol} selected={(mapping.unit ?? variableUnit) === u.code} onPress={() => onChange(u.code)} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: Colors.text },
  label: { fontSize: 14, fontWeight: '600', color: Colors.text },
  help: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  warn: { fontSize: 12, color: Colors.warning, lineHeight: 18 },
  link: { color: Colors.primary, fontWeight: '600', marginTop: 6 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 12, fontSize: 15, color: Colors.text, backgroundColor: Colors.surface },
  mapping: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  mappingValue: { maxWidth: '45%', fontSize: 13, fontWeight: '600', color: Colors.primary },
  history: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border, gap: 2 },
  problem: { padding: 10, borderRadius: 8, backgroundColor: Colors.errorLight, gap: 2 },
  problemLine: { fontSize: 12, fontWeight: '700', color: Colors.error },
  problemText: { fontSize: 12, color: Colors.text },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  option: { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, gap: 2 },
});
