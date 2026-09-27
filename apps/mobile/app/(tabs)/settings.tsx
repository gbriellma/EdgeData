import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Segmented';
import { Colors } from '@/constants/colors';
import { normalizeOrcid } from '@/core/codes';
import { createBackup, restoreBackup } from '@/database/backup';
import { getDb } from '@/database/connection';
import { LATEST_SCHEMA_VERSION } from '@/database/migrations';
import { useSettings, type UiMode } from '@/stores/settings';
import { formatDateTime } from '@/utils/formatters';

export default function SettingsScreen() {
  const router = useRouter();
  const settings = useSettings();
  const [name, setName] = useState(settings.operatorName);
  const [orcid, setOrcid] = useState(settings.operatorOrcid);
  const [autoBackup, setAutoBackup] = useState(String(settings.autoBackupEvery));
  const [busy, setBusy] = useState<null | 'backup' | 'restore'>(null);

  const orcidValid = !orcid.trim() || !!normalizeOrcid(orcid);

  const saveProfile = async () => {
    if (!orcidValid) return Alert.alert('ORCID inválido', 'Use o formato 0000-0000-0000-0000.');
    await settings.update({ operatorName: name.trim(), operatorOrcid: orcid.trim() ? normalizeOrcid(orcid)! : '' });
    Alert.alert('Salvo', 'Seu nome será registrado nas sessões, observações e na trilha de auditoria.');
  };

  const handleBackup = async () => {
    setBusy('backup');
    try {
      const zip = await createBackup();
      await settings.update({ lastBackupAt: new Date().toISOString(), observationsSinceBackup: 0 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(zip, { mimeType: 'application/zip', dialogTitle: 'Guardar backup' });
      } else {
        Alert.alert('Backup criado', zip);
      }
    } catch (err) {
      Alert.alert('Erro no backup', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = () => {
    Alert.alert('Restaurar backup', 'Todos os dados deste aparelho serão substituídos pelos do backup. Continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Restaurar',
        style: 'destructive',
        onPress: async () => {
          const result = await DocumentPicker.getDocumentAsync({ type: 'application/zip', copyToCacheDirectory: true });
          if (result.canceled || !result.assets?.[0]) return;
          setBusy('restore');
          try {
            await restoreBackup(result.assets[0].uri);
            await getDb();
            await settings.load();
            Alert.alert('Backup restaurado', 'Os dados foram restaurados.', [{ text: 'OK', onPress: () => router.replace('/') }]);
          } catch (err) {
            Alert.alert('Erro ao restaurar', err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  return (
    <KeyboardAwareScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Card onPress={() => router.push('/tutorial')} style={styles.row}>
        <Ionicons name="book-outline" size={24} color={Colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Como usar o EdgeData</Text>
          <Text style={styles.text}>Do planejamento à exportação do dataset</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.title}>Quem está coletando</Text>
        <Text style={styles.text}>Fica registrado em cada sessão, observação e alteração.</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Seu nome" placeholderTextColor={Colors.textSecondary} />
        <TextInput
          style={[styles.input, !orcidValid && { borderColor: Colors.error }]}
          value={orcid}
          onChangeText={setOrcid}
          placeholder="ORCID (opcional)"
          placeholderTextColor={Colors.textSecondary}
          autoCapitalize="characters"
        />
        <Button title="Salvar" onPress={saveProfile} variant="outline" />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.title}>Modo de uso</Text>
        <Segmented<UiMode>
          value={settings.uiMode}
          onChange={(uiMode) => settings.update({ uiMode })}
          options={[
            { value: 'simple', label: 'Simples' },
            { value: 'scientific', label: 'Científico' },
          ]}
        />
        <Text style={styles.text}>
          {settings.uiMode === 'simple'
            ? 'Mostra só o essencial: criar, definir campos, coletar e exportar.'
            : 'Mostra também hipótese, financiamento, papel das variáveis, faixa esperada, resolução, exatidão, blocos, taxa de aquisição e dados sensíveis.'}
        </Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.title}>Backup</Text>
        <Text style={styles.text}>Último backup: {settings.lastBackupAt ? formatDateTime(settings.lastBackupAt) : 'nunca'}</Text>
        <Button title="Criar backup agora" onPress={handleBackup} loading={busy === 'backup'} disabled={busy !== null} />
        <Button title="Restaurar backup" variant="outline" onPress={handleRestore} loading={busy === 'restore'} disabled={busy !== null} />
        <Text style={styles.label}>Lembrar de fazer backup a cada N observações (0 = nunca)</Text>
        <TextInput
          style={styles.input}
          value={autoBackup}
          keyboardType="number-pad"
          onChangeText={setAutoBackup}
          onEndEditing={() => settings.update({ autoBackupEvery: Math.max(0, parseInt(autoBackup, 10) || 0) })}
        />
      </Card>

      <Text style={styles.footer}>
        EdgeData {Constants.expoConfig?.version ?? ''} · banco v{LATEST_SCHEMA_VERSION}
      </Text>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  card: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 16, fontWeight: '700', color: Colors.text },
  text: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginTop: 6 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: Colors.text, backgroundColor: Colors.surface },
  footer: { textAlign: 'center', fontSize: 12, color: Colors.textSecondary, marginTop: 8 },
});
