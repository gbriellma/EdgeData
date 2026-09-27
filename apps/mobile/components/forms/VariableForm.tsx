import React from 'react';
import { View } from 'react-native';
import type { ValueMap, VariableDefinition } from '@/core/types';
import type { ValidationError } from '@/core/validation';
import { visibleVariables } from '@/core/variables';
import { FieldRenderer, type PhotoConfig, type SensorHint } from './FieldRenderer';

interface VariableFormProps {
  variables: readonly VariableDefinition[];
  values: ValueMap;
  onChange: (key: string, value: unknown) => void;
  errors?: ValidationError[];
  detailed?: boolean;
  sensorHints?: Record<string, SensorHint>;
  onCaptureImage?: (key: string, angle?: string, photoConfig?: PhotoConfig) => void;
  onScanCode?: (key: string) => void;
  onCaptureLocation?: (key: string) => void;
}

/** Formulário gerado a partir das variáveis; campos condicionais aparecem e somem conforme as respostas. */
export function VariableForm({ variables, values, onChange, errors = [], detailed, sensorHints, onCaptureImage, onScanCode, onCaptureLocation }: VariableFormProps) {
  const errorMap = new Map(errors.map((e) => [e.field, e.message]));
  return (
    <View>
      {visibleVariables(variables, values).map((variable) => (
        <FieldRenderer
          key={variable.key}
          field={variable}
          value={values[variable.key]}
          onChange={(value) => onChange(variable.key, value)}
          error={errorMap.get(variable.key)}
          detailed={detailed}
          sensor={sensorHints?.[variable.key]}
          onCaptureImage={onCaptureImage}
          onScanCode={onScanCode}
          onCaptureLocation={onCaptureLocation}
        />
      ))}
    </View>
  );
}

/** Valores iniciais de um formulário (padrões configurados nas variáveis). */
export function initialValues(variables: readonly VariableDefinition[]): ValueMap {
  const values: ValueMap = {};
  for (const variable of variables) {
    if (variable.config.defaultValue !== undefined) values[variable.key] = variable.config.defaultValue;
  }
  return values;
}
