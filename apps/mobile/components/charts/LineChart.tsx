import React, { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { Colors } from '@/constants/colors';
import { formatAxisNumber, linearScale, niceTicks, seriesColor, timeTicks } from '@/core/chart-scale';

export interface LineSeries {
  key: string;
  label: string;
  /** Índice estável da cor (segue o grupo, não a posição na lista filtrada) */
  colorIndex: number;
  points: { t: number; mean: number; se: number | null; n: number }[];
}

interface Props {
  series: LineSeries[];
  unit?: string;
  showError?: boolean;
  height?: number;
  formatValue: (v: number) => string;
}

const PAD = { top: 14, right: 16, bottom: 28, left: 46 };
const dayLabel = (t: number) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

/** Evolução temporal: média por dia de cada grupo, com ±1 erro padrão opcional. */
export function LineChart({ series, unit, showError = true, height = 240, formatValue }: Props) {
  const [width, setWidth] = useState(0);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const points = series.flatMap((s) => s.points);
  const times = [...new Set(points.map((p) => p.t))].sort((a, b) => a - b);
  const lows = points.map((p) => (showError && p.se ? p.mean - p.se : p.mean));
  const highs = points.map((p) => (showError && p.se ? p.mean + p.se : p.mean));
  const yTicks = points.length ? niceTicks(Math.min(...lows), Math.max(...highs), 4) : [];
  const tMin = times[0] ?? 0;
  const tMax = times[times.length - 1] ?? 1;
  const plotH = height - PAD.top - PAD.bottom;
  const x = linearScale(tMin === tMax ? [tMin - 43_200_000, tMax + 43_200_000] : [tMin, tMax], [PAD.left, width - PAD.right]);
  const y = linearScale([yTicks[0] ?? 0, yTicks[yTicks.length - 1] ?? 1], [PAD.top + plotH, PAD.top]);
  const xTicks = timeTicks(tMin, tMax, Math.max(2, Math.floor((width - PAD.left) / 70)));

  const pick = (px: number) => {
    if (times.length === 0) return;
    let best = times[0];
    for (const t of times) if (Math.abs(x(t) - px) < Math.abs(x(best) - px)) best = t;
    setHoverT(best);
  };

  const hovered = hoverT === null ? [] : series.map((s) => ({ s, p: s.points.find((p) => p.t === hoverT) })).filter((h) => h.p);

  return (
    <View>
      <View
        onLayout={onLayout}
        style={{ height }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => pick(e.nativeEvent.locationX)}
        onResponderMove={(e) => pick(e.nativeEvent.locationX)}
      >
        {width > 0 && points.length > 0 ? (
          <Svg width={width} height={height}>
            {yTicks.map((t) => (
              <G key={t}>
                <Line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={Colors.border} strokeWidth={1} />
                <SvgText x={PAD.left - 6} y={y(t) + 4} fontSize={10} fill={Colors.textSecondary} textAnchor="end">
                  {formatAxisNumber(t)}
                </SvgText>
              </G>
            ))}
            {xTicks.map((t) => (
              <SvgText key={t} x={x(t)} y={height - 8} fontSize={10} fill={Colors.textSecondary} textAnchor="middle">
                {dayLabel(t)}
              </SvgText>
            ))}
            {hoverT !== null ? <Line x1={x(hoverT)} x2={x(hoverT)} y1={PAD.top} y2={PAD.top + plotH} stroke={Colors.textSecondary} strokeWidth={1} /> : null}
            {series.map((s) => {
              const color = seriesColor(s.colorIndex);
              const d = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.mean).toFixed(1)}`).join(' ');
              return (
                <G key={s.key}>
                  {showError
                    ? s.points.map((p) =>
                        p.se ? <Line key={`e${p.t}`} x1={x(p.t)} x2={x(p.t)} y1={y(p.mean - p.se)} y2={y(p.mean + p.se)} stroke={color} strokeOpacity={0.5} strokeWidth={1.5} /> : null,
                      )
                    : null}
                  {s.points.length > 1 ? <Path d={d} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
                  {s.points.map((p) => (
                    <Circle key={p.t} cx={x(p.t)} cy={y(p.mean)} r={p.t === hoverT ? 5 : 4} fill={color} stroke={Colors.surface} strokeWidth={2} />
                  ))}
                </G>
              );
            })}
            {unit ? (
              <SvgText x={4} y={PAD.top - 3} fontSize={10} fill={Colors.textSecondary}>
                {unit}
              </SvgText>
            ) : null}
          </Svg>
        ) : null}
      </View>
      {hovered.length > 0 && hoverT !== null ? (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipTitle}>{new Date(hoverT).toLocaleDateString('pt-BR')}</Text>
          {hovered.map(({ s, p }) => (
            <View key={s.key} style={styles.tooltipRow}>
              <View style={[styles.dot, { backgroundColor: seriesColor(s.colorIndex) }]} />
              <Text style={styles.tooltipLabel}>{s.label}</Text>
              <Text style={styles.tooltipValue}>
                {formatValue(p!.mean)}
                {p!.se ? ` ± ${formatValue(p!.se)}` : ''} (n={p!.n})
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.hint}>Toque ou arraste no gráfico para ver os valores.</Text>
      )}
    </View>
  );
}

export function Legend({ items }: { items: { label: string; colorIndex: number }[] }) {
  if (items.length < 2) return null;
  return (
    <View style={styles.legend}>
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: seriesColor(item.colorIndex) }]} />
          <Text style={styles.legendText}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tooltip: { marginTop: 6, padding: 10, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, gap: 4 },
  tooltipTitle: { fontSize: 12, fontWeight: '700', color: Colors.text },
  tooltipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tooltipLabel: { flex: 1, fontSize: 12, color: Colors.textSecondary },
  tooltipValue: { fontSize: 12, fontWeight: '600', color: Colors.text, fontVariant: ['tabular-nums'] },
  hint: { marginTop: 4, fontSize: 11, color: Colors.textSecondary },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontSize: 12, color: Colors.text },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
