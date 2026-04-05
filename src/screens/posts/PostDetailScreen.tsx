import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getCommentsByPostId, CommentItem } from '@/src/lib/comments';
import { colors } from '@/src/constants/colors';
import {
  followUser,
  getFollowerCount,
  isFollowingUser,
  unfollowUser,
} from '@/src/lib/follows';
import { deletePost, getPostById, PostItem } from '@/src/lib/posts';
import { supabase } from '@/src/lib/supabase';

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [post, setPost] = useState<PostItem | null>(null);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [isOwnPost, setIsOwnPost] = useState(false);
  const [isSubmittingFollow, setIsSubmittingFollow] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!id) {
      return;
    }

    const loadData = async () => {
      try {
        setIsLoading(true);
        const [postData, commentData] = await Promise.all([
          getPostById(id),
          getCommentsByPostId(id),
        ]);
        setPost(postData);
        setComments(commentData);

        const {
          data: { user },
        } = await supabase.auth.getUser();

        const ownPost = user?.id === postData.author_id;
        setIsOwnPost(ownPost);

        const [nextFollowerCount, nextIsFollowing] = await Promise.all([
          getFollowerCount(postData.author_id),
          ownPost ? Promise.resolve(false) : isFollowingUser(postData.author_id),
        ]);

        setFollowerCount(nextFollowerCount);
        setIsFollowing(nextIsFollowing);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '게시글을 불러오는 중 오류가 발생했습니다.';
        Alert.alert('불러오기 실패', message, [{ text: '확인', onPress: () => router.back() }]);
      } finally {
        setIsLoading(false);
      }
    };

    void loadData();
  }, [id]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.centerText}>게시글을 불러오는 중입니다...</Text>
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.centered}>
        <Text style={styles.centerText}>게시글을 찾을 수 없습니다.</Text>
      </View>
    );
  }

  const handleToggleFollow = async () => {
    if (!post || isOwnPost) {
      return;
    }

    try {
      setIsSubmittingFollow(true);

      if (isFollowing) {
        await unfollowUser(post.author_id);
        setIsFollowing(false);
        setFollowerCount((prev) => Math.max(prev - 1, 0));
      } else {
        await followUser(post.author_id);
        setIsFollowing(true);
        setFollowerCount((prev) => prev + 1);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '팔로우 처리 중 오류가 발생했습니다.';
      Alert.alert('팔로우 실패', message);
    } finally {
      setIsSubmittingFollow(false);
    }
  };

  const handleEditPost = () => {
    if (!post) {
      return;
    }

    router.push(`/posts/edit/${post.id}`);
  };

  const handleDeletePost = () => {
    if (!post) {
      return;
    }

    Alert.alert('게시글 삭제', '이 게시글을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            setIsDeleting(true);
            await deletePost(post.id);
            router.replace('/(tabs)');
          } catch (error) {
            const message =
              error instanceof Error ? error.message : '게시글 삭제 중 오류가 발생했습니다.';
            Alert.alert('삭제 실패', message);
          } finally {
            setIsDeleting(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>게시글</Text>
        <View style={styles.iconSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          {post.profiles?.avatar_url ? (
            <Image source={{ uri: post.profiles.avatar_url }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText}>
                {getInitials(post.profiles?.nickname ?? '사용자')}
              </Text>
            </View>
          )}
          <View style={styles.headerText}>
            <Text style={styles.author}>{post.profiles?.nickname ?? '사용자'}</Text>
            <Text style={styles.date}>
              팔로워 {followerCount} · {formatPostDate(post.created_at)}
            </Text>
          </View>
          {!isOwnPost ? (
            <Pressable
              style={[
                styles.followButton,
                isFollowing && styles.followButtonActive,
                isSubmittingFollow && styles.followButtonDisabled,
              ]}
              onPress={() => void handleToggleFollow()}
              disabled={isSubmittingFollow}>
              <Text
                style={[
                  styles.followButtonText,
                  isFollowing && styles.followButtonTextActive,
                ]}>
                {isSubmittingFollow ? '처리 중...' : isFollowing ? '팔로잉' : '팔로우'}
              </Text>
            </Pressable>
          ) : (
            <View style={styles.ownerActions}>
              <Pressable style={styles.ownerButton} onPress={handleEditPost}>
                <Text style={styles.ownerButtonText}>수정</Text>
              </Pressable>
              <Pressable
                style={[styles.ownerButton, styles.ownerDeleteButton, isDeleting && styles.followButtonDisabled]}
                onPress={handleDeletePost}
                disabled={isDeleting}>
                <Text style={styles.ownerDeleteButtonText}>
                  {isDeleting ? '삭제 중...' : '삭제'}
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        {post.image_url ? (
          <Image source={{ uri: post.image_url }} style={styles.image} contentFit="cover" />
        ) : (
          <View style={styles.textImageFallback}>
            <Text style={styles.textImageFallbackText}>TEXT POST</Text>
          </View>
        )}

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>좋아요 {post.like_count}</Text>
          <Text style={styles.metaText}>댓글 {post.comment_count}</Text>
          <Text style={styles.metaText}>{post.is_public ? '공개' : '비공개'}</Text>
        </View>

        <Text style={styles.bodyText}>
          <Text style={styles.inlineAuthor}>{post.profiles?.nickname ?? '사용자'}</Text> {post.content}
        </Text>

        <View style={styles.commentsCard}>
          <Text style={styles.commentsTitle}>댓글</Text>
          {comments.length === 0 ? (
            <Text style={styles.emptyComments}>아직 댓글이 없습니다.</Text>
          ) : (
            comments.map((comment) => (
              <View key={comment.id} style={styles.commentRow}>
                <Text style={styles.commentAuthor}>
                  {comment.profiles?.nickname ?? '사용자'}
                </Text>
                <Text style={styles.commentContent}>{comment.content}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
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
  const now = new Date();

  if (Number.isNaN(date.getTime())) {
    return '방금 전';
  }

  const diffMs = now.getTime() - date.getTime();
  const hourMs = 1000 * 60 * 60;
  const dayMs = hourMs * 24;

  if (diffMs < hourMs) {
    return `${Math.max(1, Math.floor(diffMs / (1000 * 60)))}분 전`;
  }
  if (diffMs < dayMs) {
    return `${Math.max(1, Math.floor(diffMs / hourMs))}시간 전`;
  }
  if (diffMs < dayMs * 7) {
    return `${Math.max(1, Math.floor(diffMs / dayMs))}일 전`;
  }

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return now.getFullYear() === date.getFullYear()
    ? `${month}.${day}`
    : `${date.getFullYear()}.${month}.${day}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: colors.background,
    padding: 24,
  },
  centerText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 10,
    backgroundColor: colors.background,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconSpacer: {
    width: 40,
  },
  topTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  content: {
    padding: 16,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  avatarFallbackText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  headerText: {
    flex: 1,
    gap: 2,
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
  followButton: {
    minWidth: 76,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  followButtonActive: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  followButtonDisabled: {
    opacity: 0.7,
  },
  followButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  followButtonTextActive: {
    color: colors.primary,
  },
  ownerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ownerButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ownerButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  ownerDeleteButton: {
    backgroundColor: '#FFF1F1',
    borderColor: '#F2B4B4',
  },
  ownerDeleteButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#C24747',
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 20,
  },
  textImageFallback: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  textImageFallbackText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metaText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.text,
  },
  inlineAuthor: {
    fontWeight: '700',
  },
  commentsCard: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  commentsTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  emptyComments: {
    fontSize: 14,
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
  commentContent: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: colors.text,
  },
});
