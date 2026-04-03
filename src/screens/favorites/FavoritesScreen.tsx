import { StyleSheet, Text, View } from 'react-native';

import AppHeader from '@/src/components/common/AppHeader';
import ScreenContainer from '@/src/components/common/ScreenContainer';
import { colors } from '@/src/constants/colors';

export default function FavoritesScreen() {
  return (
    <ScreenContainer scroll>
      <AppHeader
        title="좋아요"
        subtitle="사용자가 좋아요 표시한 게시글을 모아보는 화면입니다."
      />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>저장된 관심 게시글</Text>
        <Text style={styles.cardText}>좋아요한 케이지 세팅과 제품 태그 게시글이 여기에 표시됩니다.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>추천 기반 정렬</Text>
        <Text style={styles.cardText}>최신순, 인기순, 관련성순으로 정렬 기능을 확장할 수 있습니다.</Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  cardText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
  },
});
