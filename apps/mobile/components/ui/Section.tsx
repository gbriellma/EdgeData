import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Colors } from '@/constants/colors';

interface SectionProps {
  title: string;
  hint?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Section({ title, hint, right, children, style }: SectionProps) {
  return (
    <View style={[styles.section, style]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

export function KeyValue({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <View style={styles.row}>
      <Text style={styles.key}>{label}</Text>
      <Text style={styles.value}>{String(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  hint: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  key: {
    fontSize: 14,
    color: Colors.textSecondary,
    flexShrink: 0,
    maxWidth: '45%',
  },
  value: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
});
