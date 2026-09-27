import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Section } from '@/components/ui/Section';
import { Colors } from '@/constants/colors';
import { nextReleaseVersion } from '@/core/export/package';
import { listSerializers, type DataFormat } from '@/core/export/serializers';
import { getDb } from '@/database/connection';
import { listReleases } from '@/database/repo/devices';
import { useAsync } from '@/hooks/useAsync';
import { exportDataset } from '@/lib/dataset-export';
import { currentActor } from '@/stores/settings';
import { formatBytes, formatDateTime } from '@/utils/formatters';

export default function ExportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [formats, setFormats] = useState<Set<DataFormat>>(new Set(['csv', 'parquet']));
  const [includeMedia, setIncludeMedia] = useState(true);
  const [notes, setNotes] = useState('');
  const [progress, setProgress] = useState<{ label: string; fraction: number } | null>(null);

  const { data: releases, refresh } = useAsync(async () => listReleases(await getDb(), id), [id]);
  const nextVersion = nextReleaseVersion((releases ?? []).map((r) => r.version));

  const toggle = (format: DataFormat) => {
    const next = new Set(formats);
    if (next.has(format)) next.delete(format);
    else next.add(format);
    setFormats(next);
  };

  const run = async () => {
    if (formats.size === 0) return Alert.alert('Escolha um formato', 'Selecione ao menos um formato de dados.');
    setProgress({ label: 'Preparando…', fraction: 0 });
    try {
      const result = await exportDataset(id, { formats: [...formats], includeMedia, notes: notes.trim() || undefined, actor: currentActor() }, (label, fraction) => setProgress({ label, fraction }));
      setNotes('');
      await refresh();
      if (result.missingMedia.length > 0) {
        Alert.alert('Atenção', `${result.missingMedia.length} foto(s) não foram encontradas no aparelho e ficaram fora do pacote.`);
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.zipPath, { mimeType: 'application/zip', dialogTitle: `Dataset v${result.version}` });
      } else {
        Alert.alert(`Dataset v${result.version}`, result.zipPath);
      }
    } catch (err) {
      Alert.alert('Erro na exportação', err instanceof Error ? err.message : String(err));
    } finally {
      setProgress(null);
    }
  };

  return (
    <KeyboardAwareScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Section title="Formatos dos dados" hint="As tabelas saem em cada formato escolhido.">
        {listSerializers().map((s) => (
          <TouchableOpacity key={s.format} style={styles.option} onPress={() => toggle(s.format)}>
            <Ionicons name={formats.has(s.format) ? 'checkbox' : 'square-outline'} size={22} color={Colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.optionTitle}>{s.label}</Text>
              <Text style={styles.optionText}>{s.description}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </Section>

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.optionTitle}>Incluir fotos</Text>
          <Text style={styles.optionText}>Copiadas para files/ com SHA-256 no manifesto</Text>
        </View>
        <Switch value={includeMedia} onValueChange={setIncludeMedia} />
      </View>

      <View>
        <Text style={styles.label}>Notas da versão (opcional)</Text>
        <TextInput style={styles.input} value={notes} onChangeText={setNotes} multiline placeholder="Ex.: inclui sessões S001–S004; corrigidas etiquetas trocadas" placeholderTextColor={Colors.textSecondary} />
      </View>

      <Card style={styles.packageCard}>
        <Text style={styles.optionTitle}>O pacote inclui</Text>
        <Text style={styles.optionText}>
          data/ (amostras, observações vigentes e histórico, sessões, eventos, leituras) · README.md · datapackage.json (Frictionless) · metadata.json · data_dictionary.csv · provenance.json (W3C PROV) · checksums.sha256
        </Text>
      </Card>

      {progress ? (
        <View style={{ gap: 6 }}>
          <Text style={styles.optionText}>{progress.label}</Text>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${Math.round(progress.fraction * 100)}%` }]} />
          </View>
        </View>
      ) : null}

      <Button title={`Gerar release v${nextVersion}`} size="large" onPress={run} loading={progress !== null} disabled={progress !== null} icon={<Ionicons name="archive-outline" size={20} color={Colors.white} />} />

      {releases && releases.length > 0 ? (
        <Section title="Releases anteriores" hint="Cada release é congelada: não pode ser alterada nem apagada.">
          {releases.map((r) => (
            <View key={r.id} style={styles.release}>
              <Text style={styles.releaseVersion}>v{r.version}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionText}>
                  {formatDateTime(r.createdAt)} · {r.fileCount} arquivos · {formatBytes(r.totalBytes)} · {r.formats.join(', ')}
                </Text>
                {r.notes ? <Text style={styles.releaseNotes}>{r.notes}</Text> : null}
              </View>
            </View>
          ))}
        </Section>
      ) : null}
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  optionTitle: { fontSize: 15, fontWeight: '600', color: Colors.text },
  optionText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 12, minHeight: 60, fontSize: 15, color: Colors.text, backgroundColor: Colors.surface, textAlignVertical: 'top' },
  packageCard: { gap: 6, backgroundColor: Colors.primarySurface, borderColor: Colors.primaryLight },
  bar: { height: 8, borderRadius: 4, backgroundColor: Colors.border, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: Colors.primary },
  release: { flexDirection: 'row', gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  releaseVersion: { fontSize: 15, fontWeight: '800', color: Colors.primary, width: 56 },
  releaseNotes: { fontSize: 13, color: Colors.text },
});
