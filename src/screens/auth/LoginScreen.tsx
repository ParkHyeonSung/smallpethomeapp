import { useEffect, useState } from 'react';

import { router } from 'expo-router';
import * as AuthSession from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import AppHeader from '@/src/components/common/AppHeader';
import ScreenContainer from '@/src/components/common/ScreenContainer';
import { colors } from '@/src/constants/colors';
import { signInWithLoginId, signUpWithLoginId } from '@/src/lib/auth';
import { upsertMyProfile, upsertProfileForCredentials } from '@/src/lib/profiles';
import { supabase } from '@/src/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

const nativeRedirectTo = AuthSession.makeRedirectUri({
  native: 'smallpethomeapp:///login-callback',
});

type AuthMode = 'login' | 'signup';

export default function LoginScreen() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isCredentialsLoading, setIsCredentialsLoading] = useState(false);

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

    void syncSession();
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
            error instanceof Error ? error.message : '프로필 저장 중 문제가 발생했어요.';
          Alert.alert('로그인 오류', message);
        }
      })();
    });

    return () => {
      isMounted = false;
      linkingSubscription.remove();
      subscription.unsubscribe();
    };
  }, []);

  const resetInputs = () => {
    setLoginId('');
    setPassword('');
    setNickname('');
  };

  const handleGoogleLogin = async () => {
    try {
      setIsGoogleLoading(true);

      if (Platform.OS === 'web') {
        const webRedirectTo =
          typeof window !== 'undefined' ? window.location.href : undefined;

        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: webRedirectTo,
            skipBrowserRedirect: true,
            queryParams: {
              prompt: 'select_account',
            },
          },
        });

        if (error) {
          throw error;
        }

        if (!data?.url) {
          throw new Error('Google 로그인 URL을 만들지 못했어요.');
        }

        if (typeof window !== 'undefined') {
          window.location.assign(data.url);
        }

        return;
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: nativeRedirectTo,
          skipBrowserRedirect: true,
          queryParams: {
            prompt: 'select_account',
          },
        },
      });

      if (error) {
        throw error;
      }

      if (!data?.url) {
        throw new Error('Google 로그인 URL을 만들지 못했어요.');
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, nativeRedirectTo);

      if (result.type !== 'success' && result.type !== 'cancel') {
        Alert.alert('로그인 실패', 'Google 로그인 흐름을 완료하지 못했어요.');
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Google 로그인 중 오류가 발생했어요.';

      Alert.alert('로그인 실패', message);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleCredentialsSubmit = async () => {
    try {
      setIsCredentialsLoading(true);

      if (mode === 'signup') {
        await signUpWithLoginId({
          loginId,
          password,
          nickname,
        });

        await upsertProfileForCredentials({ nickname });
        router.replace('/(tabs)');
        return;
      }

      await signInWithLoginId({ loginId, password });
      await upsertMyProfile();
      router.replace('/(tabs)');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '인증 처리 중 오류가 발생했어요.';

      Alert.alert(mode === 'signup' ? '회원가입 실패' : '로그인 실패', message);
    } finally {
      setIsCredentialsLoading(false);
    }
  };

  return (
    <ScreenContainer contentStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.badge}>Small Pet Home</Text>
        <AppHeader
          title="소동물 집 정보를 함께 나누세요"
          subtitle="Google 로그인도 가능하고, 아이디와 비밀번호로 바로 회원가입해서 시작할 수도 있어요."
        />
      </View>

      <View style={styles.modeRow}>
        <Pressable
          style={[styles.modeChip, mode === 'login' && styles.modeChipActive]}
          onPress={() => {
            setMode('login');
            setNickname('');
          }}>
          <Text style={[styles.modeChipText, mode === 'login' && styles.modeChipTextActive]}>
            아이디 로그인
          </Text>
        </Pressable>
        <Pressable
          style={[styles.modeChip, mode === 'signup' && styles.modeChipActive]}
          onPress={() => setMode('signup')}>
          <Text style={[styles.modeChipText, mode === 'signup' && styles.modeChipTextActive]}>
            회원가입
          </Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {mode === 'signup' ? '아이디로 회원가입' : '아이디로 로그인'}
        </Text>
        <Text style={styles.cardDescription}>
          {mode === 'signup'
            ? '회원가입이 끝나면 바로 로그인되고, 입력한 닉네임이 프로필 이름으로 저장돼요.'
            : '가입한 아이디와 비밀번호로 바로 로그인할 수 있어요.'}
        </Text>

        {mode === 'signup' ? (
          <TextInput
            value={nickname}
            onChangeText={setNickname}
            placeholder="닉네임"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
        ) : null}

        <TextInput
          value={loginId}
          onChangeText={setLoginId}
          placeholder="아이디"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          style={styles.input}
        />

        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="비밀번호"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          style={styles.input}
        />

        <Pressable
          style={[styles.primaryButton, isCredentialsLoading && styles.primaryButtonDisabled]}
          onPress={() => void handleCredentialsSubmit()}
          disabled={isCredentialsLoading}>
          <Text style={styles.primaryButtonText}>
            {isCredentialsLoading
              ? mode === 'signup'
                ? '가입 중...'
                : '로그인 중...'
              : mode === 'signup'
                ? '회원가입하기'
                : '로그인하기'}
          </Text>
        </Pressable>

        <Text style={styles.caption}>
          아이디는 영문 소문자, 숫자, 점(.), 밑줄(_), 하이픈(-) 조합으로 4자 이상을 권장해요.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Google로 시작하기</Text>
        <Text style={styles.cardDescription}>
          Google 계정으로 로그인하면 이름과 프로필 정보가 자동으로 반영돼요.
        </Text>

        <Pressable
          style={[styles.secondaryPrimaryButton, isGoogleLoading && styles.primaryButtonDisabled]}
          onPress={() => void handleGoogleLogin()}
          disabled={isGoogleLoading}>
          <Text style={styles.primaryButtonText}>
            {isGoogleLoading ? '연결 중...' : 'Google로 계속하기'}
          </Text>
        </Pressable>

        <Pressable style={styles.resetButton} onPress={resetInputs}>
          <Text style={styles.resetButtonText}>입력 초기화</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 16,
    justifyContent: 'center',
    paddingVertical: 24,
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
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeChipActive: {
    backgroundColor: colors.primaryLight,
    borderColor: '#B9D8CC',
  },
  modeChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textMuted,
  },
  modeChipTextActive: {
    color: colors.primaryStrong,
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
  input: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.background,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.text,
  },
  primaryButton: {
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  secondaryPrimaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: colors.primaryStrong,
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
  resetButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  resetButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
});
