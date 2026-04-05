import { useEffect, useState } from 'react';

import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import AppHeader from '@/src/components/common/AppHeader';
import ScreenContainer from '@/src/components/common/ScreenContainer';
import { colors } from '@/src/constants/colors';
import { getFollowerCount } from '@/src/lib/follows';
import { getMyPosts, PostItem } from '@/src/lib/posts';
import { supabase } from '@/src/lib/supabase';

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
  const [profile, setProfile] = useState<ProfileSummary>({
    avatarUrl: null,
    email: '',
    followerCount: 0,
    name: 'Small Pet Mate',
  });
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !isMounted) {
        return;
      }

      const fullName =
        typeof user.user_metadata?.full_name === 'string'
          ? user.user_metadata.full_name
          : typeof user.user_metadata?.name === 'string'
            ? user.user_metadata.name
            : 'Small Pet Mate';

      const [{ data: profileRow }, followerCount] = await Promise.all([
        supabase.from('profiles').select('nickname, email, avatar_url').eq('id', user.id).maybeSingle(),
        getFollowerCount(user.id),
      ]);

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
            : fullName,
        followerCount,
      });
    };

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    const loadMyPosts = async () => {
      try {
        setIsLoadingPosts(true);
        const data = await getMyPosts();
        setPosts(data);
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

      if (error) {
        throw error;
      }

      router.replace('/login');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to sign out.';
      Alert.alert('Sign Out Failed', message);
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <ScreenContainer scroll>
      <AppHeader
        title="프로필"
        subtitle="내 계정 정보와 내가 올린 게시글을 한눈에 확인할 수 있습니다."
      />

      <View style={styles.profileHeaderCard}>
        <View style={styles.profileHeaderText}>
          <Text style={styles.profileName}>{profile.name}</Text>
          <Text style={styles.profileFollower}>팔로워 {profile.followerCount}</Text>
          <Text style={styles.profileEmail}>{profile.email || 'No email available'}</Text>
        </View>

        {profile.avatarUrl ? (
          <Image source={{ uri: profile.avatarUrl }} style={styles.profileImage} contentFit="cover" />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(profile.name) || 'SP'}</Text>
          </View>
        )}
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>계정 상태</Text>
        <Text style={styles.infoItem}>Google 로그인 연결 완료</Text>
        <Text style={styles.infoItem}>세션 자동 유지 활성화</Text>
        <Text style={styles.infoItem}>앱 재실행 후에도 로그인 유지 확인 가능</Text>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>내 게시글</Text>

        {isLoadingPosts ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.infoItem}>내 게시글을 불러오는 중입니다...</Text>
          </View>
        ) : null}

        {!isLoadingPosts && posts.length === 0 ? (
          <Text style={styles.infoItem}>아직 작성한 게시글이 없습니다.</Text>
        ) : null}

        {!isLoadingPosts ? (
          <View style={styles.grid}>
            {posts.map((post) => (
              <TouchableOpacity
                key={post.id}
                style={styles.gridCard}
                activeOpacity={0.85}
                onPress={() => router.push(`/posts/${post.id}`)}>
                {post.image_url ? (
                  <Image
                    source={{ uri: post.image_url }}
                    style={styles.gridImage}
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.gridTextCard}>
                    <Text style={styles.gridTextCardLabel}>TEXT</Text>
                    <Text style={styles.gridTextPreview} numberOfLines={4}>
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
        style={[styles.signOutButton, isSigningOut && styles.signOutButtonDisabled]}
        onPress={handleSignOut}
        disabled={isSigningOut}>
        <Text style={styles.signOutButtonText}>
          {isSigningOut ? 'Signing out...' : 'Sign out'}
        </Text>
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  profileHeaderCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 20,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 16,
  },
  profileHeaderText: {
    flex: 1,
    gap: 6,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  profileImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.primary,
  },
  profileName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  profileFollower: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  profileEmail: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
  },
  infoCard: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  infoItem: {
    fontSize: 15,
    color: colors.textMuted,
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridCard: {
    width: '48%',
    aspectRatio: 1,
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: colors.background,
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  gridTextCard: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
    gap: 8,
  },
  gridTextCardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 1,
  },
  gridTextPreview: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
    textAlign: 'center',
  },
  signOutButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#E16A54',
  },
  signOutButtonDisabled: {
    opacity: 0.7,
  },
  signOutButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
