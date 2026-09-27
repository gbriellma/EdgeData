import React, { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { Colors } from '@/constants/colors';
import { formatAxisNumber, linearScale, niceTicks } from '@/core/chart-scale';
import { summarize, tukeyFences } from '@/core/stats';

export interface BoxGroup {
  label: string;
  values: number[];
}

interface Props {
  groups: BoxGroup[];
  unit?: string;
  selected: number | null;
  onSelect: (index: number | null) => void;
  height?: number;
}

const PAD = { top: 12, right: 12, bottom: 34, left: 46 };

/** Distribuição por grupo: caixa (Q1-Q3), mediana, bigodes até os limites de Tukey e cada ponto. */
export function BoxPlot({ groups, unit, selected, onSelect, height = 240 }: Props) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const all = groups.flatMap((g) => g.values);
  const ticks = all.length ? niceTicks(Math.min(...all), Math.max(...all), 4) : [];
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const y = linearScale([ticks[0] ?? 0, ticks[ticks.length - 1] ?? 1], [PAD.top + plotH, PAD.top]);
  const band = groups.length ? plotW / groups.length : plotW;
  const boxW = Math.min(28, band * 0.45);

  const handleTouch = (x: number) => {
    const index = Math.floor((x - PAD.left) / band);
    onSelect(index >= 0 && index < groups.length ? (index === selected ? null : index) : null);
  };

  return (
    <View onLayout={onLayout} style={{ height }} onStartShouldSetResponder={() => true} onResponderRelease={(e) => handleTouch(e.nativeEvent.locationX)}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {ticks.map((t) => (
            <G key={t}>
              <Line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={Colors.border} strokeWidth={1} />
              <SvgText x={PAD.left - 6} y={y(t) + 4} fontSize={10} fill={Colors.textSecondary} textAnchor="end">
                {formatAxisNumber(t)}
              </SvgText>
            </G>
          ))}
          {groups.map((group, i) => {
            const cx = PAD.left + band * (i + 0.5);
            const s = summarize(group.values);
            const fences = tukeyFences(group.values);
            const active = selected === null || selected === i;
            const inside = group.values.filter((v) => !fences || (v >= fences.lower && v <= fences.upper));
            const whiskerLo = inside.length ? Math.min(...inside) : s?.min;
            const whiskerHi = inside.length ? Math.max(...inside) : s?.max;
            return (
              <G key={group.label} opacity={active ? 1 : 0.35}>
                {selected === i ? <Rect x={cx - band / 2 + 2} y={PAD.top} width={band - 4} height={plotH} fill={Colors.primarySurface} rx={6} /> : null}
                {s && whiskerLo !== undefined && whiskerHi !== undefined ? (
                  <>
                    <Line x1={cx} x2={cx} y1={y(whiskerLo)} y2={y(s.q1)} stroke={Colors.textSecondary} strokeWidth={1} />
                    <Line x1={cx} x2={cx} y1={y(s.q3)} y2={y(whiskerHi)} stroke={Colors.textSecondary} strokeWidth={1} />
                    <Line x1={cx - boxW / 4} x2={cx + boxW / 4} y1={y(whiskerLo)} y2={y(whiskerLo)} stroke={Colors.textSecondary} strokeWidth={1} />
                    <Line x1={cx - boxW / 4} x2={cx + boxW / 4} y1={y(whiskerHi)} y2={y(whiskerHi)} stroke={Colors.textSecondary} strokeWidth={1} />
                    <Rect x={cx - boxW / 2} y={y(s.q3)} width={boxW} height={Math.max(1, y(s.q1) - y(s.q3))} fill={Colors.primary} fillOpacity={0.14} rx={4} />
                    <Line x1={cx - boxW / 2} x2={cx + boxW / 2} y1={y(s.median)} y2={y(s.median)} stroke={Colors.primaryDark} strokeWidth={2} strokeLinecap="round" />
                  </>
                ) : null}
                {group.values.map((v, j) => {
                  const outlier = fences ? v < fences.lower || v > fences.upper : false;
                  // deslocamento determinístico para os pontos não se sobreporem
                  const jitter = (((j * 7919) % 17) / 16 - 0.5) * boxW * 0.9;
                  return outlier ? (
                    <Circle key={j} cx={cx + jitter} cy={y(v)} r={4} fill={Colors.surface} stroke={Colors.warning} strokeWidth={2} />
                  ) : (
                    <Circle key={j} cx={cx + jitter} cy={y(v)} r={2.5} fill={Colors.primary} fillOpacity={0.55} />
                  );
                })}
                <SvgText x={cx} y={height - 14} fontSize={11} fill={Colors.text} textAnchor="middle" fontWeight={selected === i ? '700' : '400'}>
                  {group.label.length > 10 ? `${group.label.slice(0, 9)}…` : group.label}
                </SvgText>
                <SvgText x={cx} y={height - 2} fontSize={9} fill={Colors.textSecondary} textAnchor="middle">
                  n={group.values.length}
                </SvgText>
              </G>
            );
          })}
          {unit ? (
            <SvgText x={4} y={PAD.top - 2} fontSize={10} fill={Colors.textSecondary}>
              {unit}
            </SvgText>
          ) : null}
        </Svg>
      ) : null}
      {groups.length === 0 ? <Text style={styles.empty}>Sem valores numéricos para esta variável.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { position: 'absolute', top: '45%', alignSelf: 'center', color: Colors.textSecondary, fontSize: 13 },
});
