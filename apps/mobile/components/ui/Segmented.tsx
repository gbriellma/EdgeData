import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '@/constants/colors';

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ value, options, onChange }: SegmentedProps<T>) {
  return (
    <View style={styles.container}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            style={[styles.item, active && styles.active]}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.text, active && styles.textActive]}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.border,
    borderRadius: 10,
    padding: 3,
  },
  item: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  active: {
    backgroundColor: Colors.surface,
  },
  text: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  textActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
});
