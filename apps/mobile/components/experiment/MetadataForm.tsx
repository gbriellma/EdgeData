import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { normalizeOrcid } from '@/core/codes';
import type { ExperimentMetadata, TeamMember } from '@/core/types';
import { Colors } from '@/constants/colors';

interface MetadataFormProps {
  metadata: ExperimentMetadata;
  onChange: (metadata: ExperimentMetadata) => void;
  detailed?: boolean;
  /** Mostra nome e código (desligado quando a tela já os edita separadamente) */
  showIdentity?: boolean;
}

type TextKey = Exclude<keyof ExperimentMetadata, 'team'>;

export function MetadataForm({ metadata, onChange, detailed, showIdentity = true }: MetadataFormProps) {
  const set = (key: TextKey, value: string) => onChange({ ...metadata, [key]: value });

  const text = (key: TextKey, label: string, options: { placeholder?: string; multiline?: boolean; hint?: string; autoCapitalize?: 'none' | 'characters' } = {}) => (
    <View style={styles.field} key={key}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, options.multiline && styles.multiline]}
        value={(metadata[key] as string | undefined) ?? ''}
        onChangeText={(value) => set(key, value)}
        placeholder={options.placeholder}
        placeholderTextColor={Colors.textSecondary}
        multiline={options.multiline}
        textAlignVertical={options.multiline ? 'top' : 'center'}
        autoCapitalize={options.autoCapitalize}
      />
      {options.hint ? <Text style={styles.hint}>{options.hint}</Text> : null}
    </View>
  );

  return (
    <View>
      {showIdentity ? (
        <>
          {text('name', 'Nome do experimento *', { placeholder: 'Ex.: Feijão sob déficit hídrico 2026' })}
          {text('code', 'Código *', { placeholder: 'Ex.: FEIJAO-DH-2026', hint: 'Curto e único; aparece nas etiquetas e no nome do dataset', autoCapitalize: 'characters' })}
        </>
      ) : null}
      {text('description', 'Descrição', { multiline: true })}
      {text('objective', 'Objetivo', { multiline: true, placeholder: 'O que o experimento quer descobrir?' })}
      {detailed ? text('hypothesis', 'Hipótese', { multiline: true }) : null}
      {text('institution', 'Instituição', { placeholder: 'Ex.: UFRPE' })}
      {text('laboratory', 'Laboratório / grupo')}
      <TeamEditor team={metadata.team} onChange={(team) => onChange({ ...metadata, team })} detailed={detailed} />
      {detailed ? text('funding', 'Financiamento', { placeholder: 'Ex.: CNPq — processo 000000/2026-0' }) : null}
      {text('location', 'Local', { placeholder: 'Ex.: Casa de vegetação 2, Recife-PE' })}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>{text('startDate', 'Início', { placeholder: 'AAAA-MM-DD' })}</View>
        <View style={{ flex: 1 }}>{text('endDate', 'Fim', { placeholder: 'AAAA-MM-DD' })}</View>
      </View>
      {text('methodology', 'Metodologia / protocolo', { multiline: true, placeholder: 'Como as medidas são feitas, equipamentos, procedimentos…' })}
      {detailed ? text('inclusionCriteria', 'Critérios de inclusão', { multiline: true }) : null}
      {detailed ? text('exclusionCriteria', 'Critérios de exclusão', { multiline: true }) : null}
      {detailed ? text('license', 'Licença dos dados', { placeholder: 'Ex.: CC-BY-4.0', hint: 'Identificador SPDX: CC0-1.0, CC-BY-4.0, CC-BY-NC-4.0…' }) : null}
      {text('notes', 'Observações', { multiline: true })}
    </View>
  );
}

function TeamEditor({ team, onChange, detailed }: { team: TeamMember[]; onChange: (team: TeamMember[]) => void; detailed?: boolean }) {
  const [draft, setDraft] = useState<TeamMember>({ name: '' });
  const orcidOk = !draft.orcid || !!normalizeOrcid(draft.orcid);

  const add = () => {
    if (!draft.name.trim() || !orcidOk) return;
    onChange([
      ...team,
      {
        name: draft.name.trim(),
        ...(draft.role?.trim() ? { role: draft.role.trim() } : {}),
        ...(draft.orcid ? { orcid: normalizeOrcid(draft.orcid)! } : {}),
        ...(draft.affiliation?.trim() ? { affiliation: draft.affiliation.trim() } : {}),
      },
    ]);
    setDraft({ name: '' });
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>Responsáveis</Text>
      {team.map((member, index) => (
        <View key={`${member.name}-${index}`} style={styles.member}>
          <Ionicons name="person-circle-outline" size={22} color={Colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.memberName}>{member.name}</Text>
            <Text style={styles.memberMeta}>{[member.role, member.affiliation, member.orcid ? `ORCID ${member.orcid}` : undefined].filter(Boolean).join(' · ')}</Text>
          </View>
          <TouchableOpacity onPress={() => onChange(team.filter((_, i) => i !== index))} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      ))}
      <View style={styles.memberForm}>
        <TextInput style={styles.input} value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} placeholder="Nome" placeholderTextColor={Colors.textSecondary} />
        <View style={styles.row}>
          <TextInput style={[styles.input, { flex: 1 }]} value={draft.role ?? ''} onChangeText={(role) => setDraft({ ...draft, role })} placeholder="Papel (ex.: orientador)" placeholderTextColor={Colors.textSecondary} />
          <TextInput
            style={[styles.input, { flex: 1 }, !orcidOk && styles.inputError]}
            value={draft.orcid ?? ''}
            onChangeText={(orcid) => setDraft({ ...draft, orcid: orcid || undefined })}
            placeholder="ORCID"
            placeholderTextColor={Colors.textSecondary}
            autoCapitalize="characters"
          />
        </View>
        {detailed ? (
          <TextInput style={styles.input} value={draft.affiliation ?? ''} onChangeText={(affiliation) => setDraft({ ...draft, affiliation })} placeholder="Afiliação" placeholderTextColor={Colors.textSecondary} />
        ) : null}
        {!orcidOk ? <Text style={styles.error}>ORCID inválido (formato 0000-0000-0000-0000)</Text> : null}
        <TouchableOpacity style={[styles.addBtn, (!draft.name.trim() || !orcidOk) && { opacity: 0.5 }]} onPress={add}>
          <Ionicons name="person-add-outline" size={18} color={Colors.primary} />
          <Text style={styles.addText}>Adicionar pessoa</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  hint: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  error: { fontSize: 12, color: Colors.error },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  inputError: { borderColor: Colors.error },
  multiline: { minHeight: 80 },
  row: { flexDirection: 'row', gap: 10 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  memberName: { fontSize: 15, fontWeight: '600', color: Colors.text },
  memberMeta: { fontSize: 12, color: Colors.textSecondary },
  memberForm: { gap: 8, marginTop: 8 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6 },
  addText: { color: Colors.primary, fontWeight: '600' },
});
