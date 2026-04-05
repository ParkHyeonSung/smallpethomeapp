import { supabase } from '@/src/lib/supabase';
import { PostItem } from '@/src/lib/posts';

type LikeRow = {
  post_id: string;
};

function normalizePost(row: any): PostItem {
  return {
    id: row.id,
    author_id: row.author_id,
    content: row.content,
    image_url: row.image_url ?? null,
    image_path: row.image_path ?? null,
    is_public: row.is_public,
    like_count: row.like_count ?? 0,
    comment_count: row.comment_count ?? 0,
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

export async function getMyLikedPostIds() {
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('likes')
    .select('post_id')
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  return new Set((data as LikeRow[] | null)?.map((row) => row.post_id) ?? []);
}

export async function likePost(postId: string) {
  const userId = await getCurrentUserId();

  const { error } = await supabase.from('likes').insert({
    user_id: userId,
    post_id: postId,
  });

  if (error) {
    throw error;
  }
}

export async function unlikePost(postId: string) {
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from('likes')
    .delete()
    .eq('user_id', userId)
    .eq('post_id', postId);

  if (error) {
    throw error;
  }
}

export async function getMyFavoritePosts() {
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('likes')
    .select(
      `
      created_at,
      posts:post_id (
        id,
        author_id,
        content,
        image_url,
        image_path,
        is_public,
        like_count,
        comment_count,
        created_at,
        updated_at,
        profiles:author_id (
          id,
          nickname,
          avatar_url
        )
      )
      `
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? [])
    .map((row: any) => row.posts)
    .filter(Boolean)
    .map(normalizePost);
}
