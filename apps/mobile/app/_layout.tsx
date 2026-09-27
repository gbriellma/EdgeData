import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import 'react-native-reanimated';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { Colors } from '@/constants/colors';
import { getDb } from '@/database/connection';
import { useSettings } from '@/stores/settings';

const EdgeTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.primary,
    background: Colors.background,
    card: Colors.surface,
    text: Colors.text,
    border: Colors.border,
  },
};

export default function RootLayout() {
  const [error, setError] = useState<string | null>(null);
  const loaded = useSettings((s) => s.loaded);
  const load = useSettings((s) => s.load);

  useEffect(() => {
    getDb()
      .then(() => load())
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [load]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Não foi possível abrir o banco de dados</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardProvider>
      <ThemeProvider value={EdgeTheme}>
        <Stack screenOptions={{ headerTintColor: Colors.primary, headerTitleStyle: { color: Colors.text } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="experiment/new" options={{ title: 'Novo experimento', presentation: 'modal' }} />
          <Stack.Screen name="experiment/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="tutorial" options={{ title: 'Como usar o EdgeData', presentation: 'modal' }} />
        </Stack>
        <StatusBar style="dark" />
      </ThemeProvider>
    </KeyboardProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: Colors.background },
  errorTitle: { fontSize: 17, fontWeight: '700', color: Colors.error, textAlign: 'center' },
  errorText: { fontSize: 14, color: Colors.textSecondary, marginTop: 8, textAlign: 'center' },
});
