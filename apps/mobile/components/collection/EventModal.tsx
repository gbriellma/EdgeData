import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Chip } from '@/components/ui/Chip';
import { Colors } from '@/constants/colors';

const PRESETS = ['Início do tratamento', 'Irrigação', 'Chuva', 'Aplicação', 'Troca de equipamento', 'Falha de energia', 'Interrupção', 'Retomada'];

interface EventModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (label: string) => void;
}

/** Descreve um evento; o horário é capturado por quem abre o modal, no momento do toque. */
export function EventModal({ visible, onClose, onSubmit }: EventModalProps) {
  const [text, setText] = useState('');
  const submit = (label: string) => {
    if (!label.trim()) return;
    onSubmit(label.trim());
    setText('');
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Marcar evento</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>
          <Text style={styles.help}>O horário registrado é o momento em que você tocou em “Evento”.</Text>
          <View style={styles.chips}>
            {PRESETS.map((p) => (
              <Chip key={p} label={p} onPress={() => submit(p)} />
            ))}
          </View>
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="Descreva o evento…"
              placeholderTextColor={Colors.textSecondary}
              onSubmitEditing={() => submit(text)}
              returnKeyType="done"
            />
            <TouchableOpacity style={styles.button} onPress={() => submit(text)}>
              <Text style={styles.buttonText}>Registrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: Colors.text },
  help: { fontSize: 12, color: Colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  input: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: Colors.text },
  button: { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  buttonText: { color: Colors.white, fontWeight: '700' },
});
