import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SchemaBuilder } from '@/components/forms/SchemaBuilder';
import { Schema } from '@/types/schema';
import { TEMPLATES, ProjectTemplate } from '@/constants/templates';
import { useProjectActions } from '@/hooks/useProject';
import { useProjectStore } from '@/stores/projectStore';
import { getAllProjects } from '@/database/db-helpers';
import {
  listCustomTemplates,
  importTemplateFromFile,
  saveCustomTemplate,
  deleteCustomTemplate,
  TemplateFile,
} from '@/utils/templateManager';

export default function NewProjectScreen() {
  const router = useRouter();
  const { create } = useProjectActions();
  const { setProjects } = useProjectStore();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [subjectSchema, setSubjectSchema] = useState<Schema>({ fields: [] });
  const [collectionSchema, setCollectionSchema] = useState<Schema>({ fields: [] });
  const [saving, setSaving] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<ProjectTemplate[]>([]);

  useEffect(() => {
    listCustomTemplates().then(setCustomTemplates).catch(() => {});
  }, []);

  const stepTitles = [
    'Informações do Projeto',
    'Schema de Sujeitos',
    'Schema de Coletas',
  ];

  const applyTemplate = (template: ProjectTemplate) => {
    setSubjectSchema(template.subjectSchema);
    setCollectionSchema(template.collectionSchema);
    Alert.alert('Template aplicado', `Template "${template.name}" aplicado com sucesso.`);
  };

  const handleImportTemplate = async () => {
    try {
      const tpl = await importTemplateFromFile();
      if (!tpl) return;

      Alert.alert(
        'Template importado',
        `"${tpl.name}"\n\nDeseja aplicar ao projeto atual e/ou salvar nos seus templates?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Salvar e Aplicar',
            onPress: async () => {
              await saveCustomTemplate(tpl);
              const updated = await listCustomTemplates();
              setCustomTemplates(updated);
              applyTemplate({
                id: `imported_${Date.now()}`,
                name: tpl.name,
                description: tpl.description,
                subjectSchema: tpl.subjectSchema,
                collectionSchema: tpl.collectionSchema,
              });
            },
          },
          {
            text: 'Só Aplicar',
            onPress: () => {
              applyTemplate({
                id: `imported_${Date.now()}`,
                name: tpl.name,
                description: tpl.description,
                subjectSchema: tpl.subjectSchema,
                collectionSchema: tpl.collectionSchema,
              });
            },
          },
        ]
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Arquivo inválido';
      Alert.alert('Erro', message);
    }
  };

  const handleDeleteCustomTemplate = (tplId: string, tplName: string) => {
    Alert.alert('Excluir template', `Deseja excluir "${tplName}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          await deleteCustomTemplate(tplId);
          const updated = await listCustomTemplates();
          setCustomTemplates(updated);
        },
      },
    ]);
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const id = await create(name.trim(), description.trim() || null, subjectSchema, collectionSchema);
      const updated = await getAllProjects();
      setProjects(updated);
      router.dismiss();
      setTimeout(() => {
        router.push({ pathname: '/project/[id]', params: { id } });
      }, 100);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      Alert.alert('Erro', message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      bottomOffset={50}
      extraKeyboardSpace={20}
    >
      <View style={styles.stepIndicator}>
        {stepTitles.map((_, i) => (
          <View key={i} style={[styles.stepDot, i <= step && styles.stepDotActive]} />
        ))}
      </View>

      <Text style={styles.stepTitle}>{stepTitles[step]}</Text>
      <Text style={styles.stepSubtitle}>Etapa {step + 1} de 3</Text>

      {step === 0 && (
        <View style={styles.form}>
          <Input
            label="Nome do Projeto"
            placeholder="Ex: Experimento Severidade 2026"
            value={name}
            onChangeText={setName}
          />
          <Input
            label="Descrição (opcional)"
            placeholder="Descreva o experimento..."
            value={description}
            onChangeText={setDescription}
            multiline
          />

          <Text style={styles.templateTitle}>Usar template</Text>
          {TEMPLATES.map((tpl) => (
            <TouchableOpacity
              key={tpl.id}
              style={styles.templateCard}
              onPress={() => applyTemplate(tpl)}
            >
              <View style={styles.templateInfo}>
                <Text style={styles.templateName}>{tpl.name}</Text>
                <Text style={styles.templateDesc}>{tpl.description}</Text>
              </View>
              <Ionicons name="arrow-forward-circle-outline" size={24} color={Colors.primary} />
            </TouchableOpacity>
          ))}

          {customTemplates.length > 0 && (
            <>
              <Text style={styles.templateTitle}>Meus Templates</Text>
              {customTemplates.map((tpl) => (
                <TouchableOpacity
                  key={tpl.id}
                  style={styles.templateCard}
                  onPress={() => applyTemplate(tpl)}
                  onLongPress={() => handleDeleteCustomTemplate(tpl.id, tpl.name)}
                >
                  <View style={styles.templateInfo}>
                    <Text style={styles.templateName}>{tpl.name}</Text>
                    <Text style={styles.templateDesc}>{tpl.description}</Text>
                  </View>
                  <Ionicons name="star" size={20} color={Colors.warning} />
                </TouchableOpacity>
              ))}
            </>
          )}

          <TouchableOpacity
            style={styles.importCard}
            onPress={handleImportTemplate}
          >
            <Ionicons name="cloud-download-outline" size={22} color={Colors.primary} />
            <Text style={styles.importText}>Importar template de arquivo</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 1 && (
        <View>
          <Text style={styles.sectionHint}>
            Defina os campos fixos de cada unidade a ser observada.
          </Text>
          <SchemaBuilder schema={subjectSchema} onChange={setSubjectSchema} />
        </View>
      )}

      {step === 2 && (
        <View>
          <Text style={styles.sectionHint}>
            Defina os campos registrados em cada observação/coleta.
          </Text>
          <SchemaBuilder schema={collectionSchema} onChange={setCollectionSchema} />
        </View>
      )}

      <View style={styles.actions}>
        {step > 0 && (
          <Button
            title="Voltar"
            onPress={() => setStep(step - 1)}
            variant="outline"
            style={styles.actionBtn}
          />
        )}
        {step < 2 ? (
          <Button
            title="Próximo"
            onPress={() => setStep(step + 1)}
            disabled={step === 0 && !name.trim()}
            style={styles.actionBtn}
          />
        ) : (
          <Button
            title="Criar Projeto"
            onPress={handleCreate}
            loading={saving}
            disabled={saving}
            style={styles.actionBtn}
          />
        )}
      </View>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  stepDot: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
  },
  stepDotActive: {
    backgroundColor: Colors.primary,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  stepSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 24,
  },
  form: {
    gap: 4,
  },
  sectionHint: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  templateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 20,
    marginBottom: 12,
  },
  templateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  templateInfo: {
    flex: 1,
  },
  templateName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  templateDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  importCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.primarySurface,
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.primary,
  },
  importText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 32,
  },
  actionBtn: {
    flex: 1,
  },
});
