import { decode } from 'base64-arraybuffer';
import type { ImagePickerAsset } from 'expo-image-picker';

import { supabase } from '@/src/lib/supabase';

export const POST_IMAGES_BUCKET = 'post-images';

function getFileExtension(asset: ImagePickerAsset) {
  if (asset.fileName && asset.fileName.includes('.')) {
    return asset.fileName.split('.').pop()?.toLowerCase() ?? 'jpg';
  }

  if (asset.mimeType?.includes('/')) {
    return asset.mimeType.split('/')[1] ?? 'jpg';
  }

  return 'jpg';
}

export async function uploadPostImage(asset: ImagePickerAsset) {
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

  if (!asset.base64) {
    throw new Error('이미지 데이터를 읽지 못했습니다. 다시 선택해주세요.');
  }

  const extension = getFileExtension(asset);
  const filePath = `${user.id}/${Date.now()}.${extension}`;
  const contentType = asset.mimeType ?? 'image/jpeg';
  const fileData = decode(asset.base64);

  const { error: uploadError } = await supabase.storage
    .from(POST_IMAGES_BUCKET)
    .upload(filePath, fileData, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from(POST_IMAGES_BUCKET).getPublicUrl(filePath);

  return {
    imagePath: filePath,
    imageUrl: data.publicUrl,
  };
}
