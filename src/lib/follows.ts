import { supabase } from '@/src/lib/supabase';
import { upsertMyProfile } from '@/src/lib/profiles';

function formatFollowError(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return '팔로우 처리 중 오류가 발생했습니다.';
}

async function getCurrentUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(formatFollowError(error));
  }

  if (!user) {
    throw new Error('로그인이 필요합니다.');
  }

  return user.id;
}

export async function getFollowerCount(userId: string) {
  const { count, error } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('following_id', userId);

  if (error) {
    throw new Error(formatFollowError(error));
  }

  return count ?? 0;
}

export async function isFollowingUser(targetUserId: string) {
  const currentUserId = await getCurrentUserId();

  if (currentUserId === targetUserId) {
    return false;
  }

  const { data, error } = await supabase
    .from('follows')
    .select('id')
    .eq('follower_id', currentUserId)
    .eq('following_id', targetUserId)
    .maybeSingle();

  if (error) {
    throw new Error(formatFollowError(error));
  }

  return Boolean(data);
}

export async function followUser(targetUserId: string) {
  const currentUserId = await getCurrentUserId();

  if (currentUserId === targetUserId) {
    throw new Error('자기 자신은 팔로우할 수 없습니다.');
  }

  await upsertMyProfile();

  const { error } = await supabase
    .from('follows')
    .upsert(
      {
        follower_id: currentUserId,
        following_id: targetUserId,
      },
      {
        ignoreDuplicates: true,
        onConflict: 'follower_id,following_id',
      }
    );

  if (error) {
    throw new Error(formatFollowError(error));
  }
}

export async function unfollowUser(targetUserId: string) {
  const currentUserId = await getCurrentUserId();

  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', currentUserId)
    .eq('following_id', targetUserId);

  if (error) {
    throw new Error(formatFollowError(error));
  }
}
