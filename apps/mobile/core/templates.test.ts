import { describe, expect, it } from 'vitest';
import { expectedCounts, validateDesign } from './design';
import { BUILTIN_TEMPLATES, legacySchemaToVariables, parseTemplate, TemplateError, templateToFile } from './templates';
import { validateDefinitions } from './variables';

describe('templates embutidos', () => {
  it.each(BUILTIN_TEMPLATES.map((t) => [t.name, t] as const))('%s é consistente', (_name, template) => {
    expect(validateDefinitions(template.variables.filter((v) => v.scope === 'sample'))).toEqual([]);
    expect(validateDefinitions(template.variables.filter((v) => v.scope === 'observation'))).toEqual([]);
    expect(validateDesign(template.design)).toEqual([]);
    expect(expectedCounts(template.design).samples).toBeGreaterThan(0);
  });

  it('têm IDs únicos', () => {
    const ids = BUILTIN_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sobrevivem a exportar e importar', () => {
    const template = BUILTIN_TEMPLATES[1];
    const parsed = parseTemplate(JSON.parse(templateToFile(template)));
    expect(parsed.variables).toEqual(template.variables);
    expect(parsed.design).toEqual(template.design);
  });
});

describe('formato antigo', () => {
  const legacy = {
    version: 1,
    type: 'edgedata-template',
    name: 'Monitoramento de Crescimento',
    description: 'antigo',
    subjectSchema: { fields: [{ name: 'identificador', label: 'Identificador', type: 'short_text', required: true, order: 0, config: {} }] },
    collectionSchema: {
      fields: [
        { name: 'medida_cm', label: 'Medida (cm)', type: 'decimal', required: true, order: 1, config: { min: 0, max: 1000, decimals: 1, unit: 'cm' } },
        { name: 'temp', label: 'Temperatura', type: 'decimal', required: false, order: 2, config: { unit: 'graus' } },
        { name: 'Severidade', label: 'Severidade', type: 'scale', required: true, order: 3, config: { min: 0, max: 9 } },
        { name: 'x', label: 'Tipo desconhecido', type: 'foo', required: false, order: 4, config: {} },
      ],
    },
  };

  it('converte schemas de sujeito e coleta em variáveis', () => {
    const template = parseTemplate(legacy);
    expect(template.version).toBe(2);
    const byKey = Object.fromEntries(template.variables.map((v) => [v.key, v]));
    expect(byKey.identificador.scope).toBe('sample');
    expect(byKey.medida_cm).toMatchObject({ scope: 'observation', unit: 'cm', config: { min: 0, max: 1000, decimals: 1 } });
    expect(byKey.temp.unit).toBeUndefined();
    expect(byKey.temp.description).toBe('Unidade informada: graus');
    expect(byKey.severidade.unit).toBe('{score}');
    expect(byKey.x.type).toBe('short_text');
    expect(validateDefinitions(template.variables)).toEqual([]);
  });

  it('tolera schema ausente', () => {
    expect(legacySchemaToVariables(undefined, 'sample')).toEqual([]);
  });

  it('rejeita arquivos de outro tipo', () => {
    expect(() => parseTemplate({ type: 'outro' })).toThrow(TemplateError);
    expect(() => parseTemplate({ type: 'edgedata-template', version: 9 })).toThrow(/não suportada/);
  });
});
