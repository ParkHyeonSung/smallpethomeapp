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
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import AppHeader from '@/src/components/common/AppHeader';
import ScreenContainer from '@/src/components/common/ScreenContainer';
import { colors } from '@/src/constants/colors';
import { buildStressAiPayload, buildStressAiPreview, StressAiPreview } from '@/src/lib/stress-ai';
import {
  buildStressDiagnosisReport,
  StressDiagnosisInput,
  StressDiagnosisReport,
} from '@/src/lib/stress-diagnosis';
import { saveStressReport } from '@/src/lib/stress-reports';

const LEVEL_META: Record<
  StressDiagnosisReport['level'],
  { label: string; color: string; backgroundColor: string }
> = {
  stable: {
    label: '적합',
    color: '#236B4D',
    backgroundColor: '#E7F6EF',
  },
  caution: {
    label: '주의',
    color: '#9A6700',
    backgroundColor: '#FFF3D6',
  },
  warning: {
    label: '부적합',
    color: '#A62D2D',
    backgroundColor: '#FDECEC',
  },
};

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

const SPECIES_OPTIONS = ['설치류', '기니피그류', '토끼류', '파충류', '기타 소형 포유류'] as const;
const VIBRATION_SAMPLE_INTERVAL_MS = 20;

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
  const audioRecorder = useAudioRecorder(recorderOptions);
  const recorderState = useAudioRecorderState(audioRecorder, 150);

  const vibrationSubscriptionRef = useRef<ReturnType<typeof Accelerometer.addListener> | null>(null);
  const latestMeteringRef = useRef<number | null>(null);
  const measurementRunIdRef = useRef(0);

  const [step, setStep] = useState<Step>('select');
  const [measurementType, setMeasurementType] = useState<MeasurementType>('quick');
  const [species, setSpecies] = useState<(typeof SPECIES_OPTIONS)[number]>('설치류');
  const [ambientNoiseDb, setAmbientNoiseDb] = useState('');
  const [vibrationLevel, setVibrationLevel] = useState(0);
  const [directSunlight, setDirectSunlight] = useState(false);

  const [permissionStatusText, setPermissionStatusText] = useState(
    '측정을 시작하면 마이크와 센서 권한을 확인한 뒤 소음과 진동을 순서대로 측정합니다.'
  );
  const [microphoneReady, setMicrophoneReady] = useState(false);
  const [motionReady, setMotionReady] = useState(false);

  const [noiseMeasurementLabel, setNoiseMeasurementLabel] = useState('아직 소음 측정을 진행하지 않았어요.');
  const [vibrationMeasurementLabel, setVibrationMeasurementLabel] = useState(
    '아직 진동 측정을 진행하지 않았어요.'
  );
  const [isMeasuringNoise, setIsMeasuringNoise] = useState(false);
  const [isMeasuringVibration, setIsMeasuringVibration] = useState(false);
  const [hasMeasuredNoise, setHasMeasuredNoise] = useState(false);
  const [hasMeasuredVibration, setHasMeasuredVibration] = useState(false);
  const [isSavingReport, setIsSavingReport] = useState(false);
  const [isRunningMeasurement, setIsRunningMeasurement] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [aiPreview, setAiPreview] = useState<StressAiPreview | null>(null);

  const selectedOption = MEASUREMENT_OPTIONS[measurementType];

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
  const canSaveReport = step === 'result' && hasMeasuredNoise && hasMeasuredVibration;

  useEffect(() => {
    if (!isMeasuringNoise || recorderState.metering === undefined) {
      return;
    }

    latestMeteringRef.current = recorderState.metering;
  }, [isMeasuringNoise, recorderState.metering]);

  useEffect(() => {
    return () => {
      vibrationSubscriptionRef.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (!canSaveReport) {
      setAiPreview(null);
      return;
    }

    const payload = buildStressAiPayload(diagnosisInput, {
      measurementDurationSec: selectedOption.durationSec,
      report,
    });
    setAiPreview(buildStressAiPreview(payload));
  }, [canSaveReport, diagnosisInput, report, selectedOption.durationSec]);

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

    setMicrophoneReady(microphoneGranted);
    setMotionReady(motionGranted);

    if (microphoneGranted && motionGranted) {
      setPermissionStatusText('권한 확인이 완료되어 측정을 진행할 수 있어요.');
      return true;
    }

    if (!microphoneGranted && !motionGranted) {
      setPermissionStatusText('마이크와 센서 권한이 모두 필요해요.');
      return false;
    }

    if (!microphoneGranted) {
      setPermissionStatusText('소음 측정을 위해 마이크 권한이 필요해요.');
      return false;
    }

    setPermissionStatusText('진동 측정을 위해 센서 권한이 필요해요.');
    return false;
  };

  const measureNoiseAndVibration = async (durationMs: number) => {
    latestMeteringRef.current = null;
    setHasMeasuredNoise(false);
    setHasMeasuredVibration(false);
    setIsMeasuringNoise(true);
    setIsMeasuringVibration(true);
    setNoiseMeasurementLabel('소음을 측정하고 있어요...');
    setVibrationMeasurementLabel('진동을 측정하고 있어요...');

    try {
      const isAvailable = await Accelerometer.isAvailableAsync();
      if (!isAvailable) {
        setVibrationMeasurementLabel('이 기기에서는 진동 센서를 사용할 수 없어요.');
        return { noise: null, vibration: null };
      }

      const samples: number[] = [];
      // Use a denser sampling interval so short low-amplitude vibrations are less likely
      // to be lost than they were with the previous coarse 100 ms polling.
      Accelerometer.setUpdateInterval(VIBRATION_SAMPLE_INTERVAL_MS);

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();

      vibrationSubscriptionRef.current?.remove();
      vibrationSubscriptionRef.current = Accelerometer.addListener(({ x, y, z }) => {
        const magnitude = Math.sqrt(x * x + y * y + z * z);
        const deltaFromGravity = Math.abs(magnitude - 1);
        samples.push(deltaFromGravity);
      });

      await sleep(durationMs);

      await audioRecorder.stop();

      vibrationSubscriptionRef.current?.remove();
      vibrationSubscriptionRef.current = null;

      const metering = latestMeteringRef.current;
      let estimatedDb: number | null = null;
      if (metering === null) {
        setNoiseMeasurementLabel('유효한 소음 값을 읽지 못했어요. 다시 측정해 주세요.');
      } else {
        estimatedDb = mapMeteringToDb(metering);
        setAmbientNoiseDb(String(estimatedDb));
        setHasMeasuredNoise(true);
        setNoiseMeasurementLabel(`${estimatedDb} dB로 측정됐어요.`);
      }

      if (!samples.length) {
        setVibrationMeasurementLabel('유효한 진동 값을 읽지 못했어요. 다시 측정해 주세요.');
        return { noise: estimatedDb, vibration: null };
      }

      const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
      const level = mapVibrationRmsToLevel(rms);

      setVibrationLevel(level);
      setHasMeasuredVibration(true);
      setVibrationMeasurementLabel(`${getVibrationBandLabel(level)} (${level}/10)로 측정됐어요.`);
      return { noise: estimatedDb, vibration: level };
    } catch (error) {
      setNoiseMeasurementLabel(
        error instanceof Error ? error.message : '소음 측정 중 문제가 발생했어요.'
      );
      setVibrationMeasurementLabel(
        error instanceof Error ? error.message : '진동 측정 중 문제가 발생했어요.'
      );
      return { noise: null, vibration: null };
    } finally {
      try {
        if (audioRecorder.isRecording) {
          await audioRecorder.stop();
        }
      } catch {}

      vibrationSubscriptionRef.current?.remove();
      vibrationSubscriptionRef.current = null;
      setIsMeasuringVibration(false);
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
      setHasMeasuredNoise(false);
      setHasMeasuredVibration(false);
      setAmbientNoiseDb('');
      setVibrationLevel(0);
      setAiPreview(null);
      setStep('measuring');
      setRemainingSeconds(selectedOption.durationSec);
      setNoiseMeasurementLabel('소음을 측정하고 있어요...');
      setVibrationMeasurementLabel('진동을 측정하고 있어요...');

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
    setHasMeasuredNoise(false);
    setHasMeasuredVibration(false);
    setIsRunningMeasurement(false);
    setRemainingSeconds(0);
    setAiPreview(null);
    setNoiseMeasurementLabel('아직 소음 측정을 진행하지 않았어요.');
    setVibrationMeasurementLabel('아직 진동 측정을 진행하지 않았어요.');
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

  const meta = LEVEL_META[report.level];

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
    <ScreenContainer>
      <View style={styles.container}>
        <View style={styles.topRow}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
          <AppHeader
            title="입주 전 환경 적합성 진단"
            subtitle="소음과 진동을 측정하고 결과를 바로 확인합니다."
          />
        </View>

        {step === 'select' ? (
          <View style={styles.centerCard}>
            <Text style={styles.eyebrow}>Stress Check</Text>
            <Text style={styles.centerTitle}>측정 방식을 선택해 주세요.</Text>
            <Text style={styles.centerDescription}>
              현재 환경을 빠르게 확인하거나 더 길게 측정해 환경 변동을 더 많이 반영할 수 있어요.
            </Text>

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
                      <Ionicons name="chevron-forward" size={18} color={colors.primaryStrong} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {step === 'sunlight' ? (
          <View style={styles.centerCard}>
            <Text style={styles.eyebrow}>{selectedOption.label}</Text>
            <Text style={styles.centerTitle}>{selectedOption.label} 전 확인</Text>
            <Text style={styles.centerDescription}>
              동물 종류를 선택하고 직사광선 조건만 먼저 반영할게요.
            </Text>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>동물 종류</Text>
              <View style={styles.speciesOptionList}>
                {SPECIES_OPTIONS.map((option) => {
                  const active = species === option;
                  return (
                    <Pressable
                      key={option}
                      style={[styles.speciesOptionChip, active && styles.speciesOptionChipActive]}
                      onPress={() => setSpecies(option)}>
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
          <View style={styles.centerCard}>
            <Text style={styles.eyebrow}>{selectedOption.label}</Text>
            <Text style={styles.centerTitle}>{selectedOption.label} 중...</Text>
            <Text style={styles.centerDescription}>{permissionStatusText}</Text>

            <View style={styles.timerCircle}>
              <View style={styles.timerWrap}>
                <Ionicons name="time-outline" size={42} color={colors.primaryStrong} />
                <Text style={styles.timerValue}>{formatCountdown(remainingSeconds)}</Text>
              </View>
            </View>

            <View style={styles.measureSummaryCard}>
              <Text style={styles.measureSummaryLabel}>{noiseMeasurementLabel}</Text>
              <Text style={styles.measureSummaryLabel}>{vibrationMeasurementLabel}</Text>
            </View>
          </View>
        ) : null}

        {step === 'result' ? (
          <View style={styles.resultCard}>
            <Text style={styles.eyebrow}>Result</Text>
            <View style={styles.resultHeader}>
              <View style={[styles.levelBadge, { backgroundColor: meta.backgroundColor }]}>
                <Text style={[styles.levelBadgeText, { color: meta.color }]}>{meta.label}</Text>
              </View>
              <Text style={styles.modePill}>{selectedOption.label}</Text>
            </View>

            <Text style={styles.resultMetrics}>
              {report.score}점 · 소음 {ambientNoiseDb || '0'} dB · 진동 {vibrationLevel}/10
            </Text>
            <Text style={styles.resultInterpretation}>
              소음 {report.noiseBandLabel} · 진동 {getVibrationBandLabel(vibrationLevel)}
            </Text>
            <Text style={styles.reportSummary}>{report.summary}</Text>

            {aiPreview ? (
              <View style={styles.aiCard}>
                <Text style={styles.aiTitle}>{aiPreview.title}</Text>
                <Text style={styles.aiBody}>{aiPreview.body}</Text>
              </View>
            ) : null}

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
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mobileOnlyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  mobileOnlyText: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.textMuted,
    textAlign: 'center',
  },
  topRow: {
    gap: 14,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  centerCard: {
    flex: 1,
    padding: 26,
    borderRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 20,
    justifyContent: 'center',
    shadowColor: '#111111',
    shadowOpacity: 0.04,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 2,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.textMuted,
    textAlign: 'center',
  },
  centerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  centerDescription: {
    fontSize: 15,
    lineHeight: 24,
    color: colors.textMuted,
    textAlign: 'center',
  },
  optionList: {
    gap: 14,
  },
  optionButton: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderRadius: 24,
    backgroundColor: '#F7F3EB',
    borderWidth: 1,
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
    fontWeight: '800',
    color: colors.text,
  },
  optionButtonDuration: {
    fontSize: 13,
    fontWeight: '700',
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
    backgroundColor: '#F7F3EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speciesOptionChipActive: {
    borderColor: colors.primaryStrong,
    backgroundColor: colors.primaryLight,
  },
  speciesOptionChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textMuted,
  },
  speciesOptionChipTextActive: {
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
    backgroundColor: '#F7F3EB',
    borderWidth: 1,
    borderColor: colors.border,
  },
  choiceChipActive: {
    backgroundColor: colors.primaryLight,
    borderColor: '#B9D8CC',
  },
  choiceChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  choiceChipTextActive: {
    color: colors.primaryStrong,
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryStrong,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  secondaryButton: {
    minHeight: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F3EB',
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  buttonDisabled: {
    opacity: 0.65,
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
    borderColor: '#D7D0C1',
    backgroundColor: '#F7F3EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerValue: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.text,
  },
  measureSummaryCard: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: '#F7F3EB',
    gap: 12,
  },
  measureSummaryLabel: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
    textAlign: 'center',
  },
  resultCard: {
    flex: 1,
    padding: 26,
    borderRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 16,
    shadowColor: '#111111',
    shadowOpacity: 0.04,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 2,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  levelBadge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  levelBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  modePill: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  resultMetrics: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 34,
  },
  resultInterpretation: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primaryStrong,
  },
  reportSummary: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.text,
  },
  aiCard: {
    padding: 16,
    borderRadius: 22,
    backgroundColor: '#F7F3EB',
    gap: 10,
  },
  aiTitle: {
    fontSize: 14,
    fontWeight: '800',
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
