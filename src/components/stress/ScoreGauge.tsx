import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/src/constants/colors';

type ScoreGaugeProps = {
  score: number;
  level: 'stable' | 'caution' | 'warning';
  label: string;
};

const LEVEL_COLOR: Record<ScoreGaugeProps['level'], string> = {
  stable: '#2E9A6B',
  caution: '#D4930D',
  warning: '#C94444',
};

const LEVEL_BG: Record<ScoreGaugeProps['level'], string> = {
  stable: '#E7F6EF',
  caution: '#FFF3D6',
  warning: '#FDECEC',
};

const GAUGE_SIZE = 200;
const STROKE_WIDTH = 16;
const RADIUS = (GAUGE_SIZE - STROKE_WIDTH) / 2;

export default function ScoreGauge({ score, level, label }: ScoreGaugeProps) {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const clampedScore = Math.min(Math.max(score, 0), 100);
  const accentColor = LEVEL_COLOR[level];
  const bgColor = LEVEL_BG[level];

  useEffect(() => {
    animatedValue.setValue(0);
    Animated.timing(animatedValue, {
      toValue: clampedScore,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [clampedScore, animatedValue]);

  // 반원(180도) 기준으로 score를 각도로 변환
  const needleRotation = animatedValue.interpolate({
    inputRange: [0, 100],
    outputRange: ['-90deg', '90deg'],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      <View style={[styles.gaugeOuter, { width: GAUGE_SIZE, height: GAUGE_SIZE / 2 + 20 }]}>
        {/* 배경 반원 */}
        <View
          style={[
            styles.halfCircle,
            {
              width: GAUGE_SIZE,
              height: GAUGE_SIZE / 2,
              borderTopLeftRadius: RADIUS + STROKE_WIDTH / 2,
              borderTopRightRadius: RADIUS + STROKE_WIDTH / 2,
              borderColor: '#E8E2D6',
              borderWidth: STROKE_WIDTH,
              borderBottomWidth: 0,
            },
          ]}
        />

        {/* 활성 반원 — 왼쪽 반 */}
        <View style={[styles.arcMask, { width: GAUGE_SIZE / 2, left: 0 }]}>
          <Animated.View
            style={[
              styles.arcFill,
              {
                width: GAUGE_SIZE,
                height: GAUGE_SIZE / 2,
                borderTopLeftRadius: RADIUS + STROKE_WIDTH / 2,
                borderTopRightRadius: RADIUS + STROKE_WIDTH / 2,
                borderColor: accentColor,
                borderWidth: STROKE_WIDTH,
                borderBottomWidth: 0,
                left: 0,
                transform: [
                  { translateX: GAUGE_SIZE / 4 },
                  {
                    rotate: animatedValue.interpolate({
                      inputRange: [0, 50],
                      outputRange: ['-180deg', '0deg'],
                      extrapolate: 'clamp',
                    }),
                  },
                  { translateX: -(GAUGE_SIZE / 4) },
                ],
              },
            ]}
          />
        </View>

        {/* 활성 반원 — 오른쪽 반 */}
        <View style={[styles.arcMask, { width: GAUGE_SIZE / 2, right: 0 }]}>
          <Animated.View
            style={[
              styles.arcFill,
              {
                width: GAUGE_SIZE,
                height: GAUGE_SIZE / 2,
                borderTopLeftRadius: RADIUS + STROKE_WIDTH / 2,
                borderTopRightRadius: RADIUS + STROKE_WIDTH / 2,
                borderColor: accentColor,
                borderWidth: STROKE_WIDTH,
                borderBottomWidth: 0,
                right: 0,
                transform: [
                  { translateX: -(GAUGE_SIZE / 4) },
                  {
                    rotate: animatedValue.interpolate({
                      inputRange: [50, 100],
                      outputRange: ['-180deg', '0deg'],
                      extrapolate: 'clamp',
                    }),
                  },
                  { translateX: GAUGE_SIZE / 4 },
                ],
              },
            ]}
          />
        </View>

        {/* 바늘 */}
        <View style={styles.needleCenter}>
          <Animated.View
            style={[
              styles.needle,
              { transform: [{ rotate: needleRotation }] },
            ]}>
            <View style={[styles.needleLine, { backgroundColor: accentColor }]} />
          </Animated.View>
          <View style={[styles.needleDot, { backgroundColor: accentColor }]} />
        </View>

        {/* 점수 텍스트 */}
        <View style={styles.scoreTextWrap}>
          <Text style={[styles.scoreNumber, { color: accentColor }]}>{clampedScore}</Text>
          <Text style={styles.scoreUnit}>/ 100</Text>
        </View>
      </View>

      {/* 등급 배지 */}
      <View style={[styles.levelPill, { backgroundColor: bgColor }]}>
        <Text style={[styles.levelPillText, { color: accentColor }]}>{label}</Text>
      </View>

      {/* 범례 */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: LEVEL_COLOR.stable }]} />
          <Text style={styles.legendText}>적합 0~27</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: LEVEL_COLOR.caution }]} />
          <Text style={styles.legendText}>주의 28~54</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: LEVEL_COLOR.warning }]} />
          <Text style={styles.legendText}>부적합 55+</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 12,
  },
  gaugeOuter: {
    position: 'relative',
    alignItems: 'center',
    overflow: 'hidden',
  },
  halfCircle: {
    position: 'absolute',
    top: 0,
    backgroundColor: 'transparent',
  },
  arcMask: {
    position: 'absolute',
    top: 0,
    height: '100%',
    overflow: 'hidden',
  },
  arcFill: {
    position: 'absolute',
    top: 0,
    backgroundColor: 'transparent',
  },
  needleCenter: {
    position: 'absolute',
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  needle: {
    width: RADIUS - 8,
    height: 2,
    position: 'absolute',
    right: '50%',
    transformOrigin: 'right center',
  },
  needleLine: {
    width: '100%',
    height: 3,
    borderRadius: 2,
  },
  needleDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  scoreTextWrap: {
    position: 'absolute',
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  scoreNumber: {
    fontSize: 36,
    fontWeight: '900',
    lineHeight: 40,
  },
  scoreUnit: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textMuted,
    paddingBottom: 4,
  },
  levelPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  levelPillText: {
    fontSize: 14,
    fontWeight: '800',
  },
  legendRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
});
