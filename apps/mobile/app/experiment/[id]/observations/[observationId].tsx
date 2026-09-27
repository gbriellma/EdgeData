import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { VariableForm } from '@/components/forms/VariableForm';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { QcBadge } from '@/components/ui/QcBadge';
import { ReasonModal } from '@/components/ui/ReasonModal';
import { KeyValue, Section } from '@/components/ui/Section';
import { Colors } from '@/constants/colors';
import type { ValueMap } from '@/core/types';
import { validateValues, type ValidationError } from '@/core/validation';
import { sortVariables, visibleVariables } from '@/core/variables';
import { getDb } from '@/database/connection';
import { listAudit } from '@/database/repo/common';
import { getProtocol } from '@/database/repo/experiments';
import { getObservationHistory, listFiles, retractObservation, reviseObservation } from '@/database/repo/observations';
import { getSample } from '@/database/repo/samples';
import { getSession } from '@/database/repo/sessions';
import { useAsync } from '@/hooks/useAsync';
import { applyPhoto, persistFormMedia, takePhoto } from '@/lib/camera';
import { formatValue } from '@/lib/format-value';
import { captureLocation, formatGeoPoint } from '@/lib/location';
import { resolveMediaUri } from '@/lib/media';
import { currentActor, useSettings } from '@/stores/settings';
import { formatDateTime } from '@/utils/formatters';

export default function ObservationDetailScreen() {
  const { id, observationId } = useLocalSearchParams<{ id: string; observationId: string }>();
  const router = useRouter();
  const detailed = useSettings((s) => s.uiMode === 'scientific');
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<ValueMap>({});
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [modal, setModal] = useState<null | 'revise' | 'retract'>(null);
  const [busy, setBusy] = useState(false);

  const { data, refresh } = useAsync(async () => {
    const db = await getDb();
    const history = await getObservationHistory(db, observationId);
    const current = history.find((o) => o.id === observationId) ?? history[history.length - 1];
    if (!current) return null;
    const [protocol, sample, session, files, audit] = await Promise.all([
      getProtocol(db, current.protocolId),
      getSample(db, current.sampleId),
      getSession(db, current.sessionId),
      listFiles(db, { observationId: current.id }),
      listAudit(db, { entity: 'observation', entityIds: history.map((h) => h.id) }),
    ]);
    return { history, current, protocol, sample, session, files, audit };
  }, [observationId]);

  if (!data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }
  const { history, current, protocol, sample, session, files, audit } = data;
  const variables = sortVariables((protocol?.variables ?? []).filter((v) => v.scope === 'observation'));
  const latest = history[history.length - 1];

  const startEdit = () => {
    setValues(current.data);
    setErrors([]);
    setEditing(true);
  };

  const requestRevision = () => {
    const validation = validateValues(variables, values);
    setErrors(validation);
    if (validation.length > 0) return Alert.alert('Revise o formulário', validation.map((e) => e.message).join('\n'));
    setModal('revise');
  };

  const revise = async (reason: string) => {
    setModal(null);
    setBusy(true);
    try {
      const media = await persistFormMedia(variables, values, id, `${sample?.code ?? 'obs'}_${session?.code ?? ''}_rev${current.revision + 1}`);
      const revised = await reviseObservation(await getDb(), current.id, { data: media.values, files: media.files, reason }, currentActor());
      setEditing(false);
      router.replace({ pathname: '/experiment/[id]/observations/[observationId]', params: { id, observationId: revised.id } });
    } catch (err) {
      Alert.alert('Não foi possível corrigir', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const retract = async (reason: string) => {
    setModal(null);
    try {
      await retractObservation(await getDb(), current.id, reason, currentActor());
      await refresh();
    } catch (err) {
      Alert.alert('Erro', err instanceof Error ? err.message : String(err));
    }
  };

  if (editing) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <KeyboardAwareScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" bottomOffset={40}>
          <Text style={styles.help}>A correção cria a revisão {current.revision + 1}. O valor original continua guardado e visível no histórico.</Text>
          <VariableForm
            variables={variables}
            values={values}
            errors={errors}
            detailed={detailed}
            onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))}
            onCaptureImage={async (key, angle, config) => {
              const uri = await takePhoto(config);
              if (uri) setValues((v) => applyPhoto(v, key, uri, angle));
            }}
            onCaptureLocation={async (key) => {
              const point = await captureLocation();
              if (point) setValues((v) => ({ ...v, [key]: point }));
            }}
          />
        </KeyboardAwareScrollView>
        <View style={styles.footer}>
          <Button title="Cancelar" variant="outline" onPress={() => setEditing(false)} style={{ flex: 1 }} />
          <Button title="Salvar correção" onPress={requestRevision} loading={busy} disabled={busy} style={{ flex: 1 }} />
        </View>
        <ReasonModal visible={modal === 'revise'} title="Motivo da correção" message="Fica registrado na trilha de auditoria." onCancel={() => setModal(null)} onConfirm={revise} />
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{sample?.code ?? 'Amostra'}</Text>
      <Text style={styles.meta}>
        {formatDateTime(current.collectedAt)} · sessão {session?.code} · protocolo v{protocol?.version}
      </Text>
      {current.status !== 'current' ? (
        <Card style={styles.statusCard}>
          <Text style={styles.statusText}>
            {current.status === 'retracted' ? `Retratada em ${formatDateTime(current.retractedAt!)}: ${current.retractionReason}` : `Substituída pela revisão ${latest.revision} em ${formatDateTime(current.supersededAt!)}`}
          </Text>
          {current.status === 'superseded' ? <Button title="Ver versão vigente" variant="outline" size="small" onPress={() => router.replace({ pathname: '/experiment/[id]/observations/[observationId]', params: { id, observationId: latest.id } })} /> : null}
        </Card>
      ) : null}

      <Section title={`Valores (revisão ${current.revision})`}>
        {visibleVariables(variables, current.data).map((v) => {
          const value = current.data[v.key];
          const flag = current.qc[v.key];
          if (v.type === 'image' && typeof value === 'string') {
            return (
              <View key={v.key} style={{ gap: 4 }}>
                <Text style={styles.meta}>{v.label}</Text>
                <Image source={{ uri: resolveMediaUri(value) }} style={styles.photo} />
              </View>
            );
          }
          if (v.type === 'multi_image' && Array.isArray(value)) {
            return (
              <View key={v.key} style={{ gap: 4 }}>
                <Text style={styles.meta}>{v.label}</Text>
                <ScrollView horizontal>
                  {(value as { angle: string; uri: string }[]).map((p) => (
                    <View key={p.angle} style={{ marginRight: 8 }}>
                      <Image source={{ uri: resolveMediaUri(p.uri) }} style={styles.photo} />
                      <Text style={styles.meta}>{p.angle}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            );
          }
          return (
            <View key={v.key} style={styles.valueRow}>
              <Text style={styles.valueLabel}>{v.label}</Text>
              <Text style={styles.value}>{formatValue(v, value)}</Text>
              {flag && flag !== 'GOOD' ? <QcBadge flag={flag} /> : null}
            </View>
          );
        })}
      </Section>

      <Section title="Registro">
        <KeyValue label="Local" value={current.location ? formatGeoPoint(current.location) : null} />
        <KeyValue label="Origem" value={current.source === 'device' ? 'Sensor' : current.source === 'import' ? 'Importação' : 'Manual'} />
        <KeyValue label="Registrado por" value={current.createdBy} />
        <KeyValue label="Registrado em" value={formatDateTime(current.createdAt)} />
        <KeyValue label="Arquivos" value={files.length ? `${files.length} (SHA-256 registrado)` : null} />
        <KeyValue label="ID" value={current.id} />
      </Section>

      {history.length > 1 ? (
        <Section title="Histórico de versões">
          {history.map((h) => {
            const entry = audit.find((a) => a.entityId === h.id && a.action === 'revise');
            const details = entry?.details as { reason?: string; diff?: Record<string, [unknown, unknown]> } | undefined;
            return (
              <View key={h.id} style={styles.historyRow}>
                <Text style={[styles.historyTitle, h.id === current.id && { color: Colors.primary }]}>
                  Revisão {h.revision} · {formatDateTime(h.createdAt)} · {h.createdBy ?? ''}
                </Text>
                {details?.reason ? <Text style={styles.meta}>Corrigida depois: {details.reason}</Text> : null}
                {details?.diff
                  ? Object.entries(details.diff).map(([key, [before, after]]) => (
                      <Text key={key} style={styles.diff}>
                        {variables.find((v) => v.key === key)?.label ?? key}: {JSON.stringify(before)} → {JSON.stringify(after)}
                      </Text>
                    ))
                  : null}
              </View>
            );
          })}
        </Section>
      ) : null}

      {current.status === 'current' ? (
        <View style={{ gap: 10 }}>
          <Button title="Corrigir (nova revisão)" onPress={startEdit} />
          <Button title="Retratar observação" variant="danger" onPress={() => setModal('retract')} />
        </View>
      ) : null}

      <ReasonModal
        visible={modal === 'retract'}
        title="Retratar observação"
        message="A observação deixa de valer, mas continua no histórico e no dataset (observations_history)."
        confirmLabel="Retratar"
        destructive
        onCancel={() => setModal(null)}
        onConfirm={retract}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.text },
  meta: { fontSize: 12, color: Colors.textSecondary },
  help: { fontSize: 13, color: Colors.textSecondary, marginBottom: 12 },
  statusCard: { backgroundColor: Colors.warningLight, borderColor: Colors.warning, gap: 8 },
  statusText: { fontSize: 13, color: Colors.text },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  valueLabel: { fontSize: 14, color: Colors.textSecondary, flex: 1 },
  value: { fontSize: 14, fontWeight: '600', color: Colors.text },
  photo: { width: 140, height: 140, borderRadius: 10 },
  historyRow: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border, gap: 2 },
  historyTitle: { fontSize: 13, fontWeight: '700', color: Colors.text },
  diff: { fontSize: 12, color: Colors.text, fontFamily: 'monospace' },
  footer: { flexDirection: 'row', gap: 12, padding: 16, backgroundColor: Colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
});
