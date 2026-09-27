import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors } from '@/constants/colors';

interface ReasonModalProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

/** Pede um motivo obrigatório (retratações, correções). Funciona em Android e iOS. */
export function ReasonModal({ visible, title, message, confirmLabel = 'Confirmar', destructive, onCancel, onConfirm }: ReasonModalProps) {
  const [reason, setReason] = useState('');
  const close = () => {
    setReason('');
    onCancel();
  };
  const confirm = () => {
    if (!reason.trim()) return;
    const value = reason.trim();
    setReason('');
    onConfirm(value);
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <TextInput style={styles.input} value={reason} onChangeText={setReason} placeholder="Motivo" placeholderTextColor={Colors.textSecondary} multiline autoFocus />
          <View style={styles.actions}>
            <TouchableOpacity onPress={close} style={styles.btn}>
              <Text style={styles.cancel}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={confirm} style={styles.btn} disabled={!reason.trim()}>
              <Text style={[styles.confirm, destructive && { color: Colors.error }, !reason.trim() && { opacity: 0.4 }]}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'center', padding: 24 },
  box: { backgroundColor: Colors.surface, borderRadius: 16, padding: 20, gap: 12 },
  title: { fontSize: 17, fontWeight: '700', color: Colors.text },
  message: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 12, minHeight: 70, fontSize: 15, color: Colors.text, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  btn: { paddingVertical: 8, paddingHorizontal: 12 },
  cancel: { fontSize: 15, color: Colors.textSecondary, fontWeight: '600' },
  confirm: { fontSize: 15, color: Colors.primary, fontWeight: '700' },
});
