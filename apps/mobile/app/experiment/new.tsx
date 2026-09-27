import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { DesignEditor } from '@/components/experiment/DesignEditor';
import { MetadataForm } from '@/components/experiment/MetadataForm';
import { VariableBuilder } from '@/components/forms/VariableBuilder';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Colors } from '@/constants/colors';
import { describeDesign, emptyDesign, expectedCounts, planSamples, validateDesign } from '@/core/design';
import type { ExperimentTemplate } from '@/core/templates';
import type { ExperimentalDesign, ExperimentMetadata, ProtocolVariable } from '@/core/types';
import { validateDefinitions } from '@/core/variables';
import { getDb } from '@/database/connection';
import type { Project } from '@/database/models';
import { createExperiment, listProjects, suggestExperimentCode } from '@/database/repo/experiments';
import { createSamplesFromPlan } from '@/database/repo/samples';
import { BUILTIN_TEMPLATES, deleteCustomTemplate, listCustomTemplates, pickTemplateFile } from '@/lib/templates';
import { currentActor, useSettings } from '@/stores/settings';

const STEPS = ['Início', 'Identificação', 'Desenho', 'Amostras', 'Observações', 'Revisão'] as const;

export default function NewExperimentScreen() {
  const router = useRouter();
  const detailed = useSettings((s) => s.uiMode === 'scientific');
  const operatorName = useSettings((s) => s.operatorName);
  const operatorOrcid = useSettings((s) => s.operatorOrcid);

  const [step, setStep] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [customTemplates, setCustomTemplates] = useState<ExperimentTemplate[]>([]);
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<ExperimentMetadata>({
    name: '',
    code: '',
    team: operatorName ? [{ name: operatorName, ...(operatorOrcid ? { orcid: operatorOrcid } : {}), role: 'Responsável' }] : [],
  });
  const [codeTouched, setCodeTouched] = useState(false);
  const [design, setDesign] = useState<ExperimentalDesign>(emptyDesign());
  const [variables, setVariables] = useState<ProtocolVariable[]>([]);
  const [generateSamples, setGenerateSamples] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const db = await getDb();
      const list = await listProjects(db);
      setProjects(list);
      if (list.length > 0) setProjectId(list[0].id);
      setCustomTemplates(await listCustomTemplates().catch(() => []));
    })();
  }, []);

  // Sugere o código a partir do nome até o usuário editar o código
  useEffect(() => {
    if (codeTouched || !metadata.name.trim()) return;
    let cancelled = false;
    (async () => {
      const code = await suggestExperimentCode(await getDb(), projectId, metadata.name);
      if (!cancelled) setMetadata((m) => ({ ...m, code }));
    })();
    return () => {
      cancelled = true;
    };
  }, [metadata.name, projectId, codeTouched]);

  const applyTemplate = (template: ExperimentTemplate | null) => {
    if (template) {
      setTemplateName(template.name);
      setDesign({ ...emptyDesign(), ...template.design });
      setVariables(template.variables.map((v) => ({ ...v, config: { ...v.config } })));
      setMetadata((m) => ({
        ...m,
        objective: m.objective || template.metadata?.objective,
        methodology: m.methodology || template.metadata?.methodology,
        hypothesis: m.hypothesis || template.metadata?.hypothesis,
      }));
    } else {
      setTemplateName(null);
      setDesign(emptyDesign());
      setVariables([]);
    }
    setStep(1);
  };

  const importTemplate = async () => {
    try {
      const template = await pickTemplateFile();
      if (template) applyTemplate(template);
    } catch (err) {
      Alert.alert('Não foi possível importar', err instanceof Error ? err.message : String(err));
    }
  };

  const sampleVars = variables.filter((v) => v.scope === 'sample');
  const observationVars = variables.filter((v) => v.scope === 'observation');
  const replaceScope = (scope: 'sample' | 'observation', list: ProtocolVariable[]) =>
    setVariables([...variables.filter((v) => v.scope !== scope), ...list.map((v) => ({ ...v, scope }))]);

  const counts = useMemo(() => expectedCounts(design), [design]);

  const problemsFor = (index: number): string[] => {
    switch (index) {
      case 1: {
        const p: string[] = [];
        if (!metadata.name.trim()) p.push('Informe o nome do experimento');
        if (!metadata.code.trim()) p.push('Informe o código');
        if (!projectId && !newProjectName.trim() && projects.length > 0) p.push('Escolha ou crie um projeto');
        return p;
      }
      case 2:
        return validateDesign(design);
      case 3:
        return validateDefinitions(sampleVars).map((i) => i.message);
      case 4: {
        const issues = validateDefinitions(observationVars).map((i) => i.message);
        if (observationVars.length === 0) issues.push('Defina ao menos uma variável de observação');
        return issues;
      }
      default:
        return [];
    }
  };

  const next = () => {
    const problems = problemsFor(step);
    if (problems.length > 0) {
      Alert.alert('Revise antes de continuar', problems.join('\n'));
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const create = async () => {
    for (const index of [1, 2, 3, 4]) {
      const problems = problemsFor(index);
      if (problems.length > 0) {
        setStep(index);
        Alert.alert('Revise', problems.join('\n'));
        return;
      }
    }
    setSaving(true);
    try {
      const db = await getDb();
      const actor = currentActor();
      const id = await createExperiment(
        db,
        {
          projectId: projectId ?? undefined,
          newProjectName: projectId ? undefined : newProjectName.trim() || 'Meus experimentos',
          metadata,
          design,
          variables,
        },
        actor,
      );
      if (generateSamples && counts.samples > 0) {
        const factorKeys = design.factors.map((f) => f.key);
        await createSamplesFromPlan(db, id, planSamples(design), sampleVars.filter((v) => factorKeys.includes(v.key)).map((v) => v.key), actor);
      }
      router.replace({ pathname: '/experiment/[id]', params: { id } });
    } catch (err) {
      Alert.alert('Erro ao criar', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.steps}>
        {STEPS.map((label, index) => (
          <TouchableOpacity key={label} onPress={() => index < step && setStep(index)} disabled={index >= step}>
            <View style={[styles.step, index === step && styles.stepActive, index < step && styles.stepDone]}>
              <Text style={[styles.stepText, (index === step || index < step) && styles.stepTextActive]}>
                {index + 1}. {label}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <KeyboardAwareScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" bottomOffset={40}>
        {step === 0 ? (
          <View style={{ gap: 12 }}>
            <Text style={styles.title}>Como quer começar?</Text>
            <Card onPress={() => applyTemplate(null)} style={styles.option}>
              <Ionicons name="create-outline" size={26} color={Colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>Criar do zero</Text>
                <Text style={styles.optionText}>Defina desenho e variáveis passo a passo</Text>
              </View>
            </Card>
            <Card onPress={importTemplate} style={styles.option}>
              <Ionicons name="download-outline" size={26} color={Colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>Importar template</Text>
                <Text style={styles.optionText}>Arquivo .edgetemplate.json compartilhado por colegas</Text>
              </View>
            </Card>
            <Text style={styles.subtitle}>Templates</Text>
            {[...customTemplates, ...BUILTIN_TEMPLATES].map((template) => {
              const custom = customTemplates.includes(template);
              return (
                <Card
                  key={`${custom ? 'c' : 'b'}-${template.id}`}
                  onPress={() => applyTemplate(template)}
                  style={styles.option}
                >
                  <Ionicons name={custom ? 'star' : 'flask-outline'} size={24} color={Colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionTitle}>{template.name}</Text>
                    <Text style={styles.optionText}>{template.description}</Text>
                    <Text style={styles.optionMeta}>
                      {template.domain ? `${template.domain} · ` : ''}
                      {template.variables.length} variáveis · {describeDesign({ ...emptyDesign(), ...template.design })}
                    </Text>
                  </View>
                  {custom ? (
                    <TouchableOpacity
                      hitSlop={8}
                      onPress={() =>
                        Alert.alert('Excluir template', `Excluir "${template.name}" deste aparelho?`, [
                          { text: 'Cancelar', style: 'cancel' },
                          {
                            text: 'Excluir',
                            style: 'destructive',
                            onPress: async () => {
                              await deleteCustomTemplate(template.id);
                              setCustomTemplates(await listCustomTemplates());
                            },
                          },
                        ])
                      }
                    >
                      <Ionicons name="trash-outline" size={18} color={Colors.error} />
                    </TouchableOpacity>
                  ) : null}
                </Card>
              );
            })}
          </View>
        ) : null}

        {step === 1 ? (
          <View>
            {templateName ? <Text style={styles.templateNote}>Base: {templateName}</Text> : null}
            <Text style={styles.label}>Projeto</Text>
            <View style={styles.chips}>
              {projects.map((p) => (
                <Chip key={p.id} label={p.name} selected={projectId === p.id} onPress={() => setProjectId(p.id)} />
              ))}
              <Chip label="+ Novo projeto" selected={projectId === null} onPress={() => setProjectId(null)} />
            </View>
            {projectId === null ? (
              <TextInput
                style={styles.input}
                value={newProjectName}
                onChangeText={setNewProjectName}
                placeholder="Nome do projeto (ex.: Tese de mestrado)"
                placeholderTextColor={Colors.textSecondary}
              />
            ) : null}
            <View style={{ height: 16 }} />
            <MetadataForm
              metadata={metadata}
              detailed={detailed}
              onChange={(m) => {
                if (m.code !== metadata.code) setCodeTouched(true);
                setMetadata(m);
              }}
            />
          </View>
        ) : null}

        {step === 2 ? (
          <View>
            <Text style={styles.help}>
              Defina tratamentos, controles, réplicas e sessões. O EdgeData calcula quantas amostras e observações o experimento deve produzir.
            </Text>
            <DesignEditor design={design} onChange={setDesign} detailed={detailed} />
          </View>
        ) : null}

        {step === 3 ? (
          <View>
            <Text style={styles.help}>
              Atributos fixos de cada amostra (planta, vaso, parcela, corpo de prova): registrados uma vez. Ex.: cultivar, data de semeadura.
            </Text>
            <VariableBuilder scope="sample" variables={sampleVars} onChange={(list) => replaceScope('sample', list)} detailed={detailed} />
          </View>
        ) : null}

        {step === 4 ? (
          <View>
            <Text style={styles.help}>O que é medido em cada coleta. Variáveis com sensor podem ser preenchidas por um ESP32.</Text>
            <VariableBuilder scope="observation" variables={observationVars} onChange={(list) => replaceScope('observation', list)} detailed={detailed} />
          </View>
        ) : null}

        {step === 5 ? (
          <View style={{ gap: 12 }}>
            <Card style={{ gap: 6 }}>
              <Text style={styles.reviewTitle}>{metadata.name}</Text>
              <Text style={styles.optionMeta}>{metadata.code}</Text>
              <Text style={styles.optionText}>{describeDesign(design)}</Text>
              <Text style={styles.optionText}>
                {sampleVars.length} variáveis de amostra · {observationVars.length} de observação
              </Text>
              {metadata.team.length > 0 ? <Text style={styles.optionText}>Equipe: {metadata.team.map((t) => t.name).join(', ')}</Text> : null}
            </Card>
            {counts.samples > 0 ? (
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Gerar as {counts.samples} amostras do plano agora</Text>
                  <Text style={styles.help}>Códigos como {planSamples(design)[0]?.code}. Você pode cadastrar outras depois.</Text>
                </View>
                <Switch value={generateSamples} onValueChange={setGenerateSamples} />
              </View>
            ) : null}
            <Text style={styles.help}>
              O protocolo v1 guarda estas variáveis. Mudanças depois da primeira sessão criam uma nova versão — os dados já coletados continuam ligados à versão com que foram medidos.
            </Text>
          </View>
        ) : null}
      </KeyboardAwareScrollView>

      {step > 0 ? (
        <View style={styles.footer}>
          <Button title="Voltar" variant="outline" onPress={() => setStep((s) => s - 1)} style={{ flex: 1 }} />
          {step < STEPS.length - 1 ? (
            <Button title="Continuar" onPress={next} style={{ flex: 1 }} />
          ) : (
            <Button title="Criar experimento" onPress={create} loading={saving} disabled={saving} style={{ flex: 1 }} />
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  steps: { paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
  step: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: Colors.border },
  stepActive: { backgroundColor: Colors.primary },
  stepDone: { backgroundColor: Colors.primaryLight },
  stepText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  stepTextActive: { color: Colors.white },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: '700', color: Colors.text },
  subtitle: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', marginTop: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  optionText: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  optionMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  templateNote: { fontSize: 13, color: Colors.primary, fontWeight: '600', marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  help: { fontSize: 13, color: Colors.textSecondary, marginBottom: 14, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: Colors.text, backgroundColor: Colors.surface },
  reviewTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  footer: { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border, backgroundColor: Colors.surface },
});
