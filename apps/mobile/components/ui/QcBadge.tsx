import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { QC_FLAG_INFO } from '@/core/qc';
import type { QcFlag } from '@/core/types';
import { Colors } from '@/constants/colors';

const TONE: Record<0 | 1 | 2, { bg: string; fg: string }> = {
  0: { bg: Colors.successLight, fg: Colors.success },
  1: { bg: Colors.warningLight, fg: Colors.warning },
  2: { bg: Colors.errorLight, fg: Colors.error },
};

export function QcBadge({ flag }: { flag: QcFlag }) {
  const info = QC_FLAG_INFO[flag];
  const tone = TONE[info.severity];
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.text, { color: tone.fg }]}>{info.label}</Text>
    </View>
  );
}

export function StatusBadge({ label, tone }: { label: string; tone: 'ok' | 'warn' | 'error' | 'neutral' }) {
  const colors =
    tone === 'ok' ? TONE[0] : tone === 'warn' ? TONE[1] : tone === 'error' ? TONE[2] : { bg: Colors.border, fg: Colors.textSecondary };
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.text, { color: colors.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
  },
});
