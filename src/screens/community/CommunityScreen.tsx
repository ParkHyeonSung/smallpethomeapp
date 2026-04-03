import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import AppHeader from '@/src/components/common/AppHeader';
import ScreenContainer from '@/src/components/common/ScreenContainer';
import { colors } from '@/src/constants/colors';

const posts = [
  {
    id: 1,
    author: '햄토리맘',
    title: '골든햄스터 케이지 세팅 공유',
    description: '은신처, 쳇바퀴, 급수기 위치와 제품 태그를 함께 정리했어요.',
  },
  {
    id: 2,
    author: '친칠라하우스',
    title: '먼지 목욕 공간 추천',
    description: '실사용 사진과 함께 제품 링크를 태그로 남겨둘 수 있게 구성합니다.',
  },
];

export default function CommunityScreen() {
  const handleOpenMenu = () => {
    Alert.alert('메뉴', '이 버튼을 통해 이후 추가 기능 화면으로 연결할 수 있습니다.');
  };

  return (
    <ScreenContainer scroll>
      <View style={styles.headerRow}>
        <Pressable style={styles.menuButton} onPress={handleOpenMenu}>
          <Ionicons name="menu" size={22} color={colors.text} />
        </Pressable>

        <View style={styles.headerContent}>
          <AppHeader
            title="홈"
            subtitle="이 화면이 메인 커뮤니티 화면이며, 이후 메뉴에서 추가 기능으로 진입합니다."
          />
        </View>
      </View>

      {posts.map((post) => (
        <View key={post.id} style={styles.postCard}>
          <View style={styles.postImagePlaceholder}>
            <Text style={styles.postImageText}>IMAGE</Text>
          </View>

          <View style={styles.postContent}>
            <Text style={styles.author}>{post.author}</Text>
            <Text style={styles.title}>{post.title}</Text>
            <Text style={styles.description}>{post.description}</Text>

            <View style={styles.metaRow}>
              <Text style={styles.metaText}>좋아요 24</Text>
              <Text style={styles.metaText}>댓글 8</Text>
              <Text style={styles.metaText}>태그 3</Text>
            </View>
          </View>
        </View>
      ))}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerContent: {
    flex: 1,
  },
  postCard: {
    overflow: 'hidden',
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  postImagePlaceholder: {
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DCE7E2',
  },
  postImageText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 1,
  },
  postContent: {
    padding: 16,
    gap: 8,
  },
  author: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  metaText: {
    fontSize: 13,
    color: colors.textMuted,
  },
});
