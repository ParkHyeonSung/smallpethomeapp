import { useEffect, useState } from 'react';

import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import AppHeader from '@/src/components/common/AppHeader';
import ScreenContainer from '@/src/components/common/ScreenContainer';
import { colors } from '@/src/constants/colors';
import { supabase } from '@/src/lib/supabase';

type ProfileSummary = {
  avatarUrl: string | null;
  email: string;
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
  const [profile, setProfile] = useState<ProfileSummary>({
    avatarUrl: null,
    email: '',
    name: 'Small Pet Mate',
  });
  const [isSigningOut, setIsSigningOut] = useState(false);

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

      const { data: profileRow } = await supabase
        .from('profiles')
        .select('nickname, email, avatar_url')
        .eq('id', user.id)
        .maybeSingle();

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
      });
    };

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

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
        title="Profile"
        subtitle="Check the account connected to Supabase and verify that the session stays active after restarting the app."
      />

      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(profile.name) || 'SP'}</Text>
        </View>

        <Text style={styles.name}>{profile.name}</Text>
        <Text style={styles.bio}>{profile.email || 'No email available'}</Text>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Session Check</Text>
        <Text style={styles.infoItem}>Google sign-in is connected.</Text>
        <Text style={styles.infoItem}>Session is stored in AsyncStorage.</Text>
        <Text style={styles.infoItem}>Restart the app to confirm auto sign-in.</Text>
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
  profileCard: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primary,
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  bio: {
    textAlign: 'center',
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
