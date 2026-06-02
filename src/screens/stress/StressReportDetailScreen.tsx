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
          '진단 기록 불러오기 실패',
          error instanceof Error ? error.message : '진단 기록을 불러오지 못했습니다.'
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
          error instanceof Error ? error.message : '진단 기록을 삭제하지 못했습니다.'
        );
      } finally {
        setIsDeleting(false);
      }
    };

    if (Platform.OS === 'web') {
      const confirmed =
        typeof window !== 'undefined' ? window.confirm('이 진단 기록을 삭제할까요?') : false;
      if (confirmed) void runDelete();
      return;
    }

    Alert.alert('진단 기록 삭제', '이 진단 기록을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => void runDelete() },
    ]);
  };

  if (isLoading) {
    return (
      <ScreenContainer contentStyle={styles.centerContent}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.stateText}>진단 기록을 불러오는 중입니다...</Text>
      </ScreenContainer>
    );
  }

  if (!report) {
    return (
      <ScreenContainer contentStyle={styles.centerContent}>
        <Text style={styles.stateTitle}>진단 기록을 찾을 수 없습니다.</Text>
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
          <AppHeader title="진단 상세" />
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
          {isDeleting ? '삭제 중...' : '진단 기록 삭제'}
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

function getVibrationStateLabel(level: number) {
  if (level >= 8) return '강한 흔들림';
  if (level >= 6) return '뚜렷한 흔들림';
  if (level >= 3) return '약한 흔들림';
  return '안정';
}

function getReportResultSnapshot(report: StressReportItem): StressReportResultSnapshot {
  if (report.checklist.resultSnapshot) {
    const animalGroupInfo = resolveStressAnimalGroup(report.species);
    const snapshot = report.checklist.resultSnapshot;
    return {
      ...snapshot,
      frequency: {
        ...snapshot.frequency,
        peakFrequencyHz: snapshot.frequency.peakFrequencyHz ?? 0,
        interpretation: snapshot.frequency.interpretation ?? snapshot.frequency.summary,
      },
      vibration: {
        ...snapshot.vibration,
        cautionValue: snapshot.vibration.cautionValue ?? animalGroupInfo.vibrationCautionLevel,
        warningValue: snapshot.vibration.warningValue ?? animalGroupInfo.vibrationWarningLevel,
      },
    };
  }

  const animalGroupInfo = resolveStressAnimalGroup(report.species);
  const durationSec = 60;
  const endTimestamp = durationSec * 1000;
  const vibrationState = getVibrationStateLabel(report.vibration_level);

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
  layout: {
    gap: 16,
  },
  layoutDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  summaryCard: {
    gap: 16,
    paddingVertical: 4,
  },
  summaryCardDesktop: {
    flex: 0.9,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
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
  levelBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  levelBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  summaryText: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.text,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricItem: {
    width: '48.5%',
    gap: 4,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  metricValue: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    color: colors.primaryStrong,
  },
  detailColumn: {
    flex: 1.2,
    gap: 14,
  },
  sectionCard: {
    gap: 12,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
  },
  disclaimer: {
    fontSize: 11,
    lineHeight: 17,
    color: colors.textMuted,
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
