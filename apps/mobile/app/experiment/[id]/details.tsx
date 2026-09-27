import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { DesignEditor } from '@/components/experiment/DesignEditor';
import { MetadataForm } from '@/components/experiment/MetadataForm';
import { Button } from '@/components/ui/Button';
import { Section } from '@/components/ui/Section';
import { Segmented } from '@/components/ui/Segmented';
import { Colors } from '@/constants/colors';
import { validateDesign } from '@/core/design';
import type { ExperimentalDesign, ExperimentMetadata } from '@/core/types';
import { getDb } from '@/database/connection';
import type { Experiment } from '@/database/models';
import { getExperiment, saveMethodology, updateExperimentDesign, updateExperimentMetadata } from '@/database/repo/experiments';
import { currentActor, useSettings } from '@/stores/settings';

export default function ExperimentDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const detailed = useSettings((s) => s.uiMode === 'scientific');
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [metadata, setMetadata] = useState<ExperimentMetadata | null>(null);
  const [design, setDesign] = useState<ExperimentalDesign | null>(null);
  const [tab, setTab] = useState<'metadata' | 'design'>('metadata');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const e = await getExperiment(await getDb(), id);
      setExperiment(e);
      setMetadata(e?.metadata ?? null);
      setDesign(e?.design ?? null);
    })();
  }, [id]);

  if (!experiment || !metadata || !design) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  const save = async () => {
    const problems = validateDesign(design);
    if (problems.length > 0) return Alert.alert('Desenho experimental', problems.join('\n'));
    setSaving(true);
    try {
      const db = await getDb();
      const actor = currentActor();
      await updateExperimentMetadata(db, id, metadata, actor);
      await updateExperimentDesign(db, id, design, actor);
      if ((metadata.methodology ?? '') !== (experiment.metadata.methodology ?? '')) {
        await saveMethodology(db, id, metadata.methodology ?? '', actor);
      }
      router.back();
    } catch (err) {
      Alert.alert('Erro ao salvar', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={styles.tabs}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'metadata', label: 'Identificação' },
            { value: 'design', label: 'Desenho experimental' },
          ]}
        />
      </View>
      <KeyboardAwareScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" bottomOffset={40}>
        {tab === 'metadata' ? (
          <MetadataForm metadata={metadata} onChange={setMetadata} detailed={detailed} />
        ) : (
          <Section title="Desenho experimental" hint="Mudanças no desenho não alteram amostras já cadastradas. Gere as que faltarem em Amostras → Adicionar.">
            <DesignEditor design={design} onChange={setDesign} detailed={detailed} />
          </Section>
        )}
        <Text style={styles.note}>Toda alteração fica registrada na trilha de auditoria (quem, quando, antes e depois).</Text>
      </KeyboardAwareScrollView>
      <View style={styles.footer}>
        <Button title="Salvar" onPress={save} loading={saving} disabled={saving} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabs: { padding: 12, backgroundColor: Colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  content: { padding: 16, paddingBottom: 40 },
  note: { fontSize: 12, color: Colors.textSecondary, marginTop: 8 },
  footer: { padding: 16, backgroundColor: Colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
});
