import { Stack, useLocalSearchParams } from 'expo-router';

export default function ProjectLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{ title: 'Projeto' }}
      />
      <Stack.Screen
        name="subjects/index"
        options={{ title: 'Sujeitos' }}
      />
      <Stack.Screen
        name="subjects/new"
        options={{ title: 'Novo Sujeito' }}
      />
      <Stack.Screen
        name="subjects/import-csv"
        options={{ title: 'Importar CSV' }}
      />
      <Stack.Screen
        name="subjects/batch"
        options={{ title: 'Criar em Lote' }}
      />
      <Stack.Screen
        name="subjects/[subjectId]"
        options={{ title: 'Detalhe do Sujeito' }}
      />
      <Stack.Screen
        name="collections/index"
        options={{ title: 'Coletas' }}
      />
      <Stack.Screen
        name="collections/[collectionId]"
        options={{ title: 'Detalhe da Coleta' }}
      />
      <Stack.Screen
        name="collect"
        options={{ title: 'Coletar Dados', headerShown: false }}
      />
      <Stack.Screen
        name="export"
        options={{ title: 'Exportar Dataset' }}
      />
      <Stack.Screen
        name="qr-codes"
        options={{ title: 'QR Codes' }}
      />
    </Stack>
  );
}
