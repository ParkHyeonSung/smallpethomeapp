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

async function signInAfterSignUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    if (error instanceof AuthError && error.message.toLowerCase().includes('email not confirmed')) {
      throw new Error(
        '현재 Supabase에서 이메일 확인이 켜져 있어 아이디 회원가입 직후 자동 로그인이 막혀 있어요. Supabase Authentication 설정에서 Confirm email을 꺼주세요.'
      );
    }

    throw error;
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
    throw error;
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

  const { data, error } = await supabase.auth.signInWithPassword({
    email: loginIdToEmail(normalizedLoginId),
    password: validPassword,
  });

  if (error) {
    throw error;
  }

  return {
    session: data.session as Session | null,
    user: data.user as User | null,
    loginId: normalizedLoginId,
  };
}
