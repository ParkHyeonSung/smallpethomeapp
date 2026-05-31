import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/src/constants/colors';

type MetricBarItem = {
  label: string;
  value: number;
  maxValue: number;
  displayValue: string;
  color?: string;
};

type MetricBarChartProps = {
  items: MetricBarItem[];
};

function MetricBar({ label, value, maxValue, displayValue, color }: MetricBarItem) {
  const animatedWidth = useRef(new Animated.Value(0)).current;
  const ratio = maxValue > 0 ? Math.min(value / maxValue, 1) : 0;

  const barColor = color ?? getAutoColor(ratio);

  useEffect(() => {
    animatedWidth.setValue(0);
    Animated.timing(animatedWidth, {
      toValue: ratio * 100,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [ratio, animatedWidth]);

  const widthPercent = animatedWidth.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.barTrack}>
        <Animated.View
          style={[
            styles.barFill,
            { width: widthPercent, backgroundColor: barColor },
          ]}
        />
      </View>
      <Text style={[styles.barValue, { color: barColor }]}>{displayValue}</Text>
    </View>
  );
}

function getAutoColor(ratio: number) {
  if (ratio >= 0.7) return '#C94444';
  if (ratio >= 0.4) return '#D4930D';
  return '#2E9A6B';
}

export default function MetricBarChart({ items }: MetricBarChartProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>항목별 측정 결과</Text>
      {items.map((item) => (
        <MetricBar key={item.label} {...item} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
    paddingVertical: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  barLabel: {
    width: 60,
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  barTrack: {
    flex: 1,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#E8E2D6',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 7,
  },
  barValue: {
    width: 62,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
  },
});
