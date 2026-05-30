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
import {
  buildStressDiagnosisReport,
  StressDiagnosisReport,
  TrafficLevel,
} from '@/src/lib/stress-diagnosis';
import { saveStressReport } from '@/src/lib/stress-reports';

const LEVEL_META: Record<
  StressDiagnosisReport['level'],
  { label: string; color: string; backgroundColor: string }
> = {
  stable: {
    label: '안정',
    color: '#236B4D',
    backgroundColor: '#E7F6EF',
  },
  caution: {
    label: '주의',
    color: '#9A6700',
    backgroundColor: '#FFF3D6',
  },
  warning: {
    label: '위험',
    color: '#A62D2D',
    backgroundColor: '#FDECEC',
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

function getVibrationBandLabel(level: number) {
  if (level >= 8) return '매우 높음';
  if (level >= 6) return '높음';
  if (level >= 4) return '보통';
  if (level >= 2) return '낮음';
  return '매우 낮음';
}

export default function StressDiagnosisScreen() {
  const isWeb = Platform.OS === 'web';
  const audioRecorder = useAudioRecorder(recorderOptions);
  const recorderState = useAudioRecorderState(audioRecorder, 150);

  const vibrationSubscriptionRef = useRef<ReturnType<typeof Accelerometer.addListener> | null>(null);
  const noiseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vibrationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vibrationSamplesRef = useRef<number[]>([]);

  const [species, setSpecies] = useState('햄스터');
  const [cageWidthCm, setCageWidthCm] = useState('60');
  const [cageDepthCm, setCageDepthCm] = useState('40');
  const [ambientNoiseDb, setAmbientNoiseDb] = useState('');
  const [vibrationLevel, setVibrationLevel] = useState(0);
  const [trafficLevel, setTrafficLevel] = useState<TrafficLevel>('medium');
  const [hideoutReady, setHideoutReady] = useState(true);
  const [ventilationReady, setVentilationReady] = useState(true);
  const [directSunlight, setDirectSunlight] = useState(false);
  const [nearSpeaker, setNearSpeaker] = useState(false);
  const [unstableFloor, setUnstableFloor] = useState(false);

  const [hasAcceptedMeasurementNotice, setHasAcceptedMeasurementNotice] = useState(false);
  const [microphoneReady, setMicrophoneReady] = useState(false);
  const [motionReady, setMotionReady] = useState(false);
  const [permissionStatusText, setPermissionStatusText] = useState(
    '먼저 마이크와 가속도 센서 사용 목적을 확인하고 측정 준비를 진행해 주세요.'
  );

  const [noiseMeasurementLabel, setNoiseMeasurementLabel] = useState(
    '아직 소음 측정을 하지 않았습니다. 측정을 시작하면 4초 동안 간이 소음 값을 읽습니다.'
  );
  const [vibrationMeasurementLabel, setVibrationMeasurementLabel] = useState(
    '아직 진동 측정을 하지 않았습니다. 측정을 시작하면 4초 동안 센서로 흔들림 변화를 읽습니다.'
  );
  const [isMeasuringNoise, setIsMeasuringNoise] = useState(false);
  const [isMeasuringVibration, setIsMeasuringVibration] = useState(false);
  const [latestMetering, setLatestMetering] = useState<number | null>(null);
  const [hasMeasuredNoise, setHasMeasuredNoise] = useState(false);
  const [hasMeasuredVibration, setHasMeasuredVibration] = useState(false);
  const [hasRunDiagnosis, setHasRunDiagnosis] = useState(false);
  const [isSavingReport, setIsSavingReport] = useState(false);

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
      ambientNoiseDb,
      cageDepthCm,
      cageWidthCm,
      directSunlight,
      hideoutReady,
      nearSpeaker,
      species,
      trafficLevel,
      unstableFloor,
      ventilationReady,
      vibrationLevel,
    ]
  );

  const canRunDiagnosis = hasMeasuredNoise && hasMeasuredVibration;

  useEffect(() => {
    if (!isMeasuringNoise || recorderState.metering === undefined) {
      return;
    }

    setLatestMetering(recorderState.metering);
  }, [isMeasuringNoise, recorderState.metering]);

  useEffect(() => {
    return () => {
      if (noiseTimeoutRef.current) {
        clearTimeout(noiseTimeoutRef.current);
      }
      if (vibrationTimeoutRef.current) {
        clearTimeout(vibrationTimeoutRef.current);
      }
      vibrationSubscriptionRef.current?.remove();
    };
  }, []);

  const handlePrepareMeasurement = async () => {
    if (isWeb) {
      Alert.alert('모바일 전용 기능', '스트레스 진단은 휴대폰 앱에서만 사용할 수 있습니다.');
      return;
    }

    try {
      setPermissionStatusText('권한을 확인하는 중입니다.');

      const microphonePermission = await AudioModule.requestRecordingPermissionsAsync();
      const microphoneGranted = microphonePermission.granted;

      let motionGranted = true;
      if (typeof Accelerometer.requestPermissionsAsync === 'function') {
        const motionPermission = await Accelerometer.requestPermissionsAsync();
        motionGranted = motionPermission.status === 'granted';
      }

      setHasAcceptedMeasurementNotice(true);
      setMicrophoneReady(microphoneGranted);
      setMotionReady(motionGranted);

      if (microphoneGranted && motionGranted) {
        setPermissionStatusText('측정 준비가 끝났습니다. 이제 소음과 진동을 각각 측정해 주세요.');
        return;
      }

      if (!microphoneGranted && !motionGranted) {
        setPermissionStatusText('마이크와 센서 권한이 모두 거부되어 실측 진단을 진행할 수 없습니다.');
        return;
      }

      if (!microphoneGranted) {
        setPermissionStatusText('마이크 권한이 없어 소음 측정은 사용할 수 없습니다.');
        return;
      }

      setPermissionStatusText('센서 권한이 없어 진동 측정은 사용할 수 없습니다.');
    } catch (error) {
      setPermissionStatusText(
        error instanceof Error ? error.message : '권한 확인 중 문제가 발생했습니다.'
      );
    }
  };

  const stopNoiseMeasurement = async () => {
    if (noiseTimeoutRef.current) {
      clearTimeout(noiseTimeoutRef.current);
      noiseTimeoutRef.current = null;
    }

    if (recorderState.isRecording) {
      await audioRecorder.stop();
    }

    setIsMeasuringNoise(false);

    if (latestMetering === null) {
      setHasMeasuredNoise(false);
      setNoiseMeasurementLabel('유효한 소음 값을 읽지 못했습니다. 다시 한 번 측정해 주세요.');
      return;
    }

    const estimatedDb = mapMeteringToDb(latestMetering);
    setAmbientNoiseDb(String(estimatedDb));
    setHasMeasuredNoise(true);
    setNoiseMeasurementLabel(
      `최근 4초 기준 간이 추정값은 ${estimatedDb} dB이며, 현재 등급은 ${buildStressDiagnosisReport({
        species,
        cageWidthCm: cageWidthCm ? Number(cageWidthCm) : null,
        cageDepthCm: cageDepthCm ? Number(cageDepthCm) : null,
        ambientNoiseDb: estimatedDb,
        vibrationLevel,
        trafficLevel,
        hideoutReady,
        ventilationReady,
        directSunlight,
        nearSpeaker,
        unstableFloor,
      }).noiseBandLabel}입니다. 절대값보다는 환경 비교용으로 해석해 주세요.`
    );
  };

  const handleMeasureNoise = async () => {
    if (isWeb) {
      Alert.alert('모바일 전용 기능', '소음 측정은 휴대폰 앱에서만 사용할 수 있습니다.');
      return;
    }

    if (!microphoneReady) {
      setNoiseMeasurementLabel('먼저 측정 준비를 완료하고 마이크 권한을 허용해 주세요.');
      return;
    }

    try {
      setLatestMetering(null);
      setHasMeasuredNoise(false);
      setHasRunDiagnosis(false);
      setNoiseMeasurementLabel('4초 동안 주변 소음을 측정하고 있습니다.');

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setIsMeasuringNoise(true);

      noiseTimeoutRef.current = setTimeout(() => {
        void stopNoiseMeasurement();
      }, MEASUREMENT_MS);
    } catch (error) {
      setIsMeasuringNoise(false);
      setNoiseMeasurementLabel(
        error instanceof Error ? error.message : '소음 측정 중 문제가 발생했습니다.'
      );
    }
  };

  const handleMeasureVibration = async () => {
    if (isWeb) {
      Alert.alert('모바일 전용 기능', '진동 측정은 휴대폰 앱에서만 사용할 수 있습니다.');
      return;
    }

    if (!motionReady) {
      setVibrationMeasurementLabel('먼저 측정 준비를 완료하고 센서 권한을 허용해 주세요.');
      return;
    }

    try {
      setHasMeasuredVibration(false);
      setHasRunDiagnosis(false);
      setVibrationMeasurementLabel('4초 동안 진동을 측정하고 있습니다.');
      vibrationSamplesRef.current = [];

      const isAvailable = await Accelerometer.isAvailableAsync();
      if (!isAvailable) {
        setVibrationMeasurementLabel('이 기기에서는 가속도 센서를 사용할 수 없습니다.');
        return;
      }

      vibrationSubscriptionRef.current?.remove();
      Accelerometer.setUpdateInterval(100);
      setIsMeasuringVibration(true);

      vibrationSubscriptionRef.current = Accelerometer.addListener(({ x, y, z }) => {
        const magnitude = Math.sqrt(x * x + y * y + z * z);
        const deltaFromGravity = Math.abs(magnitude - 1);
        vibrationSamplesRef.current.push(deltaFromGravity);
      });

      vibrationTimeoutRef.current = setTimeout(() => {
        vibrationSubscriptionRef.current?.remove();
        vibrationSubscriptionRef.current = null;
        setIsMeasuringVibration(false);

        const samples = vibrationSamplesRef.current;
        if (!samples.length) {
          setHasMeasuredVibration(false);
          setVibrationMeasurementLabel('유효한 진동 값을 읽지 못했습니다. 다시 측정해 주세요.');
          return;
        }

        const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
        const level = mapVibrationRmsToLevel(rms);

        setVibrationLevel(level);
        setHasMeasuredVibration(true);
        setVibrationMeasurementLabel(
          `최근 4초 기준 상대 진동 등급은 ${getVibrationBandLabel(level)} (${level}/10)입니다. 기기 간 절대 비교보다는 현재 환경 안에서의 흔들림 정도로 봐주세요.`
        );
      }, MEASUREMENT_MS);
    } catch (error) {
      setIsMeasuringVibration(false);
      setVibrationMeasurementLabel(
        error instanceof Error ? error.message : '진동 측정 중 문제가 발생했습니다.'
      );
    }
  };

  const handleRunDiagnosis = () => {
    if (isWeb) {
      Alert.alert('모바일 전용 기능', '스트레스 진단은 휴대폰 앱에서만 사용할 수 있습니다.');
      return;
    }

    if (!canRunDiagnosis) {
      return;
    }

    setHasRunDiagnosis(true);
  };

  const handleSaveReport = async () => {
    if (isWeb) {
      Alert.alert('모바일 전용 기능', '스트레스 진단 결과 저장은 휴대폰 앱에서만 사용할 수 있습니다.');
      return;
    }

    try {
      setIsSavingReport(true);

      await saveStressReport({
        diagnosisInput: {
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
        },
        report,
      });

      Alert.alert('저장 완료', '진단 결과가 저장되었습니다.');
    } catch (error) {
      Alert.alert(
        '저장 실패',
        error instanceof Error ? error.message : '진단 결과를 저장하지 못했습니다.'
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
              스트레스 진단은 휴대폰의 마이크와 가속도 센서를 사용하므로 PC 웹에서는 실행할 수 없습니다.
              Expo Go 또는 모바일 빌드에서 다시 시도해 주세요.
            </Text>
            <Pressable
              style={styles.recordsButton}
              onPress={() => router.push('/stress-reports' as never)}>
              <Text style={styles.recordsButtonText}>저장된 진단 기록 보기</Text>
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
            title="스트레스 진단"
            subtitle="입주 전 케이지 환경을 점검하고, 간이 센서 측정과 체크리스트를 합쳐 위험도를 확인합니다."
          />
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>간이 측정 기반 사전 점검</Text>
          <Text style={styles.heroText}>
            소음은 논문에서 자주 언급되는 65 dB, 80 dB, 85 dB, 90 dB 구간을 참고하되, 스마트폰에서는
            절대 소음계가 아닌 간이 추정값으로 해석합니다.
          </Text>
          <Pressable
            style={styles.heroRecordsButton}
            onPress={() => router.push('/stress-reports' as never)}>
            <Ionicons name="document-text-outline" size={17} color="#FFFFFF" />
            <Text style={styles.heroRecordsButtonText}>진단 기록 보기</Text>
          </Pressable>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>측정 전 안내</Text>
          <View style={styles.noticeCard}>
            <View style={styles.noticeRow}>
              <Ionicons name="mic-outline" size={18} color={colors.primaryStrong} />
              <Text style={styles.noticeText}>마이크로 4초 동안 주변 소음을 간이 측정합니다.</Text>
            </View>
            <View style={styles.noticeRow}>
              <Ionicons name="phone-portrait-outline" size={18} color={colors.primaryStrong} />
              <Text style={styles.noticeText}>가속도 센서로 4초 동안 진동 변화를 읽습니다.</Text>
            </View>
            <View style={styles.noticeRow}>
              <Ionicons name="information-circle-outline" size={18} color={colors.primaryStrong} />
              <Text style={styles.noticeText}>
                결과는 공인 계측기가 아닌 스마트폰 기반 간이 점검입니다. 절대 진단이 아니라 입주 전 위험 신호를
                확인하는 용도로 사용해 주세요.
              </Text>
            </View>
          </View>

          <Pressable style={styles.prepareButton} onPress={() => void handlePrepareMeasurement()}>
            <Text style={styles.prepareButtonText}>동의하고 측정 준비하기</Text>
          </Pressable>

          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>현재 상태</Text>
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
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>기본 정보</Text>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>동물 종류</Text>
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
              <Text style={styles.measureTitle}>소음 측정</Text>
              <Text style={styles.measureValue}>{ambientNoiseDb ? `${ambientNoiseDb} dB` : '미측정'}</Text>
            </View>
            <Text style={styles.helperText}>
              측정 후에는 숫자 자체보다 안정, 관찰 필요, 주의 필요, 높음 같은 상대 구간으로 해석하는 것이 더 안전합니다.
            </Text>
            <Pressable
              style={[
                styles.measureButton,
                (!microphoneReady || isMeasuringNoise) && styles.measureButtonDisabled,
              ]}
              onPress={() => void handleMeasureNoise()}
              disabled={!microphoneReady || isMeasuringNoise}>
              <Text style={styles.measureButtonText}>
                {isMeasuringNoise ? '소음 측정 중...' : '마이크로 소음 측정'}
              </Text>
            </Pressable>
            <Text style={styles.measureDescription}>{noiseMeasurementLabel}</Text>
          </View>

          <View style={styles.measureCard}>
            <View style={styles.measureHeader}>
              <Text style={styles.measureTitle}>진동 측정</Text>
              <Text style={styles.measureValue}>
                {hasMeasuredVibration ? `${getVibrationBandLabel(vibrationLevel)} (${vibrationLevel}/10)` : '미측정'}
              </Text>
            </View>
            <Text style={styles.helperText}>
              진동은 기기별 절대값보다 상대 등급으로 해석합니다. 같은 장소를 여러 번 비교하는 용도로 보는 것이 좋습니다.
            </Text>
            <Pressable
              style={[
                styles.measureButton,
                (!motionReady || isMeasuringVibration) && styles.measureButtonDisabled,
              ]}
              onPress={() => void handleMeasureVibration()}
              disabled={!motionReady || isMeasuringVibration}>
              <Text style={styles.measureButtonText}>
                {isMeasuringVibration ? '진동 측정 중...' : '센서로 진동 측정'}
              </Text>
            </Pressable>
            <Text style={styles.measureDescription}>{vibrationMeasurementLabel}</Text>
          </View>

          {!hasAcceptedMeasurementNotice ? (
            <Text style={styles.inlineNotice}>먼저 위 안내를 읽고 측정 준비를 완료해 주세요.</Text>
          ) : null}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>환경 체크</Text>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>사람 동선</Text>
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
          <BooleanField label="환기 흐름이 안정적인가요?" value={ventilationReady} onChange={setVentilationReady} />
          <BooleanField label="직사광선이 직접 들어오나요?" value={directSunlight} onChange={setDirectSunlight} />
          <BooleanField label="TV나 스피커 근처인가요?" value={nearSpeaker} onChange={setNearSpeaker} />
          <BooleanField label="바닥이나 선반이 흔들리나요?" value={unstableFloor} onChange={setUnstableFloor} />
        </View>

        <Pressable
          style={[styles.diagnosisButton, !canRunDiagnosis && styles.diagnosisButtonDisabled]}
          onPress={handleRunDiagnosis}
          disabled={!canRunDiagnosis}>
          <Text style={styles.diagnosisButtonText}>
            {canRunDiagnosis ? '실측 결과로 진단 보기' : '소음과 진동 측정을 완료해 주세요'}
          </Text>
        </Pressable>

        {!canRunDiagnosis ? (
          <Text style={styles.inlineNotice}>
            실측 기반 진단은 소음 측정과 진동 측정을 모두 마친 뒤에만 열립니다.
          </Text>
        ) : null}

        {hasRunDiagnosis ? (
          <View style={styles.reportCard}>
            <View style={styles.reportHeader}>
              <View style={[styles.levelBadge, { backgroundColor: meta.backgroundColor }]}>
                <Text style={[styles.levelBadgeText, { color: meta.color }]}>{meta.label}</Text>
              </View>
              <Text style={styles.scoreText}>총점 {report.score}점</Text>
            </View>

            <View style={styles.noticePill}>
              <Ionicons name="analytics-outline" size={16} color={colors.primaryStrong} />
              <Text style={styles.noticePillText}>{report.measurementNotice}</Text>
            </View>

            <View style={styles.noiseBandCard}>
              <Text style={styles.noiseBandTitle}>소음 추정 등급</Text>
              <Text style={styles.noiseBandValue}>{report.noiseBandLabel}</Text>
            </View>

            <Text style={styles.reportSummary}>{report.summary}</Text>

            <View style={styles.reportSection}>
              <Text style={styles.reportSectionTitle}>주요 위험 요인</Text>
              {report.highlights.map((item) => (
                <View key={item} style={styles.reportRow}>
                  <Ionicons name="alert-circle-outline" size={18} color={colors.primaryStrong} />
                  <Text style={styles.reportRowText}>{item}</Text>
                </View>
              ))}
            </View>

            <View style={styles.reportSection}>
              <Text style={styles.reportSectionTitle}>권장 조치</Text>
              {report.recommendations.map((item) => (
                <View key={item} style={styles.reportRow}>
                  <Ionicons name="checkmark-circle-outline" size={18} color={colors.primaryStrong} />
                  <Text style={styles.reportRowText}>{item}</Text>
                </View>
              ))}
            </View>

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
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  heroText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#E5F0EC',
  },
  heroRecordsButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  heroRecordsButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
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
  noticeCard: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    gap: 12,
  },
  noticeRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textMuted,
  },
  prepareButton: {
    minHeight: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  prepareButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statusCard: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.background,
    gap: 10,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: '700',
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
    opacity: 0.55,
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
  diagnosisButtonDisabled: {
    opacity: 0.5,
  },
  diagnosisButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  inlineNotice: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
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
