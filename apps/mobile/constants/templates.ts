import { Schema } from '@/types/schema';

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  subjectSchema: Schema;
  collectionSchema: Schema;
}

export const TEMPLATES: ProjectTemplate[] = [
  {
    id: 'severity_assessment',
    name: 'Avaliação de Severidade',
    description: 'Avaliar intensidade/severidade de condições com escala numérica e fotos',
    subjectSchema: {
      fields: [
        { name: 'identificador', label: 'Identificador', type: 'short_text', required: true, order: 0, config: {} },
        { name: 'tipo', label: 'Tipo', type: 'short_text', required: true, order: 1, config: {} },
        { name: 'categoria', label: 'Categoria', type: 'short_text', required: false, order: 2, config: {} },
        { name: 'tratamento', label: 'Tratamento', type: 'short_text', required: false, order: 3, config: {} },
        { name: 'repeticao', label: 'Repetição', type: 'short_text', required: false, order: 4, config: {} },
        { name: 'controle', label: 'Controle', type: 'boolean', required: false, order: 5, config: { defaultValue: false } },
      ],
    },
    collectionSchema: {
      fields: [
        { name: 'foto', label: 'Foto', type: 'image', required: true, order: 0, config: {} },
        { name: 'severidade', label: 'Severidade', type: 'scale', required: true, order: 1, config: { min: 0, max: 9, labels: { 0: 'Normal', 9: 'Severo' } } },
        { name: 'condicoes', label: 'Condições Observadas', type: 'multi_category', required: false, order: 2, config: { options: ['Manchas', 'Desgaste', 'Corrosão', 'Deformação'] } },
        { name: 'observacoes', label: 'Observações', type: 'long_text', required: false, order: 3, config: {} },
      ],
    },
  },
  {
    id: 'growth_monitoring',
    name: 'Monitoramento de Crescimento',
    description: 'Acompanhamento periódico com medidas quantitativas e fotos',
    subjectSchema: {
      fields: [
        { name: 'identificador', label: 'Identificador', type: 'short_text', required: true, order: 0, config: {} },
        { name: 'tipo', label: 'Tipo', type: 'short_text', required: true, order: 1, config: {} },
        { name: 'local', label: 'Local', type: 'short_text', required: false, order: 2, config: {} },
        { name: 'data_inicio', label: 'Data de Início', type: 'date', required: false, order: 3, config: {} },
      ],
    },
    collectionSchema: {
      fields: [
        { name: 'foto', label: 'Foto', type: 'image', required: true, order: 0, config: {} },
        { name: 'medida_cm', label: 'Medida (cm)', type: 'decimal', required: true, order: 1, config: { min: 0, max: 1000, decimals: 1, unit: 'cm' } },
        { name: 'contagem', label: 'Contagem', type: 'integer', required: false, order: 2, config: { min: 0 } },
        { name: 'estagio', label: 'Estágio', type: 'category', required: true, order: 3, config: { options: ['Inicial', 'Intermediário', 'Avançado', 'Final'] } },
        { name: 'observacoes', label: 'Observações', type: 'long_text', required: false, order: 4, config: {} },
      ],
    },
  },
  {
    id: 'occurrence_monitoring',
    name: 'Monitoramento de Ocorrências',
    description: 'Registro e quantificação de ocorrências com categorização',
    subjectSchema: {
      fields: [
        { name: 'identificador', label: 'Identificador', type: 'short_text', required: true, order: 0, config: {} },
        { name: 'tipo', label: 'Tipo', type: 'short_text', required: true, order: 1, config: {} },
        { name: 'area', label: 'Área', type: 'short_text', required: false, order: 2, config: {} },
        { name: 'metodo', label: 'Método de Coleta', type: 'category', required: false, order: 3, config: { options: ['Visual', 'Armadilha', 'Amostragem', 'Sensor', 'Outro'] } },
      ],
    },
    collectionSchema: {
      fields: [
        { name: 'foto', label: 'Foto', type: 'image', required: true, order: 0, config: {} },
        { name: 'ocorrencia', label: 'Ocorrência Identificada', type: 'category', required: true, order: 1, config: { options: ['Tipo A', 'Tipo B', 'Tipo C', 'Tipo D', 'Outro'] } },
        { name: 'quantidade', label: 'Quantidade', type: 'integer', required: true, order: 2, config: { min: 0 } },
        { name: 'nivel_impacto', label: 'Nível de Impacto', type: 'scale', required: false, order: 3, config: { min: 0, max: 5, labels: { 0: 'Nenhum', 5: 'Severo' } } },
        { name: 'acao_recomendada', label: 'Ação Recomendada', type: 'short_text', required: false, order: 4, config: {} },
      ],
    },
  },
];
