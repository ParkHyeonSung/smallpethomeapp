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
  analyzeNoisePattern,
  analyzeVibrationPattern,
  NoisePatternSample,
  StressPatternAnalysis,
  VibrationPatternSample,
} from '@/src/lib/stress-patterns';
import {
  buildStressDiagnosisReport,
  StressDiagnosisInput,
} from '@/src/lib/stress-diagnosis';
import { saveStressReport } from '@/src/lib/stress-reports';
import { resolveStressAnimalGroup } from '@/src/lib/stress-animal-groups';
import {
  analyzeVibrationSamples,
  getDominantVibrationBandLabel,
  VibrationAnalyzerSnapshot,
} from '@/src/lib/vibration-analyzer';

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

const SPECIES_OPTIONS = ['설치류', '기니피그', '토끼', '파충류', '기타 포유류'] as const;
const OTHER_MAMMAL_SUB = ['고슴도치', '슈가글라이더', '페럿'] as const;
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

function getVibrationBandLabel(level: number) {
  if (level >= 8) return '매우 높음';
  if (level >= 6) return '높음';
  if (level >= 4) return '보통';
  if (level >= 2) return '낮음';
  return '매우 낮음';
}

function formatFrequencyHz(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '- Hz';
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} kHz`;
  }

  return `${Math.round(value)} Hz`;
}

function getDominantBandLabel(snapshot: AndroidAudioAnalyzerSnapshot | null) {
  if (!snapshot) {
    return '분석 대기';
  }

  const bands = [
    { label: '저주파', value: snapshot.lowBandLevel },
    { label: '중주파', value: snapshot.midBandLevel },
    { label: '고주파', value: snapshot.highBandLevel },
  ];
  return bands.sort((a, b) => b.value - a.value)[0]?.label ?? '분석 대기';
}

function downsamplePoints<T>(items: T[], maxCount: number) {
  if (items.length <= maxCount) return items;

  const step = (items.length - 1) / (maxCount - 1);
  return Array.from({ length: maxCount }, (_, index) => items[Math.round(index * step)]);
}

function getSmoothPoints(points: { x: number; y: number }[]) {
  if (points.length < 3) return points;

  const smoothPoints: { x: number; y: number }[] = [];
  const segments = 10;

  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(index - 1, 0)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(index + 2, points.length - 1)];

    for (let step = 0; step < segments; step += 1) {
      const t = step / segments;
      const t2 = t * t;
      const t3 = t2 * t;
      const x =
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const y =
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      smoothPoints.push({ x, y });
    }
  }

  smoothPoints.push(points[points.length - 1]);
  return smoothPoints;
}

type RiskGraphProps = {
  title: string;
  value: number;
  unit: string;
  maxValue: number;
  cautionValue: number;
  warningValue: number;
  patternLabel?: string;
  detail: string;
  samples: { timestampMs: number; value: number }[];
  chartWidth: number;
};

function RiskGraph({
  title,
  value,
  unit,
  maxValue,
  cautionValue,
  warningValue,
  patternLabel,
  detail,
  samples,
  chartWidth,
}: RiskGraphProps) {
  const safeValue = clamp(value, 0, maxValue);
  const chartHeight = 190;
  const chartPadding = 4;
  const drawableWidth = Math.max(chartWidth - chartPadding * 2, 1);
  const drawableHeight = Math.max(chartHeight - chartPadding * 2, 1);
  const sortedSamples = downsamplePoints(
    samples.filter((sample) => Number.isFinite(sample.value)).sort((a, b) => a.timestampMs - b.timestampMs),
    90
  );
  const displaySamples = sortedSamples.map((sample, index) => {
    const windowStart = Math.max(index - 2, 0);
    const windowEnd = Math.min(index + 3, sortedSamples.length);
    const windowSamples = sortedSamples.slice(windowStart, windowEnd);
    const averagedValue =
      windowSamples.reduce((sum, current) => sum + current.value, 0) / Math.max(windowSamples.length, 1);

    return { ...sample, value: averagedValue };
  });
  const startMs = sortedSamples[0]?.timestampMs ?? 0;
  const endMs = sortedSamples[sortedSamples.length - 1]?.timestampMs ?? startMs + 1;
  const durationMs = Math.max(endMs - startMs, 1);
  const points = displaySamples.map((sample) => {
    const x = chartPadding + ((sample.timestampMs - startMs) / durationMs) * drawableWidth;
    const y = chartPadding + drawableHeight - (clamp(sample.value, 0, maxValue) / maxValue) * drawableHeight;
    return { x, y, value: sample.value };
  });
  const smoothPoints = getSmoothPoints(points).map((point) => ({
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
        <View>
          <Text style={styles.riskGraphTitle}>{title}</Text>
          <Text style={styles.riskGraphDetail}>{detail}</Text>
        </View>
        <View style={styles.riskValueWrap}>
          <Text style={styles.riskValue}>{Math.round(safeValue)}</Text>
          <Text style={styles.riskUnit}>{unit}</Text>
        </View>
      </View>

      <View style={styles.chartWithAxis}>
        <View style={styles.yAxisLabels}>
          <Text style={styles.axisText}>{Math.round(maxValue)}{unit}</Text>
          <Text style={styles.axisText}>0{unit}</Text>
        </View>
        <View>
          <View style={[styles.lineChartWrap, { width: chartWidth }]}>
            <View style={[styles.lineDangerArea, { height: warningY }]} />
            <View style={[styles.lineCautionArea, { top: warningY, height: cautionY - warningY }]} />
            <View style={[styles.lineThresholdHorizontal, { top: warningY }]} />
            <View style={[styles.lineThresholdHorizontal, { top: cautionY }]} />
            {tenSecondTicks.map((seconds) => {
              const left = `${((seconds * 1000) / durationMs) * 100}%` as DimensionValue;
              return <View key={seconds} style={[styles.timeTickLine, { left }]} />;
            })}
            {smoothPoints.slice(1).map((point, index) => {
              const previous = smoothPoints[index];
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

      {patternLabel ? <Text style={styles.riskPatternText}>{patternLabel}</Text> : null}
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
  const lastVibrationPatternUpdateRef = useRef(0);
  const latestMeteringRef = useRef<number | null>(null);
  const measurementRunIdRef = useRef(0);

  const [step, setStep] = useState<Step>('select');
  const [measurementType, setMeasurementType] = useState<MeasurementType>('quick');
  const [species, setSpecies] = useState<string>('설치류');
  const [ambientNoiseDb, setAmbientNoiseDb] = useState('');
  const [vibrationLevel, setVibrationLevel] = useState(0);
  const [directSunlight, setDirectSunlight] = useState(false);

  const [isMeasuringNoise, setIsMeasuringNoise] = useState(false);
  const [isSavingReport, setIsSavingReport] = useState(false);
  const [isRunningMeasurement, setIsRunningMeasurement] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [audioSnapshot, setAudioSnapshot] = useState<AndroidAudioAnalyzerSnapshot | null>(null);
  const [vibrationSnapshot, setVibrationSnapshot] = useState<VibrationAnalyzerSnapshot | null>(null);
  const [noisePattern, setNoisePattern] = useState<StressPatternAnalysis | null>(null);
  const [vibrationPattern, setVibrationPattern] = useState<StressPatternAnalysis | null>(null);

  const selectedOption = MEASUREMENT_OPTIONS[measurementType];
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
  const resultChartWidth = Math.max(260, Math.min(640, width - 68));
  const vibrationMgValue = vibrationSnapshot ? vibrationSnapshot.rms * 1000 : 0;
  const vibrationSamplesMg = vibrationPatternSamplesRef.current.map((sample) => ({
    timestampMs: sample.timestampMs,
    value: sample.value * 1000,
  }));
  const vibrationMaxValue = 100;

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
    setAudioSnapshot(null);
    setVibrationSnapshot(null);
    setNoisePattern(null);
    setVibrationPattern(null);
    noisePatternSamplesRef.current = [];
    vibrationPatternSamplesRef.current = [];
    lastVibrationPatternUpdateRef.current = 0;
    latestAudioSnapshotRef.current = null;
    try {
      const isAvailable = await Accelerometer.isAvailableAsync();
      if (!isAvailable) {
        return { noise: null, vibration: null };
      }

      const samples: number[] = [];
      const sampleTimes: number[] = [];
      const useNativeAudioAnalyzer = isAndroidAudioAnalyzerAvailable();
      // Use a denser sampling interval so short low-amplitude vibrations are less likely
      // to be lost than they were with the previous coarse 100 ms polling.
      Accelerometer.setUpdateInterval(VIBRATION_SAMPLE_INTERVAL_MS);

      if (useNativeAudioAnalyzer) {
        audioAnalyzerSubscriptionRef.current?.remove();
        audioAnalyzerSubscriptionRef.current = addAndroidAudioAnalyzerListener((snapshot) => {
          latestAudioSnapshotRef.current = snapshot;
          setAudioSnapshot(snapshot);
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
          setNoisePattern(analyzeNoisePattern(noisePatternSamplesRef.current, now));
        });
        const initialSnapshot = await startAndroidAudioAnalyzer(44100, 2048);
        latestAudioSnapshotRef.current = initialSnapshot;
        setAudioSnapshot(initialSnapshot);
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
        sampleTimes.push(Date.now());
        const now = Date.now();
        vibrationPatternSamplesRef.current = [
          ...vibrationPatternSamplesRef.current,
          { timestampMs: now, value: deltaFromGravity },
        ];
        if (now - lastVibrationPatternUpdateRef.current >= 700) {
          lastVibrationPatternUpdateRef.current = now;
          setVibrationPattern(analyzeVibrationPattern(vibrationPatternSamplesRef.current, now));
        }
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
        setAudioSnapshot(nativeSnapshot);
        setNoisePattern(analyzeNoisePattern(noisePatternSamplesRef.current));
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
      const actualDurationMs =
        sampleTimes.length >= 2 ? sampleTimes[sampleTimes.length - 1] - sampleTimes[0] : durationMs;
      const actualSampleRate =
        actualDurationMs > 0 && samples.length > 1
          ? ((samples.length - 1) / actualDurationMs) * 1000
          : 1000 / VIBRATION_SAMPLE_INTERVAL_MS;

      setVibrationLevel(level);
      setVibrationSnapshot(analyzeVibrationSamples(samples, actualSampleRate));
      setVibrationPattern(analyzeVibrationPattern(vibrationPatternSamplesRef.current));
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
      setAudioSnapshot(null);
      setVibrationSnapshot(null);
      setNoisePattern(null);
      setVibrationPattern(null);
      noisePatternSamplesRef.current = [];
      vibrationPatternSamplesRef.current = [];
      lastVibrationPatternUpdateRef.current = 0;
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

  const handleReset = () => {
    measurementRunIdRef.current += 1;
    setStep('select');
    setAmbientNoiseDb('');
    setVibrationLevel(0);
    setDirectSunlight(false);
    setIsRunningMeasurement(false);
    setRemainingSeconds(0);
    setAudioSnapshot(null);
    setVibrationSnapshot(null);
    setNoisePattern(null);
    setVibrationPattern(null);
    noisePatternSamplesRef.current = [];
    vibrationPatternSamplesRef.current = [];
    lastVibrationPatternUpdateRef.current = 0;
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
              동물 종류와 직사광선 조건을 선택해주세요.
            </Text>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>동물 종류</Text>
              <View style={styles.speciesOptionList}>
                {SPECIES_OPTIONS.map((option) => {
                  const active =
                    option === '기타 포유류'
                      ? (OTHER_MAMMAL_SUB as readonly string[]).includes(species)
                      : species === option;
                  return (
                    <Pressable
                      key={option}
                      style={[styles.speciesOptionChip, active && styles.speciesOptionChipActive]}
                      onPress={() => {
                        if (option === '기타 포유류') {
                          setSpecies('고슴도치');
                        } else {
                          setSpecies(option);
                        }
                      }}>
                      <Text
                        style={[
                          styles.speciesOptionChipText,
                          active && styles.speciesOptionChipTextActive,
                        ]}>
                        {option}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {(OTHER_MAMMAL_SUB as readonly string[]).includes(species) ? (
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>세부 종 선택</Text>
                <View style={styles.speciesOptionList}>
                  {OTHER_MAMMAL_SUB.map((sub) => {
                    const active = species === sub;
                    return (
                      <Pressable
                        key={sub}
                        style={[styles.speciesOptionChip, active && styles.speciesOptionChipActive]}
                        onPress={() => setSpecies(sub)}>
                        <Text
                          style={[
                            styles.speciesOptionChipText,
                            active && styles.speciesOptionChipTextActive,
                          ]}>
                          {sub}
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
            <RiskGraph
              title="소음 위험군"
              value={noiseValue}
              unit="dB"
              maxValue={100}
              cautionValue={animalGroupInfo.noiseCautionDb}
              warningValue={noiseWarningValue}
              patternLabel={noisePattern?.label}
              chartWidth={resultChartWidth}
              samples={noisePatternSamplesRef.current.map((sample) => ({
                timestampMs: sample.timestampMs,
                value: sample.approxDb,
              }))}
              detail={
                audioSnapshot
                  ? `주요 ${formatFrequencyHz(audioSnapshot.peakFrequencyHz)} · ${getDominantBandLabel(audioSnapshot)}`
                  : report.noiseBandLabel
              }
            />

            <RiskGraph
              title="진동 위험군"
              value={vibrationMgValue}
              unit="mg"
              maxValue={vibrationMaxValue}
              cautionValue={25}
              warningValue={50}
              patternLabel={vibrationPattern?.label}
              chartWidth={resultChartWidth}
              samples={vibrationSamplesMg}
              detail={
                vibrationSnapshot
                  ? `주요 ${formatFrequencyHz(vibrationSnapshot.peakFrequencyHz)} · ${getDominantVibrationBandLabel(
                      vibrationSnapshot
                    )}`
                  : getVibrationBandLabel(vibrationLevel)
              }
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
    gap: 30,
    marginTop: 6,
    paddingVertical: 4,
  },
  riskGraphCard: {
    gap: 16,
  },
  riskGraphHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  riskGraphTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  riskGraphDetail: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
  riskValueWrap: {
    alignItems: 'flex-end',
  },
  riskValue: {
    fontSize: 34,
    fontWeight: '800',
    color: colors.text,
  },
  riskUnit: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  chartWithAxis: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  yAxisLabels: {
    width: 24,
    height: 190,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingVertical: 2,
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
  riskPatternText: {
    fontSize: 12,
    lineHeight: 18,
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
