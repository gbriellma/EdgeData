export function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return isoString;
  }
}

export function formatDateTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export function formatCoordinate(lat: number | null, lng: number | null): string {
  if (lat === null || lng === null) return 'Sem GPS';
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

export function formatNumber(value: number, decimals?: number): string {
  if (decimals !== undefined) {
    return value.toFixed(decimals);
  }
  return String(value);
}

export function getSubjectDisplayLabel(
  data: Record<string, unknown>,
  fieldNames: string[],
  schema?: { fields: { name: string; type: string }[] },
): string {
  // If a 'nome' field exists with a value, use it as the primary label
  if (schema) {
    const nomeField = schema.fields.find(
      (f) => f.name === 'nome' || f.name === 'name',
    );
    if (nomeField) {
      const nomeVal = data[nomeField.name];
      if (nomeVal !== undefined && nomeVal !== null && nomeVal !== '') {
        return String(nomeVal);
      }
    }
  }

  // Fallback: join all non-empty field values
  const parts: string[] = [];
  for (const name of fieldNames) {
    const val = data[name];
    if (val !== undefined && val !== null && val !== '' && typeof val !== 'boolean') {
      const str = String(val).trim();
      if (str) parts.push(str);
    }
  }
  return parts.length > 0 ? parts.join('_') : 'Sem identificador';
}

export function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}
