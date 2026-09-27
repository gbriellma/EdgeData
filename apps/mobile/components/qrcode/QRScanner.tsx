import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Colors } from '@/constants/colors';

interface QRScannerProps {
  /** Texto bruto lido (QR, Data Matrix ou código de barras) */
  onScanned: (raw: string) => void;
  onClose: () => void;
  hint?: string;
}

const SCAN_DEBOUNCE_MS = 1500;
const BARCODE_TYPES = ['qr', 'datamatrix', 'aztec', 'pdf417', 'code128', 'code39', 'code93', 'ean13', 'ean8', 'upc_a', 'upc_e', 'itf14', 'codabar'] as const;

export default function QRScanner({ onScanned, onClose, hint }: QRScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const lastScanAt = useRef<number>(0);
  const [scanned, setScanned] = useState(false);

  const handleBarCodeScanned = useCallback(
    ({ data }: { data: string }) => {
      const now = Date.now();
      if (!data || now - lastScanAt.current < SCAN_DEBOUNCE_MS) return;
      lastScanAt.current = now;
      setScanned(true);
      onScanned(data);
    },
    [onScanned],
  );

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permissionText}>
          É necessário permitir o acesso à câmera para ler códigos.
        </Text>
        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Conceder permissão</Text>
        </Pressable>
        <Pressable style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>Cancelar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      {/* Overlay escuro ao redor do frame de escaneamento */}
      <View style={styles.overlay}>
        <View style={styles.overlayTop} />
        <View style={styles.overlayMiddleRow}>
          <View style={styles.overlaySide} />
          <View style={styles.scanFrame}>
            {/* Cantos decorativos do frame */}
            <View style={[styles.corner, styles.cornerTopLeft]} />
            <View style={[styles.corner, styles.cornerTopRight]} />
            <View style={[styles.corner, styles.cornerBottomLeft]} />
            <View style={[styles.corner, styles.cornerBottomRight]} />
          </View>
          <View style={styles.overlaySide} />
        </View>
        <View style={styles.overlayBottom}>
          <Text style={styles.hint}>
            {scanned ? 'Código lido!' : hint ?? 'Aponte a câmera para o QR Code ou código de barras'}
          </Text>
        </View>
      </View>

      {/* Botão de fechar */}
      <Pressable style={styles.closeOverlayButton} onPress={onClose} hitSlop={12}>
        <Text style={styles.closeOverlayButtonText}>✕</Text>
      </Pressable>

      {/* Botão para escanear novamente após debounce */}
      {scanned && (
        <Pressable
          style={styles.rescanButton}
          onPress={() => {
            lastScanAt.current = 0;
            setScanned(false);
          }}
        >
          <Text style={styles.rescanButtonText}>Escanear novamente</Text>
        </Pressable>
      )}
    </View>
  );
}

const FRAME_SIZE = 240;
const CORNER_SIZE = 24;
const CORNER_THICKNESS = 3;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    padding: 24,
    gap: 16,
  },
  permissionText: {
    fontSize: 15,
    color: Colors.text,
    textAlign: 'center',
    lineHeight: 22,
  },
  permissionButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
  closeButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  closeButtonText: {
    color: Colors.textSecondary,
    fontSize: 15,
  },

  // Overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'column',
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  overlayMiddleRow: {
    flexDirection: 'row',
    height: FRAME_SIZE,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  scanFrame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    backgroundColor: 'transparent',
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 20,
  },
  hint: {
    color: Colors.white,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },

  // Cantos decorativos do frame
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: Colors.primary,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
  },

  // Botão fechar (canto superior direito)
  closeOverlayButton: {
    position: 'absolute',
    top: 48,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeOverlayButtonText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '600',
  },

  // Botão escanear novamente
  rescanButton: {
    position: 'absolute',
    bottom: 60,
    alignSelf: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  rescanButtonText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
});
