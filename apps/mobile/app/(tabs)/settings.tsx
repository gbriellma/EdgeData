import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Colors } from '@/constants/colors';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { createBackup, restoreBackup, getBackupInfo } from '@/database/backup';
import { createDemoProject } from '@/database/demo-seed';
import { useAppStore } from '@/stores/appStore';
import {
  listCustomTemplates,
  importTemplateFromFile,
  saveCustomTemplate,
  deleteCustomTemplate,
} from '@/utils/templateManager';
import { ProjectTemplate } from '@/constants/templates';

export default function SettingsScreen() {
  const router = useRouter();
  const [backupInfo, setBackupInfo] = useState<{ lastBackup: string | null; backupCount: number }>({
    lastBackup: null,
    backupCount: 0,
  });
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [creatingDemo, setCreatingDemo] = useState(false);
  const { lastBackupAt, setLastBackupAt } = useAppStore();
  const [customTemplates, setCustomTemplates] = useState<ProjectTemplate[]>([]);

  useEffect(() => {
    loadBackupInfo();
    listCustomTemplates().then(setCustomTemplates).catch(() => {});
  }, []);

  const loadBackupInfo = async () => {
    try {
      const info = await getBackupInfo();
      setBackupInfo(info);
    } catch {
      // ignore
    }
  };

  const handleCreateBackup = async () => {
    setCreating(true);
    try {
      const zipPath = await createBackup();
      setLastBackupAt(new Date().toISOString());
      await loadBackupInfo();

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(zipPath, {
          mimeType: 'application/zip',
          dialogTitle: 'Compartilhar Backup',
        });
      } else {
        Alert.alert('Backup criado', `Arquivo salvo em: ${zipPath}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao criar backup';
      Alert.alert('Erro', message);
    } finally {
      setCreating(false);
    }
  };

  const handleRestoreBackup = async () => {
    Alert.alert(
      'Restaurar Backup',
      'Isso substituirá todos os dados atuais. Tem certeza?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Continuar',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await DocumentPicker.getDocumentAsync({
                type: 'application/zip',
                copyToCacheDirectory: true,
              });

              if (result.canceled || !result.assets?.[0]) return;

              setRestoring(true);
              await restoreBackup(result.assets[0].uri);
              await loadBackupInfo();

              Alert.alert(
                'Sucesso',
                'Backup restaurado com sucesso!',
                [
                  {
                    text: 'OK',
                    onPress: () => router.replace('/'),
                  },
                ]
              );
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : 'Erro ao restaurar';
              Alert.alert('Erro', message);
            } finally {
              setRestoring(false);
            }
          },
        },
      ]
    );
  };

  const handleCreateDemo = async () => {
    setCreatingDemo(true);
    try {
      await createDemoProject();
      Alert.alert(
        'Projeto Demo Criado',
        'Um projeto de exemplo com 90 sujeitos e 12 coletas foi criado.',
        [{ text: 'Ver Projeto', onPress: () => router.navigate('/') }]
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao criar demo';
      Alert.alert('Erro', message);
    } finally {
      setCreatingDemo(false);
    }
  };

  const formatBackupDate = (dateStr: string | null): string => {
    if (!dateStr) return 'Nunca';
    try {
      return new Date(dateStr).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Tutorial */}
      <Card
        onPress={() => router.push('/tutorial')}
        style={styles.tutorialCard}
      >
        <View style={styles.tutorialIcon}>
          <Ionicons name="book-outline" size={28} color={Colors.white} />
        </View>
        <View style={styles.tutorialInfo}>
          <Text style={styles.tutorialTitle}>Como usar o EdgeData</Text>
          <Text style={styles.tutorialDesc}>
            Tutorial completo com explicação detalhada de cada funcionalidade
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
      </Card>

      {/* Projeto Demo */}
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Experimentar</Text>
        <Text style={styles.sectionDesc}>
          Crie um projeto de exemplo preenchido com sujeitos e coletas para explorar todas as funcionalidades do app.
        </Text>
        <Button
          title={creatingDemo ? 'Criando...' : 'Criar Projeto de Demonstração'}
          onPress={handleCreateDemo}
          variant="outline"
          style={styles.button}
          loading={creatingDemo}
          disabled={creatingDemo}
          icon={<Ionicons name="flask-outline" size={18} color={Colors.primary} />}
        />
      </Card>

      {/* Backup */}
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Backup Local</Text>
        <Text style={styles.sectionDesc}>
          Último backup: {formatBackupDate(lastBackupAt || backupInfo.lastBackup)}
        </Text>
        <Button
          title={creating ? 'Criando...' : 'Criar Backup Agora'}
          onPress={handleCreateBackup}
          variant="outline"
          style={styles.button}
          loading={creating}
          disabled={creating}
        />
        <Button
          title={restoring ? 'Restaurando...' : 'Restaurar Backup'}
          onPress={handleRestoreBackup}
          variant="secondary"
          style={styles.button}
          loading={restoring}
          disabled={restoring}
        />
      </Card>

      {/* Templates */}
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Templates</Text>
        <Text style={styles.sectionDesc}>
          Gerencie templates de projetos. Templates salvos aparecem na tela de criar projeto.
        </Text>

        {customTemplates.length > 0 ? (
          <View style={styles.templateList}>
            {customTemplates.map((tpl) => (
              <View key={tpl.id} style={styles.templateItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.templateItemName}>{tpl.name}</Text>
                  <Text style={styles.templateItemDesc} numberOfLines={1}>{tpl.description}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    Alert.alert('Excluir template', `Deseja excluir "${tpl.name}"?`, [
                      { text: 'Cancelar', style: 'cancel' },
                      {
                        text: 'Excluir',
                        style: 'destructive',
                        onPress: async () => {
                          await deleteCustomTemplate(tpl.id);
                          const updated = await listCustomTemplates();
                          setCustomTemplates(updated);
                        },
                      },
                    ]);
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={18} color={Colors.error} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.sectionDesc}>Nenhum template personalizado salvo.</Text>
        )}

        <Button
          title="Importar Template"
          onPress={async () => {
            try {
              const tpl = await importTemplateFromFile();
              if (!tpl) return;
              await saveCustomTemplate(tpl);
              const updated = await listCustomTemplates();
              setCustomTemplates(updated);
              Alert.alert('Sucesso', `Template "${tpl.name}" importado e salvo.`);
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : 'Arquivo inválido';
              Alert.alert('Erro', message);
            }
          }}
          variant="outline"
          style={styles.button}
          icon={<Ionicons name="cloud-download-outline" size={18} color={Colors.primary} />}
        />
      </Card>

      {/* Sensores BLE */}
      <Card
        onPress={() => router.push('/sensors')}
        style={styles.sensorCard}
      >
        <View style={styles.sensorCardRow}>
          <View style={styles.sensorIcon}>
            <Ionicons name="bluetooth" size={28} color={Colors.white} />
          </View>
          <View style={styles.sensorInfo}>
            <Text style={styles.sensorTitle}>Sensores Bluetooth</Text>
            <Text style={styles.sensorDesc}>
              Conecte ao ESP32 com sensores Atlas Scientific EZO para auto-preencher dados na coleta
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
        </View>
      </Card>

      {/* Armazenamento */}
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Armazenamento</Text>
        <Text style={styles.sectionDesc}>
          Os dados ficam armazenados localmente no dispositivo usando SQLite. As imagens são salvas no sistema de arquivos.
        </Text>
        <Text style={styles.sectionDesc}>
          Recomendamos criar backups regularmente e exportar os datasets antes de desinstalar o app.
        </Text>
      </Card>

      {/* Sobre */}
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Sobre</Text>
        <Text style={styles.sectionDesc}>EdgeData v1.0.0</Text>
        <Text style={styles.sectionDesc}>
          Plataforma de coleta de dados estruturados para qualquer área de atuação.
        </Text>
        <Text style={styles.sectionDesc}>
          Desenvolvido para funcionar 100% offline em campo.
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  tutorialCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.primarySurface,
    borderColor: Colors.primary,
  },
  tutorialIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tutorialInfo: {
    flex: 1,
    gap: 2,
  },
  tutorialTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
  },
  tutorialDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  sectionDesc: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  button: {
    marginTop: 4,
  },
  templateList: {
    gap: 8,
  },
  templateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  templateItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  templateItemDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  sensorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#E3F2FD',
    borderColor: '#1565C0',
  },
  sensorCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  sensorIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#1565C0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sensorInfo: {
    flex: 1,
    gap: 2,
  },
  sensorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1565C0',
  },
  sensorDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
});
