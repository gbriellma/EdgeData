import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Colors } from '@/constants/colors';

interface QRGeneratorProps {
  subjectId: string;
  label: string;
  size?: number;
}

const QR_URI_PREFIX = 'edgedata://subject/';

export default function QRGenerator({ subjectId, label, size = 150 }: QRGeneratorProps) {
  const qrValue = `${QR_URI_PREFIX}${subjectId}`;

  return (
    <View style={styles.container}>
      <View style={styles.qrWrapper}>
        <QRCode
          value={qrValue}
          size={size}
          color={Colors.text}
          backgroundColor={Colors.white}
        />
      </View>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 12,
    backgroundColor: Colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  qrWrapper: {
    padding: 8,
    backgroundColor: Colors.white,
    borderRadius: 4,
  },
  label: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
    maxWidth: 160,
  },
});
