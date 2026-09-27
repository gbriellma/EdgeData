import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { initialValues, VariableForm } from '@/components/forms/VariableForm';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Segmented } from '@/components/ui/Segmented';
import { Colors } from '@/constants/colors';
import { normalizeCode } from '@/core/codes';
import { parseCsv, type CsvParseResult } from '@/core/csv';
import { expandTreatments, planSamples } from '@/core/design';
import type { ProtocolVariable, ValueMap } from '@/core/types';
import { normalizeValues, validateValues, type ValidationError } from '@/core/validation';
import { fieldTypeInfo, slugifyKey } from '@/core/variables';
import { getDb } from '@/database/connection';
import type { Experiment, Sample } from '@/database/models';
import { getCurrentProtocol, getExperiment } from '@/database/repo/experiments';
import { registerSampleFile } from '@/database/repo/observations';
import { createSample, createSamples, createSamplesFromPlan, listSamples, type NewSample } from '@/database/repo/samples';
import { applyPhoto, persistFormMedia, takePhoto } from '@/lib/camera';
import { captureLocation } from '@/lib/location';
import { currentActor } from '@/stores/settings';

type Mode = 'plan' | 'manual' | 'sequence' | 'csv';

export default function NewSamplesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [sampleVars, setSampleVars] = useState<ProtocolVariable[]>([]);
  const [existing, setExisting] = useState<Sample[]>([]);
  const [mode, setMode] = useState<Mode>('plan');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const db = await getDb();
      const e = await getExperiment(db, id);
      setExperiment(e);
      const protocol = await getCurrentProtocol(db, id);
      setSampleVars(protocol.variables.filter((v) => v.scope === 'sample'));
      setExisting(await listSamples(db, id, { includeArchived: true }));
      if (e && expandTreatments(e.design).length === 0) setMode('manual');
    })();
  }, [id]);

  if (!experiment) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    try {
      const message = await fn();
      Alert.alert('Pronto', message, [{ text: 'OK', onPress: () => router.back() }]);
    } catch (err) {
      Alert.alert('Não foi possível adicionar', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAwareScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" bottomOffset={40}>
      <Segmented<Mode>
        value={mode}
        onChange={setMode}
        options={[
          { value: 'plan', label: 'Desenho' },
          { value: 'manual', label: 'Manual' },
          { value: 'sequence', label: 'Sequência' },
          { value: 'csv', label: 'CSV' },
        ]}
      />
      {mode === 'plan' ? <PlanMode experiment={experiment} existing={existing} sampleVars={sampleVars} busy={busy} run={run} /> : null}
      {mode === 'manual' ? <ManualMode experiment={experiment} sampleVars={sampleVars} busy={busy} run={run} /> : null}
      {mode === 'sequence' ? <SequenceMode experiment={experiment} busy={busy} run={run} /> : null}
      {mode === 'csv' ? <CsvMode experiment={experiment} sampleVars={sampleVars} busy={busy} run={run} /> : null}
    </KeyboardAwareScrollView>
  );
}

type RunFn = (fn: () => Promise<string>) => Promise<void>;

function PlanMode({ experiment, existing, sampleVars, busy, run }: { experiment: Experiment; existing: Sample[]; sampleVars: ProtocolVariable[]; busy: boolean; run: RunFn }) {
  const plan = planSamples(experiment.design);
  const taken = new Set(existing.map((s) => normalizeCode(s.code)));
  const missing = plan.filter((p) => !taken.has(normalizeCode(p.code)));
  if (plan.length === 0) {
    return <Text style={styles.help}>O desenho experimental ainda não tem tratamentos. Defina-os em “Dados do experimento → Desenho experimental”.</Text>;
  }
  const factorKeys = experiment.design.factors.map((f) => f.key);
  return (
    <View style={{ gap: 12 }}>
      <Card style={{ gap: 6 }}>
        <Text style={styles.title}>{plan.length} amostras no plano</Text>
        <Text style={styles.help}>{missing.length === 0 ? 'Todas já foram cadastradas.' : `${missing.length} ainda não cadastrada(s): ${missing.slice(0, 6).map((m) => m.code).join(', ')}${missing.length > 6 ? '…' : ''}`}</Text>
      </Card>
      <Button
        title={`Gerar ${missing.length} amostra(s)`}
        disabled={busy || missing.length === 0}
        loading={busy}
        onPress={() =>
          run(async () => {
            const result = await createSamplesFromPlan(
              await getDb(),
              experiment.id,
              plan,
              sampleVars.filter((v) => factorKeys.includes(v.key)).map((v) => v.key),
              currentActor(),
            );
            return `${result.created} amostra(s) criada(s).`;
          })
        }
      />
    </View>
  );
}

function ManualMode({ experiment, sampleVars, busy, run }: { experiment: Experiment; sampleVars: ProtocolVariable[]; busy: boolean; run: RunFn }) {
  const treatments = expandTreatments(experiment.design);
  const [code, setCode] = useState('');
  const [treatment, setTreatment] = useState<string | null>(null);
  const [replicate, setReplicate] = useState('');
  const [values, setValues] = useState<ValueMap>(() => initialValues(sampleVars));
  const [errors, setErrors] = useState<ValidationError[]>([]);

  const save = () => {
    const validation = validateValues(sampleVars, values);
    setErrors(validation);
    if (validation.length > 0) return;
    void run(async () => {
      const db = await getDb();
      const prefix = code.trim() || 'amostra';
      const media = await persistFormMedia(sampleVars, values, experiment.id, `${experiment.code}_${prefix}`);
      const sampleId = await createSample(
        db,
        experiment.id,
        { code: code.trim(), treatment, replicate: replicate ? Number(replicate) : null, data: normalizeValues(sampleVars, media.values) },
        currentActor(),
      );
      for (const file of media.files) await registerSampleFile(db, experiment.id, sampleId, file);
      return 'Amostra cadastrada.';
    });
  };

  return (
    <View style={{ gap: 12 }}>
      <View>
        <Text style={styles.label}>Código *</Text>
        <TextInput style={styles.input} value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="Ex.: T1_R3 (vazio = automático)" placeholderTextColor={Colors.textSecondary} />
      </View>
      {treatments.length > 0 ? (
        <View>
          <Text style={styles.label}>Tratamento</Text>
          <View style={styles.chips}>
            {treatments.map((t) => (
              <Chip key={t.code} label={t.code} selected={treatment === t.code} onPress={() => setTreatment(treatment === t.code ? null : t.code)} />
            ))}
          </View>
        </View>
      ) : null}
      <View>
        <Text style={styles.label}>Réplica</Text>
        <TextInput style={styles.input} value={replicate} onChangeText={(t) => setReplicate(t.replace(/\D/g, ''))} keyboardType="number-pad" />
      </View>
      <VariableForm
        variables={sampleVars}
        values={values}
        errors={errors}
        onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))}
        onCaptureImage={async (key, angle, config) => {
          const uri = await takePhoto(config);
          if (uri) setValues((v) => applyPhoto(v, key, uri, angle));
        }}
        onCaptureLocation={async (key) => {
          const point = await captureLocation();
          if (point) setValues((v) => ({ ...v, [key]: point }));
          else Alert.alert('GPS', 'Não foi possível obter a localização.');
        }}
      />
      <Button title="Cadastrar amostra" onPress={save} loading={busy} disabled={busy} />
    </View>
  );
}

function SequenceMode({ experiment, busy, run }: { experiment: Experiment; busy: boolean; run: RunFn }) {
  const [prefix, setPrefix] = useState('P');
  const [start, setStart] = useState('1');
  const [count, setCount] = useState('10');
  const [digits, setDigits] = useState('3');
  const n = Math.min(10000, parseInt(count, 10) || 0);
  const first = parseInt(start, 10) || 1;
  const pad = Math.min(8, Math.max(1, parseInt(digits, 10) || 1));
  const make = (i: number) => `${prefix}${String(first + i).padStart(pad, '0')}`;
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.row}>
        <Field label="Prefixo" value={prefix} onChange={setPrefix} />
        <Field label="Início" value={start} onChange={setStart} numeric />
      </View>
      <View style={styles.row}>
        <Field label="Quantidade" value={count} onChange={setCount} numeric />
        <Field label="Dígitos" value={digits} onChange={setDigits} numeric />
      </View>
      <Text style={styles.help}>{n > 0 ? `Serão criados ${make(0)} … ${make(n - 1)}` : 'Informe a quantidade'}</Text>
      <Button
        title={`Criar ${n} amostra(s)`}
        disabled={busy || n <= 0}
        loading={busy}
        onPress={() =>
          run(async () => {
            const list: NewSample[] = Array.from({ length: n }, (_, i) => ({ code: make(i) }));
            await createSamples(await getDb(), experiment.id, list, currentActor(), 'sequence');
            return `${n} amostra(s) criada(s).`;
          })
        }
      />
    </View>
  );
}

const CODE_HEADERS = ['codigo', 'code', 'nome', 'name', 'id', 'amostra', 'sample', 'sujeito'];
const TREATMENT_HEADERS = ['tratamento', 'treatment', 'trat'];
const REPLICATE_HEADERS = ['replica', 'repeticao', 'rep', 'replicate', 'repetition'];
const BLOCK_HEADERS = ['bloco', 'block'];

function CsvMode({ experiment, sampleVars, busy, run }: { experiment: Experiment; sampleVars: ProtocolVariable[]; busy: boolean; run: RunFn }) {
  const [csv, setCsv] = useState<CsvParseResult | null>(null);
  const [codeColumn, setCodeColumn] = useState<string | null>(null);

  const mapping = useMemo(() => {
    if (!csv) return null;
    const bySlug = new Map(csv.headers.map((h) => [slugifyKey(h), h]));
    const find = (candidates: string[]) => candidates.map((c) => bySlug.get(c)).find(Boolean) ?? null;
    const variables = sampleVars
      .filter((v) => !fieldTypeInfo(v.type).automatic && v.type !== 'image' && v.type !== 'multi_image' && v.type !== 'gps')
      .map((v) => ({ variable: v, header: bySlug.get(v.key) ?? bySlug.get(slugifyKey(v.label)) ?? null }));
    return { treatment: find(TREATMENT_HEADERS), replicate: find(REPLICATE_HEADERS), block: find(BLOCK_HEADERS), variables };
  }, [csv, sampleVars]);

  const pick = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'], copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const parsed = parseCsv(await FileSystem.readAsStringAsync(result.assets[0].uri));
    if (parsed.headers.length === 0) return Alert.alert('CSV vazio', 'O arquivo não tem cabeçalho.');
    setCsv(parsed);
    const bySlug = new Map(parsed.headers.map((h) => [slugifyKey(h), h]));
    setCodeColumn(CODE_HEADERS.map((c) => bySlug.get(c)).find(Boolean) ?? parsed.headers[0]);
  };

  const importRows = () => {
    if (!csv || !mapping || !codeColumn) return;
    const rows: NewSample[] = [];
    const problems: string[] = [];
    csv.rows.forEach((row, index) => {
      const values: ValueMap = {};
      for (const { variable, header } of mapping.variables) {
        if (!header) continue;
        const raw = row[header];
        values[variable.key] =
          variable.type === 'multi_category' ? raw.split(/[;|]/).map((s) => s.trim()).filter(Boolean) : variable.type === 'boolean' ? ['sim', 'true', '1', 'yes', 's'].includes(raw.toLowerCase()) : raw;
      }
      const errors = validateValues(sampleVars.filter((v) => mapping.variables.some((m) => m.header && m.variable.key === v.key)), values);
      if (errors.length > 0) problems.push(`Linha ${index + 2}: ${errors.map((e) => e.message).join('; ')}`);
      rows.push({
        code: row[codeColumn] ?? '',
        treatment: mapping.treatment ? row[mapping.treatment] || null : null,
        replicate: mapping.replicate && row[mapping.replicate] ? parseInt(row[mapping.replicate].replace(/\D/g, ''), 10) || null : null,
        block: mapping.block && row[mapping.block] ? parseInt(row[mapping.block].replace(/\D/g, ''), 10) || null : null,
        data: normalizeValues(sampleVars, values),
      });
    });
    if (problems.length > 0) {
      Alert.alert('Corrija o CSV', problems.slice(0, 6).join('\n') + (problems.length > 6 ? `\n… e mais ${problems.length - 6}` : ''));
      return;
    }
    void run(async () => {
      await createSamples(await getDb(), experiment.id, rows, currentActor(), 'csv');
      return `${rows.length} amostra(s) importada(s).`;
    });
  };

  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.help}>
        Primeira linha com cabeçalhos. Colunas com o mesmo nome (ou ID) das variáveis de amostra são preenchidas automaticamente; “tratamento”, “réplica” e “bloco” também são reconhecidas. Vírgula ou ponto e vírgula.
      </Text>
      <Button title={csv ? 'Escolher outro arquivo' : 'Escolher arquivo CSV'} variant="outline" onPress={pick} icon={<Ionicons name="document-outline" size={18} color={Colors.primary} />} />
      {csv && mapping ? (
        <Card style={{ gap: 10 }}>
          <Text style={styles.title}>{csv.rows.length} linha(s)</Text>
          <Text style={styles.label}>Coluna com o código da amostra</Text>
          <View style={styles.chips}>
            {csv.headers.map((h) => (
              <Chip key={h} label={h} selected={codeColumn === h} onPress={() => setCodeColumn(h)} />
            ))}
          </View>
          <Text style={styles.label}>Mapeamento</Text>
          {mapping.treatment ? <Text style={styles.map}>tratamento ← {mapping.treatment}</Text> : null}
          {mapping.replicate ? <Text style={styles.map}>réplica ← {mapping.replicate}</Text> : null}
          {mapping.block ? <Text style={styles.map}>bloco ← {mapping.block}</Text> : null}
          {mapping.variables.map(({ variable, header }) => (
            <Text key={variable.key} style={[styles.map, !header && { color: Colors.textSecondary }]}>
              {variable.label} ← {header ?? '(não encontrada)'}
            </Text>
          ))}
          <Button title={`Importar ${csv.rows.length} amostra(s)`} onPress={importRows} loading={busy} disabled={busy || csv.rows.length === 0} />
        </Card>
      ) : null}
    </View>
  );
}

function Field({ label, value, onChange, numeric }: { label: string; value: string; onChange: (v: string) => void; numeric?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} value={value} onChangeText={(t) => onChange(numeric ? t.replace(/\D/g, '') : t)} keyboardType={numeric ? 'number-pad' : 'default'} autoCapitalize="characters" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  title: { fontSize: 16, fontWeight: '700', color: Colors.text },
  help: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: Colors.text, backgroundColor: Colors.surface },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: 10 },
  map: { fontSize: 13, color: Colors.text },
});
