import { supabase } from '@/src/lib/supabase';

export type PostProductTag = {
  id: string;
  post_id: string;
  author_id: string;
  product_name: string;
  product_url: string;
  thumbnail_url: string | null;
  x_position: number;
  y_position: number;
  created_at: string;
};

export type PostProductTagInput = {
  productName: string;
  productUrl: string;
  thumbnailUrl?: string | null;
  xPosition: number;
  yPosition: number;
};

export function isValidProductUrl(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return false;
  }

  try {
    const url = new URL(trimmedValue);
    const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
    const hasHostname = url.hostname.includes('.') && url.hostname !== 'localhost';

    return isHttp && hasHostname;
  } catch {
    return false;
  }
}

function normalizeTag(row: any): PostProductTag {
  return {
    id: row.id,
    post_id: row.post_id,
    author_id: row.author_id,
    product_name: row.product_name,
    product_url: row.product_url,
    thumbnail_url: row.thumbnail_url ?? null,
    x_position: Number(row.x_position),
    y_position: Number(row.y_position),
    created_at: row.created_at,
  };
}

export async function getPostTagsByPostId(postId: string) {
  const { data, error } = await supabase
    .from('post_product_tags')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(normalizeTag);
}

export async function createPostTags(postId: string, tags: PostProductTagInput[]) {
  if (tags.length === 0) {
    return [];
  }

  const hasInvalidUrl = tags.some((tag) => !isValidProductUrl(tag.productUrl));
  if (hasInvalidUrl) {
    throw new Error('제품 태그 링크는 실제 외부 쇼핑몰 URL 형식이어야 합니다.');
  }

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

  const payload = tags.map((tag) => ({
    post_id: postId,
    author_id: user.id,
    product_name: tag.productName.trim(),
    product_url: tag.productUrl.trim(),
    thumbnail_url: tag.thumbnailUrl?.trim() || null,
    x_position: tag.xPosition,
    y_position: tag.yPosition,
  }));

  const { data, error } = await supabase.from('post_product_tags').insert(payload).select('*');

  if (error) {
    throw error;
  }

  return (data ?? []).map(normalizeTag);
}

export async function replacePostTags(postId: string, tags: PostProductTagInput[]) {
  const hasInvalidUrl = tags.some((tag) => !isValidProductUrl(tag.productUrl));
  if (hasInvalidUrl) {
    throw new Error('제품 태그 링크는 실제 외부 쇼핑몰 URL 형식이어야 합니다.');
  }

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

  const { error: deleteError } = await supabase
    .from('post_product_tags')
    .delete()
    .eq('post_id', postId)
    .eq('author_id', user.id);

  if (deleteError) {
    throw deleteError;
  }

  return createPostTags(postId, tags);
}
