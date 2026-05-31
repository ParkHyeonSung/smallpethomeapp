import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { router } from 'expo-router';
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
import { colors } from '@/src/constants/colors';
import { getMyStressReports, StressReportItem } from '@/src/lib/stress-reports';

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



export default function StressReportsScreen() {
  const isFocused = useIsFocused();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 900;

  const [reports, setReports] = useState<StressReportItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadReports = async () => {
    try {
      setIsLoading(true);
      setReports(await getMyStressReports());
    } catch (error) {
      Alert.alert(
        '진단 기록 불러오기 실패',
        error instanceof Error ? error.message : '저장된 진단 기록을 불러오지 못했습니다.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isFocused) return;
    void loadReports();
  }, [isFocused]);

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
            title="진단 기록"
            subtitle="저장된 스트레스 진단 결과를 다시 확인하고 환경 변화 전후를 비교할 수 있어요."
          />
        </View>
      </View>

      <View style={[styles.summaryBand, isDesktopWeb && styles.summaryBandDesktop]}>
        <View>
          <Text style={styles.summaryLabel}>저장된 기록</Text>
          <Text style={styles.summaryCount}>{reports.length}개</Text>
        </View>
        <Pressable style={styles.refreshButton} onPress={() => void loadReports()}>
          <Ionicons name="refresh" size={16} color={colors.primaryStrong} />
          <Text style={styles.refreshButtonText}>새로고침</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.stateCard}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.stateText}>진단 기록을 불러오는 중입니다...</Text>
        </View>
      ) : null}

      {!isLoading && reports.length === 0 ? (
        <View style={styles.stateCard}>
          <Ionicons name="document-text-outline" size={34} color={colors.primary} />
          <Text style={styles.stateTitle}>아직 저장된 진단 기록이 없어요.</Text>
          <Text style={styles.stateText}>
            모바일 앱에서 스트레스 진단을 완료한 뒤 결과를 저장하면 여기에 표시됩니다.
          </Text>
          <Pressable style={styles.primaryButton} onPress={() => router.push('/stress-check' as never)}>
            <Text style={styles.primaryButtonText}>진단하러 가기</Text>
          </Pressable>
        </View>
      ) : null}

      {!isLoading && reports.length > 0 ? (
        <View style={[styles.reportGrid, isDesktopWeb && styles.reportGridDesktop]}>
          {reports.map((report) => (
            <ReportCard key={report.id} report={report} isDesktopWeb={isDesktopWeb} />
          ))}
        </View>
      ) : null}
    </ScreenContainer>
  );
}

function ReportCard({
  report,
  isDesktopWeb,
}: {
  report: StressReportItem;
  isDesktopWeb: boolean;
}) {
  const meta = LEVEL_META[report.level];

  return (
    <Pressable
      style={[styles.reportCard, isDesktopWeb && styles.reportCardDesktop]}
      onPress={() => router.push({ pathname: '/stress-reports/[id]', params: { id: report.id } })}>
      <View style={styles.reportHeader}>
        <View style={styles.reportTitleWrap}>
          <Text style={styles.reportDate}>{formatReportDate(report.created_at)}</Text>
          <Text style={styles.reportSpecies}>{report.species}</Text>
        </View>
        <View style={[styles.levelBadge, { backgroundColor: meta.backgroundColor }]}>
          <Text style={[styles.levelBadgeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      <View style={styles.scoreRow}>
        <Text style={styles.scoreValue}>{report.score}</Text>
        <Text style={styles.scoreLabel}>/ 100</Text>
      </View>

      <Text style={styles.summaryText} numberOfLines={isDesktopWeb ? 3 : 4}>
        {report.summary}
      </Text>

      <View style={styles.metricGrid}>
        <Metric label="소음" value={`${report.ambient_noise_db} dB`} />
        <Metric label="진동" value={`${report.vibration_level}/10`} />
      </View>
    </Pressable>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricItem}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1}>
        {value}
      </Text>
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
    maxWidth: 1080,
    alignSelf: 'center',
    paddingTop: 28,
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
  summaryBand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    padding: 18,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: '#C9DED5',
  },
  summaryBandDesktop: {
    paddingHorizontal: 22,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  summaryCount: {
    marginTop: 4,
    fontSize: 28,
    fontWeight: '800',
    color: colors.primaryStrong,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  refreshButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primaryStrong,
  },
  stateCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 220,
    padding: 22,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  stateText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
    textAlign: 'center',
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
  reportGrid: {
    gap: 14,
  },
  reportGridDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  reportCard: {
    gap: 14,
    padding: 18,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reportCardDesktop: {
    width: '48.8%',
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  reportTitleWrap: {
    flex: 1,
    gap: 4,
  },
  reportDate: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  reportSpecies: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  levelBadge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  levelBadgeText: {
    fontSize: 13,
    fontWeight: '800',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  scoreValue: {
    fontSize: 40,
    lineHeight: 46,
    fontWeight: '800',
    color: colors.primaryStrong,
  },
  scoreLabel: {
    paddingBottom: 7,
    fontSize: 15,
    fontWeight: '800',
    color: colors.textMuted,
  },
  summaryText: {
    fontSize: 14,
    lineHeight: 22,
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
    fontWeight: '800',
    color: colors.primaryStrong,
  },
});
