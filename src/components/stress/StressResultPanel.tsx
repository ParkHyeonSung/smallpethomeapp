import type { ReactNode } from 'react';
import { DimensionValue, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/src/constants/colors';

export type StressResultFrequencyView = {
  peakFrequencyHz: number;
  dominantBand: string;
  highFrequencyLevel: string;
  lowFrequencyMarkerLevel: string;
  lowBandRatio: number;
  midBandRatio: number;
  highBandRatio: number;
  summary: string;
  interpretation: string;
};

export type StressResultPanelProps = {
  summaryLabel?: string;
  suitabilityStatus: string;
  summary: string;
  chartWidth: number;
  durationSec: number;
  noise: {
    samples: { timestampMs: number; value: number }[];
    averageDb: number;
    maxDb: number;
    cautionValue: number;
    warningValue: number;
    interpretation: string;
  };
  frequency: StressResultFrequencyView;
  vibration: {
    samples: { timestampMs: number; value: number }[];
    averageState: string;
    peakState: string;
    cautionValue: number;
    warningValue: number;
    interpretation: string;
  };
  actions?: ReactNode;
  showEstimateNotice?: boolean;
};

export function downsamplePeakSamples(samples: { timestampMs: number; value: number }[], maxCount: number) {
  if (samples.length <= maxCount) return samples;

  const bucketSize = Math.ceil(samples.length / maxCount);
  const result: { timestampMs: number; value: number }[] = [];

  for (let index = 0; index < samples.length; index += bucketSize) {
    const bucket = samples.slice(index, index + bucketSize);
    const peak = bucket.reduce((max, sample) => (sample.value > max.value ? sample : max), bucket[0]);
    result.push(peak);
  }

  return result.sort((a, b) => a.timestampMs - b.timestampMs);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatGraphTickLabel(seconds: number, durationSec: number) {
  if (durationSec > 120) {
    return `${Math.round(seconds / 60)}m`;
  }

  return `${seconds}s`;
}

function getSuitabilityStatusTone(status: string) {
  if (status.includes('부적합')) {
    return {
      backgroundColor: '#FCE4E4',
      color: '#B42318',
    };
  }

  if (status.includes('주의')) {
    return {
      backgroundColor: '#FFF2CC',
      color: '#8A5A00',
    };
  }

  return {
    backgroundColor: '#DFF3E8',
    color: '#1F7A4D',
  };
}

type RiskGraphProps = {
  title: string;
  unit: string;
  maxValue: number;
  cautionValue: number;
  warningValue: number;
  stats: { label: string; value: string }[];
  samples: { timestampMs: number; value: number }[];
  chartWidth: number;
  durationSec: number;
  startAtZero?: boolean;
};

function RiskGraph({
  title,
  unit,
  maxValue,
  cautionValue,
  warningValue,
  stats,
  samples,
  chartWidth,
  durationSec,
  startAtZero = false,
}: RiskGraphProps) {
  const chartHeight = 190;
  const chartPadding = 4;
  const drawableWidth = Math.max(chartWidth - chartPadding * 2, 1);
  const drawableHeight = Math.max(chartHeight - chartPadding * 2, 1);
  const sortedSamples = downsamplePeakSamples(
    samples.filter((sample) => Number.isFinite(sample.value)).sort((a, b) => a.timestampMs - b.timestampMs),
    90
  );
  const startMs = sortedSamples[0]?.timestampMs ?? 0;
  const durationMs = Math.max(durationSec * 1000, 1);
  const graphSamples = sortedSamples.length
    ? [
        ...(startAtZero ? [{ timestampMs: startMs, value: 0 }] : []),
        ...sortedSamples.map((sample, index) =>
          startAtZero && index === 0 ? { ...sample, timestampMs: startMs + 1 } : sample
        ),
      ]
    : [];
  const points = graphSamples.map((sample) => {
    const x = chartPadding + ((sample.timestampMs - startMs) / durationMs) * drawableWidth;
    const y = chartPadding + drawableHeight - (clamp(sample.value, 0, maxValue) / maxValue) * drawableHeight;
    return { x, y };
  });
  const linePoints = points.map((point) => ({
    x: clamp(point.x, chartPadding, chartWidth - chartPadding),
    y: clamp(point.y, chartPadding, chartHeight - chartPadding),
  }));
  const cautionY = chartPadding + drawableHeight - (clamp(cautionValue, 0, maxValue) / maxValue) * drawableHeight;
  const warningY = chartPadding + drawableHeight - (clamp(warningValue, 0, maxValue) / maxValue) * drawableHeight;
  const tickStepSec = durationSec > 120 ? 60 : 10;
  const timeTicks = Array.from(
    { length: Math.floor(durationSec / tickStepSec) + 1 },
    (_, index) => index * tickStepSec
  );

  return (
    <View style={styles.riskGraphCard}>
      <View style={styles.riskGraphHeader}>
        <Text style={styles.riskGraphTitle}>{title}</Text>
        <View style={styles.riskGraphStats}>
          {stats.map((stat) => (
            <View key={`${stat.label}-${stat.value}`} style={styles.riskGraphStatRow}>
              <Text style={styles.riskGraphStatLabel}>{stat.label}</Text>
              <Text style={styles.riskGraphStatValue}>{stat.value}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.chartBlock}>
        <View style={[styles.lineChartWrap, { width: chartWidth }]}>
          <View style={[styles.lineDangerArea, { height: warningY }]} />
          <View style={[styles.lineCautionArea, { top: warningY, height: cautionY - warningY }]} />
          <View style={[styles.lineThresholdHorizontal, { top: warningY }]} />
          <View style={[styles.lineThresholdHorizontal, { top: cautionY }]} />
          <View style={styles.yAxisOverlay}>
            <Text style={styles.axisOverlayText}>
              {Math.round(maxValue)}
              {unit}
            </Text>
            <Text style={styles.axisOverlayText}>
              0{unit}
            </Text>
          </View>
          {timeTicks.map((seconds) => {
            const left = `${((seconds * 1000) / durationMs) * 100}%` as DimensionValue;
            return <View key={seconds} style={[styles.timeTickLine, { left }]} />;
          })}
          {linePoints.slice(1).map((point, index) => {
            const previous = linePoints[index];
            const dx = point.x - previous.x;
            const dy = point.y - previous.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = `${Math.atan2(dy, dx)}rad`;

            return (
              <View
                key={`${point.x}-${index}`}
                style={[
                  styles.lineSegment,
                  {
                    left: previous.x,
                    top: previous.y,
                    width: length,
                    transform: [{ rotate: angle }],
                  },
                ]}
              />
            );
          })}
        </View>
        <View style={[styles.xAxisLabels, { width: chartWidth }]}>
          {timeTicks.map((seconds) => (
            <Text key={seconds} style={styles.axisText}>
              {formatGraphTickLabel(seconds, durationSec)}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

function MeasurementAiBlock({
  label = 'AI 해석',
  interpretation,
}: {
  label?: string;
  interpretation: string;
}) {
  return (
    <View style={styles.measurementAiBlock}>
      <Text style={styles.measurementAiLabel}>{label}</Text>
      <Text style={styles.measurementAiText}>{interpretation}</Text>
    </View>
  );
}

function FrequencyAnalysisCard({
  peakFrequencyHz,
  dominantBand,
  highFrequencyLevel,
  lowFrequencyMarkerLevel,
  lowBandRatio,
  midBandRatio,
  highBandRatio,
  interpretation,
}: StressResultFrequencyView) {
  const hasFrequencyData = peakFrequencyHz > 0 && lowBandRatio + midBandRatio + highBandRatio > 0;
  const bars = [
    { label: '낮은 대역', value: lowBandRatio },
    { label: '중간 대역', value: midBandRatio },
    { label: '높은 대역', value: highBandRatio },
  ];

  return (
    <View style={styles.frequencyAnalysisCard}>
      <View style={styles.frequencyAnalysisHeader}>
        <Text style={styles.frequencyAnalysisTitle}>소리 대역 분석</Text>
      </View>
      <Text style={styles.frequencyAnalysisNote}>
        대역 분포는 소리의 성격을 보는 참고값이며, 적합 여부는 소음과 진동으로만 반영합니다.
      </Text>
      <View style={styles.frequencyMetricGrid}>
        <View style={styles.frequencyMetricItem}>
          <Text style={styles.frequencyMetricLabel}>가장 큰 피크</Text>
          <Text style={styles.frequencyMetricValue}>{peakFrequencyHz > 0 ? `${Math.round(peakFrequencyHz)} Hz` : '-'}</Text>
        </View>
        <View style={styles.frequencyMetricItem}>
          <Text style={styles.frequencyMetricLabel}>주로 감지된 대역</Text>
          <Text style={styles.frequencyMetricValue}>{dominantBand}</Text>
        </View>
        <View style={styles.frequencyMetricItem}>
          <Text style={styles.frequencyMetricLabel}>저주파 표지</Text>
          <Text style={styles.frequencyMetricValue}>{hasFrequencyData ? lowFrequencyMarkerLevel : '-'}</Text>
        </View>
        <View style={styles.frequencyMetricItem}>
          <Text style={styles.frequencyMetricLabel}>높은 대역 수준</Text>
          <Text style={styles.frequencyMetricValue}>{hasFrequencyData ? highFrequencyLevel : '-'}</Text>
        </View>
      </View>

      {hasFrequencyData ? (
        <View style={styles.frequencyBars}>
          <Text style={styles.frequencyBarsTitle}>대역 비율</Text>
          {bars.map((bar) => (
            <View key={bar.label} style={styles.frequencyBarRow}>
              <View style={styles.frequencyBarLabelRow}>
                <Text style={styles.frequencyBarLabel}>{bar.label}</Text>
                <Text style={styles.frequencyBarValue}>{Math.round(bar.value * 100)}%</Text>
              </View>
              <View style={styles.frequencyBarTrack}>
                <View
                  style={[
                    styles.frequencyBarFill,
                    { width: `${Math.max(6, Math.round(bar.value * 100))}%` as DimensionValue },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.frequencyTextBlock}>
        <Text style={styles.frequencyTextLabel}>주파수 해석</Text>
        <Text style={styles.frequencyAnalysisText}>{interpretation}</Text>
      </View>
    </View>
  );
}

function getCompactVibrationState(state: string) {
  if (state.includes('강한')) return '강함';
  if (state.includes('주의')) return '주의 필요';
  if (state.includes('약한')) return '약함';
  if (state.includes('안정')) return '안정';
  return state;
}

export default function StressResultPanel({
  suitabilityStatus,
  summary,
  chartWidth,
  durationSec,
  noise,
  frequency,
  vibration,
  actions,
  showEstimateNotice,
}: StressResultPanelProps) {
  const suitabilityTone = getSuitabilityStatusTone(suitabilityStatus);

  return (
    <View style={styles.resultLayout}>
      <View style={styles.resultSummaryCard}>
        <View style={[styles.resultSummaryStatusBadge, { backgroundColor: suitabilityTone.backgroundColor }]}>
          <Text style={[styles.resultSummaryStatus, { color: suitabilityTone.color }]}>
            {suitabilityStatus}
          </Text>
        </View>
        <Text style={styles.resultSummaryText}>{summary}</Text>
      </View>

      <RiskGraph
        title="소음 변화"
        unit="dB"
        maxValue={100}
        cautionValue={noise.cautionValue}
        warningValue={noise.warningValue}
        chartWidth={chartWidth}
        durationSec={durationSec}
        samples={noise.samples}
        stats={[
          { label: '평균', value: `${noise.averageDb} dB` },
          { label: '최대', value: `${noise.maxDb} dB` },
        ]}
      />
      <MeasurementAiBlock label="소음 해석" interpretation={noise.interpretation} />
      <FrequencyAnalysisCard {...frequency} />

      <RiskGraph
        title="진동 변화"
        unit=""
        maxValue={10}
        cautionValue={vibration.cautionValue}
        warningValue={vibration.warningValue}
        chartWidth={chartWidth}
        durationSec={durationSec}
        startAtZero
        samples={vibration.samples}
        stats={[
          { label: '평균 상태', value: getCompactVibrationState(vibration.averageState) },
          { label: '순간 피크', value: getCompactVibrationState(vibration.peakState) },
        ]}
      />
      <MeasurementAiBlock label="진동 해석" interpretation={vibration.interpretation} />

      {actions ? <View style={styles.resultActions}>{actions}</View> : null}
      {showEstimateNotice ? (
        <Text style={styles.estimateNotice}>스마트폰 센서 기반 추정값입니다. 참고용으로 확인해 주세요.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  resultLayout: {
    gap: 14,
    marginTop: 6,
    paddingVertical: 4,
  },
  resultSummaryCard: {
    gap: 10,
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resultSummaryStatusBadge: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 78,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 10,
  },
  resultSummaryStatus: {
    fontSize: 31,
    lineHeight: 38,
    fontWeight: '900',
  },
  resultSummaryText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
  },
  riskGraphCard: {
    gap: 9,
  },
  riskGraphHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },
  riskGraphTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  riskGraphStats: {
    alignItems: 'flex-end',
    gap: 4,
  },
  riskGraphStatRow: {
    alignItems: 'flex-end',
    gap: 1,
  },
  riskGraphStatLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  riskGraphStatValue: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  chartBlock: {
    alignItems: 'center',
  },
  axisText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
  },
  lineChartWrap: {
    position: 'relative',
    height: 190,
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: '#DDEFE6',
    alignSelf: 'center',
  },
  yAxisOverlay: {
    position: 'absolute',
    top: 5,
    bottom: 5,
    left: 6,
    justifyContent: 'space-between',
    zIndex: 2,
  },
  axisOverlayText: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(28, 28, 30, 0.5)',
  },
  xAxisLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  lineDangerArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#EFB8B8',
  },
  lineCautionArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#F2E4A8',
  },
  lineThresholdHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(28, 28, 30, 0.16)',
  },
  timeTickLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(28, 28, 30, 0.08)',
  },
  lineSegment: {
    position: 'absolute',
    height: 1,
    borderRadius: 1,
    backgroundColor: colors.primaryStrong,
    transformOrigin: '0px 0.5px',
  },
  measurementAiBlock: {
    gap: 5,
    paddingHorizontal: 2,
    paddingBottom: 4,
  },
  measurementAiLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primaryStrong,
  },
  measurementAiText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
  },
  frequencyAnalysisCard: {
    gap: 9,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  frequencyAnalysisHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  frequencyAnalysisTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  frequencyAnalysisNote: {
    marginTop: -3,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
  },
  frequencyMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  frequencyMetricItem: {
    width: '48.5%',
    gap: 3,
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
  },
  frequencyMetricLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
  },
  frequencyMetricValue: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  frequencyBars: {
    gap: 7,
  },
  frequencyBarsTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.text,
  },
  frequencyBarRow: {
    gap: 5,
  },
  frequencyBarLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  frequencyBarLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  frequencyBarValue: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  frequencyBarTrack: {
    height: 8,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
  },
  frequencyBarFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.primaryStrong,
  },
  frequencyAnalysisText: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textMuted,
  },
  frequencyTextBlock: {
    gap: 4,
  },
  frequencyTextLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primaryStrong,
  },
  resultActions: {
    gap: 10,
  },
  estimateNotice: {
    marginTop: -4,
    paddingHorizontal: 2,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
    opacity: 0.78,
    textAlign: 'center',
  },
});
