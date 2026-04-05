import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useDeferredValue, useEffect, useState } from 'react';

import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import AppHeader from '@/src/components/common/AppHeader';
import ScreenContainer from '@/src/components/common/ScreenContainer';
import { colors } from '@/src/constants/colors';
import { PostItem, searchPublicPosts } from '@/src/lib/posts';

const suggestedKeywords = ['햄스터 케이지', '은신처 추천', '친칠라 모래목욕'];

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PostItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const loadResults = async () => {
      try {
        setIsLoading(true);
        const data = await searchPublicPosts(deferredQuery);
        setResults(data);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '검색 중 오류가 발생했습니다.';
        Alert.alert('검색 실패', message);
      } finally {
        setIsLoading(false);
      }
    };

    void loadResults();
  }, [deferredQuery]);

  return (
    <ScreenContainer scroll>
      <AppHeader
        title="검색"
        subtitle="작성자 이름이나 게시글 내용을 기준으로 커뮤니티 게시글을 검색할 수 있습니다."
      />

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="검색어를 입력하세요"
        placeholderTextColor={colors.textMuted}
        style={styles.searchInput}
      />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>추천 검색</Text>
        <View style={styles.keywordRow}>
          {suggestedKeywords.map((keyword) => (
            <Pressable key={keyword} style={styles.keywordChip} onPress={() => setQuery(keyword)}>
              <Text style={styles.keywordChipText}>{keyword}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.card}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.cardText}>검색 결과를 불러오는 중입니다...</Text>
        </View>
      ) : null}

      {!isLoading && results.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>검색 결과가 없습니다.</Text>
          <Text style={styles.cardText}>다른 키워드로 다시 검색해보세요.</Text>
        </View>
      ) : null}

      {!isLoading &&
        results.map((post) => (
          <Pressable key={post.id} style={styles.resultCard} onPress={() => router.push(`/posts/${post.id}`)}>
            {post.image_url ? (
              <Image source={{ uri: post.image_url }} style={styles.resultImage} contentFit="cover" />
            ) : (
              <View style={styles.resultImageFallback}>
                <Text style={styles.resultImageFallbackText}>TEXT</Text>
              </View>
            )}

            <View style={styles.resultBody}>
              <Text style={styles.resultAuthor}>{post.profiles?.nickname ?? '사용자'}</Text>
              <Text style={styles.resultContent} numberOfLines={3}>
                {post.content}
              </Text>
              <Text style={styles.resultMeta}>
                좋아요 {post.like_count} · 댓글 {post.comment_count}
              </Text>
            </View>
          </Pressable>
        ))}
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
  keywordRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  keywordChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
  },
  keywordChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  resultCard: {
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resultImage: {
    width: '100%',
    height: 180,
  },
  resultImageFallback: {
    width: '100%',
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  resultImageFallbackText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 1,
  },
  resultBody: {
    padding: 14,
    gap: 6,
  },
  resultAuthor: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  resultContent: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.text,
  },
  resultMeta: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
