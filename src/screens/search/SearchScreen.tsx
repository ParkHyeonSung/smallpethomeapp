import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useDeferredValue, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import AppHeader from '@/src/components/common/AppHeader';
import ScreenContainer from '@/src/components/common/ScreenContainer';
import { colors } from '@/src/constants/colors';
import { getPostImagesByPostIds } from '@/src/lib/post-images';
import { PostItem, searchPublicPosts } from '@/src/lib/posts';

const suggestedKeywords = ['햄스터 케이지', '고슴도치 은신처', '도마뱀 온습도'];

export default function SearchScreen() {
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PostItem[]>([]);
  const [imageCountByPostId, setImageCountByPostId] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const trimmedQuery = deferredQuery.trim();
  const hasQuery = trimmedQuery.length > 0;
  const isMobile = width < 768;
  const gridColumns = isMobile ? 3 : 5;
  const gridGap = 14;
  const [gridWidth, setGridWidth] = useState(0);

  const cardWidth =
    gridWidth > 0
      ? Math.floor((gridWidth - gridGap * (gridColumns - 1)) / gridColumns)
      : undefined;

  useEffect(() => {
    if (!hasQuery) {
      setResults([]);
      setImageCountByPostId({});
      setIsLoading(false);
      return;
    }

    const loadResults = async () => {
      try {
        setIsLoading(true);
        const data = await searchPublicPosts(trimmedQuery);
        setResults(data);
        const imageGroups = await getPostImagesByPostIds(data.map((post) => post.id));
        setImageCountByPostId(
          Object.fromEntries(
            Object.entries(imageGroups).map(([postId, images]) => [postId, images.length])
          )
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '검색 결과를 불러오는 중 오류가 발생했습니다.';
        Alert.alert('검색 실패', message);
      } finally {
        setIsLoading(false);
      }
    };

    void loadResults();
  }, [hasQuery, trimmedQuery]);

  return (
    <ScreenContainer scroll>
      <AppHeader title="검색" />

      <View style={styles.searchShell}>
        <View style={styles.searchInputRow}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="궁금한 키워드를 입력해보세요"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>추천 검색</Text>
        <View style={styles.keywordRow}>
          {suggestedKeywords.map((keyword) => (
            <Pressable
              key={keyword}
              style={styles.keywordChip}
              onPress={() => setQuery(keyword)}>
              <Text style={styles.keywordChipText}>{keyword}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {hasQuery && isLoading ? (
        <View style={styles.statePanel}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.stateText}>검색 결과를 불러오는 중입니다...</Text>
        </View>
      ) : null}

      {hasQuery && !isLoading && results.length === 0 ? (
        <View style={styles.statePanel}>
          <Ionicons name="search-outline" size={48} color={colors.border} />
          <Text style={styles.stateTitle}>검색 결과가 없습니다.</Text>
          <Text style={styles.stateText}>다른 검색어로 다시 시도해보세요.</Text>
        </View>
      ) : null}

      {hasQuery && !isLoading && results.length > 0 ? (
        <View
          style={styles.grid}
          onLayout={(event) => {
            const nextWidth = Math.floor(event.nativeEvent.layout.width);
            setGridWidth((prev) => (prev === nextWidth ? prev : nextWidth));
          }}>
          {results.map((post) => (
            <Pressable
              key={post.id}
              style={[styles.card, cardWidth ? { width: cardWidth } : null]}
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
                  style={styles.cardImage}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.cardFallback}>
                  <Text style={styles.cardFallbackLabel}>TEXT</Text>
                  <Text style={styles.cardFallbackText} numberOfLines={3}>
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
  searchShell: {
    padding: 6,
    borderRadius: 24,
    backgroundColor: colors.backgroundAccent,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 0,
  },
  panel: {
    padding: 18,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
    gap: 12,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primaryStrong,
  },
  keywordRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  keywordChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: '#C9DED5',
  },
  keywordChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primaryStrong,
  },
  statePanel: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 160,
    padding: 20,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '800',
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
    gap: 14,
    justifyContent: 'flex-start',
  },
  card: {
    overflow: 'hidden',
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  multiImageBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 24, 20, 0.62)',
  },
  cardImage: {
    width: '100%',
    aspectRatio: 1,
  },
  cardFallback: {
    width: '100%',
    aspectRatio: 1,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
    gap: 8,
  },
  cardFallbackLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.primaryStrong,
  },
  cardFallbackText: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    color: colors.primaryStrong,
  },
});
