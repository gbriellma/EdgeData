import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { Colors } from '@/constants/colors';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: Colors.primary, headerShown: true }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Experimentos', tabBarIcon: ({ color, size }) => <Ionicons name="flask-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Ajustes', tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} /> }}
      />
    </Tabs>
  );
}
