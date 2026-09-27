import { Stack } from 'expo-router';
import React from 'react';
import { Colors } from '@/constants/colors';

export default function ExperimentLayout() {
  return (
    <Stack screenOptions={{ headerTintColor: Colors.primary, headerTitleStyle: { color: Colors.text } }}>
      <Stack.Screen name="index" options={{ title: 'Experimento' }} />
      <Stack.Screen name="details" options={{ title: 'Dados do experimento' }} />
      <Stack.Screen name="variables" options={{ title: 'Protocolo e variáveis' }} />
      <Stack.Screen name="samples/index" options={{ title: 'Amostras' }} />
      <Stack.Screen name="samples/new" options={{ title: 'Adicionar amostras' }} />
      <Stack.Screen name="samples/[sampleId]" options={{ title: 'Amostra' }} />
      <Stack.Screen name="collect" options={{ headerShown: false }} />
      <Stack.Screen name="sessions" options={{ title: 'Sessões e eventos' }} />
      <Stack.Screen name="observations/index" options={{ title: 'Observações' }} />
      <Stack.Screen name="observations/[observationId]" options={{ title: 'Observação' }} />
      <Stack.Screen name="qr-codes" options={{ title: 'Etiquetas QR' }} />
      <Stack.Screen name="sensors" options={{ title: 'Sensores' }} />
      <Stack.Screen name="analysis" options={{ title: 'Análise' }} />
      <Stack.Screen name="quality" options={{ title: 'Pendências e qualidade' }} />
      <Stack.Screen name="import" options={{ title: 'Importar planilha' }} />
      <Stack.Screen name="export" options={{ title: 'Exportar dataset' }} />
    </Stack>
  );
}
