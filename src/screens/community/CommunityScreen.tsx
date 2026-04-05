import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { useIsFocused } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import AppHeader from '@/src/components/common/AppHeader';
import { CommentItem, createComment, getCommentsByPostId } from '@/src/lib/comments';
import ScreenContainer from '@/src/components/common/ScreenContainer';
import { colors } from '@/src/constants/colors';
import { getMyLikedPostIds, likePost, unlikePost } from '@/src/lib/likes';
import { getFeedPosts, PostItem } from '@/src/lib/posts';

export default function CommunityScreen() {
  const isFocused = useIsFocused();
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [commentsByPostId, setCommentsByPostId] = useState<Record<string, CommentItem[]>>({});
  const [loadingCommentsPostId, setLoadingCommentsPostId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [submittingCommentPostId, setSubmittingCommentPostId] = useState<string | null>(null);

  const handleOpenMenu = () => {
    Alert.alert('메뉴', '이 버튼을 통해 이후 추가 기능 화면으로 연결할 수 있습니다.');
  };

  const loadPosts = async (mode: 'load' | 'refresh' = 'load') => {
    try {
      if (mode === 'load') {
        setIsLoading(true);
      }

      const [feedPosts, likedIds] = await Promise.all([getFeedPosts(), getMyLikedPostIds()]);
      setPosts(feedPosts);
      setLikedPostIds(likedIds);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '게시글을 불러오는 중 오류가 발생했습니다.';
      Alert.alert('불러오기 실패', message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    void loadPosts();
  }, [isFocused]);

  const handleToggleComments = async (postId: string) => {
    if (expandedPostId === postId) {
      setExpandedPostId(null);
      return;
    }

    setExpandedPostId(postId);

    if (commentsByPostId[postId]) {
      return;
    }

    try {
      setLoadingCommentsPostId(postId);
      const comments = await getCommentsByPostId(postId);
      setCommentsByPostId((prev) => ({ ...prev, [postId]: comments }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '댓글을 불러오는 중 오류가 발생했습니다.';
      Alert.alert('댓글 불러오기 실패', message);
    } finally {
      setLoadingCommentsPostId(null);
    }
  };

  const handleSubmitComment = async (postId: string) => {
    try {
      setSubmittingCommentPostId(postId);
      const nextComment = await createComment(postId, commentDrafts[postId] ?? '');

      setCommentsByPostId((prev) => ({
        ...prev,
        [postId]: [...(prev[postId] ?? []), nextComment],
      }));
      setCommentDrafts((prev) => ({ ...prev, [postId]: '' }));
      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? {
                ...post,
                comment_count: post.comment_count + 1,
              }
            : post
        )
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '댓글 작성 중 오류가 발생했습니다.';
      Alert.alert('댓글 작성 실패', message);
    } finally {
      setSubmittingCommentPostId(null);
    }
  };

  const handleToggleLike = async (postId: string) => {
    const isLiked = likedPostIds.has(postId);

    setLikedPostIds((prev) => {
      const next = new Set(prev);
      if (isLiked) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });

    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId
          ? {
              ...post,
              like_count: Math.max(post.like_count + (isLiked ? -1 : 1), 0),
            }
          : post
      )
    );

    try {
      if (isLiked) {
        await unlikePost(postId);
      } else {
        await likePost(postId);
      }
    } catch (error) {
      setLikedPostIds((prev) => {
        const next = new Set(prev);
        if (isLiked) {
          next.add(postId);
        } else {
          next.delete(postId);
        }
        return next;
      });

      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? {
                ...post,
                like_count: Math.max(post.like_count + (isLiked ? 1 : -1), 0),
              }
            : post
        )
      );

      const message =
        error instanceof Error ? error.message : '좋아요 처리 중 오류가 발생했습니다.';
      Alert.alert('좋아요 실패', message);
    }
  };

  return (
    <ScreenContainer
      scroll
      contentStyle={styles.screenContent}>
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

      <Pressable style={styles.refreshButton} onPress={() => void loadPosts('refresh')}>
        <Text style={styles.refreshButtonText}>새로고침</Text>
      </Pressable>

      {isLoading ? (
        <View style={styles.statusCard}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.statusText}>게시글을 불러오는 중입니다...</Text>
        </View>
      ) : null}

      {!isLoading && posts.length === 0 ? (
        <View style={styles.statusCard}>
          <Text style={styles.emptyTitle}>아직 게시글이 없습니다.</Text>
          <Text style={styles.statusText}>업로드 탭에서 첫 게시글을 작성해보세요.</Text>
        </View>
      ) : null}

      {posts.map((post) => (
        <Pressable key={post.id} style={styles.postCard} onPress={() => router.push(`/posts/${post.id}`)}>
          <View style={styles.postHeader}>
            <View style={styles.authorRow}>
              {post.profiles?.avatar_url ? (
                <Image
                  source={{ uri: post.profiles.avatar_url }}
                  style={styles.authorAvatar}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.authorAvatarFallback}>
                  <Text style={styles.authorAvatarFallbackText}>
                    {getInitials(post.profiles?.nickname ?? '사용자')}
                  </Text>
                </View>
              )}

              <View style={styles.authorMeta}>
                <Text style={styles.authorName}>{post.profiles?.nickname ?? '사용자'}</Text>
              </View>
            </View>
          </View>

          <View style={styles.postImagePlaceholder}>
            {post.image_url ? (
              <Image source={{ uri: post.image_url }} style={styles.postImage} contentFit="cover" />
            ) : (
              <Text style={styles.postImageText}>TEXT POST</Text>
            )}
          </View>

          <View style={styles.postContent}>
            <View style={styles.feedbackRow}>
              <Pressable
                style={styles.feedbackItem}
                onPress={() => void handleToggleLike(post.id)}>
                <Ionicons
                  name={likedPostIds.has(post.id) ? 'heart' : 'heart-outline'}
                  size={18}
                  color={likedPostIds.has(post.id) ? '#E15A7A' : colors.text}
                />
                <Text style={styles.feedbackText}>좋아요 {post.like_count}</Text>
              </Pressable>
              <Pressable
                style={styles.feedbackItem}
                onPress={() => void handleToggleComments(post.id)}>
                <Ionicons name="chatbubble-outline" size={17} color={colors.text} />
                <Text style={styles.feedbackText}>댓글 {post.comment_count}</Text>
              </Pressable>
            </View>

            <Text style={styles.description} numberOfLines={3}>
              <Text style={styles.inlineAuthor}>{post.profiles?.nickname ?? '사용자'}</Text>{' '}
              {post.content}
            </Text>

            <View style={styles.postFooter}>
              <Text style={styles.dateText}>{formatPostDate(post.created_at)}</Text>
            </View>

            {expandedPostId === post.id ? (
              <View style={styles.commentsSection}>
                {loadingCommentsPostId === post.id ? (
                  <View style={styles.commentsStatus}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.commentsStatusText}>댓글을 불러오는 중입니다...</Text>
                  </View>
                ) : null}

                {loadingCommentsPostId !== post.id &&
                (commentsByPostId[post.id]?.length ?? 0) === 0 ? (
                  <Text style={styles.commentsEmpty}>첫 댓글을 남겨보세요.</Text>
                ) : null}

                {loadingCommentsPostId !== post.id &&
                  (commentsByPostId[post.id] ?? []).map((comment) => (
                    <View key={comment.id} style={styles.commentRow}>
                      <Text style={styles.commentAuthor}>
                        {comment.profiles?.nickname ?? '사용자'}
                      </Text>
                      <Text style={styles.commentText}>{comment.content}</Text>
                    </View>
                  ))}

                <View style={styles.commentComposer}>
                  <TextInput
                    value={commentDrafts[post.id] ?? ''}
                    onChangeText={(text) =>
                      setCommentDrafts((prev) => ({ ...prev, [post.id]: text }))
                    }
                    placeholder="댓글을 입력하세요."
                    placeholderTextColor={colors.textMuted}
                    style={styles.commentInput}
                  />
                  <Pressable
                    style={[
                      styles.commentSubmitButton,
                      submittingCommentPostId === post.id && styles.commentSubmitButtonDisabled,
                    ]}
                    onPress={() => void handleSubmitComment(post.id)}
                    disabled={submittingCommentPostId === post.id}>
                    <Text style={styles.commentSubmitText}>
                      {submittingCommentPostId === post.id ? '등록 중' : '등록'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        </Pressable>
      ))}
    </ScreenContainer>
  );
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function formatPostDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '방금 전';
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const hourMs = 1000 * 60 * 60;
  const dayMs = hourMs * 24;

  if (diffMs < hourMs) {
    const minutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
    return `${minutes}분 전`;
  }

  if (diffMs < dayMs) {
    const hours = Math.max(1, Math.floor(diffMs / hourMs));
    return `${hours}시간 전`;
  }

  if (diffMs < dayMs * 7) {
    const days = Math.max(1, Math.floor(diffMs / dayMs));
    return `${days}일 전`;
  }

  const sameYear = now.getFullYear() === date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return sameYear ? `${month}.${day}` : `${date.getFullYear()}.${month}.${day}`;
}

const styles = StyleSheet.create({
  screenContent: {
    gap: 16,
  },
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
  refreshButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
  },
  refreshButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  statusCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 140,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  statusText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
    textAlign: 'center',
  },
  postCard: {
    overflow: 'hidden',
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  postHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  authorAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  authorAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  authorAvatarFallbackText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  authorMeta: {
    flex: 1,
  },
  authorName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  postImagePlaceholder: {
    height: 180,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DCE7E2',
  },
  postImage: {
    width: '100%',
    height: '100%',
  },
  postImageText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 1,
  },
  postContent: {
    padding: 14,
    gap: 10,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  feedbackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  feedbackText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.text,
  },
  inlineAuthor: {
    fontWeight: '700',
    color: colors.text,
  },
  postFooter: {
    marginTop: -2,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  commentsSection: {
    gap: 10,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  commentsStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  commentsStatusText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  commentsEmpty: {
    fontSize: 13,
    color: colors.textMuted,
  },
  commentRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  commentText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: colors.text,
  },
  commentComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  commentInput: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  commentSubmitButton: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  commentSubmitButtonDisabled: {
    opacity: 0.7,
  },
  commentSubmitText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
