import { supabase } from '@/src/lib/supabase';

type UserMetadata = {
  avatar_url?: unknown;
  full_name?: unknown;
  login_id?: unknown;
  name?: unknown;
};

function getNickname(metadata: UserMetadata) {
  if (typeof metadata.full_name === 'string' && metadata.full_name.trim()) {
    return metadata.full_name.trim();
  }

  if (typeof metadata.name === 'string' && metadata.name.trim()) {
    return metadata.name.trim();
  }

  return 'Small Pet Mate';
}

function getAvatarUrl(metadata: UserMetadata) {
  return typeof metadata.avatar_url === 'string' ? metadata.avatar_url : null;
}

function formatProfileErrorMessage(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return '프로필 저장 중 문제가 발생했어요.';
}

export async function upsertMyProfile() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    return null;
  }

  const metadata = (user.user_metadata ?? {}) as UserMetadata;
  const payload = {
    id: user.id,
    email: user.email ?? '',
    nickname: getNickname(metadata),
    avatar_url: getAvatarUrl(metadata),
  };

  const { data, error } = await supabase
    .from('profiles')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    throw new Error(formatProfileErrorMessage(error));
  }

  return data;
}

export async function upsertProfileForCredentials({
  nickname,
}: {
  nickname: string;
}) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    return null;
  }

  const payload = {
    id: user.id,
    email: user.email ?? '',
    nickname: nickname.trim(),
    avatar_url: null,
  };

  const { data, error } = await supabase
    .from('profiles')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    throw new Error(formatProfileErrorMessage(error));
  }

  return data;
}
