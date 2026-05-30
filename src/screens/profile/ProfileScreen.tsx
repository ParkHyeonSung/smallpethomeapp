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

import AppHeader from '@/src/components/common/AppHeader';
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
  const cardWidth = isMobile ? '31.5%' : '18.6%';

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
      <AppHeader
        title="프로필"
        subtitle="계정 정보와 내가 올린 게시글을 한눈에 정리해서 볼 수 있습니다."
      />

      <View style={styles.heroCard}>
        <View style={styles.heroText}>
          <Text style={styles.name}>{profile.name}</Text>
          <Text style={styles.followers}>팔로워 {profile.followerCount}</Text>
          <Text style={styles.email}>{profile.email || 'No email available'}</Text>
        </View>

        {profile.avatarUrl ? (
          <Image source={{ uri: profile.avatarUrl }} style={styles.profileImage} contentFit="cover" />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarText}>{getInitials(profile.name) || 'SP'}</Text>
          </View>
        )}
      </View>

      <View style={styles.infoPanel}>
        <Text style={styles.infoTitle}>계정 상태</Text>
        <View style={styles.infoPillRow}>
          <View style={styles.infoPill}>
            <Text style={styles.infoPillText}>Google 로그인 연결 완료</Text>
          </View>
          <View style={styles.infoPill}>
            <Text style={styles.infoPillText}>세션 자동 유지 활성화</Text>
          </View>
          <View style={styles.infoPill}>
            <Text style={styles.infoPillText}>재실행 후 로그인 상태 확인 가능</Text>
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
        {isLoadingPosts ? (
          <View style={styles.stateWrap}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.stateText}>내 게시글을 불러오는 중입니다...</Text>
          </View>
        ) : null}

        {!isLoadingPosts && posts.length === 0 ? (
          <Text style={styles.stateText}>아직 작성한 게시글이 없습니다.</Text>
        ) : null}

        {!isLoadingPosts && posts.length > 0 ? (
          <View style={styles.grid}>
            {posts.map((post) => (
              <TouchableOpacity
                key={post.id}
                style={[styles.gridCard, { width: cardWidth }]}
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 22,
    borderRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
    gap: 16,
  },
  heroText: {
    flex: 1,
    gap: 6,
  },
  name: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primaryStrong,
  },
  followers: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
  email: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
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
    backgroundColor: colors.primaryLight,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primaryStrong,
  },
  infoPanel: {
    padding: 18,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primaryStrong,
  },
  infoPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  infoPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
  },
  infoPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primaryStrong,
  },
  stressReportsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: '#C9DED5',
  },
  stressReportsIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  stressReportsTextWrap: {
    flex: 1,
    gap: 3,
  },
  stressReportsTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primaryStrong,
  },
  stressReportsSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
  feedPanel: {
    padding: 18,
    borderRadius: 24,
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
    gap: 14,
    justifyContent: 'space-between',
  },
  gridCard: {
    overflow: 'hidden',
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: colors.primaryLight,
    gap: 8,
  },
  gridTextLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.primaryStrong,
  },
  gridTextPreview: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    color: colors.primaryStrong,
  },
  signOutButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: colors.primaryStrong,
  },
  signOutButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  disabled: {
    opacity: 0.7,
  },
});
