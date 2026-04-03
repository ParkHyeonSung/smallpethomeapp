import { useEffect, useState } from 'react';

import { router } from 'expo-router';
import * as AuthSession from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import AppHeader from '@/src/components/common/AppHeader';
import ScreenContainer from '@/src/components/common/ScreenContainer';
import { colors } from '@/src/constants/colors';
import { upsertMyProfile } from '@/src/lib/profiles';
import { supabase } from '@/src/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

const redirectTo = AuthSession.makeRedirectUri({
  native: 'smallpethomeapp:///login-callback',
});

export default function LoginScreen() {
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const syncSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session && isMounted) {
        router.replace('/(tabs)');
      }
    };

    void syncSession();

    const createSessionFromUrl = async (url: string) => {
      const { params, errorCode } = QueryParams.getQueryParams(url);

      if (errorCode) {
        throw new Error(errorCode);
      }

      const accessToken = params.access_token;
      const refreshToken = params.refresh_token;

      if (!accessToken || !refreshToken) {
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        throw error;
      }
    };

    const handleInitialUrl = async () => {
      const initialUrl = await Linking.getInitialURL();

      if (!initialUrl) {
        return;
      }

      await createSessionFromUrl(initialUrl);
    };

    void handleInitialUrl();

    const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
      void createSessionFromUrl(url);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        return;
      }

      void (async () => {
        try {
          await upsertMyProfile();
          router.replace('/(tabs)');
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Failed to save your profile.';
          Alert.alert('Profile Sync Failed', message);
        }
      })();
    });

    return () => {
      isMounted = false;
      linkingSubscription.remove();
      subscription.unsubscribe();
    };
  }, []);

  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        throw error;
      }

      if (!data?.url) {
        throw new Error('Google login URL was not created.');
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

      if (result.type !== 'success') {
        if (result.type !== 'cancel') {
          Alert.alert('Login Cancelled', 'The Google sign-in flow did not complete.');
        }
        return;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'An error occurred during Google sign-in.';

      Alert.alert('Login Failed', message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScreenContainer contentStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.badge}>Small Pet Home</Text>
        <AppHeader
          title="Share and plan a home for your small pet"
          subtitle="Connect habitat photos, product tags, layout ideas, and future AI support in one mobile app."
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Start with Google</Text>
        <Text style={styles.cardDescription}>
          Sign in with your Google account first, then we can connect community, upload, and profile features step by step.
        </Text>

        <Pressable
          style={[styles.primaryButton, isLoading && styles.primaryButtonDisabled]}
          onPress={handleGoogleLogin}
          disabled={isLoading}>
          <Text style={styles.primaryButtonText}>
            {isLoading ? 'Connecting...' : 'Continue with Google'}
          </Text>
        </Pressable>

        <Text style={styles.caption}>
          After sign-in succeeds, the Supabase session is stored and the app moves to the main tab screen.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 32,
  },
  hero: {
    gap: 16,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
    color: colors.primary,
    fontWeight: '600',
  },
  card: {
    gap: 14,
    padding: 20,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  cardDescription: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
  },
  primaryButton: {
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  caption: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textMuted,
  },
});
