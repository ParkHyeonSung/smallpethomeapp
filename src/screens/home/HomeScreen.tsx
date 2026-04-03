import { StyleSheet, Text, View } from 'react-native';

import AppHeader from '@/src/components/common/AppHeader';
import ScreenContainer from '@/src/components/common/ScreenContainer';
import { colors } from '@/src/constants/colors';

export default function HomeScreen() {
  return (
    <ScreenContainer scroll>
      <AppHeader
        title="홈"
        subtitle="핵심 기능으로 빠르게 이동할 수 있는 대시보드 화면입니다."
      />

      <View style={styles.highlightCard}>
        <Text style={styles.highlightLabel}>오늘의 추천</Text>
        <Text style={styles.highlightTitle}>우리 아이 케이지 세팅 둘러보기</Text>
        <Text style={styles.highlightDescription}>
          커뮤니티 인기 게시글, 제품 태그, AI 추천 카드가 여기에 연결될 예정입니다.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>빠른 메뉴</Text>

        <View style={styles.menuCard}>
          <Text style={styles.menuTitle}>커뮤니티</Text>
          <Text style={styles.menuDescription}>게시글 조회, 제품 태그, 좋아요/댓글 기능으로 확장</Text>
        </View>

        <View style={styles.menuCard}>
          <Text style={styles.menuTitle}>3D 시뮬레이션</Text>
          <Text style={styles.menuDescription}>케이지 크기를 입력하고 배치를 미리 구성하는 기능</Text>
        </View>

        <View style={styles.menuCard}>
          <Text style={styles.menuTitle}>AI 큐레이터</Text>
          <Text style={styles.menuDescription}>종, 몸무게, 환경 정보를 바탕으로 추천 제공</Text>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  highlightCard: {
    padding: 20,
    borderRadius: 20,
    backgroundColor: colors.primary,
    gap: 8,
  },
  highlightLabel: {
    color: '#D7F3EA',
    fontSize: 13,
    fontWeight: '600',
  },
  highlightTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  highlightDescription: {
    color: '#EAF7F3',
    fontSize: 14,
    lineHeight: 21,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  menuCard: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  menuTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  menuDescription: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
  },
});
