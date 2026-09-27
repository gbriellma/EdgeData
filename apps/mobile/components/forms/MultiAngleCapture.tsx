import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image as RNImage,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';

export interface AnglePhoto {
  angle: string;
  uri: string;
}

interface MultiAngleCaptureProps {
  photos: AnglePhoto[];
  angles: { key: string; label: string }[];
  onCapture: (angle: string) => void;
  onRemove: (angle: string) => void;
  error?: string;
  label: string;
  required?: boolean;
}

export function MultiAngleCapture({
  photos,
  angles,
  onCapture,
  onRemove,
  error,
  label,
  required,
}: MultiAngleCaptureProps) {
  const photoMap = new Map(photos.map((p) => [p.angle, p.uri]));
  const capturedCount = photos.length;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>

      <Text style={styles.subtitle}>
        {capturedCount}/{angles.length} ângulos capturados
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.anglesRow}
      >
        {angles.map((angle) => {
          const uri = photoMap.get(angle.key);
          const captured = !!uri;

          return (
            <View key={angle.key} style={styles.angleItem}>
              <TouchableOpacity
                style={[styles.angleButton, captured && styles.angleButtonCaptured]}
                onPress={() => onCapture(angle.key)}
                activeOpacity={0.7}
              >
                {captured ? (
                  <RNImage source={{ uri }} style={styles.thumbnail} />
                ) : (
                  <View style={styles.emptyAngle}>
                    <Ionicons name="ellipse-outline" size={28} color={Colors.primary} />
                  </View>
                )}

                {/* Capture/recapture overlay */}
                <View style={[styles.captureOverlay, captured && styles.recaptureOverlay]}>
                  <Ionicons
                    name={captured ? 'refresh' : 'camera'}
                    size={16}
                    color={Colors.white}
                  />
                </View>
              </TouchableOpacity>

              {/* Remove button */}
              {captured && (
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => onRemove(angle.key)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={20} color={Colors.error} />
                </TouchableOpacity>
              )}

              <Text style={[styles.angleLabel, captured && styles.angleLabelCaptured]}>
                {angle.label}
              </Text>

              {captured && (
                <Ionicons name="checkmark-circle" size={14} color={Colors.primary} />
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Quick capture all button */}
      {capturedCount < angles.length && (
        <TouchableOpacity
          style={styles.captureAllBtn}
          onPress={() => {
            const nextAngle = angles.find((a) => !photoMap.has(a.key));
            if (nextAngle) onCapture(nextAngle.key);
          }}
        >
          <Ionicons name="camera-outline" size={20} color={Colors.primary} />
          <Text style={styles.captureAllText}>
            Capturar {capturedCount === 0 ? 'fotos' : 'próximo ângulo'}
            {capturedCount > 0 && ` (${angles.find((a) => !photoMap.has(a.key))?.label})`}
          </Text>
        </TouchableOpacity>
      )}

      {capturedCount === angles.length && angles.length > 0 && (
        <View style={styles.completeBar}>
          <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
          <Text style={styles.completeText}>Todos os ângulos capturados</Text>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const THUMB_SIZE = 80;

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  required: {
    color: Colors.error,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  anglesRow: {
    gap: 10,
    paddingVertical: 4,
  },
  angleItem: {
    alignItems: 'center',
    width: THUMB_SIZE + 8,
    gap: 4,
  },
  angleButton: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  angleButtonCaptured: {
    borderColor: Colors.primary,
    borderStyle: 'solid',
  },
  emptyAngle: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.primarySurface,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  captureOverlay: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recaptureOverlay: {
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  removeBtn: {
    position: 'absolute',
    top: -4,
    right: 0,
    zIndex: 1,
  },
  angleLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  angleLabelCaptured: {
    color: Colors.primary,
    fontWeight: '500',
  },
  captureAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primarySurface,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
  },
  captureAllText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '500',
  },
  completeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primarySurface,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 10,
  },
  completeText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '500',
  },
  error: {
    fontSize: 12,
    color: Colors.error,
    marginTop: 4,
  },
});
