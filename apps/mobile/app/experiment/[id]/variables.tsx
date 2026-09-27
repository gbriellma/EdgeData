import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { VariableBuilder } from '@/components/forms/VariableBuilder';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Section } from '@/components/ui/Section';
import { Segmented } from '@/components/ui/Segmented';
import { Colors } from '@/constants/colors';
import type { ProtocolVariable, VariableScope } from '@/core/types';
import { definitionsEqual } from '@/core/variables';
import { getDb } from '@/database/connection';
import type { Protocol, Session } from '@/database/models';
import { getCurrentProtocol, listProtocols, saveVariables, sessionsPerProtocol, usedVariableKeys } from '@/database/repo/experiments';
import { getOpenSession } from '@/database/repo/sessions';
import { currentActor, useSettings } from '@/stores/settings';
import { formatDate } from '@/utils/formatters';

export default function ProtocolScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const detailed = useSettings((s) => s.uiMode === 'scientific');
  const [current, setCurrent] = useState<Protocol | null>(null);
  const [history, setHistory] = useState<Protocol[]>([]);
  const [usage, setUsage] = useState<Map<string, number>>(new Map());
  const [lockedKeys, setLockedKeys] = useState<string[]>([]);
  const [openSession, setOpenSession] = useState<Session | null>(null);
  const [variables, setVariables] = useState<ProtocolVariable[]>([]);
  const [scope, setScope] = useState<VariableScope>('observation');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const db = await getDb();
      const protocol = await getCurrentProtocol(db, id);
      setCurrent(protocol);
      setVariables(protocol.variables);
      setHistory(await listProtocols(db, id));
      setUsage(await sessionsPerProtocol(db, id));
      setLockedKeys(await usedVariableKeys(db, id));
      setOpenSession(await getOpenSession(db, id));
    })();
  }, [id]);

  if (!current) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  const inUse = (usage.get(current.id) ?? 0) > 0;
  const changed = !definitionsEqual(current.variables, variables);

  const save = async () => {
    if (inUse && !note.trim()) {
      Alert.alert('Descreva a mudança', 'Uma nova versão do protocolo será criada. Explique o que mudou e por quê.');
      return;
    }
    setSaving(true);
    try {
      const result = await saveVariables(await getDb(), id, variables, currentActor(), note.trim() || undefined);
      Alert.alert(
        result.newVersion ? `Protocolo v${result.version} criado` : 'Variáveis salvas',
        result.newVersion
          ? openSession
            ? `A sessão ${openSession.code} continua usando a versão anterior. Encerre-a para coletar com a v${result.version}.`
            : 'As próximas sessões usarão a nova versão. Os dados já coletados continuam ligados à versão anterior.'
          : undefined,
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (err) {
      Alert.alert('Não foi possível salvar', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <KeyboardAwareScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" bottomOffset={40}>
        <Card style={styles.versionCard}>
          <Ionicons name="git-branch-outline" size={20} color={Colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.versionTitle}>Protocolo v{current.version}</Text>
            <Text style={styles.meta}>
              {inUse ? `Usado em ${usage.get(current.id)} sessão(ões) — alterações criam a v${current.version + 1}` : 'Ainda não usado — alterações atualizam esta versão'}
            </Text>
          </View>
        </Card>

        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            { value: 'observation', label: `Observação (${variables.filter((v) => v.scope === 'observation').length})` },
            { value: 'sample', label: `Amostra (${variables.filter((v) => v.scope === 'sample').length})` },
          ]}
        />
        <Text style={styles.help}>
          {scope === 'observation' ? 'Medido a cada coleta.' : 'Atributos fixos de cada amostra, preenchidos no cadastro.'}
        </Text>

        <VariableBuilder
          scope={scope}
          variables={variables.filter((v) => v.scope === scope)}
          onChange={(list) => setVariables([...variables.filter((v) => v.scope !== scope), ...list.map((v) => ({ ...v, scope }))])}
          detailed={detailed}
          lockedKeys={lockedKeys}
        />

        {inUse && changed ? (
          <View style={{ marginTop: 16 }}>
            <Text style={styles.label}>O que mudou e por quê? *</Text>
            <TextInput
              style={styles.input}
              value={note}
              onChangeText={setNote}
              multiline
              placeholder="Ex.: incluída temperatura da folha; taxa de 8 kHz → 32 kHz"
              placeholderTextColor={Colors.textSecondary}
            />
          </View>
        ) : null}

        {history.length > 1 ? (
          <Section title="Histórico de versões" style={{ marginTop: 20 }}>
            {[...history].reverse().map((p) => (
              <View key={p.id} style={styles.historyRow}>
                <Text style={styles.historyVersion}>v{p.version}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.meta}>
                    {formatDate(p.createdAt)} · {p.variables.length} variáveis · {usage.get(p.id) ?? 0} sessão(ões)
                    {p.createdBy ? ` · ${p.createdBy}` : ''}
                  </Text>
                  {p.changeNote ? <Text style={styles.note}>{p.changeNote}</Text> : null}
                </View>
              </View>
            ))}
          </Section>
        ) : null}
      </KeyboardAwareScrollView>
      <View style={styles.footer}>
        <Button
          title={inUse && changed ? `Criar protocolo v${current.version + 1}` : 'Salvar'}
          onPress={save}
          loading={saving}
          disabled={saving || !changed}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  versionCard: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  versionTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  meta: { fontSize: 12, color: Colors.textSecondary },
  help: { fontSize: 13, color: Colors.textSecondary },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 12, minHeight: 70, fontSize: 15, color: Colors.text, backgroundColor: Colors.surface, textAlignVertical: 'top' },
  historyRow: { flexDirection: 'row', gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  historyVersion: { fontSize: 15, fontWeight: '800', color: Colors.primary, width: 32 },
  note: { fontSize: 13, color: Colors.text, marginTop: 2 },
  footer: { padding: 16, backgroundColor: Colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
});
