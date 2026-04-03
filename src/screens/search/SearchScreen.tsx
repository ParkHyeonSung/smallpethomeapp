import { StyleSheet, Text, TextInput, View } from 'react-native';

import AppHeader from '@/src/components/common/AppHeader';
import ScreenContainer from '@/src/components/common/ScreenContainer';
import { colors } from '@/src/constants/colors';

export default function SearchScreen() {
  return (
    <ScreenContainer scroll>
      <AppHeader
        title="검색"
        subtitle="게시글, 제품 태그, 사용자 정보를 검색할 수 있는 화면입니다."
      />

      <TextInput
        placeholder="검색어를 입력하세요"
        placeholderTextColor={colors.textMuted}
        style={styles.searchInput}
      />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>추천 검색</Text>
        <Text style={styles.cardText}>햄스터 케이지</Text>
        <Text style={styles.cardText}>은신처 추천</Text>
        <Text style={styles.cardText}>친칠라 모래목욕</Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  searchInput: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 15,
    color: colors.text,
  },
  card: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  cardText: {
    fontSize: 15,
    color: colors.textMuted,
  },
});
