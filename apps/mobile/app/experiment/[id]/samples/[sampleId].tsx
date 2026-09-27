import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { VariableForm } from '@/components/forms/VariableForm';
import { generateQRLabelPDF } from '@/components/qrcode/QRLabelSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { KeyValue, Section } from '@/components/ui/Section';
import { QcBadge } from '@/components/ui/QcBadge';
import { Colors } from '@/constants/colors';
import { worstFlag } from '@/core/qc';
import type { ValueMap } from '@/core/types';
import { normalizeValues, validateValues, type ValidationError } from '@/core/validation';
import { sortVariables } from '@/core/variables';
import { getDb } from '@/database/connection';
import { getCurrentProtocol, getExperiment } from '@/database/repo/experiments';
import { listObservations, registerSampleFile } from '@/database/repo/observations';
import { deleteSampleIfUnused, getSample, markQrGenerated, setSampleArchived, updateSample } from '@/database/repo/samples';
import { useAsync } from '@/hooks/useAsync';
import { applyPhoto, persistFormMedia, takePhoto } from '@/lib/camera';
import { formatValue } from '@/lib/format-value';
import { captureLocation } from '@/lib/location';
import { resolveMediaUri } from '@/lib/media';
import { currentActor } from '@/stores/settings';
import { formatDateTime } from '@/utils/formatters';

export default function SampleDetailScreen() {
  const { id, sampleId } = useLocalSearchParams<{ id: string; sampleId: string }>();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState('');
  const [values, setValues] = useState<ValueMap>({});
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [saving, setSaving] = useState(false);

  const { data, loading, refresh } = useAsync(async () => {
    const db = await getDb();
    const [sample, experiment, protocol, observations] = await Promise.all([
      getSample(db, sampleId),
      getExperiment(db, id),
      getCurrentProtocol(db, id),
      listObservations(db, { experimentId: id, sampleId }),
    ]);
    return { sample, experiment, sampleVars: sortVariables(protocol.variables.filter((v) => v.scope === 'sample')), observations };
  }, [id, sampleId]);

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }
  if (!data?.sample || !data.experiment) {
    return (
      <View style={styles.center}>
        <Text>Amostra não encontrada</Text>
      </View>
    );
  }
  const { sample, experiment, sampleVars, observations } = data;

  const startEdit = () => {
    setCode(sample.code);
    setValues(sample.data);
    setErrors([]);
    setEditing(true);
  };

  const save = async () => {
    const validation = validateValues(sampleVars, values);
    setErrors(validation);
    if (validation.length > 0) return;
    setSaving(true);
    try {
      const db = await getDb();
      const media = await persistFormMedia(sampleVars, values, id, `${experiment.code}_${code}`);
      await updateSample(db, sampleId, { code, data: normalizeValues(sampleVars, media.values) }, currentActor());
      for (const file of media.files) await registerSampleFile(db, id, sampleId, file);
      setEditing(false);
      await refresh();
    } catch (err) {
      Alert.alert('Erro', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const printLabel = async () => {
    try {
      const uri = await generateQRLabelPDF([{ id: sample.id, code: sample.code, label: sample.treatment ?? experiment.code }], `${experiment.name} — ${sample.code}`);
      await markQrGenerated(await getDb(), [sample.id]);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
    } catch (err) {
      Alert.alert('Erro', err instanceof Error ? err.message : String(err));
    }
  };

  const remove = () => {
    Alert.alert('Remover amostra', observations.length > 0 ? 'A amostra tem observações e será arquivada (os dados ficam guardados).' : 'Excluir esta amostra?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: observations.length > 0 ? 'Arquivar' : 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const db = await getDb();
          if (observations.length > 0) await setSampleArchived(db, sampleId, true, currentActor());
          else await deleteSampleIfUnused(db, sampleId, currentActor());
          router.back();
        },
      },
    ]);
  };

  if (editing) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <KeyboardAwareScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" bottomOffset={40}>
          <Text style={styles.label}>Código</Text>
          <TextInput style={styles.input} value={code} onChangeText={setCode} autoCapitalize="characters" />
          <View style={{ height: 12 }} />
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
            }}
          />
          <Text style={styles.help}>A alteração fica registrada na auditoria com os valores anteriores.</Text>
        </KeyboardAwareScrollView>
        <View style={styles.footer}>
          <Button title="Cancelar" variant="outline" onPress={() => setEditing(false)} style={{ flex: 1 }} />
          <Button title="Salvar" onPress={save} loading={saving} disabled={saving} style={{ flex: 1 }} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{sample.code}</Text>
          <Text style={styles.meta}>{sample.id}</Text>
        </View>
        <TouchableOpacity onPress={startEdit} hitSlop={8}>
          <Ionicons name="create-outline" size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <Section title="Identificação">
        <KeyValue label="Tratamento" value={sample.treatment} />
        <KeyValue label="Réplica" value={sample.replicate} />
        <KeyValue label="Bloco" value={sample.block} />
        <KeyValue label="Cadastro" value={formatDateTime(sample.createdAt)} />
        {sample.archived ? <KeyValue label="Situação" value="Arquivada" /> : null}
      </Section>

      {sampleVars.length > 0 ? (
        <Section title="Atributos">
          {sampleVars.map((v) =>
            v.type === 'image' && typeof sample.data[v.key] === 'string' ? (
              <View key={v.key}>
                <Text style={styles.meta}>{v.label}</Text>
                <Image source={{ uri: resolveMediaUri(sample.data[v.key] as string) }} style={styles.photo} />
              </View>
            ) : (
              <KeyValue key={v.key} label={v.label} value={formatValue(v, sample.data[v.key])} />
            ),
          )}
        </Section>
      ) : null}

      <Section title={`Observações (${observations.length})`}>
        {observations.length === 0 ? <Text style={styles.help}>Nenhuma observação ainda.</Text> : null}
        {observations.map((o) => (
          <TouchableOpacity key={o.id} style={styles.obsRow} onPress={() => router.push({ pathname: '/experiment/[id]/observations/[observationId]', params: { id, observationId: o.id } })}>
            <View style={{ flex: 1 }}>
              <Text style={styles.obsTitle}>{formatDateTime(o.collectedAt)}</Text>
              <Text style={styles.meta}>
                {o.revision > 1 ? `revisão ${o.revision} · ` : ''}
                {o.source === 'device' ? 'com sensor' : 'manual'}
              </Text>
            </View>
            <QcBadge flag={worstFlag(o.qc)} />
          </TouchableOpacity>
        ))}
      </Section>

      <Card style={{ gap: 10 }}>
        <Button title="Etiqueta QR desta amostra" variant="outline" onPress={printLabel} icon={<Ionicons name="qr-code-outline" size={18} color={Colors.primary} />} />
        <Button title={observations.length > 0 ? 'Arquivar amostra' : 'Excluir amostra'} variant="danger" onPress={remove} />
      </Card>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '800', color: Colors.text },
  meta: { fontSize: 12, color: Colors.textSecondary },
  help: { fontSize: 13, color: Colors.textSecondary },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: Colors.text, backgroundColor: Colors.surface },
  photo: { width: 160, height: 160, borderRadius: 10, marginTop: 6, marginBottom: 8 },
  obsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  obsTitle: { fontSize: 14, fontWeight: '600', color: Colors.text },
  footer: { flexDirection: 'row', gap: 12, padding: 16, backgroundColor: Colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
});
