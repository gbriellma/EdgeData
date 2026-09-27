import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import 'react-native-reanimated';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useDatabase } from '@/hooks/useDatabase';

const GreenLightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#2E7D32',
    background: '#FAFAFA',
    card: '#FFFFFF',
    text: '#1C1C1E',
    border: '#E5E7EB',
  },
};

const GreenDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: '#4CAF50',
    background: '#121212',
    card: '#1E1E1E',
    text: '#F5F5F5',
    border: '#374151',
  },
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { dbReady } = useDatabase();

  if (!dbReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  return (
    <KeyboardProvider>
      <ThemeProvider value={colorScheme === 'dark' ? GreenDarkTheme : GreenLightTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="project/new"
            options={{ title: 'Novo Projeto', presentation: 'modal' }}
          />
          <Stack.Screen
            name="project/[id]"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="tutorial"
            options={{ title: 'Como Usar o EdgeData', presentation: 'modal' }}
          />
          <Stack.Screen
            name="sensors"
            options={{ title: 'Sensores Bluetooth', presentation: 'modal' }}
          />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </KeyboardProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
  },
});
