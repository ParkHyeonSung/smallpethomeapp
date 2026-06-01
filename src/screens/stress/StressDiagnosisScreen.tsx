import { useEffect, useMemo, useRef, useState } from 'react';

import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { router } from 'expo-router';
import { Accelerometer } from 'expo-sensors';
import { Alert, DimensionValue, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { EmitterSubscription } from 'react-native';

import ScreenContainer from '@/src/components/common/ScreenContainer';
import { colors } from '@/src/constants/colors';
import {
  addAndroidAudioAnalyzerListener,
  AndroidAudioAnalyzerSnapshot,
  isAndroidAudioAnalyzerAvailable,
  mapRmsDbToApproxDisplayDb,
  startAndroidAudioAnalyzer,
  stopAndroidAudioAnalyzer,
} from '@/src/lib/android-audio-analyzer';
import {
  NoisePatternSample,
  VibrationPatternSample,
} from '@/src/lib/stress-patterns';
import {
  buildStressAiPayload,
  generateStressAiResult,
  StressAiResult,
} from '@/src/lib/stress-ai';
import {
  buildStressDiagnosisReport,
  StressDiagnosisInput,
} from '@/src/lib/stress-diagnosis';
import { saveStressReport } from '@/src/lib/stress-reports';
import {
  resolveStressAnimalGroup,
  STRESS_ANIMAL_CATEGORY_OPTIONS,
  StressAnimalCategory,
} from '@/src/lib/stress-animal-groups';

const recorderOptions = {
  ...RecordingPresets.LOW_QUALITY,
  isMeteringEnabled: true,
};

const MEASUREMENT_OPTIONS = {
  quick: {
    label: '빠른 측정',
    durationSec: 60,
    description: '현재 환경을 빠르게 확인합니다.',
  },
  precise: {
    label: '정밀 측정',
    durationSec: 600,
    description: '더 길게 측정해 환경 변동을 더 많이 반영합니다.',
  },
} as const;

const VIBRATION_SAMPLE_INTERVAL_MS = 5;

type MeasurementType = keyof typeof MEASUREMENT_OPTIONS;
type Step = 'select' | 'sunlight' | 'measuring' | 'result';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function mapMeteringToDb(metering: number) {
  return Math.round(clamp(metering + 100, 35, 100));
}

function mapVibrationRmsToLevel(rms: number) {
  return clamp(Math.round(rms * 42), 0, 10);
}

function downsamplePeakSamples(samples: { timestampMs: number; value: number }[], maxCount: number) {
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

type RiskGraphProps = {
  title: string;
  unit: string;
  maxValue: number;
  cautionValue: number;
  warningValue: number;
  stats: string[];
  samples: { timestampMs: number; value: number }[];
  chartWidth: number;
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
  const endMs = sortedSamples[sortedSamples.length - 1]?.timestampMs ?? startMs + 1;
  const durationMs = Math.max(endMs - startMs, 1);
  const graphSamples = sortedSamples.length
    ? [
        { timestampMs: startMs, value: 0 },
        ...sortedSamples.map((sample, index) =>
          index === 0 ? { ...sample, timestampMs: startMs + 1 } : sample
        ),
      ]
    : [];
  const points = graphSamples.map((sample) => {
    const x = chartPadding + ((sample.timestampMs - startMs) / durationMs) * drawableWidth;
    const y = chartPadding + drawableHeight - (clamp(sample.value, 0, maxValue) / maxValue) * drawableHeight;
    return { x, y, value: sample.value };
  });
  const linePoints = points.map((point) => ({
    x: clamp(point.x, chartPadding, chartWidth - chartPadding),
    y: clamp(point.y, chartPadding, chartHeight - chartPadding),
  }));
  const cautionY = chartPadding + drawableHeight - (clamp(cautionValue, 0, maxValue) / maxValue) * drawableHeight;
  const warningY = chartPadding + drawableHeight - (clamp(warningValue, 0, maxValue) / maxValue) * drawableHeight;
  const tenSecondTicks = Array.from(
    { length: Math.floor(durationMs / 10_000) + 1 },
    (_, index) => index * 10
  );

  return (
    <View style={styles.riskGraphCard}>
      <View style={styles.riskGraphHeader}>
        <Text style={styles.riskGraphTitle}>{title}</Text>
        <View style={styles.riskGraphStats}>
          {stats.map((stat) => (
            <Text key={stat} style={styles.riskGraphStatText}>
              {stat}
            </Text>
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
              <Text style={styles.axisOverlayText}>{Math.round(maxValue)}{unit}</Text>
              <Text style={styles.axisOverlayText}>0{unit}</Text>
            </View>
            {tenSecondTicks.map((seconds) => {
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
            {tenSecondTicks.map((seconds) => (
              <Text key={seconds} style={styles.axisText}>
                {seconds}s
              </Text>
            ))}
          </View>
      </View>

    </View>
  );
}

function getAverageValue(values: number[], fallback: number) {
  const finiteValues = values.filter(Number.isFinite);
  if (!finiteValues.length) return fallback;

  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
}

function getMaxValue(values: number[], fallback: number) {
  const finiteValues = values.filter(Number.isFinite);
  if (!finiteValues.length) return fallback;

  return Math.max(...finiteValues);
}

function getPercentileValue(values: number[], percentile: number, fallback: number) {
  const finiteValues = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finiteValues.length) return fallback;

  const index = Math.min(finiteValues.length - 1, Math.max(0, Math.ceil(finiteValues.length * percentile) - 1));
  return finiteValues[index];
}

function getSuitabilityLabel(level: string) {
  if (level === 'warning') return '부적합';
  if (level === 'caution') return '주의 필요';
  return '적합';
}

function getNoiseAiInterpretation(averageDb: number, maxDb: number, animalLabel: string) {
  const averageText =
    averageDb >= 75
      ? '생활 소음이 계속 크게 느껴질 수 있는 수준'
      : averageDb >= 65
        ? '주변 생활 소음이 어느 정도 있는 수준'
        : '큰 소음이 오래 이어지지는 않은 수준';
  const maxText =
    maxDb >= 90
      ? '사육장 위치로는 부담이 큰 순간 소음'
      : maxDb >= 80
        ? '갑자기 큰 소리가 들어온 구간'
        : maxDb >= 65
          ? '일상적인 소리 변화가 들어온 구간'
          : '큰 소리 변화가 두드러지지 않은 구간';

  if (maxDb >= 90) {
    return `평균 ${averageDb} dB는 ${averageText}입니다. 최대 ${maxDb} dB는 ${animalLabel}에게 부담이 될 수 있는 ${maxText}으로, TV·스피커·청소기·문 여닫힘 같은 소음원을 확인해 주세요.`;
  }

  if (maxDb >= 80) {
    return `평균 ${averageDb} dB는 ${averageText}입니다. 최대 ${maxDb} dB는 ${maxText}으로, 같은 소리가 반복되는 위치인지 확인하는 것이 좋습니다.`;
  }

  if (averageDb >= 65) {
    return `평균 ${averageDb} dB는 ${averageText}입니다. 최대 ${maxDb} dB는 ${maxText}이라서, 바로 부적합으로 보긴 어렵지만 더 조용한 위치와 비교해 볼 수 있습니다.`;
  }

  return `평균 ${averageDb} dB는 ${averageText}입니다. 최대 ${maxDb} dB도 ${maxText}이라서, 측정 시간 기준으로는 소음이 크게 두드러지지 않았습니다.`;
}

function getVibrationStateLabel(level: number) {
  if (level >= 8) return '강한 흔들림';
  if (level >= 6) return '뚜렷한 흔들림';
  if (level >= 3) return '약한 흔들림';
  return '안정';
}

function getVibrationAiInterpretation(averageState: string, peakState: string) {
  if (peakState === '강한 흔들림') {
    return `측정 대부분의 시간에는 ${averageState} 상태로 해석됩니다. 다만 짧게 강한 흔들림이 감지된 순간이 있어, 스피커·세탁기·냉장고·흔들리는 선반처럼 진동이 케이지로 이어질 수 있는 물건을 확인해 주세요.`;
  }

  if (peakState === '뚜렷한 흔들림') {
    return `측정 대부분의 시간에는 ${averageState} 상태로 해석됩니다. 일부 구간에서 흔들림이 뚜렷하게 나타났으므로 받침대가 단단한지, 사람이 자주 건드리는 위치는 아닌지 확인하는 것이 좋습니다.`;
  }

  if (averageState === '약한 흔들림' || peakState === '약한 흔들림') {
    return `측정 중 약한 흔들림이 일부 감지되었습니다. 장시간 머무르는 사육장 위치라면 더 안정적인 바닥이나 받침대와 비교해 볼 수 있습니다.`;
  }

  return `측정 시간 동안 큰 흔들림은 두드러지지 않았습니다. 현재 위치는 진동 면에서는 비교적 안정적으로 볼 수 있습니다.`;
}

function getVibrationSummary(averageState: string, peakState: string) {
  if (peakState === '강한 흔들림') {
    return {
      averageState,
      peakState: '짧게 큰 흔들림 감지',
      pattern: averageState === '안정' ? '순간 피크' : '강한 흔들림 구간',
      meaning:
        averageState === '안정'
          ? '대부분의 시간에는 흔들림이 크지 않았지만, 측정 중 짧은 순간 큰 흔들림이 감지되었습니다.'
          : '측정 중 흔들림이 있는 상태에서 짧게 더 큰 흔들림이 함께 감지되었습니다.',
      guidance:
        '받침대, 선반, 주변 기기 진동 또는 측정 중 휴대폰 움직임을 확인하세요.',
    };
  }

  if (peakState === '뚜렷한 흔들림') {
    return {
      averageState,
      peakState,
      pattern: averageState === '안정' ? '일부 구간 흔들림' : '반복 가능 흔들림',
      meaning:
        averageState === '안정'
          ? '대부분의 시간에는 안정적이지만, 일부 구간에서 뚜렷한 흔들림이 감지되었습니다.'
          : '측정 중 흔들림이 비교적 자주 감지되어 받침대나 주변 기기 영향을 확인할 필요가 있습니다.',
      guidance:
        '사육장을 올릴 받침대가 단단한지, 사람이 자주 건드리는 책상이나 선반은 아닌지 확인하세요.',
    };
  }

  if (averageState === '약한 흔들림' || peakState === '약한 흔들림') {
    return {
      averageState,
      peakState,
      pattern: '약한 흔들림',
      meaning: '측정 중 약한 흔들림이 일부 감지되었습니다.',
      guidance: '장시간 사육장 위치로 쓸 곳이라면 더 안정적인 바닥이나 받침대와 비교해 보세요.',
    };
  }

  return {
    averageState,
    peakState,
    pattern: '안정',
    meaning: '측정 시간 동안 큰 흔들림은 두드러지지 않았습니다.',
    guidance: '현재 위치는 진동 면에서는 비교적 안정적으로 볼 수 있습니다.',
  };
}

function getNoiseFrequencySummary(samples: NoisePatternSample[]) {
  const validSamples = samples.filter((sample) => sample.peakFrequencyHz > 0);
  if (!validSamples.length) {
    return {
      peakFrequencyHz: 0,
      dominantBand: '분석 대기',
      highFrequencyLevel: '낮음',
      lowFrequencyMarkerLevel: '낮음',
      lowBandRatio: 0,
      midBandRatio: 0,
      highBandRatio: 0,
      summary: '주파수 분석을 위한 소음 샘플이 아직 충분하지 않습니다.',
    };
  }

  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  const peakFrequencyHz = validSamples.reduce((max, sample) =>
    sample.approxDb > max.approxDb ? sample : max
  ).peakFrequencyHz;
  const lowBand = average(validSamples.map((sample) => sample.lowBandLevel));
  const midBand = average(validSamples.map((sample) => sample.midBandLevel));
  const highBand = average(validSamples.map((sample) => sample.highBandLevel));
  const lowMarker = average(
    validSamples.map((sample) => Math.max(sample.marker32HzLevel, sample.marker125HzLevel))
  );
  const dominantBand =
    lowBand >= midBand && lowBand >= highBand
      ? '저주파'
      : highBand >= lowBand && highBand >= midBand
        ? '고주파'
        : '중주파';
  const highFrequencyLevel = highBand >= 0.55 ? '높음' : highBand >= 0.3 ? '보통' : '낮음';
  const lowFrequencyMarkerLevel = lowMarker >= 0.55 ? '높음' : lowMarker >= 0.3 ? '보통' : '낮음';
  const maxBand = Math.max(lowBand, midBand, highBand, 0.01);

  const summary =
    dominantBand === '저주파'
      ? '낮은 대역의 소리가 함께 감지되어 가전제품의 웅웅거림이나 바닥을 타고 전달되는 소리를 확인해 볼 수 있습니다.'
      : dominantBand === '고주파'
        ? '높은 대역의 소리가 함께 감지되어 전자기기음, 금속성 울림, 삐 소리 같은 자극을 확인해 볼 수 있습니다.'
        : '일반 생활 소음에 가까운 중간 대역이 주로 감지되었습니다.';

  return {
    peakFrequencyHz,
    dominantBand,
    highFrequencyLevel,
    lowFrequencyMarkerLevel,
    lowBandRatio: clamp(lowBand / maxBand, 0, 1),
    midBandRatio: clamp(midBand / maxBand, 0, 1),
    highBandRatio: clamp(highBand / maxBand, 0, 1),
    summary,
  };
}

type MeasurementAiBlockProps = {
  interpretation: string;
};

function MeasurementAiBlock({ interpretation }: MeasurementAiBlockProps) {
  return (
    <View style={styles.measurementAiBlock}>
      <Text style={styles.measurementAiLabel}>AI 해석</Text>
      <Text style={styles.measurementAiText}>{interpretation}</Text>
    </View>
  );
}

type FrequencyAnalysisCardProps = {
  dominantBand: string;
  highFrequencyLevel: string;
  lowFrequencyMarkerLevel: string;
  lowBandRatio: number;
  midBandRatio: number;
  highBandRatio: number;
  summary: string;
};

function FrequencyAnalysisCard({
  lowBandRatio,
  midBandRatio,
  highBandRatio,
  summary,
}: FrequencyAnalysisCardProps) {
  const bars = [
    { label: '낮은 대역', value: lowBandRatio },
    { label: '중간 대역', value: midBandRatio },
    { label: '높은 대역', value: highBandRatio },
  ];

  return (
    <View style={styles.frequencyAnalysisCard}>
      <View style={styles.frequencyAnalysisHeader}>
        <Text style={styles.frequencyAnalysisTitle}>주파수 분석</Text>
      </View>
      <View style={styles.frequencyBars}>
        {bars.map((bar) => (
          <View key={bar.label} style={styles.frequencyBarRow}>
            <Text style={styles.frequencyBarLabel}>{bar.label}</Text>
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
      <Text style={styles.frequencyAnalysisText}>{summary}</Text>
    </View>
  );
}

type BooleanFieldProps = {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
};

function BooleanField({ label, value, onChange }: BooleanFieldProps) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.choiceRow}>
        <Pressable
          style={[styles.choiceChip, value && styles.choiceChipActive]}
          onPress={() => onChange(true)}>
          <Text style={[styles.choiceChipText, value && styles.choiceChipTextActive]}>예</Text>
        </Pressable>
        <Pressable
          style={[styles.choiceChip, !value && styles.choiceChipActive]}
          onPress={() => onChange(false)}>
          <Text style={[styles.choiceChipText, !value && styles.choiceChipTextActive]}>아니오</Text>
        </Pressable>
      </View>
    </View>
  );
}

function formatDurationLabel(durationSec: number) {
  if (durationSec >= 60) {
    const minutes = Math.round(durationSec / 60);
    return `약 ${minutes}분 소요`;
  }

  return `약 ${durationSec}초 소요`;
}

function formatCountdown(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export default function StressDiagnosisScreen() {
  const isWeb = Platform.OS === 'web';
  const { width } = useWindowDimensions();
  const audioRecorder = useAudioRecorder(recorderOptions);
  const recorderState = useAudioRecorderState(audioRecorder, 150);

  const vibrationSubscriptionRef = useRef<ReturnType<typeof Accelerometer.addListener> | null>(null);
  const audioAnalyzerSubscriptionRef = useRef<EmitterSubscription | null>(null);
  const latestAudioSnapshotRef = useRef<AndroidAudioAnalyzerSnapshot | null>(null);
  const noisePatternSamplesRef = useRef<NoisePatternSample[]>([]);
  const vibrationPatternSamplesRef = useRef<VibrationPatternSample[]>([]);
  const latestMeteringRef = useRef<number | null>(null);
  const measurementRunIdRef = useRef(0);

  const [step, setStep] = useState<Step>('select');
  const [measurementType, setMeasurementType] = useState<MeasurementType>('quick');
  const [animalCategory, setAnimalCategory] = useState<StressAnimalCategory>('rodent');
  const [species, setSpecies] = useState<string>('마우스·랫');
  const [ambientNoiseDb, setAmbientNoiseDb] = useState('');
  const [vibrationLevel, setVibrationLevel] = useState(0);
  const [directSunlight, setDirectSunlight] = useState(false);

  const [isMeasuringNoise, setIsMeasuringNoise] = useState(false);
  const [isSavingReport, setIsSavingReport] = useState(false);
  const [isRunningMeasurement, setIsRunningMeasurement] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [aiResult, setAiResult] = useState<StressAiResult | null>(null);

  const selectedOption = MEASUREMENT_OPTIONS[measurementType];
  const selectedAnimalCategory = useMemo(
    () =>
      STRESS_ANIMAL_CATEGORY_OPTIONS.find((categoryOption) => categoryOption.category === animalCategory) ??
      STRESS_ANIMAL_CATEGORY_OPTIONS[0],
    [animalCategory]
  );
  const animalGroupInfo = useMemo(() => resolveStressAnimalGroup(species), [species]);

  const diagnosisInput = useMemo<StressDiagnosisInput>(
    () => ({
      species,
      cageWidthCm: null,
      cageDepthCm: null,
      ambientNoiseDb: ambientNoiseDb ? Number(ambientNoiseDb) : 0,
      vibrationLevel,
      trafficLevel: 'low',
      hideoutReady: true,
      ventilationReady: true,
      directSunlight,
      nearSpeaker: false,
      unstableFloor: false,
      measurementMode: measurementType === 'precise' ? 'peak' : 'current',
    }),
    [ambientNoiseDb, directSunlight, measurementType, species, vibrationLevel]
  );

  const report = useMemo(() => buildStressDiagnosisReport(diagnosisInput), [diagnosisInput]);
  const noiseValue = ambientNoiseDb ? Number(ambientNoiseDb) : 0;
  const noiseWarningValue = animalGroupInfo.noiseWarningDb ?? Math.min(animalGroupInfo.noiseCautionDb + 10, 100);
  const resultChartWidth = Math.max(240, Math.min(640, width - 80));
  const noiseSamples = noisePatternSamplesRef.current.map((sample) => ({
    timestampMs: sample.timestampMs,
    value: sample.approxDb,
  }));
  const frequencySummary = getNoiseFrequencySummary(noisePatternSamplesRef.current);
  const noiseAverageValue = Math.round(getAverageValue(noiseSamples.map((sample) => sample.value), noiseValue));
  const noiseMaxValue = Math.round(getMaxValue(noiseSamples.map((sample) => sample.value), noiseValue));
  const vibrationSamplesLevel = vibrationPatternSamplesRef.current.map((sample) => ({
    timestampMs: sample.timestampMs,
    value: mapVibrationRmsToLevel(sample.value),
  }));
  const vibrationAverageLevel = Math.round(
    getAverageValue(vibrationSamplesLevel.map((sample) => sample.value), vibrationLevel)
  );
  const vibrationPeakLevel = Math.round(
    getPercentileValue(vibrationSamplesLevel.map((sample) => sample.value), 0.95, vibrationLevel)
  );
  const vibrationAverageState = getVibrationStateLabel(vibrationAverageLevel);
  const vibrationPeakState = getVibrationStateLabel(vibrationPeakLevel);
  const vibrationSummary = useMemo(
    () => getVibrationSummary(vibrationAverageState, vibrationPeakState),
    [vibrationAverageState, vibrationPeakState]
  );
  const noiseAiInterpretation = getNoiseAiInterpretation(noiseAverageValue, noiseMaxValue, animalGroupInfo.label);
  const vibrationAiInterpretation = getVibrationAiInterpretation(vibrationAverageState, vibrationPeakState);
  const displayNoiseInterpretation = aiResult?.noiseInterpretation ?? noiseAiInterpretation;
  const displayVibrationInterpretation = aiResult?.vibrationInterpretation ?? vibrationAiInterpretation;
  const vibrationMaxValue = 10;

  useEffect(() => {
    if (!isMeasuringNoise || recorderState.metering === undefined) {
      return;
    }

    latestMeteringRef.current = recorderState.metering;
  }, [isMeasuringNoise, recorderState.metering]);

  useEffect(() => {
    return () => {
      vibrationSubscriptionRef.current?.remove();
      audioAnalyzerSubscriptionRef.current?.remove();
      void stopAndroidAudioAnalyzer();
    };
  }, []);

  useEffect(() => {
    if (!isRunningMeasurement) {
      return;
    }

    const interval = setInterval(() => {
      setRemainingSeconds((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunningMeasurement]);

  useEffect(() => {
    if (step !== 'result') {
      return;
    }

    let cancelled = false;
    const payload = buildStressAiPayload(diagnosisInput, {
      measurementDurationSec: selectedOption.durationSec,
      report,
      measuredValues: {
        averageDb: noiseAverageValue,
        maxDb: noiseMaxValue,
      },
      vibrationSummary,
      frequencyAnalysis: {
        peakFrequencyHz: frequencySummary.peakFrequencyHz,
        dominantBand: frequencySummary.dominantBand,
        highFrequencyLevel: frequencySummary.highFrequencyLevel,
        lowFrequencyMarkerLevel: frequencySummary.lowFrequencyMarkerLevel,
        lowBandRatio: frequencySummary.lowBandRatio,
        midBandRatio: frequencySummary.midBandRatio,
        highBandRatio: frequencySummary.highBandRatio,
        summary: frequencySummary.summary,
      },
    });

    setAiResult(null);
    generateStressAiResult(payload)
      .then((result) => {
        if (!cancelled) {
          setAiResult(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAiResult(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    diagnosisInput,
    frequencySummary.dominantBand,
    frequencySummary.highBandRatio,
    frequencySummary.highFrequencyLevel,
    frequencySummary.lowBandRatio,
    frequencySummary.lowFrequencyMarkerLevel,
    frequencySummary.midBandRatio,
    frequencySummary.peakFrequencyHz,
    frequencySummary.summary,
    noiseAverageValue,
    noiseMaxValue,
    report,
    selectedOption.durationSec,
    step,
    vibrationAverageState,
    vibrationPeakState,
    vibrationSummary,
  ]);

  const ensureMeasurementPermissions = async () => {
    const microphonePermission = await AudioModule.requestRecordingPermissionsAsync();
    const microphoneGranted = microphonePermission.granted;

    let motionGranted = true;
    if (typeof Accelerometer.requestPermissionsAsync === 'function') {
      const motionPermission = await Accelerometer.requestPermissionsAsync();
      motionGranted = motionPermission.status === 'granted';
    }

    if (microphoneGranted && motionGranted) {
      return true;
    }

    if (!microphoneGranted && !motionGranted) {
      return false;
    }

    if (!microphoneGranted) {
      return false;
    }

    return false;
  };

  const measureNoiseAndVibration = async (durationMs: number) => {
    latestMeteringRef.current = null;
    setIsMeasuringNoise(true);
    setAiResult(null);
    noisePatternSamplesRef.current = [];
    vibrationPatternSamplesRef.current = [];
    latestAudioSnapshotRef.current = null;
    try {
      const isAvailable = await Accelerometer.isAvailableAsync();
      if (!isAvailable) {
        return { noise: null, vibration: null };
      }

      const samples: number[] = [];
      const useNativeAudioAnalyzer = isAndroidAudioAnalyzerAvailable();
      // Use a denser sampling interval so short low-amplitude vibrations are less likely
      // to be lost than they were with the previous coarse 100 ms polling.
      Accelerometer.setUpdateInterval(VIBRATION_SAMPLE_INTERVAL_MS);

      if (useNativeAudioAnalyzer) {
        audioAnalyzerSubscriptionRef.current?.remove();
        audioAnalyzerSubscriptionRef.current = addAndroidAudioAnalyzerListener((snapshot) => {
          latestAudioSnapshotRef.current = snapshot;
          const displayDb = mapRmsDbToApproxDisplayDb(snapshot.rmsDb);
          const now = Date.now();
          noisePatternSamplesRef.current = [
            ...noisePatternSamplesRef.current,
            {
              timestampMs: now,
              approxDb: displayDb,
              peakFrequencyHz: snapshot.peakFrequencyHz,
              lowBandLevel: snapshot.lowBandLevel,
              midBandLevel: snapshot.midBandLevel,
              highBandLevel: snapshot.highBandLevel,
              marker32HzLevel: snapshot.marker32HzLevel,
              marker125HzLevel: snapshot.marker125HzLevel,
            },
          ];
        });
        const initialSnapshot = await startAndroidAudioAnalyzer(44100, 2048);
        latestAudioSnapshotRef.current = initialSnapshot;
      } else {
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });

        await audioRecorder.prepareToRecordAsync();
        audioRecorder.record();
      }

      vibrationSubscriptionRef.current?.remove();
      vibrationSubscriptionRef.current = Accelerometer.addListener(({ x, y, z }) => {
        const magnitude = Math.sqrt(x * x + y * y + z * z);
        const deltaFromGravity = Math.abs(magnitude - 1);
        samples.push(deltaFromGravity);
        const now = Date.now();
        vibrationPatternSamplesRef.current = [
          ...vibrationPatternSamplesRef.current,
          { timestampMs: now, value: deltaFromGravity },
        ];
      });

      await sleep(durationMs);

      let nativeSnapshot: AndroidAudioAnalyzerSnapshot | null = null;
      if (useNativeAudioAnalyzer) {
        nativeSnapshot = (await stopAndroidAudioAnalyzer()) ?? latestAudioSnapshotRef.current;
        audioAnalyzerSubscriptionRef.current?.remove();
        audioAnalyzerSubscriptionRef.current = null;
      } else {
        await audioRecorder.stop();
      }

      vibrationSubscriptionRef.current?.remove();
      vibrationSubscriptionRef.current = null;

      const metering = latestMeteringRef.current;
      let estimatedDb: number | null = null;
      if (nativeSnapshot) {
        estimatedDb = mapRmsDbToApproxDisplayDb(nativeSnapshot.rmsDb);
        setAmbientNoiseDb(String(estimatedDb));
      } else if (metering === null) {
      } else {
        estimatedDb = mapMeteringToDb(metering);
        setAmbientNoiseDb(String(estimatedDb));
      }

      if (!samples.length) {
        return { noise: estimatedDb, vibration: null };
      }

      const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
      const level = mapVibrationRmsToLevel(rms);

      setVibrationLevel(level);
      return { noise: estimatedDb, vibration: level };
    } catch {
      return { noise: null, vibration: null };
    } finally {
      try {
        if (audioRecorder.isRecording) {
          await audioRecorder.stop();
        }
      } catch {}

      audioAnalyzerSubscriptionRef.current?.remove();
      audioAnalyzerSubscriptionRef.current = null;
      void stopAndroidAudioAnalyzer();
      vibrationSubscriptionRef.current?.remove();
      vibrationSubscriptionRef.current = null;
      setIsMeasuringNoise(false);
    }
  };

  const startMeasurementFlow = async () => {
    if (isWeb) {
      Alert.alert('모바일 전용 기능', '스트레스 진단은 휴대폰 앱에서만 사용할 수 있습니다.');
      return;
    }

    const runId = measurementRunIdRef.current + 1;
    measurementRunIdRef.current = runId;

    try {
      setIsRunningMeasurement(true);
      setAmbientNoiseDb('');
      setVibrationLevel(0);
      setAiResult(null);
      noisePatternSamplesRef.current = [];
      vibrationPatternSamplesRef.current = [];
      latestAudioSnapshotRef.current = null;
      setStep('measuring');
      setRemainingSeconds(selectedOption.durationSec);

      const permissionsReady = await ensureMeasurementPermissions();
      if (!permissionsReady) {
        setStep('sunlight');
        return;
      }

      const totalDurationMs = selectedOption.durationSec * 1000;
      const result = await measureNoiseAndVibration(totalDurationMs);

      if (measurementRunIdRef.current !== runId) {
        return;
      }

      if (result.noise !== null && result.vibration !== null) {
        setStep('result');
      } else {
        setStep('sunlight');
      }
    } finally {
      if (measurementRunIdRef.current === runId) {
        setRemainingSeconds(0);
      }
      setIsRunningMeasurement(false);
    }
  };

  const handleSelectMeasurement = (nextType: MeasurementType) => {
    setMeasurementType(nextType);
    setStep('sunlight');
  };

  const handleSelectAnimalCategory = (nextCategory: StressAnimalCategory) => {
    const nextCategoryOption =
      STRESS_ANIMAL_CATEGORY_OPTIONS.find((categoryOption) => categoryOption.category === nextCategory) ??
      STRESS_ANIMAL_CATEGORY_OPTIONS[0];

    setAnimalCategory(nextCategory);
    setSpecies(nextCategoryOption.options[0].label);
  };

  const handleReset = () => {
    measurementRunIdRef.current += 1;
    setStep('select');
    setAmbientNoiseDb('');
    setVibrationLevel(0);
    setDirectSunlight(false);
    setIsRunningMeasurement(false);
    setRemainingSeconds(0);
    setAiResult(null);
    noisePatternSamplesRef.current = [];
    vibrationPatternSamplesRef.current = [];
    latestAudioSnapshotRef.current = null;
  };

  const handleSaveReport = async () => {
    if (isWeb) {
      Alert.alert('모바일 전용 기능', '스트레스 진단 결과 저장은 휴대폰 앱에서만 사용할 수 있습니다.');
      return;
    }

    try {
      setIsSavingReport(true);
      await saveStressReport({
        diagnosisInput,
        report,
      });
      Alert.alert('저장 완료', '진단 결과가 저장되었어요.');
    } catch (error) {
      Alert.alert(
        '저장 실패',
        error instanceof Error ? error.message : '진단 결과를 저장하지 못했어요.'
      );
    } finally {
      setIsSavingReport(false);
    }
  };

  if (isWeb) {
    return (
      <ScreenContainer>
        <View style={styles.mobileOnlyContent}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>

          <View style={styles.mobileOnlyCard}>
            <Ionicons name="phone-portrait-outline" size={34} color={colors.primaryStrong} />
            <Text style={styles.mobileOnlyTitle}>모바일 앱에서만 사용할 수 있어요</Text>
            <Text style={styles.mobileOnlyText}>
              스트레스 진단은 휴대폰의 마이크와 가속도 센서를 사용하므로 PC 웹에서는 실행할 수
              없어요.
            </Text>
          </View>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll={step === 'result'}>
      <View style={[styles.container, step === 'result' && { flex: undefined }]}>
        <Pressable style={styles.backButton} onPress={step === 'sunlight' ? () => setStep('select') : () => router.back()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>

        {step === 'select' ? (
          <View style={styles.selectLayout}>
            <Text style={styles.selectTitle}>측정 방식 선택</Text>

            <View style={styles.optionList}>
              {(['quick', 'precise'] as const).map((optionKey) => {
                const option = MEASUREMENT_OPTIONS[optionKey];
                return (
                  <Pressable
                    key={optionKey}
                    style={styles.optionButton}
                    onPress={() => handleSelectMeasurement(optionKey)}>
                    <View style={styles.optionButtonTextWrap}>
                      <Text style={styles.optionButtonTitle}>{option.label}</Text>
                      <Text style={styles.optionButtonDescription}>{option.description}</Text>
                    </View>
                    <View style={styles.optionButtonMeta}>
                      <Text style={styles.optionButtonDuration}>{formatDurationLabel(option.durationSec)}</Text>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={colors.primaryStrong}
                      />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {step === 'sunlight' ? (
          <View style={styles.formLayout}>
            <Text style={styles.centerTitle}>{selectedOption.label}</Text>
            <Text style={styles.centerDescription}>
              동물군과 직사광선 조건을 선택해주세요.
            </Text>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>동물군</Text>
              <View style={styles.speciesOptionList}>
                {STRESS_ANIMAL_CATEGORY_OPTIONS.map((option) => {
                  const active = animalCategory === option.category;
                  return (
                    <Pressable
                      key={option.category}
                      style={[styles.speciesOptionChip, active && styles.speciesOptionChipActive]}
                      onPress={() => handleSelectAnimalCategory(option.category)}>
                      <Text
                        style={[
                          styles.speciesOptionChipText,
                          active && styles.speciesOptionChipTextActive,
                        ]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {selectedAnimalCategory.options.length > 1 ? (
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>세부 유형</Text>
                <View style={styles.speciesOptionList}>
                  {selectedAnimalCategory.options.map((option) => {
                    const active = species === option.label;
                    return (
                      <Pressable
                        key={option.profileId}
                        style={[styles.speciesOptionChip, active && styles.speciesOptionChipActive]}
                        onPress={() => setSpecies(option.label)}>
                        <Text
                          style={[
                            styles.speciesOptionChipText,
                            active && styles.speciesOptionChipTextActive,
                          ]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <BooleanField
              label="직사광선이 직접 들어오고 피할 공간이 없나요?"
              value={directSunlight}
              onChange={setDirectSunlight}
            />

            <Pressable style={styles.primaryButton} onPress={() => void startMeasurementFlow()}>
              <Text style={styles.primaryButtonText}>{selectedOption.label} 시작</Text>
            </Pressable>
          </View>
        ) : null}

        {step === 'measuring' ? (
          <View style={styles.measureLayout}>
            <Text style={styles.measureTitle}>{selectedOption.label} 중...</Text>

            <View style={styles.timerCircle}>
              <View style={styles.timerWrap}>
                <Ionicons name="time-outline" size={42} color={colors.primaryStrong} />
                <Text style={styles.timerValue}>{formatCountdown(remainingSeconds)}</Text>
              </View>
            </View>

          </View>
        ) : null}

        {step === 'result' ? (
          <View style={styles.resultLayout}>
            <View style={styles.resultSummaryCard}>
              <Text style={styles.resultSummaryLabel}>사육 환경 적합도</Text>
              <Text style={styles.resultSummaryStatus}>{getSuitabilityLabel(report.level)}</Text>
              <Text style={styles.resultSummaryText}>{report.summary}</Text>
            </View>

            <RiskGraph
              title="소음 변화"
              unit="dB"
              maxValue={100}
              cautionValue={animalGroupInfo.noiseCautionDb}
              warningValue={noiseWarningValue}
              chartWidth={resultChartWidth}
              samples={noiseSamples}
              stats={[`평균 ${noiseAverageValue} dB`, `최대 ${noiseMaxValue} dB`]}
            />
            <MeasurementAiBlock
              interpretation={displayNoiseInterpretation}
            />
            <FrequencyAnalysisCard
              dominantBand={frequencySummary.dominantBand}
              highFrequencyLevel={frequencySummary.highFrequencyLevel}
              lowFrequencyMarkerLevel={frequencySummary.lowFrequencyMarkerLevel}
              lowBandRatio={frequencySummary.lowBandRatio}
              midBandRatio={frequencySummary.midBandRatio}
              highBandRatio={frequencySummary.highBandRatio}
              summary={frequencySummary.summary}
            />

            <RiskGraph
              title="진동 변화"
              unit=""
              maxValue={vibrationMaxValue}
              cautionValue={3}
              warningValue={6}
              chartWidth={resultChartWidth}
              samples={vibrationSamplesLevel}
              stats={[`평균 ${vibrationAverageState}`, `피크 ${vibrationPeakState}`]}
            />
            <MeasurementAiBlock
              interpretation={displayVibrationInterpretation}
            />

            <View style={styles.resultActions}>
              <Pressable style={styles.secondaryButton} onPress={handleReset}>
                <Text style={styles.secondaryButtonText}>다시 측정</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryButton, isSavingReport && styles.buttonDisabled]}
                onPress={() => void handleSaveReport()}
                disabled={isSavingReport}>
                <Text style={styles.primaryButtonText}>{isSavingReport ? '저장 중...' : '결과 저장'}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 16,
    paddingBottom: 40,
  },
  mobileOnlyContent: {
    flex: 1,
    padding: 20,
    gap: 18,
    justifyContent: 'center',
  },
  mobileOnlyCard: {
    alignItems: 'center',
    gap: 14,
    padding: 24,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mobileOnlyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  mobileOnlyText: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.textMuted,
    textAlign: 'center',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  formLayout: {
    flex: 1,
    gap: 20,
    justifyContent: 'center',
    marginTop: 14,
    padding: 20,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.textMuted,
    textAlign: 'center',
  },
  centerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  centerDescription: {
    fontSize: 15,
    lineHeight: 24,
    color: colors.textMuted,
    textAlign: 'center',
  },
  selectLayout: {
    flex: 1,
    gap: 22,
    justifyContent: 'center',
    marginTop: 14,
    padding: 20,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  optionList: {
    gap: 14,
  },
  optionButton: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  optionButtonTextWrap: {
    flex: 1,
    gap: 4,
  },
  optionButtonMeta: {
    alignItems: 'flex-end',
    gap: 8,
  },
  optionButtonTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  optionButtonDuration: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primaryStrong,
  },
  optionButtonDescription: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textMuted,
  },
  fieldBlock: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  speciesOptionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 2,
  },
  speciesOptionChip: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speciesOptionChipActive: {
    borderColor: colors.primaryStrong,
    backgroundColor: colors.primaryLight,
  },
  speciesOptionChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  speciesOptionChipTextActive: {
    fontWeight: '700',
    color: colors.primaryStrong,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choiceChip: {
    minWidth: 84,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  choiceChipActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primaryStrong,
  },
  choiceChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  choiceChipTextActive: {
    fontWeight: '700',
    color: colors.primaryStrong,
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryStrong,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryButton: {
    minHeight: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  measureLayout: {
    flex: 1,
    gap: 26,
    justifyContent: 'center',
    marginTop: 14,
    padding: 20,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  measureTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  timerWrap: {
    alignItems: 'center',
    gap: 8,
  },
  timerCircle: {
    width: 210,
    height: 210,
    alignSelf: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D1D1D6',
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerValue: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.text,
  },
  measureSummaryLabel: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
    textAlign: 'center',
  },
  resultLayout: {
    gap: 14,
    marginTop: 6,
    paddingVertical: 4,
  },
  resultSummaryCard: {
    gap: 5,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resultSummaryLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textMuted,
  },
  resultSummaryStatus: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
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
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  riskGraphStats: {
    alignItems: 'flex-end',
    gap: 2,
  },
  riskGraphStatText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
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
    height: 190,
    overflow: 'hidden',
    borderRadius: 12,
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
    backgroundColor: '#F0B8B8',
  },
  lineCautionArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#F7E6B8',
  },
  lineThresholdHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(28, 28, 30, 0.28)',
  },
  timeTickLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(28, 28, 30, 0.08)',
  },
  lineSegment: {
    position: 'absolute',
    height: 1,
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
  frequencyBars: {
    gap: 7,
  },
  frequencyBarRow: {
    gap: 5,
  },
  frequencyBarLabel: {
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
  resultHero: {
    gap: 10,
  },
  resultHeadline: {
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 38,
    color: colors.text,
  },
  resultPatternSummary: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
  },
  levelBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  levelBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  resultSection: {
    gap: 7,
    paddingTop: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  resultMetrics: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 30,
  },
  resultInterpretation: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primaryStrong,
  },
  frequencySummary: {
    gap: 5,
  },
  frequencySummaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  frequencySummaryMuted: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
  },
  reportSummary: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.text,
  },
  recommendationBox: {
    gap: 8,
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
  },
  disclaimer: {
    fontSize: 12,
    lineHeight: 19,
    color: colors.textMuted,
    textAlign: 'left',
  },
  aiBlock: {
    gap: 8,
  },
  aiTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  aiBody: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.textMuted,
  },
  resultActions: {
    marginTop: 'auto',
    gap: 10,
  },
});
