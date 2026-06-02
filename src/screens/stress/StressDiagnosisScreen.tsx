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
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { EmitterSubscription } from 'react-native';

import ScreenContainer from '@/src/components/common/ScreenContainer';
import StressResultPanel, { downsamplePeakSamples } from '@/src/components/stress/StressResultPanel';
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
import { saveStressReport, StressReportResultSnapshot } from '@/src/lib/stress-reports';
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
const AI_INTERPRETATION_PENDING_TEXT = 'AI 해석을 생성하는 중입니다.';
const AI_INTERPRETATION_FAILED_TEXT = 'AI 해석을 생성하지 못했습니다. 그래프와 수치를 참고해 주세요.';

type MeasurementType = keyof typeof MEASUREMENT_OPTIONS;
type Step = 'select' | 'sunlight' | 'measuring' | 'checking' | 'result';
type DebugResultLevel = 'stable' | 'caution' | 'warning';

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

function getGraphPatternSummary(
  samples: { timestampMs: number; value: number }[],
  options: {
    durationSec: number;
    threshold: number;
    average?: number;
    max?: number;
    p95?: number;
    unitLabel: string;
  }
) {
  const sortedSamples = samples
    .filter((sample) => Number.isFinite(sample.value))
    .sort((a, b) => a.timestampMs - b.timestampMs);
  const durationMs = Math.max(options.durationSec * 1000, 1);
  const values = sortedSamples.map((sample) => sample.value);
  const average = options.average ?? getAverageValue(values, 0);
  const max = options.max ?? getMaxValue(values, average);
  const p95 = options.p95 ?? getPercentileValue(values, 0.95, average);
  const peakGap = Math.max(0, max - average);
  let spikeCount = 0;
  let spikeDurationMs = 0;
  let longestSpikeMs = 0;
  let currentSpikeMs = 0;
  let inSpike = false;

  sortedSamples.forEach((sample, index) => {
    const nextTimestamp = sortedSamples[index + 1]?.timestampMs;
    const segmentMs = Math.max(0, Math.min(nextTimestamp ?? sample.timestampMs, sortedSamples[0].timestampMs + durationMs) - sample.timestampMs);
    const isSpike = sample.value >= options.threshold;

    if (isSpike) {
      if (!inSpike) {
        spikeCount += 1;
        inSpike = true;
        currentSpikeMs = 0;
      }
      spikeDurationMs += segmentMs;
      currentSpikeMs += segmentMs;
      longestSpikeMs = Math.max(longestSpikeMs, currentSpikeMs);
    } else {
      inSpike = false;
      currentSpikeMs = 0;
    }
  });

  const activeRatio = clamp(spikeDurationMs / durationMs, 0, 1);
  const spikeDurationSec = Number((spikeDurationMs / 1000).toFixed(1));
  const longestSpikeSec = Number((longestSpikeMs / 1000).toFixed(1));
  const pattern =
    spikeCount >= 4
      ? '짧은 피크가 반복됨'
      : activeRatio >= 0.25
        ? '높은 구간이 비교적 오래 이어짐'
        : spikeCount >= 1
          ? '순간 피크가 있음'
          : '큰 변화가 적음';
  const userMeaning =
    spikeCount >= 4
      ? `평균보다 높은 ${options.unitLabel} 변화가 여러 번 반복되었습니다.`
      : activeRatio >= 0.25
        ? `측정 시간 중 높은 ${options.unitLabel} 구간이 비교적 길게 이어졌습니다.`
        : spikeCount >= 1
          ? `대부분은 안정적이지만 순간적으로 높은 ${options.unitLabel} 변화가 있었습니다.`
          : `측정 시간 동안 큰 ${options.unitLabel} 변화는 많지 않았습니다.`;

  return {
    average: Math.round(average),
    max: Math.round(max),
    p95: Math.round(p95),
    peakGap: Math.round(peakGap),
    spikeCount,
    spikeDurationSec,
    longestSpikeSec,
    activeRatio: Number(activeRatio.toFixed(3)),
    pattern,
    userMeaning,
  };
}

function getSuitabilityLabel(level: string) {
  if (level === 'warning') return '부적합';
  if (level === 'caution') return '주의 필요';
  return '적합';
}

function getVibrationStateLabel(level: number, cautionLevel: number, warningLevel: number) {
  if (level >= warningLevel) return '강한 흔들림';
  if (level >= cautionLevel) return '주의가 필요한 흔들림';
  if (level >= Math.max(1, cautionLevel / 2)) return '약한 흔들림';
  return '안정';
}

function getVibrationSummary(averageState: string, peakState: string, pattern: string) {
  return {
    averageState,
    peakState,
    pattern,
    meaning: '',
    guidance: '',
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
      summary: '주파수 대역 분석은 Android 네이티브 소음 분석이 가능할 때 표시됩니다.',
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
  const totalBand = Math.max(lowBand + midBand + highBand, 0.01);

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
    lowBandRatio: clamp(lowBand / totalBand, 0, 1),
    midBandRatio: clamp(midBand / totalBand, 0, 1),
    highBandRatio: clamp(highBand / totalBand, 0, 1),
    summary,
  };
}

function buildDebugNoiseSamples(targetDb: number, durationSec: number): NoisePatternSample[] {
  return Array.from({ length: 30 }, (_, index) => {
    const progress = index / 29;
    const wave = Math.sin(progress * Math.PI * 4) * 3;
    return {
      timestampMs: Math.round(progress * durationSec * 1000),
      approxDb: Math.round(targetDb + wave),
      peakFrequencyHz: 125,
      lowBandLevel: 0.32,
      midBandLevel: 0.48,
      highBandLevel: 0.2,
      marker32HzLevel: 0.18,
      marker125HzLevel: 0.32,
    };
  });
}

function buildDebugVibrationSamples(targetLevel: number, durationSec: number): VibrationPatternSample[] {
  return Array.from({ length: 30 }, (_, index) => {
    const progress = index / 29;
    const pulse = index % 9 === 0 ? 1 : 0;
    const level = clamp(targetLevel + pulse, 0, 10);
    return {
      timestampMs: Math.round(progress * durationSec * 1000),
      value: level / 42,
    };
  });
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
  const measurementEndAtRef = useRef<number | null>(null);

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
  const [isAiInterpretationFailed, setIsAiInterpretationFailed] = useState(false);
  const [aiErrorMessage, setAiErrorMessage] = useState<string | null>(null);
  const [isDebugResult, setIsDebugResult] = useState(false);

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
  const noiseP95Value = Math.round(getPercentileValue(noiseSamples.map((sample) => sample.value), 0.95, noiseValue));
  const vibrationSamplesLevel = vibrationPatternSamplesRef.current.map((sample) => ({
    timestampMs: sample.timestampMs,
    value: mapVibrationRmsToLevel(sample.value),
  }));
  const vibrationAverageLevel = Math.round(
    getAverageValue(vibrationSamplesLevel.map((sample) => sample.value), vibrationLevel)
  );
  const vibrationP95Level = Math.round(
    getPercentileValue(vibrationSamplesLevel.map((sample) => sample.value), 0.95, vibrationLevel)
  );
  const vibrationPeakLevel = Math.round(
    getMaxValue(vibrationSamplesLevel.map((sample) => sample.value), vibrationLevel)
  );
  const vibrationPatternBase = getGraphPatternSummary(vibrationSamplesLevel, {
    durationSec: selectedOption.durationSec,
    threshold: animalGroupInfo.vibrationCautionLevel,
    average: vibrationAverageLevel,
    max: vibrationPeakLevel,
    p95: vibrationP95Level,
    unitLabel: '진동',
  });
  const vibrationAverageState = getVibrationStateLabel(
    vibrationAverageLevel,
    animalGroupInfo.vibrationCautionLevel,
    animalGroupInfo.vibrationWarningLevel
  );
  const vibrationPeakState = getVibrationStateLabel(
    vibrationPeakLevel,
    animalGroupInfo.vibrationCautionLevel,
    animalGroupInfo.vibrationWarningLevel
  );
  const vibrationSummary = useMemo(
    () => getVibrationSummary(vibrationAverageState, vibrationPeakState, vibrationPatternBase.pattern),
    [vibrationAverageState, vibrationPeakState, vibrationPatternBase.pattern]
  );
  const interpretationFallbackText = isAiInterpretationFailed
    ? aiErrorMessage
      ? `${AI_INTERPRETATION_FAILED_TEXT}\n${aiErrorMessage}`
      : AI_INTERPRETATION_FAILED_TEXT
    : AI_INTERPRETATION_PENDING_TEXT;
  const displayNoiseInterpretation = aiResult?.noiseInterpretation ?? interpretationFallbackText;
  const displayFrequencyInterpretation = aiResult?.frequencyInterpretation ?? interpretationFallbackText;
  const displayVibrationInterpretation = aiResult?.vibrationInterpretation ?? interpretationFallbackText;
  const resultSnapshot = useMemo<StressReportResultSnapshot>(
    () => ({
      durationSec: selectedOption.durationSec,
      suitabilityStatus: getSuitabilityLabel(report.level),
      summary: report.summary,
      noise: {
        samples: downsamplePeakSamples(noiseSamples, 180),
        averageDb: noiseAverageValue,
        maxDb: noiseMaxValue,
        cautionValue: animalGroupInfo.noiseCautionDb,
        warningValue: noiseWarningValue,
        interpretation: displayNoiseInterpretation,
      },
      frequency: {
        peakFrequencyHz: frequencySummary.peakFrequencyHz,
        dominantBand: frequencySummary.dominantBand,
        highFrequencyLevel: frequencySummary.highFrequencyLevel,
        lowFrequencyMarkerLevel: frequencySummary.lowFrequencyMarkerLevel,
        lowBandRatio: frequencySummary.lowBandRatio,
        midBandRatio: frequencySummary.midBandRatio,
        highBandRatio: frequencySummary.highBandRatio,
        summary: frequencySummary.summary,
        interpretation: displayFrequencyInterpretation,
      },
      vibration: {
        samples: downsamplePeakSamples(vibrationSamplesLevel, 180),
        averageState: vibrationAverageState,
        peakState: vibrationPeakState,
        cautionValue: animalGroupInfo.vibrationCautionLevel,
        warningValue: animalGroupInfo.vibrationWarningLevel,
        interpretation: displayVibrationInterpretation,
      },
    }),
    [
      animalGroupInfo.noiseCautionDb,
      animalGroupInfo.vibrationCautionLevel,
      animalGroupInfo.vibrationWarningLevel,
      displayFrequencyInterpretation,
      displayNoiseInterpretation,
      displayVibrationInterpretation,
      frequencySummary.peakFrequencyHz,
      frequencySummary.dominantBand,
      frequencySummary.highBandRatio,
      frequencySummary.highFrequencyLevel,
      frequencySummary.lowBandRatio,
      frequencySummary.lowFrequencyMarkerLevel,
      frequencySummary.midBandRatio,
      frequencySummary.summary,
      noiseAverageValue,
      noiseMaxValue,
      noiseSamples,
      noiseWarningValue,
      report.level,
      report.summary,
      selectedOption.durationSec,
      vibrationAverageState,
      vibrationPeakState,
      vibrationSamplesLevel,
    ]
  );
  useEffect(() => {
    if (!isMeasuringNoise || recorderState.metering === undefined) {
      return;
    }

    latestMeteringRef.current = recorderState.metering;
    noisePatternSamplesRef.current = [
      ...noisePatternSamplesRef.current,
      {
        timestampMs: Date.now(),
        approxDb: mapMeteringToDb(recorderState.metering),
        peakFrequencyHz: 0,
        lowBandLevel: 0,
        midBandLevel: 0,
        highBandLevel: 0,
        marker32HzLevel: 0,
        marker125HzLevel: 0,
      },
    ];
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
      const endAt = measurementEndAtRef.current;
      if (!endAt) {
        return;
      }

      setRemainingSeconds(Math.max(0, Math.ceil((endAt - Date.now()) / 1000)));
    }, 250);

    return () => clearInterval(interval);
  }, [isRunningMeasurement]);

  useEffect(() => {
    if (step !== 'checking') {
      return;
    }

    let cancelled = false;
    const currentNoiseSamples = noisePatternSamplesRef.current.map((sample) => ({
      timestampMs: sample.timestampMs,
      value: sample.approxDb,
    }));
    const currentVibrationSamplesLevel = vibrationPatternSamplesRef.current.map((sample) => ({
      timestampMs: sample.timestampMs,
      value: mapVibrationRmsToLevel(sample.value),
    }));
    const noisePatternSummary = getGraphPatternSummary(currentNoiseSamples, {
      durationSec: selectedOption.durationSec,
      threshold: Math.max(animalGroupInfo.noiseCautionDb, noiseAverageValue + 10),
      average: noiseAverageValue,
      max: noiseMaxValue,
      p95: getPercentileValue(currentNoiseSamples.map((sample) => sample.value), 0.95, noiseAverageValue),
      unitLabel: '소음',
    });
    const vibrationPatternBase = getGraphPatternSummary(currentVibrationSamplesLevel, {
      durationSec: selectedOption.durationSec,
      threshold: animalGroupInfo.vibrationCautionLevel,
      unitLabel: '진동',
    });
    const vibrationPatternSummary = {
      average: vibrationPatternBase.average,
      max: vibrationPatternBase.max,
      p95: vibrationPatternBase.p95,
      peakGap: vibrationPatternBase.peakGap,
      spikeCount: vibrationPatternBase.spikeCount,
      spikeDurationSec: vibrationPatternBase.spikeDurationSec,
      longestSpikeSec: vibrationPatternBase.longestSpikeSec,
      activeRatio: vibrationPatternBase.activeRatio,
      pattern: vibrationPatternBase.pattern,
      userMeaning: vibrationPatternBase.userMeaning,
    };
    const payload = buildStressAiPayload(diagnosisInput, {
      measurementDurationSec: selectedOption.durationSec,
      report,
      measuredValues: {
        averageDb: noiseAverageValue,
        maxDb: noiseMaxValue,
        p95Db: noiseP95Value,
        averageVibrationLevel: vibrationAverageLevel,
        maxVibrationLevel: vibrationPeakLevel,
        p95VibrationLevel: vibrationP95Level,
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
      noisePatternSummary,
      vibrationPatternSummary,
    });

    setAiResult(null);
    setIsAiInterpretationFailed(false);
    setAiErrorMessage(null);
    generateStressAiResult(payload)
      .then((result) => {
        if (!cancelled) {
          setAiResult(result);
          setIsAiInterpretationFailed(false);
          setAiErrorMessage(null);
          setStep('result');
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : '알 수 없는 오류';
          console.warn('Stress AI interpretation failed:', message);
          setAiResult(null);
          setIsAiInterpretationFailed(true);
          setAiErrorMessage(message);
          setStep('result');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    diagnosisInput,
    animalGroupInfo.noiseCautionDb,
    animalGroupInfo.frequencyGuidance,
    animalGroupInfo.vibrationCautionLevel,
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
    noiseP95Value,
    report,
    selectedOption.durationSec,
    step,
    vibrationAverageLevel,
    vibrationAverageState,
    vibrationP95Level,
    vibrationPeakLevel,
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

      measurementEndAtRef.current = Date.now() + durationMs;
      setRemainingSeconds(Math.ceil(durationMs / 1000));

      await sleep(durationMs);
      setRemainingSeconds(0);

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
      Alert.alert('모바일 전용 기능', '입주 전 환경 체크는 휴대폰 앱에서만 사용할 수 있습니다.');
      return;
    }

    const runId = measurementRunIdRef.current + 1;
    measurementRunIdRef.current = runId;

    try {
      setIsRunningMeasurement(true);
      setAmbientNoiseDb('');
      setVibrationLevel(0);
      setAiResult(null);
      setIsAiInterpretationFailed(false);
      setAiErrorMessage(null);
      setIsDebugResult(false);
      noisePatternSamplesRef.current = [];
      vibrationPatternSamplesRef.current = [];
      latestAudioSnapshotRef.current = null;
      measurementEndAtRef.current = null;
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
        setStep('checking');
      } else {
        setStep('sunlight');
      }
    } finally {
      if (measurementRunIdRef.current === runId) {
        setRemainingSeconds(0);
      }
      setIsRunningMeasurement(false);
      measurementEndAtRef.current = null;
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
    setIsAiInterpretationFailed(false);
    setAiErrorMessage(null);
    setIsDebugResult(false);
    noisePatternSamplesRef.current = [];
    vibrationPatternSamplesRef.current = [];
    latestAudioSnapshotRef.current = null;
    measurementEndAtRef.current = null;
  };

  const handleApplyDebugResult = (level: DebugResultLevel) => {
    const durationSec = MEASUREMENT_OPTIONS.quick.durationSec;
    const warningNoiseDb = animalGroupInfo.noiseWarningDb ?? animalGroupInfo.noiseCautionDb + 12;
    const targetNoiseDb =
      level === 'warning'
        ? warningNoiseDb
        : level === 'caution'
          ? animalGroupInfo.noiseCautionDb
          : Math.max(35, animalGroupInfo.noiseCautionDb - 18);
    const targetVibrationLevel =
      level === 'warning'
        ? animalGroupInfo.vibrationWarningLevel
        : level === 'caution'
          ? animalGroupInfo.vibrationCautionLevel
          : Math.max(0, animalGroupInfo.vibrationCautionLevel - 2);
    const label = level === 'warning' ? '부적합' : level === 'caution' ? '주의 필요' : '적합';

    measurementRunIdRef.current += 1;
    setMeasurementType('quick');
    setAmbientNoiseDb(String(Math.round(targetNoiseDb)));
    setVibrationLevel(targetVibrationLevel);
    setDirectSunlight(false);
    setIsRunningMeasurement(false);
    setRemainingSeconds(0);
    setIsDebugResult(true);
    setIsAiInterpretationFailed(false);
    setAiErrorMessage(null);
    setAiResult({
      suitabilityStatus: label,
      noiseStatus: level === 'stable' ? '안정' : level === 'caution' ? '주의 필요' : '높음',
      vibrationStatus: level === 'stable' ? '안정' : level === 'caution' ? '주의가 필요한 흔들림' : '강한 흔들림',
      noiseInterpretation:
        level === 'stable'
          ? '테스트 값 기준으로 소음 변화가 크게 두드러지지 않습니다.'
          : level === 'caution'
            ? '테스트 값 기준으로 해당 동물군에 주의가 필요한 소음 구간을 확인하는 화면입니다.'
            : '테스트 값 기준으로 높은 소음 자극이 감지되는 화면입니다.',
      frequencyInterpretation: '테스트 샘플로 만든 주파수 대역 표시입니다.',
      vibrationInterpretation:
        level === 'stable'
          ? '테스트 값 기준으로 진동은 안정적인 상태에 가깝습니다.'
          : level === 'caution'
            ? '테스트 값 기준으로 주의가 필요한 흔들림 상태를 확인하는 화면입니다.'
            : '테스트 값 기준으로 강한 흔들림 상태를 확인하는 화면입니다.',
      why: '개발 중 UI 확인을 위한 테스트 결과입니다.',
      improvements: '실제 판정 확인은 기기 측정으로 다시 진행해 주세요.',
    });
    noisePatternSamplesRef.current = buildDebugNoiseSamples(targetNoiseDb, durationSec);
    vibrationPatternSamplesRef.current = buildDebugVibrationSamples(targetVibrationLevel, durationSec);
    latestAudioSnapshotRef.current = null;
    measurementEndAtRef.current = null;
    setStep('result');
  };

  const handleSaveReport = async () => {
    if (isDebugResult) {
      Alert.alert('테스트 결과', '개발 테스트 결과는 저장하지 않습니다.');
      return;
    }

    if (isWeb) {
      Alert.alert('모바일 전용 기능', '입주 전 환경 체크 결과 저장은 휴대폰 앱에서만 사용할 수 있습니다.');
      return;
    }

    try {
      setIsSavingReport(true);
      await saveStressReport({
        diagnosisInput,
        report,
        resultSnapshot,
      });
      Alert.alert('저장 완료', '체크 결과가 저장되었어요.');
    } catch (error) {
      Alert.alert(
        '저장 실패',
        error instanceof Error ? error.message : '체크 결과를 저장하지 못했어요.'
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
              입주 전 환경 체크는 휴대폰의 마이크와 가속도 센서를 사용하므로 PC 웹에서는 실행할 수
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

            {__DEV__ ? (
              <View style={styles.debugCard}>
                <Text style={styles.debugTitle}>결과 화면 테스트</Text>
                <View style={styles.debugButtonRow}>
                  <Pressable style={styles.debugButton} onPress={() => handleApplyDebugResult('stable')}>
                    <Text style={styles.debugButtonText}>적합</Text>
                  </Pressable>
                  <Pressable style={styles.debugButton} onPress={() => handleApplyDebugResult('caution')}>
                    <Text style={styles.debugButtonText}>주의 필요</Text>
                  </Pressable>
                  <Pressable style={styles.debugButton} onPress={() => handleApplyDebugResult('warning')}>
                    <Text style={styles.debugButtonText}>부적합</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
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

        {step === 'checking' ? (
          <View style={styles.measureLayout}>
            <Text style={styles.measureTitle}>결과 확인중...</Text>

            <View style={styles.checkingCard}>
              <ActivityIndicator size="large" color={colors.primaryStrong} />
              <Text style={styles.checkingText}>측정값과 그래프 패턴을 정리하고 있어요.</Text>
            </View>
          </View>
        ) : null}

        {step === 'result' ? (
          <StressResultPanel
            suitabilityStatus={resultSnapshot.suitabilityStatus}
            summary={resultSnapshot.summary}
            chartWidth={resultChartWidth}
            durationSec={resultSnapshot.durationSec}
            noise={resultSnapshot.noise}
            frequency={resultSnapshot.frequency}
            vibration={resultSnapshot.vibration}
            showEstimateNotice
            actions={
              <>
                <Pressable style={styles.secondaryButton} onPress={handleReset}>
                  <Text style={styles.secondaryButtonText}>다시 측정</Text>
                </Pressable>
                {isDebugResult ? (
                  <Text style={styles.debugResultNotice}>개발 테스트 결과는 저장되지 않습니다.</Text>
                ) : (
                  <Pressable
                    style={[styles.primaryButton, isSavingReport && styles.buttonDisabled]}
                    onPress={() => void handleSaveReport()}
                    disabled={isSavingReport}>
                    <Text style={styles.primaryButtonText}>{isSavingReport ? '저장 중...' : '결과 저장'}</Text>
                  </Pressable>
                )}
              </>
            }
          />
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
  debugCard: {
    gap: 10,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  debugTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textMuted,
  },
  debugButtonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  debugButton: {
    minHeight: 38,
    paddingHorizontal: 13,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  debugButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primaryStrong,
  },
  debugResultNotice: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
    textAlign: 'center',
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
  checkingCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    minHeight: 160,
    padding: 24,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
  },
  checkingText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
    textAlign: 'center',
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
