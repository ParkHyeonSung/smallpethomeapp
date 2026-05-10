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
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import AppHeader from '@/src/components/common/AppHeader';
import ScreenContainer from '@/src/components/common/ScreenContainer';
import { colors } from '@/src/constants/colors';
import {
  buildStressDiagnosisReport,
  StressDiagnosisReport,
  TrafficLevel,
} from '@/src/lib/stress-diagnosis';

const LEVEL_META: Record<
  StressDiagnosisReport['level'],
  { label: string; color: string; bg: string }
> = {
  stable: {
    label: '안정',
    color: '#236B4D',
    bg: '#E7F6EF',
  },
  caution: {
    label: '주의',
    color: '#9A6700',
    bg: '#FFF3D6',
  },
  warning: {
    label: '경고',
    color: '#A62D2D',
    bg: '#FDECEC',
  },
};

const MEASUREMENT_MS = 4000;

const recorderOptions = {
  ...RecordingPresets.LOW_QUALITY,
  isMeteringEnabled: true,
};

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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function mapMeteringToDb(metering: number) {
  return Math.round(clamp(metering + 100, 35, 100));
}

function mapVibrationRmsToLevel(rms: number) {
  return clamp(Math.round(rms * 42), 0, 10);
}

export default function StressDiagnosisScreen() {
  const audioRecorder = useAudioRecorder(recorderOptions);
  const recorderState = useAudioRecorderState(audioRecorder, 150);

  const vibrationSubscriptionRef = useRef<ReturnType<typeof Accelerometer.addListener> | null>(null);
  const vibrationSamplesRef = useRef<number[]>([]);
  const measurementTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [species, setSpecies] = useState('햄스터');
  const [cageWidthCm, setCageWidthCm] = useState('60');
  const [cageDepthCm, setCageDepthCm] = useState('40');
  const [ambientNoiseDb, setAmbientNoiseDb] = useState('62');
  const [vibrationLevel, setVibrationLevel] = useState(3);
  const [trafficLevel, setTrafficLevel] = useState<TrafficLevel>('medium');
  const [hideoutReady, setHideoutReady] = useState(true);
  const [ventilationReady, setVentilationReady] = useState(true);
  const [directSunlight, setDirectSunlight] = useState(false);
  const [nearSpeaker, setNearSpeaker] = useState(false);
  const [unstableFloor, setUnstableFloor] = useState(false);
  const [hasRunDiagnosis, setHasRunDiagnosis] = useState(false);

  const [noiseMeasurementLabel, setNoiseMeasurementLabel] = useState(
    '마이크 권한을 허용하면 4초간 주변 소음을 측정해 추정 dB 값을 채울 수 있습니다.'
  );
  const [vibrationMeasurementLabel, setVibrationMeasurementLabel] = useState(
    '기기를 케이지 받침대 근처에 두고 4초간 진동을 측정할 수 있습니다.'
  );
  const [isMeasuringNoise, setIsMeasuringNoise] = useState(false);
  const [isMeasuringVibration, setIsMeasuringVibration] = useState(false);
  const [latestMetering, setLatestMetering] = useState<number | null>(null);

  const report = useMemo(
    () =>
      buildStressDiagnosisReport({
        species,
        cageWidthCm: cageWidthCm ? Number(cageWidthCm) : null,
        cageDepthCm: cageDepthCm ? Number(cageDepthCm) : null,
        ambientNoiseDb: ambientNoiseDb ? Number(ambientNoiseDb) : 0,
        vibrationLevel,
        trafficLevel,
        hideoutReady,
        ventilationReady,
        directSunlight,
        nearSpeaker,
        unstableFloor,
      }),
    [
      species,
      cageWidthCm,
      cageDepthCm,
      ambientNoiseDb,
      vibrationLevel,
      trafficLevel,
      hideoutReady,
      ventilationReady,
      directSunlight,
      nearSpeaker,
      unstableFloor,
    ]
  );

  useEffect(() => {
    if (!isMeasuringNoise || recorderState.metering === undefined) {
      return;
    }

    setLatestMetering(recorderState.metering);
  }, [isMeasuringNoise, recorderState.metering]);

  useEffect(() => {
    return () => {
      if (measurementTimeoutRef.current) {
        clearTimeout(measurementTimeoutRef.current);
      }
      vibrationSubscriptionRef.current?.remove();
    };
  }, []);

  const stopNoiseMeasurement = async () => {
    if (measurementTimeoutRef.current) {
      clearTimeout(measurementTimeoutRef.current);
      measurementTimeoutRef.current = null;
    }

    if (recorderState.isRecording) {
      await audioRecorder.stop();
    }

    setIsMeasuringNoise(false);

    if (latestMetering === null) {
      setNoiseMeasurementLabel('충분한 소음 데이터를 읽지 못했습니다. 조금 더 큰 주변 소리에서 다시 시도해주세요.');
      return;
    }

    const estimatedDb = mapMeteringToDb(latestMetering);
    setAmbientNoiseDb(String(estimatedDb));
    setNoiseMeasurementLabel(
      `최근 4초 평균을 기준으로 추정 소음 ${estimatedDb} dB로 반영했습니다. 기기별 오차가 있어 참고용 수치로 사용해주세요.`
    );
  };

  const handleMeasureNoise = async () => {
    try {
      setNoiseMeasurementLabel('마이크 권한과 오디오 모드를 확인한 뒤 4초간 주변 소음을 측정합니다.');
      setLatestMetering(null);

      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setNoiseMeasurementLabel('마이크 권한이 없어 소음을 측정할 수 없습니다.');
        return;
      }

      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });

      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();

      setIsMeasuringNoise(true);
      measurementTimeoutRef.current = setTimeout(() => {
        void stopNoiseMeasurement();
      }, MEASUREMENT_MS);
    } catch (error) {
      setIsMeasuringNoise(false);
      setNoiseMeasurementLabel(
        error instanceof Error ? error.message : '마이크 소음 측정 중 문제가 발생했습니다.'
      );
    }
  };

  const handleMeasureVibration = async () => {
    try {
      setVibrationMeasurementLabel('가속도 센서를 연결해 4초간 진동을 수집합니다.');
      vibrationSamplesRef.current = [];

      const isAvailable = await Accelerometer.isAvailableAsync();
      if (!isAvailable) {
        setVibrationMeasurementLabel('현재 기기에서는 가속도 센서를 사용할 수 없습니다.');
        return;
      }

      if (typeof Accelerometer.requestPermissionsAsync === 'function') {
        const permission = await Accelerometer.requestPermissionsAsync();
        if (permission.status !== 'granted') {
          setVibrationMeasurementLabel('센서 권한이 없어 진동을 측정할 수 없습니다.');
          return;
        }
      }

      vibrationSubscriptionRef.current?.remove();
      Accelerometer.setUpdateInterval(100);
      setIsMeasuringVibration(true);

      vibrationSubscriptionRef.current = Accelerometer.addListener(({ x, y, z }) => {
        const magnitude = Math.sqrt(x * x + y * y + z * z);
        const deltaFromGravity = Math.abs(magnitude - 1);
        vibrationSamplesRef.current.push(deltaFromGravity);
      });

      setTimeout(() => {
        vibrationSubscriptionRef.current?.remove();
        vibrationSubscriptionRef.current = null;
        setIsMeasuringVibration(false);

        const samples = vibrationSamplesRef.current;
        if (!samples.length) {
          setVibrationMeasurementLabel('진동 데이터를 읽지 못했습니다. 기기를 고정한 상태로 다시 시도해주세요.');
          return;
        }

        const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
        const level = mapVibrationRmsToLevel(rms);

        setVibrationLevel(level);
        setVibrationMeasurementLabel(
          `4초간 측정한 진동 RMS를 기준으로 ${level}/10 단계로 반영했습니다. 측정 중에는 기기를 케이지 받침대 가까이에 두는 것이 좋습니다.`
        );
      }, MEASUREMENT_MS);
    } catch (error) {
      setIsMeasuringVibration(false);
      setVibrationMeasurementLabel(
        error instanceof Error ? error.message : '가속도 센서 측정 중 문제가 발생했습니다.'
      );
    }
  };

  const meta = LEVEL_META[report.level];

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.topRow}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
          <AppHeader
            title="스트레스 진단"
            subtitle="실제 마이크와 가속도 센서로 환경을 측정하고, 논문 기반 소음 구간과 함께 입주 전 위험도를 진단합니다."
          />
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>실측 기반 환경 점검</Text>
          <Text style={styles.heroText}>
            소음은 마이크 입력 레벨에서 추정 dB로 환산하고, 진동은 스마트폰 MEMS 가속도 센서로 수집합니다.
            정확한 공인 계측값은 아니므로 발표에서는 간이 진단 도구로 설명하는 것이 가장 안전합니다.
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>기본 정보</Text>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>동물 종</Text>
            <TextInput
              value={species}
              onChangeText={setSpecies}
              placeholder="예: 햄스터, 고슴도치"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>

          <View style={styles.inlineFields}>
            <View style={styles.inlineField}>
              <Text style={styles.fieldLabel}>케이지 가로(cm)</Text>
              <TextInput
                value={cageWidthCm}
                onChangeText={setCageWidthCm}
                keyboardType="number-pad"
                placeholder="60"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
            </View>
            <View style={styles.inlineField}>
              <Text style={styles.fieldLabel}>케이지 세로(cm)</Text>
              <TextInput
                value={cageDepthCm}
                onChangeText={setCageDepthCm}
                keyboardType="number-pad"
                placeholder="40"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>실제 측정</Text>

          <View style={styles.measureCard}>
            <View style={styles.measureHeader}>
              <Text style={styles.measureTitle}>주변 소음 측정</Text>
              <Text style={styles.measureValue}>{ambientNoiseDb || '0'} dB</Text>
            </View>
            <Text style={styles.helperText}>
              65dB 미만은 안정, 65dB 이상은 주의 시작, 80dB 이상은 높은 스트레스 가능성, 85dB 이상은 피해야 할
              고소음 구간으로 판단합니다.
            </Text>
            <Pressable
              style={[styles.measureButton, isMeasuringNoise && styles.measureButtonDisabled]}
              onPress={() => void handleMeasureNoise()}
              disabled={isMeasuringNoise}>
              <Text style={styles.measureButtonText}>
                {isMeasuringNoise ? '소음 측정 중...' : '마이크로 소음 측정'}
              </Text>
            </Pressable>
            <Text style={styles.measureDescription}>{noiseMeasurementLabel}</Text>
          </View>

          <View style={styles.measureCard}>
            <View style={styles.measureHeader}>
              <Text style={styles.measureTitle}>진동 측정</Text>
              <Text style={styles.measureValue}>{vibrationLevel}/10</Text>
            </View>
            <Text style={styles.helperText}>
              기기를 케이지 받침대 근처에 두고 측정하면 바닥 흔들림이나 생활 진동을 간이 수준으로 확인할 수 있습니다.
            </Text>
            <Pressable
              style={[styles.measureButton, isMeasuringVibration && styles.measureButtonDisabled]}
              onPress={() => void handleMeasureVibration()}
              disabled={isMeasuringVibration}>
              <Text style={styles.measureButtonText}>
                {isMeasuringVibration ? '진동 측정 중...' : '가속도 센서로 진동 측정'}
              </Text>
            </Pressable>
            <Text style={styles.measureDescription}>{vibrationMeasurementLabel}</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>환경 체크 항목</Text>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>사람 이동량</Text>
            <View style={styles.choiceRow}>
              {([
                ['low', '적음'],
                ['medium', '보통'],
                ['high', '많음'],
              ] as const).map(([value, label]) => (
                <Pressable
                  key={value}
                  style={[styles.choiceChip, trafficLevel === value && styles.choiceChipActive]}
                  onPress={() => setTrafficLevel(value)}>
                  <Text
                    style={[
                      styles.choiceChipText,
                      trafficLevel === value && styles.choiceChipTextActive,
                    ]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <BooleanField label="은신처가 준비되어 있나요?" value={hideoutReady} onChange={setHideoutReady} />
          <BooleanField
            label="케이지 주변 환기 공간이 확보되어 있나요?"
            value={ventilationReady}
            onChange={setVentilationReady}
          />
          <BooleanField
            label="직사광선이 직접 들어오나요?"
            value={directSunlight}
            onChange={setDirectSunlight}
          />
          <BooleanField
            label="스피커나 TV와 가까운가요?"
            value={nearSpeaker}
            onChange={setNearSpeaker}
          />
          <BooleanField
            label="바닥이나 선반이 흔들리나요?"
            value={unstableFloor}
            onChange={setUnstableFloor}
          />
        </View>

        <Pressable style={styles.diagnosisButton} onPress={() => setHasRunDiagnosis(true)}>
          <Text style={styles.diagnosisButtonText}>진단 리포트 보기</Text>
        </Pressable>

        {hasRunDiagnosis ? (
          <View style={styles.reportCard}>
            <View style={styles.reportHeader}>
              <View style={[styles.levelBadge, { backgroundColor: meta.bg }]}>
                <Text style={[styles.levelBadgeText, { color: meta.color }]}>{meta.label}</Text>
              </View>
              <Text style={styles.scoreText}>위험 점수 {report.score}점</Text>
            </View>

            <View style={styles.noiseBandCard}>
              <Text style={styles.noiseBandTitle}>소음 판단 구간</Text>
              <Text style={styles.noiseBandValue}>{report.noiseBandLabel}</Text>
            </View>

            <Text style={styles.reportSummary}>{report.summary}</Text>

            <View style={styles.reportSection}>
              <Text style={styles.reportSectionTitle}>주요 체크 포인트</Text>
              {report.highlights.map((item) => (
                <View key={item} style={styles.reportRow}>
                  <Ionicons name="alert-circle-outline" size={18} color={colors.primaryStrong} />
                  <Text style={styles.reportRowText}>{item}</Text>
                </View>
              ))}
            </View>

            <View style={styles.reportSection}>
              <Text style={styles.reportSectionTitle}>추천 조치</Text>
              {report.recommendations.map((item) => (
                <View key={item} style={styles.reportRow}>
                  <Ionicons name="checkmark-circle-outline" size={18} color={colors.primaryStrong} />
                  <Text style={styles.reportRowText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  heroText: {
    fontSize: 14,
    lineHeight: 22,
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
    fontSize: 19,
    fontWeight: '700',
    color: colors.text,
  },
  fieldBlock: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  helperText: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textMuted,
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
  inlineFields: {
    flexDirection: 'row',
    gap: 12,
  },
  inlineField: {
    flex: 1,
    gap: 8,
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
  scaleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scaleValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primaryStrong,
  },
  scaleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  scaleDot: {
    flex: 1,
    height: 12,
    borderRadius: 999,
    backgroundColor: colors.backgroundAccent,
  },
  scaleDotActive: {
    backgroundColor: colors.accent,
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
    fontWeight: '700',
    color: colors.primaryStrong,
  },
  measureButton: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  measureButtonDisabled: {
    opacity: 0.7,
  },
  measureButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  measureDescription: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textMuted,
  },
  diagnosisButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: colors.primary,
  },
  diagnosisButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
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
    fontWeight: '700',
    color: colors.primaryStrong,
  },
  reportSummary: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.text,
  },
  reportSection: {
    gap: 12,
  },
  reportSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
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
});
