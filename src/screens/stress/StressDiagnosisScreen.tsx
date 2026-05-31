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
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import AppHeader from '@/src/components/common/AppHeader';
import ScreenContainer from '@/src/components/common/ScreenContainer';
import { colors } from '@/src/constants/colors';
import { buildStressAiPayload, buildStressAiPreview, StressAiPreview } from '@/src/lib/stress-ai';
import { buildStressDiagnosisReport, StressDiagnosisReport } from '@/src/lib/stress-diagnosis';
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

const MEASUREMENT_MS = 4000;

const recorderOptions = {
  ...RecordingPresets.LOW_QUALITY,
  isMeteringEnabled: true,
};

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

export default function StressDiagnosisScreen() {
  const isWeb = Platform.OS === 'web';
  const audioRecorder = useAudioRecorder(recorderOptions);
  const recorderState = useAudioRecorderState(audioRecorder, 150);

  const vibrationSubscriptionRef = useRef<ReturnType<typeof Accelerometer.addListener> | null>(null);
  const latestMeteringRef = useRef<number | null>(null);

  const [species, setSpecies] = useState('햄스터');
  const [ambientNoiseDb, setAmbientNoiseDb] = useState('');
  const [vibrationLevel, setVibrationLevel] = useState(0);
  const [directSunlight, setDirectSunlight] = useState(false);

  const [permissionStatusText, setPermissionStatusText] = useState(
    '측정 시작을 누르면 마이크와 센서 권한을 확인한 뒤 소음과 진동을 연속 측정합니다.'
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
  const [hasRunDiagnosis, setHasRunDiagnosis] = useState(false);
  const [isSavingReport, setIsSavingReport] = useState(false);
  const [isRunningMeasurement, setIsRunningMeasurement] = useState(false);
  const [aiPreview, setAiPreview] = useState<StressAiPreview | null>(null);

  const diagnosisInput = useMemo(
    () => ({
      species,
      cageWidthCm: null,
      cageDepthCm: null,
      ambientNoiseDb: ambientNoiseDb ? Number(ambientNoiseDb) : 0,
      vibrationLevel,
      trafficLevel: 'low' as const,
      hideoutReady: true,
      ventilationReady: true,
      directSunlight,
      nearSpeaker: false,
      unstableFloor: false,
      measurementMode: 'current' as const,
    }),
    [ambientNoiseDb, directSunlight, species, vibrationLevel]
  );

  const report = useMemo(() => buildStressDiagnosisReport(diagnosisInput), [diagnosisInput]);

  const canSaveReport = hasMeasuredNoise && hasMeasuredVibration && hasRunDiagnosis;

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
      measurementDurationSec: 8,
      report,
    });

    setAiPreview(buildStressAiPreview(payload));
  }, [canSaveReport, diagnosisInput, report]);

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
      setPermissionStatusText('권한 확인이 완료되어 바로 측정을 진행할 수 있어요.');
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

  const measureNoise = async () => {
    latestMeteringRef.current = null;
    setHasMeasuredNoise(false);
    setIsMeasuringNoise(true);
    setNoiseMeasurementLabel('소음을 측정하고 있어요...');

    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();

      await sleep(MEASUREMENT_MS);
      await audioRecorder.stop();

      const metering = latestMeteringRef.current;
      if (metering === null) {
        setNoiseMeasurementLabel('유효한 소음 값을 읽지 못했어요. 다시 측정해 주세요.');
        return null;
      }

      const estimatedDb = mapMeteringToDb(metering);
      setAmbientNoiseDb(String(estimatedDb));
      setHasMeasuredNoise(true);
      setNoiseMeasurementLabel(`${estimatedDb} dB로 측정되었어요.`);
      return estimatedDb;
    } catch (error) {
      setNoiseMeasurementLabel(
        error instanceof Error ? error.message : '소음 측정 중 문제가 발생했어요.'
      );
      return null;
    } finally {
      setIsMeasuringNoise(false);
    }
  };

  const measureVibration = async () => {
    setHasMeasuredVibration(false);
    setIsMeasuringVibration(true);
    setVibrationMeasurementLabel('진동을 측정하고 있어요...');

    try {
      const isAvailable = await Accelerometer.isAvailableAsync();
      if (!isAvailable) {
        setVibrationMeasurementLabel('이 기기에서는 진동 센서를 사용할 수 없어요.');
        return null;
      }

      const samples: number[] = [];
      Accelerometer.setUpdateInterval(100);

      vibrationSubscriptionRef.current?.remove();
      vibrationSubscriptionRef.current = Accelerometer.addListener(({ x, y, z }) => {
        const magnitude = Math.sqrt(x * x + y * y + z * z);
        const deltaFromGravity = Math.abs(magnitude - 1);
        samples.push(deltaFromGravity);
      });

      await sleep(MEASUREMENT_MS);

      vibrationSubscriptionRef.current?.remove();
      vibrationSubscriptionRef.current = null;

      if (!samples.length) {
        setVibrationMeasurementLabel('유효한 진동 값을 읽지 못했어요. 다시 측정해 주세요.');
        return null;
      }

      const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
      const level = mapVibrationRmsToLevel(rms);

      setVibrationLevel(level);
      setHasMeasuredVibration(true);
      setVibrationMeasurementLabel(`${getVibrationBandLabel(level)} (${level}/10)으로 측정되었어요.`);
      return level;
    } catch (error) {
      setVibrationMeasurementLabel(
        error instanceof Error ? error.message : '진동 측정 중 문제가 발생했어요.'
      );
      return null;
    } finally {
      setIsMeasuringVibration(false);
    }
  };

  const handleStartMeasurement = async () => {
    if (isWeb) {
      Alert.alert('모바일 전용 기능', '스트레스 진단은 휴대폰 앱에서만 사용할 수 있습니다.');
      return;
    }

    try {
      setIsRunningMeasurement(true);
      setHasRunDiagnosis(false);

      const permissionsReady = await ensureMeasurementPermissions();
      if (!permissionsReady) {
        return;
      }

      const noise = await measureNoise();
      const vibration = await measureVibration();

      if (noise !== null && vibration !== null) {
        setHasRunDiagnosis(true);
      }
    } finally {
      setIsRunningMeasurement(false);
    }
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
            <Text style={styles.mobileOnlyTitle}>모바일 앱에서만 사용할 수 있어요.</Text>
            <Text style={styles.mobileOnlyText}>
              스트레스 진단은 휴대폰의 마이크와 가속도 센서를 사용하므로 PC 웹에서는 실행할 수 없어요.
            </Text>
            <Pressable
              style={styles.recordsButton}
              onPress={() => router.push('/stress-reports' as never)}>
              <Text style={styles.recordsButtonText}>진단 기록 보기</Text>
            </Pressable>
          </View>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.topRow}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
          <AppHeader
            title="입주 전 환경 적합성 진단"
            subtitle="소음과 진동을 먼저 측정하고 직사광선 여부만 보정합니다."
          />
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>측정 시작</Text>
          <Text style={styles.heroDuration}>약 8초 소요</Text>
          <Pressable
            style={[styles.heroActionButton, isRunningMeasurement && styles.measureButtonDisabled]}
            onPress={() => void handleStartMeasurement()}
            disabled={isRunningMeasurement}>
            <Text style={styles.heroActionButtonText}>
              {isRunningMeasurement ? '측정 중...' : '측정 시작'}
            </Text>
          </Pressable>
          <Text style={styles.heroHint}>
            더 정확한 확인이 필요하면 소음이나 진동이 큰 시간대에 한 번 더 측정해 보세요.
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>측정 상태</Text>
          <Text style={styles.statusDescription}>{permissionStatusText}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, microphoneReady && styles.statusBadgeActive]}>
              <Text style={[styles.statusBadgeText, microphoneReady && styles.statusBadgeTextActive]}>
                마이크 {microphoneReady ? '허용됨' : '대기중'}
              </Text>
            </View>
            <View style={[styles.statusBadge, motionReady && styles.statusBadgeActive]}>
              <Text style={[styles.statusBadgeText, motionReady && styles.statusBadgeTextActive]}>
                센서 {motionReady ? '허용됨' : '대기중'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>기본 정보</Text>
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>동물 종류</Text>
            <TextInput
              value={species}
              onChangeText={setSpecies}
              placeholder="예: 햄스터"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>측정 결과</Text>

          <View style={styles.measureCard}>
            <View style={styles.measureHeader}>
              <Text style={styles.measureTitle}>소음</Text>
              <Text style={styles.measureValue}>{ambientNoiseDb ? `${ambientNoiseDb} dB` : '미측정'}</Text>
            </View>
            <Text style={styles.measureDescription}>{noiseMeasurementLabel}</Text>
          </View>

          <View style={styles.measureCard}>
            <View style={styles.measureHeader}>
              <Text style={styles.measureTitle}>진동</Text>
              <Text style={styles.measureValue}>
                {hasMeasuredVibration ? `${getVibrationBandLabel(vibrationLevel)} (${vibrationLevel}/10)` : '미측정'}
              </Text>
            </View>
            <Text style={styles.measureDescription}>{vibrationMeasurementLabel}</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>선택 보정</Text>
          <BooleanField label="직사광선이 직접 들어오나요?" value={directSunlight} onChange={setDirectSunlight} />
        </View>

        {canSaveReport ? (
          <View style={styles.reportCard}>
            <View style={styles.reportHeader}>
              <View style={[styles.levelBadge, { backgroundColor: meta.backgroundColor }]}>
                <Text style={[styles.levelBadgeText, { color: meta.color }]}>{meta.label}</Text>
              </View>
              <Text style={styles.scoreText}>총점 {report.score}점</Text>
            </View>

            <Text style={styles.reportSummary}>{report.summary}</Text>

            <View style={styles.noiseBandCard}>
              <Text style={styles.noiseBandTitle}>소음 추정 등급</Text>
              <Text style={styles.noiseBandValue}>{report.noiseBandLabel}</Text>
            </View>

            <View style={styles.noticePill}>
              <Ionicons name="information-circle-outline" size={16} color={colors.primaryStrong} />
              <Text style={styles.noticePillText}>{report.measurementNotice}</Text>
            </View>

            <View style={styles.reportSection}>
              {report.highlights.map((item) => (
                <View key={item} style={styles.reportRow}>
                  <Ionicons name="alert-circle-outline" size={18} color={colors.primaryStrong} />
                  <Text style={styles.reportRowText}>{item}</Text>
                </View>
              ))}
            </View>

            <View style={styles.reportSection}>
              {report.recommendations.map((item) => (
                <View key={item} style={styles.reportRow}>
                  <Ionicons name="checkmark-circle-outline" size={18} color={colors.primaryStrong} />
                  <Text style={styles.reportRowText}>{item}</Text>
                </View>
              ))}
            </View>

            {aiPreview ? (
              <View style={styles.aiCard}>
                <Text style={styles.aiTitle}>{aiPreview.title}</Text>
                <Text style={styles.aiBody}>{aiPreview.body}</Text>
              </View>
            ) : null}

            <Text style={styles.inlineNotice}>
              더 전문적으로 확인하려면 생활 소음이나 진동이 큰 시간대에 다시 측정해 보세요.
            </Text>

            <Pressable
              style={[styles.saveReportButton, isSavingReport && styles.saveReportButtonDisabled]}
              onPress={() => void handleSaveReport()}
              disabled={isSavingReport}>
              <Text style={styles.saveReportButtonText}>
                {isSavingReport ? '저장 중...' : '진단 결과 저장하기'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
  recordsButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  recordsButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  scrollContent: {
    padding: 20,
    gap: 16,
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
  heroCard: {
    padding: 20,
    borderRadius: 24,
    backgroundColor: colors.primaryStrong,
    gap: 10,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroDuration: {
    fontSize: 13,
    color: '#D6E7DF',
  },
  heroActionButton: {
    marginTop: 8,
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  heroActionButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primaryStrong,
  },
  heroHint: {
    fontSize: 13,
    lineHeight: 20,
    color: '#E5F0EC',
  },
  sectionCard: {
    padding: 18,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  statusDescription: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textMuted,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  statusBadgeActive: {
    backgroundColor: colors.primaryLight,
    borderColor: '#B9D8CC',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  statusBadgeTextActive: {
    color: colors.primaryStrong,
  },
  fieldBlock: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  input: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.background,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.text,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choiceChip: {
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.background,
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
  measureCard: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    gap: 10,
  },
  measureHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  measureTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  measureValue: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primaryStrong,
  },
  measureDescription: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textMuted,
  },
  measureButtonDisabled: {
    opacity: 0.6,
  },
  reportCard: {
    padding: 18,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 18,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  levelBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  levelBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  scoreText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  reportSummary: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
  },
  noiseBandCard: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    gap: 4,
  },
  noiseBandTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  noiseBandValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primaryStrong,
  },
  noticePill: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
  },
  noticePillText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
  },
  reportSection: {
    gap: 12,
  },
  reportRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  reportRowText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
  },
  aiCard: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    gap: 8,
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
  inlineNotice: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
  },
  saveReportButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: colors.primaryStrong,
  },
  saveReportButtonDisabled: {
    opacity: 0.7,
  },
  saveReportButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
