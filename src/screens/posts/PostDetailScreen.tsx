import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import CommentRow from '@/src/components/comments/CommentRow';
import { colors } from '@/src/constants/colors';
import { CommentItem, createComment, deleteComment, getCommentsByPostId, updateComment } from '@/src/lib/comments';
import { followUser, getFollowerCount, isFollowingUser, unfollowUser } from '@/src/lib/follows';
import { getMyLikedPostIds, likePost, unlikePost } from '@/src/lib/likes';
import { getPostImagesByPostId, PostImageItem } from '@/src/lib/post-images';
import { getPostTagsByPostId, PostProductTag } from '@/src/lib/post-tags';
import { deletePost, getPostById, PostItem } from '@/src/lib/posts';
import { supabase } from '@/src/lib/supabase';

const COMMENT_SHEET_Y = 640;

export default function PostDetailScreen() {
  const params = useLocalSearchParams();
  const idParam = Array.isArray(params.id) ? params.id[0] : params.id;
  const fallbackId =
    typeof window !== 'undefined'
      ? window.location.pathname.split('/').filter(Boolean).pop()
      : undefined;
  const postId = typeof idParam === 'string' && idParam.length > 0 ? idParam : fallbackId;

  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;
  const commentSheetY = useRef(new Animated.Value(COMMENT_SHEET_Y)).current;
  const imageScrollRef = useRef<ScrollView | null>(null);

  const [post, setPost] = useState<PostItem | null>(null);
  const [postImages, setPostImages] = useState<PostImageItem[]>([]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [mediaWidth, setMediaWidth] = useState(0);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [tags, setTags] = useState<PostProductTag[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingFollow, setIsSubmittingFollow] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentDraft, setEditingCommentDraft] = useState('');
  const [isSubmittingCommentEdit, setIsSubmittingCommentEdit] = useState(false);
  const [menuCommentId, setMenuCommentId] = useState<string | null>(null);
  const [isCommentSheetVisible, setIsCommentSheetVisible] = useState(false);
  const [activeTagId, setActiveTagId] = useState<string | null>(null);

  const activeTag = useMemo(
    () => tags.find((tag) => tag.id === activeTagId) ?? null,
    [activeTagId, tags]
  );
  const isOwnPost = !!post && currentUserId === post.author_id;
  const displayImages = useMemo(() => {
    if (postImages.length > 0) {
      return postImages;
    }

    if (!post?.image_url) {
      return [];
    }

    return [
      {
        id: `fallback-${post.id}`,
        post_id: post.id,
        image_url: post.image_url,
        image_path: post.image_path ?? '',
        sort_order: 0,
        created_at: post.created_at,
      },
    ];
  }, [post, postImages]);

  const shouldShowTags = !!post?.image_url && activeImageIndex === 0;

  useEffect(() => {
    if (!postId) {
      setIsLoading(false);
      return;
    }

    const load = async () => {
      try {
        setIsLoading(true);
        const [{ data: auth }, nextPost, nextComments, nextTags, likedIds, nextImages] = await Promise.all([
          supabase.auth.getUser(),
          getPostById(postId),
          getCommentsByPostId(postId),
          getPostTagsByPostId(postId),
          getMyLikedPostIds(),
          getPostImagesByPostId(postId),
        ]);

        setPost(nextPost);
        setComments(nextComments);
        setTags(nextTags);
        setPostImages(nextImages);
        setCurrentUserId(auth.user?.id ?? null);
        setIsLiked(likedIds.has(nextPost.id));

        const nextFollowerCount = await getFollowerCount(nextPost.author_id);
        setFollowerCount(nextFollowerCount);

        if (auth.user?.id && auth.user.id !== nextPost.author_id) {
          setIsFollowing(await isFollowingUser(nextPost.author_id));
        } else {
          setIsFollowing(false);
        }
      } catch (error) {
        Alert.alert('불러오기 실패', error instanceof Error ? error.message : '게시글을 불러오지 못했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [postId]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) {
          commentSheetY.setValue(gesture.dy);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 140) {
          closeCommentSheet();
          return;
        }

        Animated.spring(commentSheetY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
        }).start();
      },
    })
  ).current;

  const closeCommentSheet = () => {
    Animated.timing(commentSheetY, {
      toValue: COMMENT_SHEET_Y,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setIsCommentSheetVisible(false);
      setMenuCommentId(null);
    });
  };

  const openCommentSheet = () => {
    setIsCommentSheetVisible(true);
    commentSheetY.setValue(COMMENT_SHEET_Y);
    Animated.spring(commentSheetY, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 0,
    }).start();
  };

  const handleToggleLike = async () => {
    if (!post) return;
    const nextLiked = !isLiked;

    setIsLiked(nextLiked);
    setPost((prev) =>
      prev ? { ...prev, like_count: Math.max(prev.like_count + (nextLiked ? 1 : -1), 0) } : prev
    );

    try {
      if (nextLiked) {
        await likePost(post.id);
      } else {
        await unlikePost(post.id);
      }
    } catch (error) {
      setIsLiked(!nextLiked);
      setPost((prev) =>
        prev ? { ...prev, like_count: Math.max(prev.like_count + (nextLiked ? -1 : 1), 0) } : prev
      );
      Alert.alert('좋아요 실패', error instanceof Error ? error.message : '좋아요 처리 중 오류가 발생했습니다.');
    }
  };

  const handleToggleFollow = async () => {
    if (!post || isOwnPost) return;

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
      Alert.alert('팔로우 실패', error instanceof Error ? error.message : '팔로우 처리 중 오류가 발생했습니다.');
    } finally {
      setIsSubmittingFollow(false);
    }
  };

  const handleDeletePost = () => {
    const runDelete = async () => {
      if (!post) return;

      try {
        setIsDeleting(true);
        await deletePost(post.id);
        router.replace('/(tabs)');
      } catch (error) {
        Alert.alert('삭제 실패', error instanceof Error ? error.message : '게시글을 삭제하지 못했습니다.');
      } finally {
        setIsDeleting(false);
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' ? window.confirm('이 게시글을 삭제할까요?') : false;
      if (confirmed) void runDelete();
      return;
    }

    Alert.alert('게시글 삭제', '이 게시글을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => void runDelete() },
    ]);
  };

  const handleSubmitComment = async () => {
    if (!post) return;

    try {
      setIsSubmittingComment(true);
      const nextComment = await createComment(post.id, commentDraft);
      setComments((prev) => [...prev, nextComment]);
      setCommentDraft('');
      setPost((prev) => (prev ? { ...prev, comment_count: prev.comment_count + 1 } : prev));
    } catch (error) {
      Alert.alert('댓글 작성 실패', error instanceof Error ? error.message : '댓글을 작성하지 못했습니다.');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleSaveCommentEdit = async () => {
    if (!editingCommentId) return;

    try {
      setIsSubmittingCommentEdit(true);
      const nextComment = await updateComment(editingCommentId, editingCommentDraft);
      setComments((prev) =>
        prev.map((comment) => (comment.id === editingCommentId ? nextComment : comment))
      );
      setEditingCommentId(null);
      setEditingCommentDraft('');
    } catch (error) {
      Alert.alert('댓글 수정 실패', error instanceof Error ? error.message : '댓글을 수정하지 못했습니다.');
    } finally {
      setIsSubmittingCommentEdit(false);
    }
  };

  const handleDeleteComment = (commentId: string) => {
    const runDelete = async () => {
      try {
        await deleteComment(commentId);
        setComments((prev) => prev.filter((comment) => comment.id !== commentId));
        setPost((prev) =>
          prev ? { ...prev, comment_count: Math.max(prev.comment_count - 1, 0) } : prev
        );
        setMenuCommentId(null);
      } catch (error) {
        Alert.alert('댓글 삭제 실패', error instanceof Error ? error.message : '댓글을 삭제하지 못했습니다.');
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' ? window.confirm('이 댓글을 삭제할까요?') : false;
      if (confirmed) void runDelete();
      return;
    }

    Alert.alert('댓글 삭제', '이 댓글을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => void runDelete() },
    ]);
  };

  const openCommentActions = (comment: CommentItem) => {
    if (currentUserId !== comment.user_id) return;

    if (Platform.OS === 'web') {
      setMenuCommentId((prev) => (prev === comment.id ? null : comment.id));
      return;
    }

    Alert.alert('댓글 관리', '원하는 작업을 선택해주세요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '수정',
        onPress: () => {
          setEditingCommentId(comment.id);
          setEditingCommentDraft(comment.content);
          setMenuCommentId(null);
        },
      },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => handleDeleteComment(comment.id),
      },
    ]);
  };

  const handleOpenTagLink = async () => {
    const activeTag = tags.find((tag) => tag.id === activeTagId);
    if (!activeTag) return;

    try {
      await Linking.openURL(activeTag.product_url);
    } catch {
      Alert.alert('링크 열기 실패', '외부 링크를 열 수 없습니다.');
    }
  };

  const scrollImages = (direction: 'prev' | 'next') => {
    if (!displayImages.length || !mediaWidth) return;

    const nextIndex =
      direction === 'next'
        ? Math.min(activeImageIndex + 1, displayImages.length - 1)
        : Math.max(activeImageIndex - 1, 0);

    imageScrollRef.current?.scrollTo({ x: mediaWidth * nextIndex, animated: true });
    setActiveImageIndex(nextIndex);
    setActiveTagId(null);
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.muted}>게시글을 불러오는 중입니다...</Text>
      </View>
    );
  }

  if (!post || !postId) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>게시글을 찾을 수 없습니다.</Text>
        <Pressable style={styles.pill} onPress={() => router.back()}>
          <Text style={styles.pillText}>뒤로 가기</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>게시글</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, isDesktopWeb && styles.contentDesktop]}>
        <View style={[styles.card, isDesktopWeb && styles.cardDesktop]}>
          <View style={[styles.media, isDesktopWeb && styles.mediaDesktop]}>
            {displayImages.length > 0 ? (
              <View
                style={styles.mediaInner}
                onLayout={(event) => {
                  const nextWidth = event.nativeEvent.layout.width;
                  setMediaWidth((prev) => (prev === nextWidth ? prev : nextWidth));
                }}>
                <ScrollView
                  ref={imageScrollRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={(event) => {
                    const nextIndex = Math.round(
                      event.nativeEvent.contentOffset.x /
                        Math.max(event.nativeEvent.layoutMeasurement.width, 1)
                    );
                    setActiveImageIndex(nextIndex);
                    setActiveTagId(null);
                  }}>
                  {displayImages.map((image) => (
                    <View
                      key={image.id || image.image_url}
                      style={[styles.imageSlide, { width: mediaWidth || width - 32 }]}>
                      <Image source={{ uri: image.image_url }} style={styles.image} contentFit="contain" />
                    </View>
                  ))}
                </ScrollView>

                {displayImages.length > 1 ? (
                  <>
                    <View style={styles.imageCountBadge}>
                      <Text style={styles.imageCountText}>
                        {Math.min(activeImageIndex + 1, displayImages.length)}/{displayImages.length}
                      </Text>
                    </View>
                    {isDesktopWeb ? (
                      <>
                        <Pressable
                          style={[styles.carouselArrow, styles.carouselArrowLeft, activeImageIndex === 0 && styles.carouselArrowDisabled]}
                          onPress={() => scrollImages('prev')}
                          disabled={activeImageIndex === 0}>
                          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
                        </Pressable>
                        <Pressable
                          style={[
                            styles.carouselArrow,
                            styles.carouselArrowRight,
                            activeImageIndex >= displayImages.length - 1 && styles.carouselArrowDisabled,
                          ]}
                          onPress={() => scrollImages('next')}
                          disabled={activeImageIndex >= displayImages.length - 1}>
                          <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
                        </Pressable>
                      </>
                    ) : null}
                  </>
                ) : null}

                {shouldShowTags
                  ? tags.map((tag) => (
                      <Pressable
                        key={tag.id}
                        style={[
                          styles.marker,
                          { left: `${tag.x_position * 100}%`, top: `${tag.y_position * 100}%` },
                        ]}
                        onPress={() => setActiveTagId((prev) => (prev === tag.id ? null : tag.id))}
                      />
                    ))
                  : null}

                {shouldShowTags && activeTag ? (
                  <View style={styles.tagCard}>
                    <Text style={styles.tagName}>{activeTag.product_name}</Text>
                    <Text style={styles.tagUrl} numberOfLines={1}>
                      {activeTag.product_url}
                    </Text>
                    <Pressable style={styles.smallPill} onPress={handleOpenTagLink}>
                      <Text style={styles.smallPillText}>링크 열기</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={[styles.textCover, isDesktopWeb && styles.textCoverDesktop]}>
                <View>
                  <Text style={styles.badge}>TEXT STORY</Text>
                  <Text style={styles.meta}>
                    {formatPostDate(post.created_at)} · {post.is_public ? '공개' : '비공개'}
                  </Text>
                </View>
                <Text style={[styles.textPost, isDesktopWeb && styles.textPostDesktop]}>{post.content}</Text>
                <Text style={styles.metaStrong}>
                  {post.profiles?.nickname ?? '사용자'}님의 텍스트 게시글
                </Text>
              </View>
            )}
          </View>

          <View style={[styles.side, isDesktopWeb && styles.sideDesktop]}>
            <View style={styles.header}>
              <View style={styles.authorRow}>
                {post.profiles?.avatar_url ? (
                  <Image source={{ uri: post.profiles.avatar_url }} style={styles.avatar} contentFit="cover" />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarFallbackText}>{getInitials(post.profiles?.nickname ?? '사용자')}</Text>
                  </View>
                )}
                <View style={styles.authorMeta}>
                  <Text style={styles.author}>{post.profiles?.nickname ?? '사용자'}</Text>
                  <Text style={styles.muted}>팔로워 {followerCount} · {formatPostDate(post.created_at)}</Text>
                </View>
              </View>

              {isOwnPost ? (
                <View style={styles.row}>
                  <Pressable style={styles.outlinePill} onPress={() => router.push(`/posts/edit/${post.id}`)}>
                    <Text style={styles.outlinePillText}>수정</Text>
                  </Pressable>
                  <Pressable style={styles.deletePill} onPress={handleDeletePost} disabled={isDeleting}>
                    <Text style={styles.deletePillText}>{isDeleting ? '삭제 중...' : '삭제'}</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={[styles.followPill, isFollowing && styles.outlinePill, isSubmittingFollow && styles.disabled]}
                  onPress={() => void handleToggleFollow()}
                  disabled={isSubmittingFollow}>
                  <Text style={[styles.followText, isFollowing && styles.outlinePillText]}>
                    {isSubmittingFollow ? '처리 중...' : isFollowing ? '팔로잉' : '팔로우'}
                  </Text>
                </Pressable>
              )}
            </View>

            <View style={styles.row}>
              <Pressable style={styles.metaAction} onPress={() => void handleToggleLike()}>
                <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={18} color={isLiked ? '#E15A7A' : colors.text} />
                <Text style={styles.metaStrong}>좋아요 {post.like_count}</Text>
              </Pressable>
              <Pressable style={styles.metaAction} onPress={isDesktopWeb ? undefined : openCommentSheet}>
                <Ionicons name="chatbubble-outline" size={17} color={colors.text} />
                <Text style={styles.metaStrong}>댓글 {post.comment_count}</Text>
              </Pressable>
              <Text style={styles.metaStrong}>{post.is_public ? '공개' : '비공개'}</Text>
            </View>

            <Text style={styles.body}>
              <Text style={styles.bodyAuthor}>{post.profiles?.nickname ?? '사용자'}</Text> {post.content}
            </Text>

            {isDesktopWeb ? (
              <View style={styles.commentPanel}>
                <Text style={styles.section}>댓글</Text>
                <ScrollView style={styles.commentScroller} contentContainerStyle={styles.commentList} showsVerticalScrollIndicator={false}>
                  {comments.length === 0 ? (
                    <Text style={styles.muted}>아직 댓글이 없습니다.</Text>
                  ) : (
                    comments.map((comment) => (
                      <CommentRow
                        key={comment.id}
                        comment={comment}
                        currentUserId={currentUserId}
                        editingCommentId={editingCommentId}
                        editingCommentDraft={editingCommentDraft}
                        isSubmittingCommentEdit={isSubmittingCommentEdit}
                        menuCommentId={menuCommentId}
                        onChangeEditDraft={setEditingCommentDraft}
                        onCancelEdit={() => setEditingCommentId(null)}
                        onOpenActions={openCommentActions}
                        onSaveEdit={handleSaveCommentEdit}
                        onStartEdit={(target) => {
                          setEditingCommentId(target.id);
                          setEditingCommentDraft(target.content);
                          setMenuCommentId(null);
                        }}
                        onDelete={handleDeleteComment}
                        formatDate={formatPostDate}
                      />
                    ))
                  )}
                </ScrollView>
                <View style={styles.inputRow}>
                  <TextInput
                    value={commentDraft}
                    onChangeText={setCommentDraft}
                    placeholder="댓글을 입력하세요."
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                  />
                  <Pressable style={[styles.submit, isSubmittingComment && styles.disabled]} onPress={() => void handleSubmitComment()} disabled={isSubmittingComment}>
                    <Text style={styles.submitText}>{isSubmittingComment ? '등록 중' : '게시'}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>

      {!isDesktopWeb ? (
        <Modal transparent animationType="none" visible={isCommentSheetVisible} onRequestClose={closeCommentSheet}>
          <View style={styles.overlay}>
            <Pressable style={styles.backdrop} onPress={closeCommentSheet} />
            <Animated.View style={[styles.sheet, { transform: [{ translateY: commentSheetY }] }]}>
              <View style={styles.handleArea} {...panResponder.panHandlers}>
                <View style={styles.handle} />
              </View>
              <View style={styles.sheetHeader}>
                <Text style={styles.section}>댓글</Text>
                <Pressable onPress={closeCommentSheet}>
                  <Ionicons name="close" size={22} color={colors.text} />
                </Pressable>
              </View>
              <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.commentList} showsVerticalScrollIndicator={false}>
                {comments.length === 0 ? (
                  <Text style={styles.muted}>아직 댓글이 없습니다.</Text>
                ) : (
                  comments.map((comment) => (
                    <CommentRow
                      key={comment.id}
                      comment={comment}
                      currentUserId={currentUserId}
                      editingCommentId={editingCommentId}
                      editingCommentDraft={editingCommentDraft}
                      isSubmittingCommentEdit={isSubmittingCommentEdit}
                      menuCommentId={menuCommentId}
                      onChangeEditDraft={setEditingCommentDraft}
                      onCancelEdit={() => setEditingCommentId(null)}
                      onOpenActions={openCommentActions}
                      onSaveEdit={handleSaveCommentEdit}
                      onStartEdit={(target) => {
                        setEditingCommentId(target.id);
                        setEditingCommentDraft(target.content);
                        setMenuCommentId(null);
                      }}
                      onDelete={handleDeleteComment}
                      formatDate={formatPostDate}
                    />
                  ))
                )}
              </ScrollView>
              <View style={styles.inputRow}>
                <TextInput
                  value={commentDraft}
                  onChangeText={setCommentDraft}
                  placeholder="댓글을 입력하세요."
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />
                <Pressable style={[styles.submit, isSubmittingComment && styles.disabled]} onPress={() => void handleSubmitComment()} disabled={isSubmittingComment}>
                  <Text style={styles.submitText}>{isSubmittingComment ? '등록 중' : '게시'}</Text>
                </Pressable>
              </View>
            </Animated.View>
          </View>
        </Modal>
      ) : null}
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
  if (Number.isNaN(date.getTime())) return '방금 전';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const hourMs = 1000 * 60 * 60;
  const dayMs = hourMs * 24;

  if (diffMs < hourMs) return `${Math.max(1, Math.floor(diffMs / (1000 * 60)))}분 전`;
  if (diffMs < dayMs) return `${Math.max(1, Math.floor(diffMs / hourMs))}시간 전`;
  if (diffMs < dayMs * 7) return `${Math.max(1, Math.floor(diffMs / dayMs))}일 전`;

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return now.getFullYear() === date.getFullYear()
    ? `${month}.${day}`
    : `${date.getFullYear()}.${month}.${day}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 10 },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  spacer: { width: 40 },
  topTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  content: { padding: 16 },
  contentDesktop: { minHeight: '100%', alignItems: 'center', justifyContent: 'center' },
  card: { gap: 16 },
  cardDesktop: { width: '100%', maxWidth: 1400, minHeight: 820, flexDirection: 'row', gap: 0, overflow: 'hidden', borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  media: { overflow: 'hidden', borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  mediaDesktop: { flex: 1.45, borderWidth: 0, borderRadius: 0, backgroundColor: '#EEF4F0' },
  mediaInner: { position: 'relative', backgroundColor: '#EEF4F0' },
  imageSlide: { width: '100%' },
  image: { width: '100%', aspectRatio: 4 / 5 },
  imageCountBadge: { position: 'absolute', top: 16, right: 16, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(16, 24, 20, 0.62)' },
  imageCountText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  carouselArrow: { position: 'absolute', top: '50%', marginTop: -20, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16, 24, 20, 0.58)' },
  carouselArrowLeft: { left: 16 },
  carouselArrowRight: { right: 16 },
  carouselArrowDisabled: { opacity: 0.35 },
  marker: { position: 'absolute', width: 18, height: 18, marginLeft: -9, marginTop: -9, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 4, borderColor: colors.primary },
  tagCard: { position: 'absolute', left: 16, right: 16, bottom: 16, padding: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.96)', gap: 6 },
  tagName: { fontSize: 14, fontWeight: '800', color: colors.text },
  tagUrl: { fontSize: 12, color: colors.textMuted },
  smallPill: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.primaryLight },
  smallPillText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  textCover: { minHeight: 420, padding: 24, justifyContent: 'space-between', backgroundColor: '#E4EFE9' },
  textCoverDesktop: { flex: 1, minHeight: 820, paddingHorizontal: 42, paddingVertical: 40 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#F6FBF8', fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: colors.primary },
  meta: { marginTop: 10, fontSize: 13, fontWeight: '600', color: '#567066' },
  textPost: { fontSize: 28, lineHeight: 38, fontWeight: '800', color: '#17362F' },
  textPostDesktop: { fontSize: 42, lineHeight: 58 },
  metaStrong: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  side: { gap: 16 },
  sideDesktop: { flex: 1, padding: 22, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
  authorRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  avatarFallbackText: { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },
  authorMeta: { flex: 1, gap: 4 },
  author: { fontSize: 20, fontWeight: '800', color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  outlinePill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  outlinePillText: { fontSize: 13, fontWeight: '700', color: colors.text },
  deletePill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: '#FFF3F3', borderWidth: 1, borderColor: '#F2B7B7' },
  deletePillText: { fontSize: 13, fontWeight: '700', color: '#C24747' },
  followPill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.primary },
  followText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  metaAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  body: { fontSize: 16, lineHeight: 25, color: colors.text, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  bodyAuthor: { fontWeight: '800' },
  commentPanel: { flex: 1, minHeight: 0, gap: 14, padding: 18, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  section: { fontSize: 16, fontWeight: '800', color: colors.text },
  commentScroller: { flex: 1, minHeight: 0 },
  commentList: { paddingVertical: 12, gap: 16 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, minHeight: 46, borderRadius: 14, backgroundColor: colors.background, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: colors.text },
  submit: { alignItems: 'center', justifyContent: 'center', minWidth: 72, height: 46, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.primary },
  submitText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(8, 12, 10, 0.28)' },
  backdrop: { flex: 1 },
  sheet: { maxHeight: '82%', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface, paddingHorizontal: 18, paddingBottom: 18 },
  handleArea: { alignItems: 'center', paddingTop: 10, paddingBottom: 10 },
  handle: { width: 44, height: 5, borderRadius: 999, backgroundColor: '#C9D3CE' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  sheetScroll: { maxHeight: 420 },
  pill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.primaryLight },
  pillText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  muted: { fontSize: 14, color: colors.textMuted },
  disabled: { opacity: 0.7 },
});
