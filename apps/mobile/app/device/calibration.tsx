import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { StatusBadge } from '@/components/ui/QcBadge';
import { ReasonModal } from '@/components/ui/ReasonModal';
import { Section } from '@/components/ui/Section';
import { Segmented } from '@/components/ui/Segmented';
import { Colors } from '@/constants/colors';
import {
  applyCalibration,
  calibrationStatus,
  fitCalibration,
  formatEquation,
  METHOD_INFO,
  type CalibrationFit,
  type CalibrationMethod,
} from '@/core/calibration';
import { formatAxisNumber, linearScale, niceTicks } from '@/core/chart-scale';
import { parseLocaleNumber } from '@/core/import/plan';
import { unitSymbol } from '@/core/units';
import { getDb } from '@/database/connection';
import { createCalibration, listCalibrations, revokeCalibration } from '@/database/repo/calibrations';
import { getDevice } from '@/database/repo/devices';
import type { Calibration } from '@/database/models';
import { useAsync } from '@/hooks/useAsync';
import { useDevices } from '@/stores/devices';
import { currentActor } from '@/stores/settings';
import { formatDate } from '@/utils/formatters';

interface PointDraft {
  raw: string;
  reference: string;
  note: string;
}

const VALIDITY = [
  { months: 3, label: '3 meses' },
  { months: 6, label: '6 meses' },
  { months: 12, label: '1 ano' },
  { months: 0, label: 'Sem prazo' },
];

const STATUS_LABEL = { valid: 'Vigente', expiring: 'Vence em breve', expired: 'Vencida', revoked: 'Revogada', future: 'Futura' } as const;
const STATUS_TONE = { valid: 'ok', expiring: 'warn', expired: 'error', revoked: 'neutral', future: 'neutral' } as const;

export default function CalibrationScreen() {
  const { deviceId, sensorId } = useLocalSearchParams<{ deviceId: string; sensorId: string }>();
  const navigation = useNavigation();
  const [creating, setCreating] = useState(false);
  const [method, setMethod] = useState<CalibrationMethod>('linear');
  const [points, setPoints] = useState<PointDraft[]>([{ raw: '', reference: '', note: '' }, { raw: '', reference: '', note: '' }]);
  const [instrument, setInstrument] = useState('');
  const [certificate, setCertificate] = useState('');
  const [notes, setNotes] = useState('');
  const [validMonths, setValidMonths] = useState(12);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState<Calibration | null>(null);
  const connected = useDevices((s) => Object.values(s.connections).some((c) => c.device?.id === deviceId && c.status === 'connected'));

  const { data, refresh } = useAsync(async () => {
    const db = await getDb();
    const [device, calibrations] = await Promise.all([getDevice(db, deviceId), listCalibrations(db, { deviceId, sensorId })]);
    return { device, calibrations, sensor: device?.manifest.sensors.find((s) => s.id === sensorId) ?? null };
  }, [deviceId, sensorId]);

  useEffect(() => {
    if (data?.sensor) navigation.setOptions({ title: `Calibração · ${data.sensor.label ?? data.sensor.id}` });
  }, [data?.sensor, navigation]);

  const parsed = useMemo(
    () =>
      points
        .map((p) => ({ raw: parseLocaleNumber(p.raw), reference: parseLocaleNumber(p.reference), note: p.note.trim() || undefined }))
        .filter((p): p is { raw: number; reference: number; note: string | undefined } => p.raw !== null && p.reference !== null),
    [points],
  );
  const fit = useMemo((): CalibrationFit | string => {
    try {
      return fitCalibration(parsed, method);
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }, [parsed, method]);

  if (!data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }
  if (!data.device || !data.sensor) {
    return (
      <View style={styles.center}>
        <Text style={styles.help}>Sensor não encontrado.</Text>
      </View>
    );
  }

  const unit = unitSymbol(data.sensor.unit);
  const now = new Date().toISOString();

  const updatePoint = (index: number, patch: Partial<PointDraft>) => setPoints((list) => list.map((p, i) => (i === index ? { ...p, ...patch } : p)));

  const readRaw = async (index: number) => {
    try {
      const result = await useDevices.getState().readSensor(deviceId, sensorId);
      if (typeof result.raw !== 'number') return Alert.alert('Leitura', 'O sensor não devolveu um número.');
      updatePoint(index, { raw: String(result.raw) });
    } catch (err) {
      Alert.alert('Sensor', err instanceof Error ? err.message : String(err));
    }
  };

  const save = async () => {
    if (typeof fit === 'string') return Alert.alert('Ajuste incompleto', fit);
    setSaving(true);
    try {
      const validFrom = new Date();
      const validUntil = validMonths > 0 ? new Date(validFrom.getFullYear(), validFrom.getMonth() + validMonths, validFrom.getDate()).toISOString() : null;
      await createCalibration(
        await getDb(),
        {
          deviceId,
          sensorId,
          method,
          points: parsed,
          unit: data.sensor!.unit,
          referenceInstrument: instrument,
          certificate,
          validFrom: validFrom.toISOString(),
          validUntil,
          notes,
        },
        currentActor(),
      );
      setCreating(false);
      setPoints([{ raw: '', reference: '', note: '' }, { raw: '', reference: '', note: '' }]);
      setInstrument('');
      setCertificate('');
      setNotes('');
      await refresh();
    } catch (err) {
      Alert.alert('Não foi possível salvar', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (reason: string) => {
    const target = revoking;
    setRevoking(null);
    if (!target) return;
    await revokeCalibration(await getDb(), target.id, reason, currentActor());
    await refresh();
  };

  return (
    <KeyboardAwareScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" bottomOffset={40}>
      <Text style={styles.help}>
        Compare o sensor com um padrão ou equipamento de referência em alguns pontos da faixa de uso. O app grava sempre o valor bruto e, ao lado, o valor corrigido pela
        calibração vigente, com a identificação da curva usada.
      </Text>

      <Section title="Histórico">
        {data.calibrations.length === 0 ? <Text style={styles.help}>Nenhuma calibração registrada para este sensor.</Text> : null}
        {data.calibrations.map((c) => {
          const status = calibrationStatus(c, now);
          return (
            <Card key={c.id} style={{ gap: 4 }}>
              <View style={styles.row}>
                <Text style={[styles.equation, { flex: 1 }]}>{formatEquation(c.coefficients)}</Text>
                <StatusBadge label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} />
              </View>
              <Text style={styles.help}>
                {METHOD_INFO[c.method].label} · {c.points.length} ponto(s) · RMSE {formatAxisNumber(c.rmse ?? 0)} {unit}
                {c.r2 !== null ? ` · R² ${c.r2.toFixed(4).replace('.', ',')}` : ''}
              </Text>
              <Text style={styles.help}>
                Desde {formatDate(c.validFrom)}
                {c.validUntil ? ` até ${formatDate(c.validUntil)}` : ', sem prazo'}
                {c.referenceInstrument ? ` · Padrão: ${c.referenceInstrument}` : ''}
                {c.certificate ? ` · Certificado ${c.certificate}` : ''}
              </Text>
              {c.revokedReason ? <Text style={styles.warn}>Revogada: {c.revokedReason}</Text> : null}
              {c.notes ? <Text style={styles.help}>{c.notes}</Text> : null}
              {!c.revokedAt ? (
                <TouchableOpacity onPress={() => setRevoking(c)}>
                  <Text style={styles.danger}>Revogar</Text>
                </TouchableOpacity>
              ) : null}
            </Card>
          );
        })}
      </Section>

      {!creating ? (
        <Button title="Nova calibração" onPress={() => setCreating(true)} icon={<Ionicons name="add" size={20} color={Colors.white} />} />
      ) : (
        <Section title="Nova calibração">
          <Segmented value={method} options={(Object.keys(METHOD_INFO) as CalibrationMethod[]).map((m) => ({ value: m, label: METHOD_INFO[m].label }))} onChange={setMethod} />
          <Text style={styles.help}>{METHOD_INFO[method].description}. Mínimo de {METHOD_INFO[method].minPoints} ponto(s); use mais para estimar o erro.</Text>

          {points.map((p, i) => (
            <Card key={i} style={{ gap: 8 }}>
              <View style={styles.row}>
                <Text style={[styles.label, { flex: 1 }]}>Ponto {i + 1}</Text>
                {points.length > 1 ? (
                  <TouchableOpacity onPress={() => setPoints((list) => list.filter((_, j) => j !== i))} accessibilityLabel="Remover ponto">
                    <Ionicons name="trash-outline" size={18} color={Colors.error} />
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={styles.row}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.help}>Sensor ({unit})</Text>
                  <TextInput style={styles.input} value={p.raw} onChangeText={(raw) => updatePoint(i, { raw })} keyboardType="decimal-pad" placeholder="lido" placeholderTextColor={Colors.textSecondary} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.help}>Referência ({unit})</Text>
                  <TextInput
                    style={styles.input}
                    value={p.reference}
                    onChangeText={(reference) => updatePoint(i, { reference })}
                    keyboardType="decimal-pad"
                    placeholder="padrão"
                    placeholderTextColor={Colors.textSecondary}
                  />
                </View>
              </View>
              {connected ? (
                <TouchableOpacity style={styles.row} onPress={() => void readRaw(i)}>
                  <Ionicons name="bluetooth" size={16} color={Colors.primary} />
                  <Text style={styles.link}>Ler valor do sensor agora</Text>
                </TouchableOpacity>
              ) : null}
              {typeof fit !== 'string' && parsed[i] ? (
                <Text style={styles.help}>Resíduo: {formatAxisNumber(parsed[i].reference - applyCalibration(fit.coefficients, parsed[i].raw))} {unit}</Text>
              ) : null}
            </Card>
          ))}
          <Button title="Adicionar ponto" variant="outline" onPress={() => setPoints((list) => [...list, { raw: '', reference: '', note: '' }])} />

          <Card style={{ gap: 6 }}>
            {typeof fit === 'string' ? (
              <Text style={styles.help}>{fit}</Text>
            ) : (
              <>
                <Text style={styles.equation}>{formatEquation(fit.coefficients)}</Text>
                <Text style={styles.help}>
                  RMSE {formatAxisNumber(fit.rmse)} {unit}
                  {fit.r2 !== null ? ` · R² ${fit.r2.toFixed(4).replace('.', ',')}` : ''}
                </Text>
                <FitChart points={parsed} coefficients={fit.coefficients} />
              </>
            )}
          </Card>

          <Text style={styles.label}>Validade</Text>
          <View style={styles.chips}>
            {VALIDITY.map((v) => (
              <Chip key={v.months} label={v.label} selected={validMonths === v.months} onPress={() => setValidMonths(v.months)} />
            ))}
          </View>
          <TextInput style={styles.input} value={instrument} onChangeText={setInstrument} placeholder="Equipamento de referência (modelo, nº de série)" placeholderTextColor={Colors.textSecondary} />
          <TextInput style={styles.input} value={certificate} onChangeText={setCertificate} placeholder="Nº do certificado de calibração (opcional)" placeholderTextColor={Colors.textSecondary} />
          <TextInput style={[styles.input, { minHeight: 60 }]} value={notes} onChangeText={setNotes} multiline placeholder="Condições (temperatura, soluções-padrão…)" placeholderTextColor={Colors.textSecondary} />
          <View style={styles.row}>
            <Button title="Cancelar" variant="outline" onPress={() => setCreating(false)} style={{ flex: 1 }} />
            <Button title="Salvar calibração" onPress={save} loading={saving} disabled={saving || typeof fit === 'string'} style={{ flex: 1.4 }} />
          </View>
        </Section>
      )}

      <ReasonModal
        visible={revoking !== null}
        title="Revogar calibração"
        message="Leituras já gravadas continuam com a correção aplicada; novas leituras deixam de usar esta curva."
        confirmLabel="Revogar"
        destructive
        onCancel={() => setRevoking(null)}
        onConfirm={(reason) => void revoke(reason)}
      />
    </KeyboardAwareScrollView>
  );
}

/** Pontos (sensor x referência) e a curva ajustada; a diagonal tracejada seria o sensor perfeito. */
function FitChart({ points, coefficients }: { points: { raw: number; reference: number }[]; coefficients: number[] }) {
  const [width, setWidth] = useState(0);
  const height = 180;
  const pad = { top: 10, right: 12, bottom: 24, left: 42 };
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  if (points.length === 0) return null;
  const xs = points.map((p) => p.raw);
  const ys = points.map((p) => p.reference);
  const xTicks = niceTicks(Math.min(...xs), Math.max(...xs), 4);
  const yTicks = niceTicks(Math.min(...ys, ...xs), Math.max(...ys, ...xs), 4);
  const x = linearScale([xTicks[0], xTicks[xTicks.length - 1]], [pad.left, width - pad.right]);
  const y = linearScale([yTicks[0], yTicks[yTicks.length - 1]], [height - pad.bottom, pad.top]);
  const steps = 40;
  const x0 = xTicks[0];
  const x1 = xTicks[xTicks.length - 1];
  const curve = Array.from({ length: steps + 1 }, (_, i) => {
    const raw = x0 + ((x1 - x0) * i) / steps;
    return `${i === 0 ? 'M' : 'L'}${x(raw).toFixed(1)},${y(applyCalibration(coefficients, raw)).toFixed(1)}`;
  }).join(' ');
  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {yTicks.map((t) => (
            <React.Fragment key={`y${t}`}>
              <Line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={Colors.border} strokeWidth={1} />
              <SvgText x={pad.left - 6} y={y(t) + 4} fontSize={10} fill={Colors.textSecondary} textAnchor="end">
                {formatAxisNumber(t)}
              </SvgText>
            </React.Fragment>
          ))}
          {xTicks.map((t) => (
            <SvgText key={`x${t}`} x={x(t)} y={height - 6} fontSize={10} fill={Colors.textSecondary} textAnchor="middle">
              {formatAxisNumber(t)}
            </SvgText>
          ))}
          <Line x1={x(x0)} y1={y(x0)} x2={x(x1)} y2={y(x1)} stroke={Colors.textSecondary} strokeWidth={1} strokeDasharray="4 4" />
          <Path d={curve} stroke={Colors.primary} strokeWidth={2} fill="none" />
          {points.map((p, i) => (
            <Circle key={i} cx={x(p.raw)} cy={y(p.reference)} r={4} fill={Colors.primaryDark} stroke={Colors.surface} strokeWidth={2} />
          ))}
        </Svg>
      ) : null}
      <Text style={styles.axisHint}>eixo x: sensor · eixo y: referência</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  help: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  warn: { fontSize: 12, color: Colors.warning },
  danger: { fontSize: 13, fontWeight: '600', color: Colors.error, marginTop: 4 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.text },
  link: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  equation: { fontSize: 16, fontWeight: '700', color: Colors.text, fontVariant: ['tabular-nums'] },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 10, fontSize: 15, color: Colors.text, backgroundColor: Colors.surface },
  axisHint: { position: 'absolute', right: 12, top: 0, fontSize: 10, color: Colors.textSecondary },
});
