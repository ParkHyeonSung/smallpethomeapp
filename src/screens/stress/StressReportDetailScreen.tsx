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
import MetricBarChart from '@/src/components/stress/MetricBarChart';
import { colors } from '@/src/constants/colors';
import {
  deleteStressReport,
  getMyStressReportById,
  StressReportItem,
} from '@/src/lib/stress-reports';

const LEVEL_META: Record<
  StressReportItem['level'],
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

  const meta = LEVEL_META[report.level];

  return (
    <ScreenContainer
      scroll
      contentStyle={[styles.content, isDesktopWeb && styles.contentDesktop]}>
      <View style={styles.topRow}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <AppHeader
            title="진단 상세"
            subtitle="저장된 측정값과 위험 요인, 권장 조치를 확인합니다."
          />
        </View>
      </View>

      <View style={[styles.layout, isDesktopWeb && styles.layoutDesktop]}>
        <View style={[styles.summaryCard, isDesktopWeb && styles.summaryCardDesktop]}>
          <View style={styles.summaryHeader}>
            <View>
              <Text style={styles.dateText}>{formatReportDate(report.created_at)}</Text>
              <Text style={styles.speciesText}>{report.species}</Text>
            </View>
            <View style={[styles.levelBadge, { backgroundColor: meta.backgroundColor }]}>
              <Text style={[styles.levelBadgeText, { color: meta.color }]}>{meta.label}</Text>
            </View>
          </View>

          <View style={styles.scorePanel}>
            <Text style={styles.scoreValue}>{report.score}</Text>
            <Text style={styles.scoreLabel}>/ 100</Text>
          </View>
          <Text style={styles.scoreHint}>
            점수가 낮을수록 안정적인 환경입니다. (0~27 적합 · 28~54 주의 · 55+ 부적합)
          </Text>

          <Text style={styles.summaryText}>{report.summary}</Text>

          <MetricBarChart
            items={[
              {
                label: '소음',
                value: report.ambient_noise_db,
                maxValue: 100,
                displayValue: `${report.ambient_noise_db} dB`,
              },
              {
                label: '진동',
                value: report.vibration_level,
                maxValue: 10,
                displayValue: `${report.vibration_level}/10`,
              },
            ]}
          />
        </View>

        <View style={styles.detailColumn}>

          <InfoList title="주요 위험 요인" icon="alert-circle-outline" items={report.highlights} />
          <InfoList title="권장 조치" icon="checkmark-circle-outline" items={report.recommendations} />

          <View style={styles.noticeCard}>
            <Ionicons name="information-circle-outline" size={18} color={colors.primaryStrong} />
            <Text style={styles.noticeText}>{report.measurement_notice}</Text>
          </View>

          <Text style={styles.disclaimer}>
            이 결과는 스마트폰 센서로 측정한 간이 데이터와 동물복지 관련 공개 문헌을 참고해
            산출한 참고용 추정값이며, 수의학적 진단을 대체하지 않습니다. 이상 행동이나 건강
            문제가 관찰되면 반드시 수의사와 상담하세요.
          </Text>

          <Pressable
            style={[styles.deleteButton, isDeleting && styles.disabled]}
            onPress={handleDelete}
            disabled={isDeleting}>
            <Text style={styles.deleteButtonText}>
              {isDeleting ? '삭제 중...' : '진단 기록 삭제'}
            </Text>
          </Pressable>
        </View>
      </View>
    </ScreenContainer>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricItem}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}


function InfoList({
  title,
  icon,
  items,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  items: string[];
}) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items.map((item) => (
        <View key={item} style={styles.infoRow}>
          <Ionicons name={icon} size={18} color={colors.primaryStrong} />
          <Text style={styles.infoText}>{item}</Text>
        </View>
      ))}
    </View>
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
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerText: {
    flex: 1,
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
    padding: 20,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
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
    fontWeight: '800',
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
    fontWeight: '800',
  },
  scorePanel: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  scoreValue: {
    fontSize: 52,
    lineHeight: 58,
    fontWeight: '800',
    color: colors.primaryStrong,
  },
  scoreLabel: {
    paddingBottom: 9,
    fontSize: 16,
    fontWeight: '800',
    color: colors.textMuted,
  },
  scoreHint: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
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
    borderRadius: 12,
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
    fontWeight: '800',
    color: colors.primaryStrong,
  },
  detailColumn: {
    flex: 1.2,
    gap: 14,
  },
  sectionCard: {
    gap: 12,
    padding: 18,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
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
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.primaryLight,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: colors.primaryStrong,
  },
  deleteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#FFF3F3',
    borderWidth: 1,
    borderColor: '#F2B7B7',
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.danger,
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 14,
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
