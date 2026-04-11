import { supabase } from '@/src/lib/supabase';

export type PostImageItem = {
  id: string;
  post_id: string;
  image_url: string;
  image_path: string;
  sort_order: number;
  created_at: string;
};

export type CreatePostImageInput = {
  imageUrl: string;
  imagePath: string;
  sortOrder: number;
};

function normalizePostImage(row: any): PostImageItem {
  return {
    id: row.id,
    post_id: row.post_id,
    image_url: row.image_url,
    image_path: row.image_path,
    sort_order: row.sort_order ?? 0,
    created_at: row.created_at,
  };
}

export async function createPostImages(postId: string, images: CreatePostImageInput[]) {
  if (images.length === 0) {
    return [];
  }

  const payload = images.map((image) => ({
    post_id: postId,
    image_url: image.imageUrl,
    image_path: image.imagePath,
    sort_order: image.sortOrder,
  }));

  const { data, error } = await supabase
    .from('post_images')
    .insert(payload)
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(normalizePostImage);
}

export async function getPostImagesByPostId(postId: string) {
  const { data, error } = await supabase
    .from('post_images')
    .select('*')
    .eq('post_id', postId)
    .order('sort_order', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(normalizePostImage);
}

export async function getPostImagesByPostIds(postIds: string[]) {
  if (postIds.length === 0) {
    return {} as Record<string, PostImageItem[]>;
  }

  const { data, error } = await supabase
    .from('post_images')
    .select('*')
    .in('post_id', postIds)
    .order('sort_order', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).reduce<Record<string, PostImageItem[]>>((acc, row) => {
    const image = normalizePostImage(row);
    if (!acc[image.post_id]) {
      acc[image.post_id] = [];
    }
    acc[image.post_id].push(image);
    return acc;
  }, {});
}

export async function replacePostImages(postId: string, images: CreatePostImageInput[]) {
  const { error: deleteError } = await supabase.from('post_images').delete().eq('post_id', postId);

  if (deleteError) {
    throw deleteError;
  }

  return createPostImages(postId, images);
}
