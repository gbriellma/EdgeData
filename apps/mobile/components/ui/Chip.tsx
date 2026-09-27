import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { Colors } from '@/constants/colors';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}

export function Chip({ label, selected, onPress, onRemove, icon, style }: ChipProps) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.selected, style]}
      onPress={onPress}
      disabled={!onPress && !onRemove}
      activeOpacity={0.7}
    >
      {icon ? <Ionicons name={icon} size={14} color={selected ? Colors.primary : Colors.textSecondary} /> : null}
      <Text style={[styles.text, selected && styles.textSelected]} numberOfLines={1}>
        {label}
      </Text>
      {onRemove ? (
        <TouchableOpacity onPress={onRemove} hitSlop={8}>
          <Ionicons name="close-circle" size={16} color={Colors.textSecondary} />
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    maxWidth: '100%',
  },
  selected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySurface,
  },
  text: {
    fontSize: 13,
    color: Colors.text,
    flexShrink: 1,
  },
  textSelected: {
    color: Colors.primary,
    fontWeight: '600',
  },
});
