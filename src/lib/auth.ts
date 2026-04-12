import { AuthError, Session, User } from '@supabase/supabase-js';

import { supabase } from '@/src/lib/supabase';

const LOGIN_ID_DOMAIN = 'smallpethome.app';

export function normalizeLoginId(loginId: string) {
  return loginId.trim().toLowerCase();
}

export function loginIdToEmail(loginId: string) {
  return `${normalizeLoginId(loginId)}@${LOGIN_ID_DOMAIN}`;
}

export function validateLoginId(loginId: string) {
  const normalized = normalizeLoginId(loginId);

  if (normalized.length < 4 || normalized.length > 20) {
    throw new Error('아이디는 4자 이상 20자 이하로 입력해주세요.');
  }

  if (!/^[a-z0-9._-]+$/.test(normalized)) {
    throw new Error('아이디는 영문 소문자, 숫자, 점(.), 밑줄(_), 하이픈(-)만 사용할 수 있어요.');
  }

  return normalized;
}

export function validatePassword(password: string) {
  if (password.length < 6) {
    throw new Error('비밀번호는 6자 이상으로 입력해주세요.');
  }

  return password;
}

export function validateNickname(nickname: string) {
  const trimmed = nickname.trim();

  if (trimmed.length < 2 || trimmed.length > 20) {
    throw new Error('닉네임은 2자 이상 20자 이하로 입력해주세요.');
  }

  return trimmed;
}

async function clearExistingSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return;
  }

  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}

export function formatAuthErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return '인증 처리 중 문제가 발생했어요.';
  }

  const lowerMessage = error.message.toLowerCase();

  if (error instanceof AuthError) {
    // Supabase error codes/messages we expect in this project.
    const code = 'code' in error && typeof error.code === 'string' ? error.code : '';

    if (code === 'email_provider_disabled') {
      return 'Supabase에서 Email 로그인이 꺼져 있어 회원가입이 막혀 있어요. Authentication > Providers > Email을 켜주세요.';
    }

    if (code === 'user_already_exists' || lowerMessage.includes('already registered')) {
      return '이미 사용 중인 아이디예요. 다른 아이디로 다시 시도해주세요.';
    }

    if (lowerMessage.includes('email not confirmed')) {
      return '현재 Supabase에서 이메일 확인이 켜져 있어 자동 로그인이 막혀 있어요. 테스트용이라면 Confirm email을 꺼주세요.';
    }

    if (lowerMessage.includes('invalid login credentials')) {
      return '아이디 또는 비밀번호가 맞지 않아요.';
    }

    if (lowerMessage.includes('password')) {
      return '비밀번호 조건을 다시 확인해주세요.';
    }
  }

  return error.message;
}

async function signInAfterSignUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(formatAuthErrorMessage(error));
  }

  return data;
}

export async function signUpWithLoginId({
  loginId,
  password,
  nickname,
}: {
  loginId: string;
  password: string;
  nickname: string;
}) {
  const normalizedLoginId = validateLoginId(loginId);
  const validPassword = validatePassword(password);
  const validNickname = validateNickname(nickname);
  const email = loginIdToEmail(normalizedLoginId);

  await clearExistingSession();

  const { data, error } = await supabase.auth.signUp({
    email,
    password: validPassword,
    options: {
      data: {
        login_id: normalizedLoginId,
        name: validNickname,
        full_name: validNickname,
        avatar_url: null,
      },
    },
  });

  if (error) {
    throw new Error(formatAuthErrorMessage(error));
  }

  if (data.session && data.user) {
    return {
      session: data.session,
      user: data.user,
      loginId: normalizedLoginId,
      nickname: validNickname,
    };
  }

  const signInData = await signInAfterSignUp(email, validPassword);

  return {
    session: signInData.session,
    user: signInData.user,
    loginId: normalizedLoginId,
    nickname: validNickname,
  };
}

export async function signInWithLoginId({
  loginId,
  password,
}: {
  loginId: string;
  password: string;
}) {
  const normalizedLoginId = validateLoginId(loginId);
  const validPassword = validatePassword(password);

  await clearExistingSession();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: loginIdToEmail(normalizedLoginId),
    password: validPassword,
  });

  if (error) {
    throw new Error(formatAuthErrorMessage(error));
  }

  return {
    session: data.session as Session | null,
    user: data.user as User | null,
    loginId: normalizedLoginId,
  };
}
