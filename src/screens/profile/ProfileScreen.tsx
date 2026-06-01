import { useEffect, useState } from 'react';

import { useIsFocused } from '@react-navigation/native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';

import ScreenContainer from '@/src/components/common/ScreenContainer';
import { colors } from '@/src/constants/colors';
import { getFollowerCount } from '@/src/lib/follows';
import { getPostImagesByPostIds } from '@/src/lib/post-images';
import { getMyPosts, PostItem } from '@/src/lib/posts';
import { supabase } from '@/src/lib/supabase';
import { Ionicons } from '@expo/vector-icons';

type ProfileSummary = {
  avatarUrl: string | null;
  email: string;
  followerCount: number;
  name: string;
};

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default function ProfileScreen() {
  const isFocused = useIsFocused();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const gridColumns = isMobile ? 3 : 5;
  const gridGap = 14;

  const [profile, setProfile] = useState<ProfileSummary>({
    avatarUrl: null,
    email: '',
    followerCount: 0,
    name: 'Small Pet Mate',
  });
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [imageCountByPostId, setImageCountByPostId] = useState<Record<string, number>>({});
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [gridWidth, setGridWidth] = useState(0);

  const cardWidth =
    gridWidth > 0
      ? Math.floor((gridWidth - gridGap * (gridColumns - 1)) / gridColumns)
      : undefined;

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !isMounted) return;

      const fallbackName =
        typeof user.user_metadata?.full_name === 'string'
          ? user.user_metadata.full_name
          : typeof user.user_metadata?.name === 'string'
            ? user.user_metadata.name
            : 'Small Pet Mate';

      const [{ data: profileRow }, followerCount] = await Promise.all([
        supabase
          .from('profiles')
          .select('nickname, email, avatar_url')
          .eq('id', user.id)
          .maybeSingle(),
        getFollowerCount(user.id),
      ]);

      if (!isMounted) return;

      setProfile({
        avatarUrl:
          typeof profileRow?.avatar_url === 'string' ? profileRow.avatar_url : null,
        email:
          typeof profileRow?.email === 'string' && profileRow.email
            ? profileRow.email
            : user.email ?? '',
        name:
          typeof profileRow?.nickname === 'string' && profileRow.nickname
            ? profileRow.nickname
            : fallbackName,
        followerCount,
      });
    };

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isFocused) return;

    const loadMyPosts = async () => {
      try {
        setIsLoadingPosts(true);
        const data = await getMyPosts();
        setPosts(data);
        const imageGroups = await getPostImagesByPostIds(data.map((post) => post.id));
        setImageCountByPostId(
          Object.fromEntries(
            Object.entries(imageGroups).map(([postId, images]) => [postId, images.length])
          )
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '내 게시글을 불러오는 중 오류가 발생했습니다.';
        Alert.alert('불러오기 실패', message);
      } finally {
        setIsLoadingPosts(false);
      }
    };

    void loadMyPosts();
  }, [isFocused]);

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.replace('/login');
    } catch (error) {
      const message = error instanceof Error ? error.message : '로그아웃에 실패했습니다.';
      Alert.alert('로그아웃 실패', message);
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <ScreenContainer scroll>
      <View style={styles.heroCard}>
        {profile.avatarUrl ? (
          <Image source={{ uri: profile.avatarUrl }} style={styles.profileImage} contentFit="cover" />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarText}>{getInitials(profile.name) || 'SP'}</Text>
          </View>
        )}
        <Text style={styles.name}>{profile.name}</Text>
        <Text style={styles.email}>{profile.email || ''}</Text>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{posts.length}</Text>
            <Text style={styles.statLabel}>게시글</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{profile.followerCount}</Text>
            <Text style={styles.statLabel}>팔로워</Text>
          </View>
        </View>
      </View>


      <Pressable
        style={styles.stressReportsButton}
        onPress={() => router.push('/stress-reports' as never)}>
        <View style={styles.stressReportsIcon}>
          <Ionicons name="document-text-outline" size={20} color={colors.primaryStrong} />
        </View>
        <View style={styles.stressReportsTextWrap}>
          <Text style={styles.stressReportsTitle}>스트레스 진단 기록</Text>
          <Text style={styles.stressReportsSubtitle}>저장한 측정 결과와 점수를 다시 확인합니다.</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>

      <View style={styles.feedPanel}>
        <Text style={styles.feedTitle}>내 게시글</Text>
        {isLoadingPosts ? (
          <View style={styles.stateWrap}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.stateText}>내 게시글을 불러오는 중입니다...</Text>
          </View>
        ) : null}

        {!isLoadingPosts && posts.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="camera-outline" size={48} color={colors.border} />
            <Text style={styles.stateText}>아직 작성한 게시글이 없습니다.</Text>
          </View>
        ) : null}

        {!isLoadingPosts && posts.length > 0 ? (
          <View
            style={styles.grid}
            onLayout={(event) => {
              const nextWidth = Math.floor(event.nativeEvent.layout.width);
              setGridWidth((prev) => (prev === nextWidth ? prev : nextWidth));
            }}>
            {posts.map((post) => (
              <TouchableOpacity
                key={post.id}
                style={[styles.gridCard, cardWidth ? { width: cardWidth } : null]}
                activeOpacity={0.85}
                onPress={() =>
                  router.push({ pathname: '/posts/[id]', params: { id: post.id } })
                }>
                {(imageCountByPostId[post.id] ?? 0) > 1 ? (
                  <View style={styles.multiImageBadge}>
                    <Ionicons name="copy-outline" size={14} color="#FFFFFF" />
                  </View>
                ) : null}
                {post.image_url ? (
                  <Image source={{ uri: post.image_url }} style={styles.gridImage} contentFit="cover" />
                ) : (
                  <View style={styles.gridTextCard}>
                    <Text style={styles.gridTextLabel}>TEXT</Text>
                    <Text style={styles.gridTextPreview} numberOfLines={3}>
                      {post.content}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>

      <Pressable
        style={[styles.signOutButton, isSigningOut && styles.disabled]}
        onPress={handleSignOut}
        disabled={isSigningOut}>
        <Text style={styles.signOutButtonText}>
          {isSigningOut ? '로그아웃 중...' : '로그아웃'}
        </Text>
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    gap: 8,
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.primaryStrong,
    textAlign: 'center',
  },
  email: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },
  profileImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarFallback: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.primaryStrong,
  },
  stressReportsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stressReportsIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  stressReportsTextWrap: {
    flex: 1,
    gap: 2,
  },
  stressReportsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primaryStrong,
  },
  stressReportsSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
  },
  feedPanel: {
    padding: 18,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 120,
  },
  stateWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stateText: {
    fontSize: 14,
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
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    marginTop: 8,
  },
  statItem: {
    alignItems: 'center',
    gap: 2,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },
  feedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 24,
  },
  signOutButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  signOutButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.danger,
  },
  disabled: {
    opacity: 0.7,
  },
});
