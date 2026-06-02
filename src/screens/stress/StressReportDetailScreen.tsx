import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import AppHeader from '@/src/components/common/AppHeader';
import ScreenContainer from '@/src/components/common/ScreenContainer';
import StressResultPanel from '@/src/components/stress/StressResultPanel';
import { colors } from '@/src/constants/colors';
import { resolveStressAnimalGroup } from '@/src/lib/stress-animal-groups';
import {
  deleteStressReport,
  getMyStressReportById,
  StressReportItem,
  StressReportResultSnapshot,
} from '@/src/lib/stress-reports';

export default function StressReportDetailScreen() {
  const params = useLocalSearchParams();
  const reportId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 980;

  const [report, setReport] = useState<StressReportItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!reportId) {
      setIsLoading(false);
      return;
    }

    const loadReport = async () => {
      try {
        setIsLoading(true);
        setReport(await getMyStressReportById(reportId));
      } catch (error) {
        Alert.alert(
          '기록 불러오기 실패',
          error instanceof Error ? error.message : '기록을 불러오지 못했습니다.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    void loadReport();
  }, [reportId]);

  const handleDelete = () => {
    if (!report) return;

    const runDelete = async () => {
      try {
        setIsDeleting(true);
        await deleteStressReport(report.id);
        router.replace('/stress-reports');
      } catch (error) {
        Alert.alert(
          '삭제 실패',
          error instanceof Error ? error.message : '기록을 삭제하지 못했습니다.'
        );
      } finally {
        setIsDeleting(false);
      }
    };

    if (Platform.OS === 'web') {
      const confirmed =
        typeof window !== 'undefined' ? window.confirm('이 기록을 삭제할까요?') : false;
      if (confirmed) void runDelete();
      return;
    }

    Alert.alert('기록 삭제', '이 기록을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => void runDelete() },
    ]);
  };

  if (isLoading) {
    return (
      <ScreenContainer contentStyle={styles.centerContent}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.stateText}>기록을 불러오는 중입니다...</Text>
      </ScreenContainer>
    );
  }

  if (!report) {
    return (
      <ScreenContainer contentStyle={styles.centerContent}>
        <Text style={styles.stateTitle}>기록을 찾을 수 없습니다.</Text>
        <Pressable style={styles.primaryButton} onPress={() => router.replace('/stress-reports')}>
          <Text style={styles.primaryButtonText}>목록으로 돌아가기</Text>
        </Pressable>
      </ScreenContainer>
    );
  }

  const resultChartWidth = Math.max(240, Math.min(640, width - 80));
  const snapshot = getReportResultSnapshot(report);

  return (
    <ScreenContainer
      scroll
      contentStyle={[styles.content, isDesktopWeb && styles.contentDesktop]}>
      <View style={styles.topRow}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <AppHeader title="입주 전 환경 체크 기록" />
        </View>
      </View>

      <View style={styles.recordMeta}>
        <Text style={styles.dateText}>{formatReportDate(report.created_at)}</Text>
        <Text style={styles.speciesText}>{report.species}</Text>
      </View>

      <StressResultPanel
        suitabilityStatus={snapshot.suitabilityStatus}
        summary={snapshot.summary}
        chartWidth={resultChartWidth}
        durationSec={snapshot.durationSec}
        noise={snapshot.noise}
        frequency={snapshot.frequency}
        vibration={snapshot.vibration}
        showEstimateNotice
      />

      <Pressable
        style={[styles.deleteButton, isDeleting && styles.disabled]}
        onPress={handleDelete}
        disabled={isDeleting}>
        <Text style={styles.deleteButtonText}>
          {isDeleting ? '삭제 중...' : '기록 삭제'}
        </Text>
      </Pressable>
    </ScreenContainer>
  );
}

function formatReportDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '날짜 없음';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}.${month}.${day} ${hours}:${minutes}`;
}

function getSuitabilityLabel(level: StressReportItem['level']) {
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

function getReportResultSnapshot(report: StressReportItem): StressReportResultSnapshot {
  if (report.checklist.resultSnapshot) {
    const animalGroupInfo = resolveStressAnimalGroup(report.species);
    const snapshot = report.checklist.resultSnapshot;
    const vibrationValues = snapshot.vibration.samples.map((sample) => sample.value);
    const vibrationAverageLevel = Math.round(getAverageValue(vibrationValues, report.vibration_level));
    const vibrationPeakLevel = Math.round(getMaxValue(vibrationValues, report.vibration_level));
    return {
      ...snapshot,
      frequency: {
        ...snapshot.frequency,
        peakFrequencyHz: snapshot.frequency.peakFrequencyHz ?? 0,
        interpretation: snapshot.frequency.interpretation ?? snapshot.frequency.summary,
      },
      vibration: {
        ...snapshot.vibration,
        averageState: getVibrationStateLabel(
          vibrationAverageLevel,
          animalGroupInfo.vibrationCautionLevel,
          animalGroupInfo.vibrationWarningLevel
        ),
        peakState: getVibrationStateLabel(
          vibrationPeakLevel,
          animalGroupInfo.vibrationCautionLevel,
          animalGroupInfo.vibrationWarningLevel
        ),
        cautionValue: snapshot.vibration.cautionValue ?? animalGroupInfo.vibrationCautionLevel,
        warningValue: snapshot.vibration.warningValue ?? animalGroupInfo.vibrationWarningLevel,
      },
    };
  }

  const animalGroupInfo = resolveStressAnimalGroup(report.species);
  const durationSec = 60;
  const endTimestamp = durationSec * 1000;
  const vibrationState = getVibrationStateLabel(
    report.vibration_level,
    animalGroupInfo.vibrationCautionLevel,
    animalGroupInfo.vibrationWarningLevel
  );

  return {
    durationSec,
    suitabilityStatus: getSuitabilityLabel(report.level),
    summary: report.summary,
    noise: {
      samples: [
        { timestampMs: 0, value: report.ambient_noise_db },
        { timestampMs: endTimestamp, value: report.ambient_noise_db },
      ],
      averageDb: report.ambient_noise_db,
      maxDb: report.ambient_noise_db,
      cautionValue: animalGroupInfo.noiseCautionDb,
      warningValue: animalGroupInfo.noiseWarningDb ?? Math.min(animalGroupInfo.noiseCautionDb + 10, 100),
      interpretation: report.summary,
    },
    frequency: {
      peakFrequencyHz: 0,
      dominantBand: '분석 없음',
      highFrequencyLevel: '낮음',
      lowFrequencyMarkerLevel: '낮음',
      lowBandRatio: 0,
      midBandRatio: 0,
      highBandRatio: 0,
      summary: '이전 기록에는 소리 성격 분석 데이터가 저장되어 있지 않습니다.',
      interpretation: '이전 기록에는 주파수 해석 데이터가 저장되어 있지 않습니다.',
    },
    vibration: {
      samples: [
        { timestampMs: 0, value: report.vibration_level },
        { timestampMs: endTimestamp, value: report.vibration_level },
      ],
      averageState: vibrationState,
      peakState: vibrationState,
      cautionValue: animalGroupInfo.vibrationCautionLevel,
      warningValue: animalGroupInfo.vibrationWarningLevel,
      interpretation: report.summary,
    },
  };
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
  },
  contentDesktop: {
    width: '100%',
    maxWidth: 1120,
    alignSelf: 'center',
    paddingTop: 28,
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerText: {
    flex: 1,
  },
  recordMeta: {
    gap: 3,
    paddingHorizontal: 2,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  speciesText: {
    marginTop: 4,
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  deleteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: '#FFF3F3',
    borderWidth: 1,
    borderColor: '#F2B7B7',
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.danger,
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  stateText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.7,
  },
});
