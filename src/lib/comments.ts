import { supabase } from '@/src/lib/supabase';

export type CommentItem = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  profiles?: {
    id: string;
    nickname: string;
    avatar_url: string | null;
  } | null;
};

function normalizeComment(row: any): CommentItem {
  return {
    id: row.id,
    post_id: row.post_id,
    user_id: row.user_id,
    content: row.content,
    created_at: row.created_at,
    updated_at: row.updated_at,
    profiles: row.profiles
      ? {
          id: row.profiles.id,
          nickname: row.profiles.nickname,
          avatar_url: row.profiles.avatar_url ?? null,
        }
      : null,
  };
}

async function getCurrentUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!user) {
    throw new Error('로그인이 필요합니다.');
  }

  return user.id;
}

export async function getCommentsByPostId(postId: string) {
  const { data, error } = await supabase
    .from('comments')
    .select(
      `
      id,
      post_id,
      user_id,
      content,
      created_at,
      updated_at,
      profiles:user_id (
        id,
        nickname,
        avatar_url
      )
      `
    )
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(normalizeComment);
}

export async function createComment(postId: string, content: string) {
  const userId = await getCurrentUserId();
  const trimmedContent = content.trim();

  if (!trimmedContent) {
    throw new Error('댓글 내용을 입력해주세요.');
  }

  const { data, error } = await supabase
    .from('comments')
    .insert({
      post_id: postId,
      user_id: userId,
      content: trimmedContent,
    })
    .select(
      `
      id,
      post_id,
      user_id,
      content,
      created_at,
      updated_at,
      profiles:user_id (
        id,
        nickname,
        avatar_url
      )
      `
    )
    .single();

  if (error) {
    throw error;
  }

  return normalizeComment(data);
}
