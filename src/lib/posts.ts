import { supabase } from '@/src/lib/supabase';

export type PostProfile = {
  id: string;
  nickname: string;
  avatar_url: string | null;
};

export type PostItem = {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  image_path: string | null;
  is_public: boolean;
  like_count: number;
  comment_count: number;
  created_at: string;
  updated_at: string;
  profiles?: PostProfile | null;
};

type CreatePostInput = {
  content: string;
  imageUrl?: string | null;
  imagePath?: string | null;
  isPublic?: boolean;
};

type UpdatePostInput = {
  postId: string;
  content: string;
  imageUrl?: string | null;
  imagePath?: string | null;
  isPublic?: boolean;
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

export async function createPost({
  content,
  imageUrl = null,
  imagePath = null,
  isPublic = true,
}: CreatePostInput) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    throw new Error('로그인이 필요합니다.');
  }

  const trimmedContent = content.trim();

  if (!trimmedContent) {
    throw new Error('게시글 내용을 입력해주세요.');
  }

  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_id: user.id,
      content: trimmedContent,
      image_url: imageUrl,
      image_path: imagePath,
      is_public: isPublic,
    })
    .select(
      `
      id,
      author_id,
      content,
      image_url,
      image_path,
      is_public,
      like_count,
      comment_count,
      created_at,
      updated_at
      `
    )
    .single();

  if (error) {
    throw error;
  }

  return normalizePost(data);
}

export async function getFeedPosts() {
  const { data, error } = await supabase
    .from('posts')
    .select(
      `
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
      `
    )
    .eq('is_public', true)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(normalizePost);
}

export async function getMyPosts() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    throw new Error('로그인이 필요합니다.');
  }

  const { data, error } = await supabase
    .from('posts')
    .select(
      `
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
      `
    )
    .eq('author_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(normalizePost);
}

export async function searchPublicPosts(query: string) {
  const trimmedQuery = query.trim().toLowerCase();
  const posts = await getFeedPosts();

  if (!trimmedQuery) {
    return posts;
  }

  return posts.filter((post) => {
    const author = post.profiles?.nickname?.toLowerCase() ?? '';
    const content = post.content.toLowerCase();

    return author.includes(trimmedQuery) || content.includes(trimmedQuery);
  });
}

export async function getPostById(postId: string) {
  const { data, error } = await supabase
    .from('posts')
    .select(
      `
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
      `
    )
    .eq('id', postId)
    .single();

  if (error) {
    throw error;
  }

  return normalizePost(data);
}

export async function updatePost({
  postId,
  content,
  imageUrl = null,
  imagePath = null,
  isPublic = true,
}: UpdatePostInput) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    throw new Error('로그인이 필요합니다.');
  }

  const trimmedContent = content.trim();

  if (!trimmedContent) {
    throw new Error('게시글 내용을 입력해주세요.');
  }

  const { data, error } = await supabase
    .from('posts')
    .update({
      content: trimmedContent,
      image_url: imageUrl,
      image_path: imagePath,
      is_public: isPublic,
    })
    .eq('id', postId)
    .eq('author_id', user.id)
    .select(
      `
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
      `
    )
    .single();

  if (error) {
    throw error;
  }

  return normalizePost(data);
}

export async function deletePost(postId: string) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    throw new Error('로그인이 필요합니다.');
  }

  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', postId)
    .eq('author_id', user.id);

  if (error) {
    throw error;
  }
}
