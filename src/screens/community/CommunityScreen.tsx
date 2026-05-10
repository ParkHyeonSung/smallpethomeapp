import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { useIsFocused } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image as NativeImage,
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
import AppHeader from '@/src/components/common/AppHeader';
import ScreenContainer from '@/src/components/common/ScreenContainer';
import { colors } from '@/src/constants/colors';
import { CommentItem, createComment, deleteComment, getCommentsByPostId, updateComment } from '@/src/lib/comments';
import { getMyLikedPostIds, likePost, unlikePost } from '@/src/lib/likes';
import { getPostImagesByPostIds, PostImageItem } from '@/src/lib/post-images';
import { getFeedPosts, PostItem } from '@/src/lib/posts';
import { supabase } from '@/src/lib/supabase';

const COMMENT_SHEET_Y = 560;

export default function CommunityScreen() {
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;
  const isFocused = useIsFocused();
  const commentSheetY = useRef(new Animated.Value(COMMENT_SHEET_Y)).current;
  const feedScrollRefs = useRef<Record<string, ScrollView | null>>({});

  const [posts, setPosts] = useState<PostItem[]>([]);
  const [postImagesByPostId, setPostImagesByPostId] = useState<Record<string, PostImageItem[]>>({});
  const [activeImageIndexByPostId, setActiveImageIndexByPostId] = useState<Record<string, number>>({});
  const [mediaWidthByPostId, setMediaWidthByPostId] = useState<Record<string, number>>({});
  const [imageRatios, setImageRatios] = useState<Record<string, number>>({});
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const [commentsByPostId, setCommentsByPostId] = useState<Record<string, CommentItem[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [commentSheetPostId, setCommentSheetPostId] = useState<string | null>(null);
  const [loadingCommentsPostId, setLoadingCommentsPostId] = useState<string | null>(null);
  const [submittingCommentPostId, setSubmittingCommentPostId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentDraft, setEditingCommentDraft] = useState('');
  const [isSubmittingCommentEdit, setIsSubmittingCommentEdit] = useState(false);
  const [menuCommentId, setMenuCommentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  useEffect(() => {
    if (!isFocused) return;
    void loadPosts();
  }, [isFocused]);

  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id ?? null);
    };

    void loadUser();
  }, []);

  useEffect(() => {
    posts.forEach((post) => {
      getDisplayImages(post, postImagesByPostId).forEach((image) => {
        const ratioKey = image.id || image.image_url;
        if (!image.image_url || imageRatios[ratioKey]) return;

        NativeImage.getSize(
          image.image_url,
          (imageWidth, imageHeight) => {
            if (!imageWidth || !imageHeight) return;
            setImageRatios((prev) => ({
              ...prev,
              [ratioKey]: imageWidth / imageHeight,
            }));
          },
          () =>
            setImageRatios((prev) => ({
              ...prev,
              [ratioKey]: 4 / 5,
            }))
        );
      });
    });
  }, [posts, postImagesByPostId, imageRatios]);

  const loadPosts = async () => {
    try {
      setIsLoading(true);
      const [feedPosts, likedIds] = await Promise.all([getFeedPosts(), getMyLikedPostIds()]);
      const nextPostImages = await getPostImagesByPostIds(feedPosts.map((post) => post.id));

      setPosts(feedPosts);
      setLikedPostIds(likedIds);
      setPostImagesByPostId(nextPostImages);
    } catch (error) {
      Alert.alert('불러오기 실패', error instanceof Error ? error.message : '게시글을 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadCommentsForPost = async (postId: string) => {
    if (commentsByPostId[postId]) return;

    try {
      setLoadingCommentsPostId(postId);
      const nextComments = await getCommentsByPostId(postId);
      setCommentsByPostId((prev) => ({ ...prev, [postId]: nextComments }));
    } catch (error) {
      Alert.alert('댓글 불러오기 실패', error instanceof Error ? error.message : '댓글을 불러오지 못했습니다.');
    } finally {
      setLoadingCommentsPostId(null);
    }
  };

  const closeCommentSheet = () => {
    Animated.timing(commentSheetY, {
      toValue: COMMENT_SHEET_Y,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setCommentSheetPostId(null);
      setMenuCommentId(null);
    });
  };

  const openCommentSheet = async (postId: string) => {
    await loadCommentsForPost(postId);
    setCommentSheetPostId(postId);
    commentSheetY.setValue(COMMENT_SHEET_Y);

    Animated.spring(commentSheetY, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 0,
    }).start();
  };

  const handleToggleCommentsDesktop = async (postId: string) => {
    if (expandedPostId === postId) {
      setExpandedPostId(null);
      return;
    }

    setExpandedPostId(postId);
    await loadCommentsForPost(postId);
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
          ? { ...post, like_count: Math.max(post.like_count + (isLiked ? -1 : 1), 0) }
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
            ? { ...post, like_count: Math.max(post.like_count + (isLiked ? 1 : -1), 0) }
            : post
        )
      );

      Alert.alert('좋아요 실패', error instanceof Error ? error.message : '좋아요 처리 중 오류가 발생했습니다.');
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
          post.id === postId ? { ...post, comment_count: post.comment_count + 1 } : post
        )
      );
    } catch (error) {
      Alert.alert('댓글 작성 실패', error instanceof Error ? error.message : '댓글을 작성하지 못했습니다.');
    } finally {
      setSubmittingCommentPostId(null);
    }
  };

  const handleSaveCommentEdit = async () => {
    if (!editingCommentId || !commentSheetPostId) return;

    try {
      setIsSubmittingCommentEdit(true);
      const nextComment = await updateComment(editingCommentId, editingCommentDraft);
      setCommentsByPostId((prev) => ({
        ...prev,
        [commentSheetPostId]: (prev[commentSheetPostId] ?? []).map((comment) =>
          comment.id === editingCommentId ? nextComment : comment
        ),
      }));
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
        if (!commentSheetPostId) return;

        setCommentsByPostId((prev) => ({
          ...prev,
          [commentSheetPostId]: (prev[commentSheetPostId] ?? []).filter((comment) => comment.id !== commentId),
        }));
        setPosts((prev) =>
          prev.map((post) =>
            post.id === commentSheetPostId
              ? { ...post, comment_count: Math.max(post.comment_count - 1, 0) }
              : post
          )
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

  const scrollPostImages = (postId: string, direction: 'prev' | 'next', imageCount: number) => {
    const currentIndex = activeImageIndexByPostId[postId] ?? 0;
    const nextIndex =
      direction === 'next'
        ? Math.min(currentIndex + 1, imageCount - 1)
        : Math.max(currentIndex - 1, 0);
    const mediaWidth = mediaWidthByPostId[postId];
    const target = feedScrollRefs.current[postId];

    if (!target || !mediaWidth) return;

    target.scrollTo({ x: mediaWidth * nextIndex, animated: true });
    setActiveImageIndexByPostId((prev) => ({ ...prev, [postId]: nextIndex }));
  };

  return (
    <ScreenContainer scroll contentStyle={[styles.screenContent, isDesktopWeb && styles.screenContentDesktop]}>
      <View style={styles.headerRow}>
        <Pressable
          style={styles.menuButton}
          onPress={() => router.push('/stress-check')}>
          <Ionicons name="menu" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.headerContent}>
          <AppHeader
            title="커뮤니티"
            subtitle="여러 이미지를 좌우로 넘기며 게시글을 살펴볼 수 있습니다."
          />
        </View>
      </View>

      <Pressable style={styles.refreshButton} onPress={() => void loadPosts()}>
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

      {posts.map((post) => {
        const displayImages = getDisplayImages(post, postImagesByPostId);
        const activeImageIndex = activeImageIndexByPostId[post.id] ?? 0;

        return (
          <View key={post.id} style={[styles.postCard, isDesktopWeb && styles.postCardDesktop]}>
            <View style={styles.postHeader}>
              <View style={styles.authorRow}>
                {post.profiles?.avatar_url ? (
                  <ExpoImage source={{ uri: post.profiles.avatar_url }} style={styles.authorAvatar} contentFit="cover" />
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

            <Pressable
              style={styles.postMediaContainer}
              onLayout={(event) => {
                const nextWidth = event.nativeEvent.layout.width;
                setMediaWidthByPostId((prev) =>
                  prev[post.id] === nextWidth ? prev : { ...prev, [post.id]: nextWidth }
                );
              }}
              onPress={() => router.push({ pathname: '/posts/[id]', params: { id: post.id } })}>
              {displayImages.length > 0 ? (
                <View>
                  <ScrollView
                    ref={(node) => {
                      feedScrollRefs.current[post.id] = node;
                    }}
                    horizontal
                    pagingEnabled
                    nestedScrollEnabled
                    showsHorizontalScrollIndicator={false}
                    onMomentumScrollEnd={(event) => {
                      const nextIndex = Math.round(
                        event.nativeEvent.contentOffset.x /
                          Math.max(event.nativeEvent.layoutMeasurement.width, 1)
                      );
                      setActiveImageIndexByPostId((prev) => ({ ...prev, [post.id]: nextIndex }));
                    }}>
                    {displayImages.map((image) => (
                      <View
                        key={image.id || image.image_url}
                        style={[styles.mediaSlide, { width: mediaWidthByPostId[post.id] || width - 40 }]}>
                        <ExpoImage
                          source={{ uri: image.image_url }}
                          style={[
                            styles.postImage,
                            isDesktopWeb && styles.postImageDesktop,
                            {
                              aspectRatio: imageRatios[image.id || image.image_url] ?? 4 / 5,
                              height: undefined,
                            },
                          ]}
                          contentFit="cover"
                        />
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
                            onPress={() => scrollPostImages(post.id, 'prev', displayImages.length)}
                            disabled={activeImageIndex === 0}>
                            <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
                          </Pressable>
                          <Pressable
                            style={[
                              styles.carouselArrow,
                              styles.carouselArrowRight,
                              activeImageIndex >= displayImages.length - 1 && styles.carouselArrowDisabled,
                            ]}
                            onPress={() => scrollPostImages(post.id, 'next', displayImages.length)}
                            disabled={activeImageIndex >= displayImages.length - 1}>
                            <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
                          </Pressable>
                        </>
                      ) : null}
                    </>
                  ) : null}
                </View>
              ) : (
                <View style={styles.textPostCard}>
                  <Text style={styles.textPostBadge}>TEXT STORY</Text>
                  <Text style={styles.textPostPreview} numberOfLines={7}>
                    {post.content}
                  </Text>
                  <Text style={styles.textPostHint}>눌러서 전체 글 보기</Text>
                </View>
              )}
            </Pressable>

            <View style={styles.postContent}>
              <View style={styles.feedbackRow}>
                <Pressable style={styles.feedbackItem} onPress={() => void handleToggleLike(post.id)}>
                  <Ionicons
                    name={likedPostIds.has(post.id) ? 'heart' : 'heart-outline'}
                    size={18}
                    color={likedPostIds.has(post.id) ? '#E15A7A' : colors.text}
                  />
                  <Text style={styles.feedbackText}>좋아요 {post.like_count}</Text>
                </Pressable>

                <Pressable
                  style={styles.feedbackItem}
                  onPress={() =>
                    isDesktopWeb
                      ? void handleToggleCommentsDesktop(post.id)
                      : void openCommentSheet(post.id)
                  }>
                  <Ionicons name="chatbubble-outline" size={17} color={colors.text} />
                  <Text style={styles.feedbackText}>댓글 {post.comment_count}</Text>
                </Pressable>
              </View>

              <Pressable onPress={() => router.push({ pathname: '/posts/[id]', params: { id: post.id } })}>
                <Text style={styles.description} numberOfLines={3}>
                  <Text style={styles.inlineAuthor}>{post.profiles?.nickname ?? '사용자'}</Text> {post.content}
                </Text>
                <View style={styles.postFooter}>
                  <Text style={styles.dateText}>{formatPostDate(post.created_at)}</Text>
                </View>
              </Pressable>

              {isDesktopWeb && expandedPostId === post.id ? (
                <View style={styles.commentsSection}>
                  {loadingCommentsPostId === post.id ? (
                    <View style={styles.commentsStatus}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={styles.commentsStatusText}>댓글을 불러오는 중입니다...</Text>
                    </View>
                  ) : null}

                  {loadingCommentsPostId !== post.id && (commentsByPostId[post.id]?.length ?? 0) === 0 ? (
                    <Text style={styles.commentsEmpty}>첫 댓글을 남겨보세요.</Text>
                  ) : null}

                  {loadingCommentsPostId !== post.id &&
                    (commentsByPostId[post.id] ?? []).slice(-2).map((comment) => (
                      <View key={comment.id} style={styles.commentRow}>
                        <Text style={styles.commentAuthor}>{comment.profiles?.nickname ?? '사용자'}</Text>
                        <Text style={styles.commentText}>{comment.content}</Text>
                      </View>
                    ))}

                  {loadingCommentsPostId !== post.id && (commentsByPostId[post.id]?.length ?? 0) > 2 ? (
                    <Pressable onPress={() => router.push({ pathname: '/posts/[id]', params: { id: post.id } })}>
                      <Text style={styles.moreCommentsText}>댓글 전체 보기</Text>
                    </Pressable>
                  ) : null}

                  <View style={styles.commentComposer}>
                    <TextInput
                      value={commentDrafts[post.id] ?? ''}
                      onChangeText={(text) => setCommentDrafts((prev) => ({ ...prev, [post.id]: text }))}
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
                        {submittingCommentPostId === post.id ? '등록 중' : '게시'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>
          </View>
        );
      })}

      <Modal transparent animationType="none" visible={commentSheetPostId !== null} onRequestClose={closeCommentSheet}>
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={closeCommentSheet} />

          <Animated.View style={[styles.commentSheet, { transform: [{ translateY: commentSheetY }] }]}>
            <View style={styles.commentSheetHandleArea} {...panResponder.panHandlers}>
              <View style={styles.commentSheetHandle} />
            </View>

            <View style={styles.commentSheetHeader}>
              <Text style={styles.commentSheetTitle}>댓글</Text>
              <Pressable onPress={closeCommentSheet}>
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.commentSheetScroll}
              contentContainerStyle={styles.commentSheetScrollContent}
              showsVerticalScrollIndicator={false}>
              {loadingCommentsPostId === commentSheetPostId ? (
                <View style={styles.commentsStatus}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.commentsStatusText}>댓글을 불러오는 중입니다...</Text>
                </View>
              ) : null}

              {loadingCommentsPostId !== commentSheetPostId &&
              (commentsByPostId[commentSheetPostId ?? '']?.length ?? 0) === 0 ? (
                <Text style={styles.commentsEmpty}>첫 댓글을 남겨보세요.</Text>
              ) : null}

              {loadingCommentsPostId !== commentSheetPostId &&
                (commentsByPostId[commentSheetPostId ?? ''] ?? []).map((comment) => (
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
                ))}
            </ScrollView>

            <View style={styles.commentSheetComposer}>
              <TextInput
                value={commentDrafts[commentSheetPostId ?? ''] ?? ''}
                onChangeText={(text) =>
                  setCommentDrafts((prev) => ({ ...prev, [commentSheetPostId ?? '']: text }))
                }
                placeholder="댓글을 입력하세요."
                placeholderTextColor={colors.textMuted}
                style={styles.commentInput}
              />
              <Pressable
                style={[
                  styles.commentSubmitButton,
                  submittingCommentPostId === commentSheetPostId && styles.commentSubmitButtonDisabled,
                ]}
                onPress={() => commentSheetPostId && void handleSubmitComment(commentSheetPostId)}
                disabled={submittingCommentPostId === commentSheetPostId}>
                <Text style={styles.commentSubmitText}>
                  {submittingCommentPostId === commentSheetPostId ? '등록 중' : '게시'}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

function getDisplayImages(
  post: PostItem,
  postImagesByPostId: Record<string, PostImageItem[]>
) {
  const images = postImagesByPostId[post.id] ?? [];
  if (images.length > 0) {
    return images;
  }

  if (!post.image_url) {
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

  if (diffMs < hourMs) {
    return `${Math.max(1, Math.floor(diffMs / (1000 * 60)))}분 전`;
  }

  if (diffMs < dayMs) {
    return `${Math.max(1, Math.floor(diffMs / hourMs))}시간 전`;
  }

  if (diffMs < dayMs * 7) {
    return `${Math.max(1, Math.floor(diffMs / dayMs))}일 전`;
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
  screenContentDesktop: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingTop: 20,
    paddingBottom: 40,
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
  postCardDesktop: {
    borderRadius: 14,
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
    backgroundColor: colors.primary,
  },
  authorAvatarFallbackText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  authorMeta: {
    flex: 1,
  },
  authorName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  postMediaContainer: {
    overflow: 'hidden',
    backgroundColor: '#DCE7E2',
  },
  mediaSlide: {
    flexShrink: 0,
  },
  postImage: {
    width: '100%',
  },
  postImageDesktop: {
    width: '100%',
  },
  imageCountBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(16, 24, 20, 0.62)',
  },
  imageCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  carouselArrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 24, 20, 0.58)',
  },
  carouselArrowLeft: {
    left: 12,
  },
  carouselArrowRight: {
    right: 12,
  },
  carouselArrowDisabled: {
    opacity: 0.35,
  },
  textPostCard: {
    width: '100%',
    minHeight: 280,
    paddingHorizontal: 24,
    paddingVertical: 22,
    justifyContent: 'space-between',
    backgroundColor: '#E4EFE9',
  },
  textPostBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F6FBF8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: colors.primary,
  },
  textPostPreview: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '800',
    color: '#17362F',
  },
  textPostHint: {
    fontSize: 13,
    fontWeight: '700',
    color: '#416A60',
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
    marginTop: 4,
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
  moreCommentsText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
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
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(8, 12, 10, 0.28)',
  },
  sheetBackdrop: {
    flex: 1,
  },
  commentSheet: {
    maxHeight: '82%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.surface,
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
  commentSheetHandleArea: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 10,
  },
  commentSheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#C9D3CE',
  },
  commentSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  commentSheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  commentSheetScroll: {
    maxHeight: 420,
  },
  commentSheetScrollContent: {
    paddingVertical: 14,
    gap: 14,
  },
  commentSheetComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
