import { getDatabase } from './database';
import {
  createProject,
  createSubject,
  createCollection,
} from './db-helpers';
import { Schema } from '@/types/schema';

const DEMO_PROJECT_NAME = '[Demo] Feijão - Microrganismos e Estresse Hídrico';

/**
 * Checks if the demo project already exists by querying the DB directly
 * (includes archived projects to prevent UNIQUE constraint errors).
 */
export async function demoProjectExists(): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM projects WHERE name = ?',
    DEMO_PROJECT_NAME
  );
  return (row?.count ?? 0) > 0;
}

/**
 * Deletes an existing demo project (including all its data) so it can be recreated.
 */
async function deleteExistingDemo(): Promise<void> {
  const db = await getDatabase();
  const project = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM projects WHERE name = ?',
    DEMO_PROJECT_NAME
  );
  if (!project) return;

  const pid = project.id;
  await db.runAsync(
    'DELETE FROM images WHERE collection_id IN (SELECT id FROM collections WHERE project_id = ?)',
    pid
  );
  await db.runAsync('DELETE FROM collections WHERE project_id = ?', pid);
  await db.runAsync('DELETE FROM subjects WHERE project_id = ?', pid);
  await db.runAsync('DELETE FROM projects WHERE id = ?', pid);
}

/**
 * Creates a fully populated demo project with 90 subjects modeled after
 * a real bean experiment:
 *
 * - 3 varieties: T1, T2, T3
 * - 2 irrigation conditions: C (Controle), E (Estresse 50%)
 * - 5 microorganisms: F1, F2 (fungos), B1, B2 (bactérias), C (controle)
 * - 3 repetitions: R1, R2, R3
 *
 * Subject names follow: TipoFeijão_Rega_Microrganismo_Repetição
 * Example: T2_C_F1_R2
 *
 * Collection schema includes multi-camera (Frente, Esquerda, Direita, Trás),
 * date and time fields.
 *
 * Returns the project ID.
 */
export async function createDemoProject(): Promise<string> {
  // Clean up any previous demo
  await deleteExistingDemo();

  const db = await getDatabase();

  let projectId = '';

  await db.withTransactionAsync(async () => {
    // ── Schemas ──

    const subjectSchema: Schema = {
      fields: [
        {
          name: 'nome',
          label: 'Nome',
          type: 'short_text',
          required: true,
          order: 0,
          config: {},
        },
        {
          name: 'variedade',
          label: 'Variedade',
          type: 'category',
          required: true,
          order: 1,
          config: { options: ['T1', 'T2', 'T3'] },
        },
        {
          name: 'rega',
          label: 'Condição de Rega',
          type: 'category',
          required: true,
          order: 2,
          config: { options: ['C', 'E'] },
        },
        {
          name: 'microrganismo',
          label: 'Microrganismo',
          type: 'category',
          required: true,
          order: 3,
          config: { options: ['F1', 'F2', 'B1', 'B2', 'C'] },
        },
        {
          name: 'repeticao',
          label: 'Repetição',
          type: 'category',
          required: true,
          order: 4,
          config: { options: ['R1', 'R2', 'R3'] },
        },
        {
          name: 'notas',
          label: 'Notas',
          type: 'long_text',
          required: false,
          order: 5,
          config: {},
        },
      ],
    };

    const collectionSchema: Schema = {
      fields: [
        {
          name: 'data_coleta',
          label: 'Data',
          type: 'date',
          required: true,
          order: 0,
          config: {},
        },
        {
          name: 'hora_coleta',
          label: 'Hora',
          type: 'time',
          required: true,
          order: 1,
          config: {},
        },
        {
          name: 'fotos',
          label: 'Fotos Multi-ângulo',
          type: 'multi_image',
          required: true,
          order: 2,
          config: {
            angles: [
              { key: 'frente', label: 'Frente' },
              { key: 'esquerda', label: 'Esquerda' },
              { key: 'direita', label: 'Direita' },
              { key: 'tras', label: 'Trás' },
            ],
          },
        },
        {
          name: 'altura_cm',
          label: 'Altura (cm)',
          type: 'decimal',
          required: true,
          order: 3,
          config: { min: 0, max: 200, decimals: 1, unit: 'cm' },
        },
        {
          name: 'num_folhas',
          label: 'Número de folhas',
          type: 'integer',
          required: false,
          order: 4,
          config: { min: 0 },
        },
        {
          name: 'vigor',
          label: 'Vigor',
          type: 'scale',
          required: true,
          order: 5,
          config: { min: 1, max: 5, labels: { 1: 'Fraco', 3: 'Médio', 5: 'Excelente' } },
        },
        {
          name: 'estagio',
          label: 'Estágio',
          type: 'category',
          required: true,
          order: 6,
          config: { options: ['Germinação', 'Plântula', 'Vegetativo', 'Floração', 'Frutificação'] },
        },
        {
          name: 'sintomas',
          label: 'Sintomas',
          type: 'multi_category',
          required: false,
          order: 7,
          config: { options: ['Nenhum', 'Amarelecimento', 'Manchas', 'Murcha', 'Necrose'] },
        },
        {
          name: 'observacoes',
          label: 'Observações',
          type: 'long_text',
          required: false,
          order: 8,
          config: {},
        },
        {
          name: 'timestamp',
          label: 'Timestamp',
          type: 'auto_timestamp',
          required: false,
          order: 9,
          config: {},
        },
      ],
    };

    // ── Create project ──

    projectId = await createProject(
      DEMO_PROJECT_NAME,
      'Experimento com três variedades de feijão (T1, T2, T3), duas condições de rega (C=Controle irrigado, E=Estresse 50%), cinco tratamentos de microrganismo (F1, F2 fungos; B1, B2 bactérias; C controle) e três repetições (R1, R2, R3). Total: 90 sujeitos. Inclui captura multi-ângulo (Frente, Esquerda, Direita, Trás).',
      subjectSchema,
      collectionSchema
    );

    // ── Subjects: full factorial 3×2×5×3 = 90 ──

    const variedades = ['T1', 'T2', 'T3'];
    const regas = ['C', 'E'];
    const microrganismos = ['F1', 'F2', 'B1', 'B2', 'C'];
    const repeticoes = ['R1', 'R2', 'R3'];

    const subjectIds: string[] = [];

    for (const v of variedades) {
      for (const r of regas) {
        for (const m of microrganismos) {
          for (const rep of repeticoes) {
            const nome = `${v}_${r}_${m}_${rep}`;
            const sid = await createSubject(projectId, {
              nome,
              variedade: v,
              rega: r,
              microrganismo: m,
              repeticao: rep,
              notas: '',
            });
            subjectIds.push(sid);
          }
        }
      }
    }

    // ── Sample collections for first 12 subjects ──

    const ts1 = '2026-02-15T10:00:00.000Z';
    const sampleData = [
      { altura_cm: 18.5, num_folhas: 6, vigor: 4, estagio: 'Vegetativo', sintomas: ['Nenhum'], observacoes: 'Desenvolvimento normal' },
      { altura_cm: 17.2, num_folhas: 5, vigor: 4, estagio: 'Vegetativo', sintomas: ['Nenhum'], observacoes: '' },
      { altura_cm: 15.8, num_folhas: 5, vigor: 3, estagio: 'Vegetativo', sintomas: ['Nenhum'], observacoes: '' },
      { altura_cm: 19.3, num_folhas: 7, vigor: 5, estagio: 'Vegetativo', sintomas: ['Nenhum'], observacoes: 'Excelente vigor' },
      { altura_cm: 16.1, num_folhas: 5, vigor: 3, estagio: 'Vegetativo', sintomas: ['Amarelecimento'], observacoes: '' },
      { altura_cm: 14.7, num_folhas: 4, vigor: 3, estagio: 'Plântula', sintomas: ['Nenhum'], observacoes: '' },
      { altura_cm: 12.1, num_folhas: 4, vigor: 2, estagio: 'Plântula', sintomas: ['Murcha', 'Amarelecimento'], observacoes: 'Sinais de estresse hídrico' },
      { altura_cm: 13.8, num_folhas: 5, vigor: 3, estagio: 'Vegetativo', sintomas: ['Amarelecimento'], observacoes: '' },
      { altura_cm: 11.4, num_folhas: 4, vigor: 2, estagio: 'Plântula', sintomas: ['Manchas'], observacoes: 'Manchas nas folhas basais' },
      { altura_cm: 10.8, num_folhas: 3, vigor: 2, estagio: 'Plântula', sintomas: ['Murcha', 'Necrose'], observacoes: 'Necrose parcial nas bordas' },
      { altura_cm: 9.6, num_folhas: 3, vigor: 2, estagio: 'Plântula', sintomas: ['Amarelecimento', 'Murcha'], observacoes: 'Estresse severo' },
      { altura_cm: 8.2, num_folhas: 3, vigor: 1, estagio: 'Plântula', sintomas: ['Murcha', 'Necrose'], observacoes: 'Necessita intervenção' },
    ];

    const sampleCount = Math.min(12, subjectIds.length);
    for (let i = 0; i < sampleCount; i++) {
      const data = {
        ...sampleData[i],
        data_coleta: '15/02/2026',
        hora_coleta: '10:00',
        timestamp: ts1,
      };
      await createCollection(subjectIds[i], projectId, data, null, null);
    }
  });

  return projectId;
}
