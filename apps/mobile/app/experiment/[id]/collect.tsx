import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EventModal } from '@/components/collection/EventModal';
import { ConnectionCard } from '@/components/devices/ConnectionCard';
import type { SensorHint } from '@/components/forms/FieldRenderer';
import { initialValues, VariableForm } from '@/components/forms/VariableForm';
import QRScanner from '@/components/qrcode/QRScanner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Colors } from '@/constants/colors';
import { parseScannedCode } from '@/core/codes';
import { formatReading, readingToValue } from '@/core/device/binding';
import type { GeoPoint, ProtocolVariable, ValueMap } from '@/core/types';
import { validateValues, type ValidationError } from '@/core/validation';
import { sortVariables } from '@/core/variables';
import { getDb } from '@/database/connection';
import { uuid } from '@/database/db';
import type { Experiment, Protocol, Sample, SensorBinding, Session } from '@/database/models';
import { listBindings, listDevices } from '@/database/repo/devices';
import { clearDraft, getDraft, saveDraft } from '@/database/repo/drafts';
import { getExperiment, getProtocol } from '@/database/repo/experiments';
import { createObservation, ObservationValidationError } from '@/database/repo/observations';
import { findSampleByCode, getSample, listSamples } from '@/database/repo/samples';
import { closeSession, getOpenSession, observedSampleIds, openSession, recordEvent } from '@/database/repo/sessions';
import { applyPhoto, persistFormMedia, takePhoto } from '@/lib/camera';
import { formatValue } from '@/lib/format-value';
import { captureLocation } from '@/lib/location';
import { useDevices } from '@/stores/devices';
import { currentActor, useSettings } from '@/stores/settings';
import { formatRelative } from '@/utils/formatters';

type Step = 'identify' | 'form';
type ScanTarget = { kind: 'sample' } | { kind: 'field'; key: string } | null;

export default function CollectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const detailed = useSettings((s) => s.uiMode === 'scientific');
  const operatorName = useSettings((s) => s.operatorName);

  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [observed, setObserved] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState<Step>('identify');
  const [sample, setSample] = useState<Sample | null>(null);
  const [values, setValues] = useState<ValueMap>({});
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [saving, setSaving] = useState(false);
  const [scan, setScan] = useState<ScanTarget>(null);
  const [query, setQuery] = useState('');
  const [eventAt, setEventAt] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [bindings, setBindings] = useState<SensorBinding[]>([]);
  const [deviceNames, setDeviceNames] = useState<Map<string, string>>(new Map());
  /** Leitura de sensor usada em cada campo (proveniência da observação) */
  const [readingIds, setReadingIds] = useState<Record<string, string>>({});
  const [showDevices, setShowDevices] = useState(false);
  const connections = useDevices((s) => s.connections);
  const attachDevices = useDevices((s) => s.attach);

  const load = useCallback(async () => {
    const db = await getDb();
    const e = await getExperiment(db, id);
    setExperiment(e);
    setSamples(await listSamples(db, id));
    setBindings(await listBindings(db, id));
    setDeviceNames(new Map((await listDevices(db)).map((d) => [d.id, d.name])));
    const open = await getOpenSession(db, id);
    setSession(open);
    if (open) {
      setProtocol(await getProtocol(db, open.protocolId));
      setObserved(await observedSampleIds(db, open.id));
    }
    setLoading(false);
    if (open) void offerDraft(open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Rascunho: o formulário em preenchimento sobrevive a fechar o app ─────────

  const draftRef = useRef<{ sample: Sample | null; values: ValueMap; readingIds: Record<string, string>; active: boolean }>({
    sample: null,
    values: {},
    readingIds: {},
    active: false,
  });
  useEffect(() => {
    draftRef.current = { sample, values, readingIds, active: step === 'form' && sample !== null };
  }, [sample, values, readingIds, step]);

  const flushDraft = useCallback(async () => {
    const current = draftRef.current;
    if (!current.active || !current.sample || !session) return;
    await saveDraft(await getDb(), {
      experimentId: id,
      sessionId: session.id,
      sampleId: current.sample.id,
      data: current.values,
      extra: { readingIds: current.readingIds },
    }).catch(() => undefined);
  }, [id, session]);

  useEffect(() => {
    if (step !== 'form' || !sample) return;
    const timer = setTimeout(() => void flushDraft(), 600);
    return () => clearTimeout(timer);
  }, [values, readingIds, sample, step, flushDraft]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void flushDraft();
    });
    return () => {
      sub.remove();
      void flushDraft();
    };
  }, [flushDraft]);

  const offerDraft = async (open: Session) => {
    const db = await getDb();
    const draft = await getDraft(db, id);
    if (!draft?.sampleId) return;
    const draftSample = await getSample(db, draft.sampleId);
    if (!draftSample || draftSample.archived) {
      await clearDraft(db, id);
      return;
    }
    const otherSession = draft.sessionId !== open.id;
    Alert.alert(
      'Coleta não salva',
      `Há um preenchimento de ${draftSample.code} de ${formatRelative(draft.updatedAt)} que não foi salvo${otherSession ? ' (de outra sessão; será salvo nesta)' : ''}. Recuperar?`,
      [
        {
          text: 'Descartar',
          style: 'destructive',
          onPress: () => void clearDraft(db, id),
        },
        {
          text: 'Recuperar',
          onPress: () => {
            setSample(draftSample);
            setValues(draft.data);
            setReadingIds((draft.extra.readingIds as Record<string, string> | undefined) ?? {});
            setErrors([]);
            setStep('form');
          },
        },
      ],
    );
  };

  const leaveForm = () => {
    const filled = Object.entries(values).some(([key, value]) => {
      const initial = initialValues(observationVars)[key];
      return value !== undefined && value !== '' && JSON.stringify(value) !== JSON.stringify(initial);
    });
    const discard = async () => {
      await clearDraft(await getDb(), id);
      setSample(null);
      setValues({});
      setReadingIds({});
      setStep('identify');
    };
    if (!filled) return void discard();
    Alert.alert('Descartar preenchimento?', `Os dados de ${sample?.code} ainda não foram salvos.`, [
      { text: 'Continuar preenchendo', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: () => void discard() },
    ]);
  };

  useEffect(() => {
    void load();
  }, [load]);

  // Enquanto a sessão está aberta nesta tela, leituras e eventos dos dispositivos são gravados nela
  const sessionId = session?.id;
  useEffect(() => {
    if (!sessionId) return;
    void attachDevices({ experimentId: id, sessionId });
    return () => {
      void attachDevices(null);
    };
  }, [sessionId, id, attachDevices]);

  const observationVars = useMemo(
    () => sortVariables((protocol?.variables ?? []).filter((v): v is ProtocolVariable => v.scope === 'observation')),
    [protocol],
  );
  const sampleVars = useMemo(() => sortVariables((protocol?.variables ?? []).filter((v) => v.scope === 'sample')), [protocol]);
  const readFromSensor = useCallback(async (variable: ProtocolVariable, binding: SensorBinding) => {
    try {
      const result = await useDevices.getState().readSensor(binding.deviceId, binding.sensorId);
      const converted = readingToValue(result.raw, result.sensor, variable);
      if (!converted.ok) {
        Alert.alert(variable.label, converted.reason);
        return;
      }
      setValues((v) => ({ ...v, [variable.key]: converted.value }));
      const readingId = result.readingId;
      if (readingId) setReadingIds((ids) => ({ ...ids, [variable.key]: readingId }));
    } catch (err) {
      Alert.alert('Sensor', err instanceof Error ? err.message : String(err));
    }
  }, []);

  const sensorHints = useMemo(() => {
    const hints: Record<string, SensorHint> = {};
    const active = Object.values(connections);
    for (const binding of bindings) {
      const variable = observationVars.find((v) => v.key === binding.variableKey);
      if (!variable) continue;
      const connection = active.find((c) => c.device?.id === binding.deviceId && c.status === 'connected');
      const sensor = connection?.manifest?.sensors.find((s) => s.id === binding.sensorId);
      hints[variable.key] = {
        source: `${connection?.name ?? deviceNames.get(binding.deviceId) ?? binding.deviceId} · ${sensor?.label ?? binding.sensorId}`,
        latest: connection ? formatReading(connection.latest[binding.sensorId]?.value, sensor) : 'desconectado',
        onRead: () => void readFromSensor(variable, binding),
      };
    }
    return hints;
  }, [bindings, connections, observationVars, deviceNames, readFromSensor]);

  const activeDevices = Object.values(connections);
  const streamingCount = activeDevices.filter((c) => c.streaming).length;

  const pending = useMemo(() => samples.filter((s) => !observed.has(s.id)), [samples, observed]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? samples.filter((s) => s.code.toLowerCase().includes(q) || (s.treatment ?? '').toLowerCase().includes(q)) : samples;
    return [...list].sort((a, b) => Number(observed.has(a.id)) - Number(observed.has(b.id)));
  }, [samples, query, observed]);

  // ── Sessão ─────────────────────────────────────────────────────────────────

  const startSession = async () => {
    if (!operatorName.trim()) {
      Alert.alert('Quem está coletando?', 'Informe seu nome em Ajustes para que ele fique registrado na sessão.', [
        { text: 'Continuar assim mesmo', onPress: () => void doStart() },
        { text: 'Ir para Ajustes', onPress: () => router.push('/settings') },
      ]);
      return;
    }
    await doStart();
  };

  const doStart = async () => {
    try {
      await openSession(await getDb(), id, { operator: currentActor(), notes: notes.trim() || undefined });
      await load();
    } catch (err) {
      Alert.alert('Erro', err instanceof Error ? err.message : String(err));
    }
  };

  const endSession = () => {
    if (!session) return;
    Alert.alert(`Encerrar sessão ${session.code}?`, `${observed.size} amostra(s) observada(s), ${pending.length} pendente(s).`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Encerrar',
        style: 'destructive',
        onPress: async () => {
          await attachDevices(null);
          await closeSession(await getDb(), session.id, currentActor());
          router.back();
        },
      },
    ]);
  };

  const addEvent = async (label: string) => {
    if (!session) return;
    try {
      await recordEvent(await getDb(), { experimentId: id, sessionId: session.id, label, occurredAt: eventAt ?? undefined }, currentActor());
      setEventAt(null);
    } catch (err) {
      Alert.alert('Erro', err instanceof Error ? err.message : String(err));
    }
  };

  // ── Identificação da amostra ────────────────────────────────────────────────

  const choose = (s: Sample) => {
    const start = () => {
      setSample(s);
      setValues(initialValues(observationVars));
      setReadingIds({});
      setErrors([]);
      setStep('form');
    };
    if (observed.has(s.id)) {
      Alert.alert('Já observada nesta sessão', `${s.code} já tem observação na sessão ${session?.code}. Registrar outra medida?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Registrar outra', onPress: start },
      ]);
    } else start();
  };

  const handleScan = async (raw: string) => {
    const target = scan;
    setScan(null);
    if (target?.kind === 'field') {
      setValues((v) => ({ ...v, [target.key]: raw.trim() }));
      return;
    }
    const parsed = parseScannedCode(raw);
    const db = await getDb();
    let found: Sample | null = null;
    if (parsed.kind === 'uuid') found = await getSample(db, parsed.id);
    if (!found && parsed.kind === 'uuid' && parsed.code) found = await findSampleByCode(db, id, parsed.code);
    if (!found && parsed.kind === 'code') found = await findSampleByCode(db, id, parsed.code);
    if (!found) return Alert.alert('Amostra não encontrada', 'O código lido não corresponde a nenhuma amostra deste experimento.');
    if (found.experimentId !== id) return Alert.alert('Outro experimento', 'Esta etiqueta pertence a outro experimento.');
    if (found.archived) return Alert.alert('Amostra arquivada', `${found.code} está arquivada.`);
    choose(found);
  };

  // ── Salvar ──────────────────────────────────────────────────────────────────

  const save = async (next: boolean) => {
    if (!session || !sample || !experiment) return;
    const validation = validateValues(observationVars, values);
    setErrors(validation);
    if (validation.length > 0) {
      Alert.alert('Revise o formulário', validation.map((e) => e.message).join('\n'));
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const needsLocation = observationVars.some((v) => v.type === 'auto_gps');
      const location: GeoPoint | null = needsLocation ? await captureLocation() : null;
      const final: ValueMap = { ...values };
      for (const v of observationVars) {
        if (v.type === 'auto_timestamp') final[v.key] = now;
        if (v.type === 'auto_uuid') final[v.key] = uuid();
        if (v.type === 'auto_gps' && location) final[v.key] = location;
      }
      const media = await persistFormMedia(observationVars, final, id, `${experiment.code}_${sample.code}_${session.code}`);
      await createObservation(
        await getDb(),
        { sessionId: session.id, sampleId: sample.id, data: media.values, location, files: media.files, readingIds: Object.values(readingIds), collectedAt: now },
        currentActor(),
      );
      setObserved((o) => new Set(o).add(sample.id));
      draftRef.current.active = false;
      await clearDraft(await getDb(), id);
      await remindBackup();
      setSample(null);
      setValues({});
      setReadingIds({});
      setStep('identify');
      if (next) setScan({ kind: 'sample' });
    } catch (err) {
      if (err instanceof ObservationValidationError) setErrors(err.errors);
      Alert.alert('Não foi possível salvar', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const remindBackup = async () => {
    const { autoBackupEvery, observationsSinceBackup, update } = useSettings.getState();
    const count = observationsSinceBackup + 1;
    await update({ observationsSinceBackup: count });
    if (autoBackupEvery > 0 && count >= autoBackupEvery) {
      Alert.alert('Hora do backup', `${count} observações desde o último backup. Faça um backup em Ajustes quando puder.`);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (scan) {
    return <QRScanner onScanned={handleScan} onClose={() => setScan(null)} hint={scan.kind === 'sample' ? 'Aponte para a etiqueta da amostra' : 'Aponte para o código'} />;
  }

  if (loading || !experiment) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} accessibilityLabel="Fechar">
        <Ionicons name="close" size={24} color={Colors.text} />
      </TouchableOpacity>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={styles.headerTitle}>{session ? `Sessão ${session.code}` : 'Coleta'}</Text>
        {session ? (
          <Text style={styles.headerMeta}>
            {observed.size}/{samples.length} amostras · protocolo v{protocol?.version} · {formatRelative(session.startedAt)}
          </Text>
        ) : null}
      </View>
      {session ? (
        <TouchableOpacity onPress={endSession} style={styles.headerBtn} accessibilityLabel="Encerrar sessão">
          <Ionicons name="stop-circle-outline" size={26} color={Colors.error} />
        </TouchableOpacity>
      ) : (
        <View style={styles.headerBtn} />
      )}
    </View>
  );

  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        {header}
        <KeyboardAwareScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={{ gap: 8 }}>
            <Text style={styles.title}>Nova sessão de coleta</Text>
            <Text style={styles.help}>
              A sessão registra quem coletou, quando, com qual versão do protocolo e quais dispositivos estavam conectados. Abra uma sessão por ida a campo ou corrida de aquisição.
            </Text>
            <Text style={styles.label}>Observações da sessão (opcional)</Text>
            <TextInput
              style={styles.input}
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder="Condições do tempo, equipe presente…"
              placeholderTextColor={Colors.textSecondary}
            />
          </Card>
          {samples.length === 0 ? <Text style={styles.warn}>Este experimento ainda não tem amostras. Cadastre-as antes de coletar.</Text> : null}
          <Button title="Abrir sessão" size="large" onPress={startSession} disabled={samples.length === 0} icon={<Ionicons name="play" size={20} color={Colors.white} />} />
        </KeyboardAwareScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {header}
      <View style={styles.toolbar}>
        <TouchableOpacity
          style={styles.toolBtn}
          onPress={() => setEventAt(new Date().toISOString())}
          accessibilityLabel="Marcar evento"
        >
          <Ionicons name="flag-outline" size={18} color={Colors.primary} />
          <Text style={styles.toolText}>Evento</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolBtn} onPress={() => setShowDevices((v) => !v)} accessibilityLabel="Dispositivos">
          <Ionicons name={streamingCount > 0 ? 'radio-button-on' : 'bluetooth-outline'} size={18} color={streamingCount > 0 ? Colors.error : Colors.primary} />
          <Text style={styles.toolText}>
            Sensores{activeDevices.length > 0 ? ` (${activeDevices.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {showDevices ? (
        <ScrollView style={styles.devicePanel} contentContainerStyle={{ gap: 8, padding: 16 }}>
          {activeDevices.length === 0 ? <Text style={styles.help}>Nenhum dispositivo conectado.</Text> : null}
          {activeDevices.map((connection) => (
            <ConnectionCard key={connection.bleId} connection={connection} compact />
          ))}
          <Text style={styles.help}>Enquanto esta tela está aberta, tudo o que os dispositivos enviam é gravado como leitura bruta desta sessão.</Text>
          <Button title="Conectar dispositivo" variant="outline" size="small" onPress={() => router.push('/devices' as Href)} />
        </ScrollView>
      ) : null}

      {step === 'identify' ? (
        <View style={{ flex: 1, padding: 16, gap: 12 }}>
          <Button title="Escanear etiqueta" size="large" onPress={() => setScan({ kind: 'sample' })} icon={<Ionicons name="qr-code-outline" size={22} color={Colors.white} />} />
          {pending.length > 0 ? (
            <Button title={`Próxima pendente: ${pending[0].code}`} variant="outline" onPress={() => choose(pending[0])} />
          ) : (
            <Text style={styles.done}>Todas as amostras foram observadas nesta sessão.</Text>
          )}
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={Colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar ou digitar código"
              placeholderTextColor={Colors.textSecondary}
              autoCapitalize="characters"
              onSubmitEditing={() => query.trim() && handleScan(query)}
            />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(s) => s.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.sampleRow} onPress={() => choose(item)}>
                <Ionicons name={observed.has(item.id) ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={observed.has(item.id) ? Colors.primary : Colors.textSecondary} />
                <Text style={styles.sampleCode}>{item.code}</Text>
                <Text style={styles.sampleMeta}>{item.treatment ?? ''}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      ) : null}

      {step === 'form' && sample ? (
        <>
          <KeyboardAwareScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" bottomOffset={60}>
            <Card style={styles.banner}>
              <Ionicons name="leaf" size={18} color={Colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.bannerTitle}>{sample.code}</Text>
                <Text style={styles.bannerMeta}>
                  {[sample.treatment, ...sampleVars.filter((v) => sample.data[v.key] !== undefined && v.type !== 'image' && v.type !== 'multi_image').slice(0, 3).map((v) => `${v.label}: ${formatValue(v, sample.data[v.key])}`)]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            </Card>
            <VariableForm
              variables={observationVars}
              values={values}
              errors={errors}
              detailed={detailed}
              sensorHints={sensorHints}
              onChange={(key, value) => {
                setValues((v) => ({ ...v, [key]: value }));
                // valor editado à mão deixa de ser a leitura do sensor
                setReadingIds((ids) => {
                  if (!(key in ids)) return ids;
                  const next = { ...ids };
                  delete next[key];
                  return next;
                });
              }}
              onCaptureImage={async (key, angle, config) => {
                const uri = await takePhoto(config);
                if (uri) setValues((v) => applyPhoto(v, key, uri, angle));
              }}
              onScanCode={(key) => setScan({ kind: 'field', key })}
              onCaptureLocation={async (key) => {
                const point = await captureLocation();
                if (point) setValues((v) => ({ ...v, [key]: point }));
                else Alert.alert('GPS', 'Não foi possível obter a localização.');
              }}
            />
          </KeyboardAwareScrollView>
          <View style={styles.footer}>
            <Button title="Voltar" variant="outline" onPress={leaveForm} style={{ flex: 1 }} />
            <Button title="Salvar" variant="secondary" onPress={() => save(false)} loading={saving} disabled={saving} style={{ flex: 1 }} />
            <Button title="Salvar + próxima" onPress={() => save(true)} disabled={saving} style={{ flex: 1.4 }} />
          </View>
        </>
      ) : null}

      <EventModal visible={eventAt !== null} onClose={() => setEventAt(null)} onSubmit={addEvent} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border, backgroundColor: Colors.surface },
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  headerMeta: { fontSize: 12, color: Colors.textSecondary },
  toolbar: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  toolBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: Colors.primary, backgroundColor: Colors.primarySurface },
  toolText: { color: Colors.primary, fontWeight: '600', fontSize: 13 },
  title: { fontSize: 18, fontWeight: '700', color: Colors.text },
  help: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  warn: { fontSize: 13, color: Colors.warning },
  done: { fontSize: 14, color: Colors.primary, fontWeight: '600', textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 12, minHeight: 60, fontSize: 15, color: Colors.text, textAlignVertical: 'top' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: Colors.text },
  sampleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  sampleCode: { fontSize: 15, fontWeight: '600', color: Colors.text },
  sampleMeta: { flex: 1, fontSize: 12, color: Colors.textSecondary, textAlign: 'right' },
  banner: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: Colors.primarySurface, borderColor: Colors.primaryLight },
  bannerTitle: { fontSize: 18, fontWeight: '800', color: Colors.primaryDark },
  bannerMeta: { fontSize: 12, color: Colors.textSecondary },
  devicePanel: { maxHeight: 320, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  footer: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: Colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
});
