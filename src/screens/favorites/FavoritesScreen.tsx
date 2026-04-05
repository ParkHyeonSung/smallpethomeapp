import { Image } from 'expo-image';
import { useEffect, useState } from 'react';

import { router } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import AppHeader from '@/src/components/common/AppHeader';
import ScreenContainer from '@/src/components/common/ScreenContainer';
import { colors } from '@/src/constants/colors';
import { getMyFavoritePosts } from '@/src/lib/likes';
import { PostItem } from '@/src/lib/posts';

export default function FavoritesScreen() {
  const isFocused = useIsFocused();
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    const loadFavoritePosts = async () => {
      try {
        setIsLoading(true);
        const data = await getMyFavoritePosts();
        setPosts(data);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '좋아요한 게시글을 불러오는 중 오류가 발생했습니다.';
        Alert.alert('불러오기 실패', message);
      } finally {
        setIsLoading(false);
      }
    };

    void loadFavoritePosts();
  }, [isFocused]);

  return (
    <ScreenContainer scroll>
      <AppHeader
        title="좋아요"
        subtitle="내가 좋아요한 게시글을 모아보는 화면입니다."
      />

      {isLoading ? (
        <View style={styles.card}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.cardText}>좋아요한 게시글을 불러오는 중입니다...</Text>
        </View>
      ) : null}

      {!isLoading && posts.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>좋아요한 게시글이 없습니다.</Text>
          <Text style={styles.cardText}>홈 탭에서 하트를 눌러 관심 게시글을 추가해보세요.</Text>
        </View>
      ) : null}

      {!isLoading &&
        posts.map((post) => (
          <Pressable key={post.id} style={styles.postCard} onPress={() => router.push(`/posts/${post.id}`)}>
            <View style={styles.postHeader}>
              <Text style={styles.author}>{post.profiles?.nickname ?? '사용자'}</Text>
              <Text style={styles.date}>{formatDate(post.created_at)}</Text>
            </View>

            {post.image_url ? (
              <Image source={{ uri: post.image_url }} style={styles.postImage} contentFit="cover" />
            ) : (
              <View style={styles.postImageFallback}>
                <Text style={styles.postImageFallbackText}>TEXT POST</Text>
              </View>
            )}

            <View style={styles.postBody}>
              <Text style={styles.postContent} numberOfLines={3}>
                {post.content}
              </Text>
              <Text style={styles.postMeta}>
                좋아요 {post.like_count} · 댓글 {post.comment_count}
              </Text>
            </View>
          </Pressable>
        ))}
    </ScreenContainer>
  );
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '방금 전';
  }

  const now = new Date();
  const sameYear = now.getFullYear() === date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return sameYear ? `${month}.${day}` : `${date.getFullYear()}.${month}.${day}`;
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
  postCard: {
    overflow: 'hidden',
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  author: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  date: {
    fontSize: 12,
    color: colors.textMuted,
  },
  postImage: {
    width: '100%',
    height: 180,
  },
  postImageFallback: {
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  postImageFallbackText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 1,
  },
  postBody: {
    padding: 14,
    gap: 8,
  },
  postContent: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.text,
  },
  postMeta: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
