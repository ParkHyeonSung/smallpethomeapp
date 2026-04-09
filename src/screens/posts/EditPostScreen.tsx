import { useEffect, useState } from 'react';

import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import ScreenContainer from '@/src/components/common/ScreenContainer';
import { colors } from '@/src/constants/colors';
import { getPostById, updatePost } from '@/src/lib/posts';
import { uploadPostImage } from '@/src/lib/storage';

export default function EditPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [content, setContent] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!id) {
      return;
    }

    const loadPost = async () => {
      try {
        setIsLoading(true);
        const post = await getPostById(id);
        setContent(post.content);
        setIsPublic(post.is_public);
        setCurrentImageUrl(post.image_url);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '게시글을 불러오는 중 오류가 발생했습니다.';
        Alert.alert('불러오기 실패', message, [{ text: '확인', onPress: () => router.back() }]);
      } finally {
        setIsLoading(false);
      }
    };

    void loadPost();
  }, [id]);

  const handlePickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert('권한 필요', '이미지를 선택하려면 사진 접근 권한이 필요합니다.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 4],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled) {
        setSelectedImage(result.assets[0] ?? null);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '이미지 선택 중 오류가 발생했습니다.';
      Alert.alert('이미지 선택 실패', message);
    }
  };

  const handleSave = async () => {
    if (!id) {
      return;
    }

    try {
      setIsSubmitting(true);

      let imageUrl = currentImageUrl;
      let imagePath: string | null = null;

      if (selectedImage) {
        const uploaded = await uploadPostImage(selectedImage);
        imageUrl = uploaded.imageUrl;
        imagePath = uploaded.imagePath;
      }

      await updatePost({
        postId: id,
        content,
        imageUrl,
        imagePath,
        isPublic,
      });

      router.replace(`/posts/${id}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '게시글 수정 중 오류가 발생했습니다.';
      Alert.alert('수정 실패', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.centerText}>게시글을 불러오는 중입니다...</Text>
      </View>
    );
  }

  return (
    <ScreenContainer scroll>
      <View style={styles.topRow}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>뒤로</Text>
        </Pressable>
        <Text style={styles.title}>게시글 수정</Text>
        <View style={styles.topSpacer} />
      </View>

      <Pressable style={styles.imageBox} onPress={handlePickImage}>
        {selectedImage?.uri ? (
          <Image source={{ uri: selectedImage.uri }} style={styles.previewImage} contentFit="cover" />
        ) : currentImageUrl ? (
          <Image source={{ uri: currentImageUrl }} style={styles.previewImage} contentFit="cover" />
        ) : (
          <Text style={styles.imageBoxText}>탭해서 이미지를 선택하세요.</Text>
        )}
      </Pressable>

      <View style={styles.formCard}>
        <Text style={styles.label}>게시글 설명</Text>
        <TextInput
          value={content}
          onChangeText={setContent}
          placeholder="게시글 내용을 수정하세요."
          placeholderTextColor={colors.textMuted}
          multiline
          textAlignVertical="top"
          style={styles.contentInput}
        />

        <View style={styles.visibilityRow}>
          <View style={styles.visibilityTextGroup}>
            <Text style={styles.label}>공개 게시글</Text>
            <Text style={styles.helperText}>비공개로 바꾸면 본인만 볼 수 있습니다.</Text>
          </View>
          <Switch
            value={isPublic}
            onValueChange={setIsPublic}
            trackColor={{ false: '#D1D5DB', true: '#9FD3C7' }}
            thumbColor={isPublic ? colors.primary : '#F9FAFB'}
          />
        </View>

        <Pressable
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={() => void handleSave()}
          disabled={isSubmitting}>
          <Text style={styles.submitButtonText}>
            {isSubmitting ? '저장 중...' : '수정하기'}
          </Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: colors.background,
    padding: 24,
  },
  centerText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  topSpacer: {
    width: 54,
  },
  imageBox: {
    height: 220,
    overflow: 'hidden',
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageBoxText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    color: colors.textMuted,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  formCard: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  contentInput: {
    minHeight: 160,
    borderRadius: 14,
    backgroundColor: colors.background,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  visibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  visibilityTextGroup: {
    flex: 1,
    gap: 4,
  },
  helperText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
  submitButton: {
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
