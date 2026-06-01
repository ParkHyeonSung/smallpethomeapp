import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';

import { useIsFocused } from '@react-navigation/native';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import AppHeader from '@/src/components/common/AppHeader';
import ScreenContainer from '@/src/components/common/ScreenContainer';
import { colors } from '@/src/constants/colors';
import { getMyFavoritePosts } from '@/src/lib/likes';
import { getPostImagesByPostIds } from '@/src/lib/post-images';
import { PostItem } from '@/src/lib/posts';

export default function FavoritesScreen() {
  const isFocused = useIsFocused();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const gridColumns = isMobile ? 3 : 5;
  const gridGap = 14;

  const [posts, setPosts] = useState<PostItem[]>([]);
  const [imageCountByPostId, setImageCountByPostId] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [gridWidth, setGridWidth] = useState(0);

  const cardWidth =
    gridWidth > 0
      ? Math.floor((gridWidth - gridGap * (gridColumns - 1)) / gridColumns)
      : undefined;

  useEffect(() => {
    if (!isFocused) return;

    const loadFavoritePosts = async () => {
      try {
        setIsLoading(true);
        const data = await getMyFavoritePosts();
        setPosts(data);
        const imageGroups = await getPostImagesByPostIds(data.map((post) => post.id));
        setImageCountByPostId(
          Object.fromEntries(
            Object.entries(imageGroups).map(([postId, images]) => [postId, images.length])
          )
        );
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
      <AppHeader title="좋아요" />

      {isLoading ? (
        <View style={styles.statePanel}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.stateText}>좋아요한 게시글을 불러오는 중입니다...</Text>
        </View>
      ) : null}

      {!isLoading && posts.length === 0 ? (
        <View style={styles.statePanel}>
          <Ionicons name="heart-outline" size={48} color={colors.border} />
          <Text style={styles.stateTitle}>좋아요한 게시글이 없습니다.</Text>
          <Text style={styles.stateText}>마음에 드는 게시글에 하트를 눌러 저장해보세요.</Text>
        </View>
      ) : null}

      {!isLoading && posts.length > 0 ? (
        <View
          style={styles.grid}
          onLayout={(event) => {
            const nextWidth = Math.floor(event.nativeEvent.layout.width);
            setGridWidth((prev) => (prev === nextWidth ? prev : nextWidth));
          }}>
          {posts.map((post) => (
            <Pressable
              key={post.id}
              style={[styles.gridCard, cardWidth ? { width: cardWidth } : null]}
              onPress={() =>
                router.push({ pathname: '/posts/[id]', params: { id: post.id } })
              }>
              {(imageCountByPostId[post.id] ?? 0) > 1 ? (
                <View style={styles.multiImageBadge}>
                  <Ionicons name="copy-outline" size={14} color="#FFFFFF" />
                </View>
              ) : null}
              {post.image_url ? (
                <Image
                  source={{ uri: post.image_url }}
                  style={styles.gridImage}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.gridTextCard}>
                  <Text style={styles.gridTextLabel}>TEXT</Text>
                  <Text style={styles.gridTextPreview} numberOfLines={3}>
                    {post.content}
                  </Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  statePanel: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 160,
    padding: 20,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stateTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.primaryStrong,
  },
  stateText: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    color: colors.textMuted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'flex-start',
  },
  gridCard: {
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  multiImageBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  gridImage: {
    width: '100%',
    aspectRatio: 1,
  },
  gridTextCard: {
    width: '100%',
    aspectRatio: 1,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    gap: 6,
  },
  gridTextLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: colors.primaryStrong,
  },
  gridTextPreview: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    color: colors.primaryStrong,
  },
});
