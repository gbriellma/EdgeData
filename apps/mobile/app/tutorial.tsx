import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/colors';

interface Step {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string[];
}

const STEPS: Step[] = [
  {
    icon: 'flask-outline',
    title: '1. Crie o experimento',
    body: [
      'Comece do zero, de um template ou importe um arquivo .edgetemplate.json.',
      'Informe objetivo, equipe (com ORCID), local e período. No modo científico aparecem hipótese, financiamento, critérios e licença.',
    ],
  },
  {
    icon: 'grid-outline',
    title: '2. Defina o desenho experimental',
    body: [
      'Liste tratamentos e controles, ou fatores e níveis (fatorial). Informe réplicas, blocos e sessões previstas.',
      'O app calcula quantas amostras e observações o experimento deve produzir e mostra o progresso da coleta.',
    ],
  },
  {
    icon: 'options-outline',
    title: '3. Crie as variáveis',
    body: [
      'Variáveis de amostra são atributos fixos (cultivar, data de semeadura). Variáveis de observação são medidas a cada coleta.',
      'Cada variável tem ID estável, tipo, unidade (padrão UCUM, com busca), limites aceitos e faixa esperada. Fora da faixa esperada o valor é aceito, mas recebe uma flag de qualidade.',
      'Use "Mostrar somente quando…" para campos condicionais: Há doença? → Qual? → Severidade.',
    ],
  },
  {
    icon: 'leaf-outline',
    title: '4. Cadastre e etiquete as amostras',
    body: [
      'Gere as amostras pelo desenho (ex.: T1_Controle_R2), cadastre à mão, por sequência ou por CSV.',
      'Imprima etiquetas QR: elas guardam o identificador permanente e o código legível. Códigos de barras e Data Matrix também são lidos.',
    ],
  },
  {
    icon: 'scan-outline',
    title: '5. Colete em sessões',
    body: [
      'Toque em "Iniciar coleta" para abrir uma sessão: ela registra quem coletou, quando e com qual versão do protocolo.',
      'Escaneie a etiqueta, preencha e use "Salvar + próxima" — o leitor reabre para a próxima amostra. Tudo funciona sem internet.',
      'Toque em "Evento" para marcar acontecimentos (irrigação, chuva, troca de equipamento) com o horário exato.',
    ],
  },
  {
    icon: 'git-branch-outline',
    title: '6. Dados brutos nunca são apagados',
    body: [
      'Corrigir uma observação cria uma revisão; o valor original continua no histórico, com o motivo e o autor.',
      'Retratar invalida uma observação com motivo, sem apagá-la. Toda alteração fica na trilha de auditoria.',
      'Mudar variáveis depois da primeira sessão cria uma nova versão do protocolo.',
    ],
  },
  {
    icon: 'cloud-download-outline',
    title: '7. Exporte o dataset',
    body: [
      'Cada exportação é uma release (v1.0.0, v1.1.0…) com CSV, JSON Lines e/ou Parquet, fotos, README, dicionário de dados, datapackage.json, proveniência e checksums SHA-256.',
      'Confira a integridade no computador com: sha256sum -c checksums.sha256',
    ],
  },
  {
    icon: 'save-outline',
    title: 'Backup',
    body: ['Em Ajustes, crie um backup completo (banco + fotos) e guarde-o fora do celular. O app lembra você a cada N observações.'],
  },
];

export default function TutorialScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>Do planejamento ao dataset publicável, sem internet. Estes são os passos.</Text>
      {STEPS.map((step) => (
        <View key={step.title} style={styles.card}>
          <View style={styles.header}>
            <Ionicons name={step.icon} size={22} color={Colors.primary} />
            <Text style={styles.title}>{step.title}</Text>
          </View>
          {step.body.map((paragraph) => (
            <Text key={paragraph} style={styles.body}>
              {paragraph}
            </Text>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  intro: { fontSize: 15, color: Colors.textSecondary, lineHeight: 21 },
  card: { backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 16, fontWeight: '700', color: Colors.text, flex: 1 },
  body: { fontSize: 14, color: Colors.text, lineHeight: 21 },
});
