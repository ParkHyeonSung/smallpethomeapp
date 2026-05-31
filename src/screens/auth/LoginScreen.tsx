import { useEffect, useRef, useState } from 'react';

import { router } from 'expo-router';
import * as AuthSession from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import ScreenContainer from '@/src/components/common/ScreenContainer';
import { colors } from '@/src/constants/colors';
import {
  formatAuthErrorMessage,
  signInWithLoginId,
  signUpWithLoginId,
} from '@/src/lib/auth';
import { upsertMyProfile, upsertProfileForCredentials } from '@/src/lib/profiles';
import { supabase } from '@/src/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

const nativeRedirectTo = AuthSession.makeRedirectUri({
  path: 'login-callback',
});

type AuthMode = 'login' | 'signup';

export default function LoginScreen() {
  const skipNextAuthStateProfileSyncRef = useRef(false);
  const [mode, setMode] = useState<AuthMode>('login');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackTone, setFeedbackTone] = useState<'error' | 'success'>('error');
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

      if (skipNextAuthStateProfileSyncRef.current) {
        skipNextAuthStateProfileSyncRef.current = false;
        return;
      }

      void (async () => {
        try {
          await upsertMyProfile();
          router.replace('/(tabs)');
        } catch (error) {
          setFeedbackTone('error');
          setFeedbackMessage(
            error instanceof Error
              ? error.message
              : '프로필 정보를 불러오는 중 문제가 발생했어요.'
          );
        }
      })();
    });

    return () => {
      isMounted = false;
      linkingSubscription.remove();
      subscription.unsubscribe();
    };
  }, []);

  const setErrorFeedback = (error: unknown) => {
    setFeedbackTone('error');
    setFeedbackMessage(formatAuthErrorMessage(error));
  };

  const handleGoogleLogin = async () => {
    try {
      setIsGoogleLoading(true);
      setFeedbackMessage('');

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
        throw new Error('Google 로그인 절차를 완료하지 못했어요.');
      }
    } catch (error) {
      setErrorFeedback(error);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleCredentialsSubmit = async () => {
    try {
      setIsCredentialsLoading(true);
      setFeedbackMessage('');

      if (mode === 'signup') {
        skipNextAuthStateProfileSyncRef.current = true;

        await signUpWithLoginId({
          loginId,
          password,
          nickname,
        });

        await upsertProfileForCredentials({ nickname });
        setFeedbackTone('success');
        setFeedbackMessage('회원가입이 완료되어 바로 로그인되었어요.');
        router.replace('/(tabs)');
        return;
      }

      skipNextAuthStateProfileSyncRef.current = true;
      await signInWithLoginId({ loginId, password });
      await upsertMyProfile();
      setFeedbackTone('success');
      setFeedbackMessage('로그인에 성공했어요.');
      router.replace('/(tabs)');
    } catch (error) {
      setErrorFeedback(error);
    } finally {
      setIsCredentialsLoading(false);
    }
  };

  return (
    <ScreenContainer scroll contentStyle={styles.container}>
      <View style={styles.authPanel}>
        <Text style={styles.screenTitle}>{mode === 'signup' ? '회원가입' : '로그인'}</Text>

        <View style={styles.modeRow}>
          <Pressable
            style={[styles.modeChip, mode === 'login' && styles.modeChipActive]}
            onPress={() => {
              setMode('login');
              setNickname('');
              setFeedbackMessage('');
            }}>
            <Text style={[styles.modeChipText, mode === 'login' && styles.modeChipTextActive]}>
              로그인
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modeChip, mode === 'signup' && styles.modeChipActive]}
            onPress={() => {
              setMode('signup');
              setFeedbackMessage('');
            }}>
            <Text style={[styles.modeChipText, mode === 'signup' && styles.modeChipTextActive]}>
              회원가입
            </Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          {feedbackMessage ? (
            <View
              style={[
                styles.feedbackBox,
                feedbackTone === 'error' ? styles.feedbackError : styles.feedbackSuccess,
              ]}>
              <Text
                style={[
                  styles.feedbackText,
                  feedbackTone === 'error' ? styles.feedbackErrorText : styles.feedbackSuccessText,
                ]}>
                {feedbackMessage}
              </Text>
            </View>
          ) : null}

          <View style={styles.formGroup}>
            {mode === 'signup' ? (
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>닉네임</Text>
                <TextInput
                  value={nickname}
                  onChangeText={setNickname}
                  placeholder="프로필에 표시될 이름"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />
              </View>
            ) : null}

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>아이디</Text>
              <TextInput
                value={loginId}
                onChangeText={setLoginId}
                placeholder="영문, 숫자 조합 4자 이상"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                style={styles.input}
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>비밀번호</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="비밀번호 입력"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                style={styles.input}
              />
            </View>
          </View>

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
        </View>

        <View style={styles.socialRow}>
          <Pressable
            style={[styles.googleCircleButton, isGoogleLoading && styles.primaryButtonDisabled]}
            onPress={() => void handleGoogleLogin()}
            disabled={isGoogleLoading}>
            <Text style={styles.googleCircleText}>{isGoogleLoading ? '...' : 'G'}</Text>
          </Pressable>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: 24,
    paddingBottom: 32,
  },
  authPanel: {
    gap: 18,
  },
  screenTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.primaryStrong,
    textAlign: 'center',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
    padding: 6,
    borderRadius: 22,
    backgroundColor: '#EDE6D8',
  },
  modeChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  modeChipActive: {
    backgroundColor: colors.surface,
  },
  modeChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#7E857F',
  },
  modeChipTextActive: {
    color: colors.primaryStrong,
  },
  card: {
    gap: 18,
    padding: 24,
    borderRadius: 26,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#241F17',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    elevation: 2,
  },
  feedbackBox: {
    borderRadius: 16,
    paddingHorizontal: 15,
    paddingVertical: 13,
  },
  feedbackError: {
    backgroundColor: '#FDECEC',
    borderWidth: 1,
    borderColor: '#F6C8C8',
  },
  feedbackSuccess: {
    backgroundColor: '#E8F6F0',
    borderWidth: 1,
    borderColor: '#BEE3D1',
  },
  feedbackText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  feedbackErrorText: {
    color: '#A62D2D',
  },
  feedbackSuccessText: {
    color: '#236B4D',
  },
  formGroup: {
    gap: 14,
  },
  fieldBlock: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primaryStrong,
  },
  input: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: '#FAF6EF',
    borderWidth: 1,
    borderColor: '#E7DECF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.text,
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: colors.primary,
  },
  secondaryPrimaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    paddingVertical: 16,
    borderRadius: 18,
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
  socialRow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleCircleButton: {
    width: 64,
    height: 64,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#DDD2BF',
    shadowColor: '#241F17',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 2,
  },
  googleCircleText: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primaryStrong,
  },
});
