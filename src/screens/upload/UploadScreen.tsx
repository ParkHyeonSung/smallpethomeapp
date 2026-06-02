import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import AppHeader from '@/src/components/common/AppHeader';
import ScreenContainer from '@/src/components/common/ScreenContainer';
import { colors } from '@/src/constants/colors';
import { createPostImages, getPostImagesByPostId, replacePostImages } from '@/src/lib/post-images';
import { createPost, getPostById, updatePost } from '@/src/lib/posts';
import {
  createPostTags,
  ensurePostTagImageSortOrderReady,
  getPostTagsByPostId,
  isValidProductUrl,
  PostProductTagInput,
  replacePostTags,
} from '@/src/lib/post-tags';
import { uploadPostImages } from '@/src/lib/storage';

type DraftTag = PostProductTagInput & { id: string };

type SelectedImageItem = Partial<ImagePicker.ImagePickerAsset> & {
  uri: string;
  imagePath?: string | null;
  existing?: boolean;
};

type UploadScreenProps = {
  editPostId?: string;
};

export default function UploadScreen({ editPostId }: UploadScreenProps) {
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;
  const isEditMode = !!editPostId;

  const [selectedImages, setSelectedImages] = useState<SelectedImageItem[]>([]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isPickingImage, setIsPickingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [, setIsLoadingPost] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [postContent, setPostContent] = useState('');
  const [tagName, setTagName] = useState('');
  const [tagUrl, setTagUrl] = useState('');
  const [draftTags, setDraftTags] = useState<DraftTag[]>([]);
  const [isTagPlacementMode, setIsTagPlacementMode] = useState(false);
  const [pendingPosition, setPendingPosition] = useState<{ x: number; y: number } | null>(null);
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });

  const activeImage = selectedImages[activeImageIndex] ?? null;
  const activeImageTags = draftTags.filter((tag) => (tag.imageSortOrder ?? 0) === activeImageIndex);

  const imageAspectRatio = useMemo(() => {
    if (!activeImage?.width || !activeImage?.height) return 4 / 5;
    return activeImage.width / activeImage.height;
  }, [activeImage]);

  useEffect(() => {
    if (!editPostId) return;

    const loadPostForEdit = async () => {
      try {
        setIsLoadingPost(true);

        const [post, postImages, postTags] = await Promise.all([
          getPostById(editPostId),
          getPostImagesByPostId(editPostId),
          getPostTagsByPostId(editPostId),
        ]);

        setPostContent(post.content);
        setIsPublic(post.is_public);
        setSelectedImages(
          postImages.map((image) => ({
            uri: image.image_url,
            imagePath: image.image_path,
            existing: true,
          }))
        );
        setDraftTags(
          postTags.map((tag, index) => ({
            id: `${tag.id}-${index}`,
            productName: tag.product_name,
            productUrl: tag.product_url,
            thumbnailUrl: tag.thumbnail_url,
            xPosition: tag.x_position,
            yPosition: tag.y_position,
            imageSortOrder: tag.image_sort_order,
          }))
        );
        setActiveImageIndex(0);
      } catch (error) {
        Alert.alert(
          '게시글 불러오기 실패',
          error instanceof Error ? error.message : '수정할 게시글을 불러오지 못했습니다.'
        );
      } finally {
        setIsLoadingPost(false);
      }
    };

    void loadPostForEdit();
  }, [editPostId]);

  const handlePickImages = async () => {
    try {
      setIsPickingImage(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 10,
        quality: 0.9,
        base64: true,
      });

      if (result.canceled || !result.assets.length) return;

      setSelectedImages((prev) => {
        const nextImages = [...prev, ...result.assets.map((asset) => ({ ...asset, existing: false }))];
        return nextImages.slice(0, 10);
      });

      if (selectedImages.length === 0) {
        setActiveImageIndex(0);
        setDraftTags([]);
      }

      setPendingPosition(null);
      setTagName('');
      setTagUrl('');
      setIsTagPlacementMode(false);
    } catch (error) {
      Alert.alert(
        '이미지 선택 실패',
        error instanceof Error ? error.message : '이미지를 선택하지 못했습니다.'
      );
    } finally {
      setIsPickingImage(false);
    }
  };

  const handleSelectTagPosition = (event: any) => {
    if (!activeImage || !isTagPlacementMode) return;
    const { locationX, locationY } = event.nativeEvent;
    if (!previewSize.width || !previewSize.height) return;
    setPendingPosition({
      x: Math.min(Math.max(locationX / previewSize.width, 0), 1),
      y: Math.min(Math.max(locationY / previewSize.height, 0), 1),
    });
    setIsTagPlacementMode(false);
  };

  const handlePreviewLayout = (event: LayoutChangeEvent) => {
    const { width: nextWidth, height: nextHeight } = event.nativeEvent.layout;
    setPreviewSize({ width: nextWidth, height: nextHeight });
  };

  const handleAddTag = () => {
    if (!pendingPosition) {
      Alert.alert('태그 위치 선택', '먼저 현재 이미지에서 제품 위치를 선택해주세요.');
      return;
    }

    if (!tagName.trim()) {
      Alert.alert('제품 이름 입력', '제품 이름을 입력해주세요.');
      return;
    }

    if (!tagUrl.trim()) {
      Alert.alert('링크 입력', '제품 링크를 입력해주세요.');
      return;
    }

    if (!isValidProductUrl(tagUrl)) {
      Alert.alert(
        '유효한 링크 필요',
        '제품 태그는 실제로 열 수 있는 외부 쇼핑몰 링크만 첨부할 수 있습니다. `https://`가 포함된 주소를 입력해주세요.'
      );
      return;
    }

    setDraftTags((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${prev.length}`,
        productName: tagName.trim(),
        productUrl: tagUrl.trim(),
        xPosition: pendingPosition.x,
        yPosition: pendingPosition.y,
        imageSortOrder: activeImageIndex,
      },
    ]);
    setTagName('');
    setTagUrl('');
    setPendingPosition(null);
  };

  const handleRemoveImage = (targetIndex: number) => {
    setSelectedImages((prev) => {
      const nextImages = prev.filter((_, index) => index !== targetIndex);

      if (nextImages.length === 0) {
        setActiveImageIndex(0);
        setDraftTags([]);
        setPendingPosition(null);
        setIsTagPlacementMode(false);
        return nextImages;
      }

      setDraftTags((prevTags) =>
        prevTags
          .filter((tag) => (tag.imageSortOrder ?? 0) !== targetIndex)
          .map((tag) => ({
            ...tag,
            imageSortOrder:
              (tag.imageSortOrder ?? 0) > targetIndex ? (tag.imageSortOrder ?? 0) - 1 : tag.imageSortOrder,
          }))
      );
      setPendingPosition(null);
      setIsTagPlacementMode(false);

      setActiveImageIndex((currentIndex) => {
        if (currentIndex > targetIndex) return currentIndex - 1;
        if (currentIndex === targetIndex) return Math.max(0, currentIndex - 1);
        return currentIndex;
      });

      return nextImages;
    });
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);

      const existingImages = selectedImages.filter((image) => image.existing);
      const newImages = selectedImages.filter((image) => !image.existing) as ImagePicker.ImagePickerAsset[];
      const uploadedImages = newImages.length > 0 ? await uploadPostImages(newImages) : [];
      const mergedImages = [
        ...existingImages.map((image) => ({
          imageUrl: image.uri,
          imagePath: image.imagePath ?? '',
        })),
        ...uploadedImages,
      ];

      const representativeImageUrl = mergedImages[0]?.imageUrl ?? null;
      const representativeImagePath = mergedImages[0]?.imagePath ?? null;

      const tagPayload = draftTags.map((tag) => ({
        productName: tag.productName,
        productUrl: tag.productUrl,
        xPosition: tag.xPosition,
        yPosition: tag.yPosition,
        imageSortOrder: tag.imageSortOrder ?? 0,
        thumbnailUrl: null,
      }));

      if (tagPayload.length > 0) {
        await ensurePostTagImageSortOrderReady();
      }

      if (isEditMode && editPostId) {
        const post = await updatePost({
          postId: editPostId,
          content: postContent,
          imageUrl: representativeImageUrl,
          imagePath: representativeImagePath,
          isPublic,
        });

        await replacePostImages(
          post.id,
          mergedImages.map((image, index) => ({
            imageUrl: image.imageUrl,
            imagePath: image.imagePath,
            sortOrder: index,
          }))
        );
        await replacePostTags(post.id, tagPayload);

        router.replace(`/posts/${post.id}`);
        return;
      }

      const post = await createPost({
        content: postContent,
        imageUrl: representativeImageUrl,
        imagePath: representativeImagePath,
        isPublic,
      });

      if (mergedImages.length > 0) {
        await createPostImages(
          post.id,
          mergedImages.map((image, index) => ({
            imageUrl: image.imageUrl,
            imagePath: image.imagePath,
            sortOrder: index,
          }))
        );
      }

      if (tagPayload.length > 0) {
        await createPostTags(post.id, tagPayload);
      }

      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert(
        '업로드 실패',
        error instanceof Error ? error.message : '게시글 업로드 중 오류가 발생했습니다.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <AppHeader title="게시글 업로드" />

      <View style={[styles.layout, isDesktopWeb && styles.layoutDesktop]}>
        <View style={[styles.previewCard, isDesktopWeb && styles.previewCardDesktop]}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>이미지</Text>
            <Pressable style={styles.secondaryButton} onPress={() => void handlePickImages()}>
              <Text style={styles.secondaryButtonText}>
                {isPickingImage ? '선택 중...' : '이미지 선택'}
              </Text>
            </Pressable>
          </View>

          {selectedImages.length > 0 ? (
            <>
              <Text style={styles.helperText}>
                첫 번째 이미지는 대표 이미지로 사용됩니다. 사진을 선택한 뒤 제품 위치를 찍어 태그를 추가할 수 있습니다.
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.thumbnailRow}>
                {selectedImages.map((image, index) => (
                  <View
                    key={`${image.assetId ?? image.uri}-${index}`}
                    style={[
                      styles.thumbnailButton,
                      activeImageIndex === index && styles.thumbnailButtonActive,
                    ]}>
                    <Pressable
                      style={styles.thumbnailPressable}
                      onPress={() => {
                        setActiveImageIndex(index);
                        setPendingPosition(null);
                        setIsTagPlacementMode(false);
                      }}>
                      <Image source={{ uri: image.uri }} style={styles.thumbnailImage} contentFit="cover" />
                    </Pressable>
                    <View style={styles.thumbnailBadge}>
                      <Text style={styles.thumbnailBadgeText}>{index + 1}</Text>
                    </View>
                    <Pressable
                      style={styles.thumbnailRemoveButton}
                      onPress={() => handleRemoveImage(index)}>
                      <Ionicons name="close" size={12} color="#FFFFFF" />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>

              <>
                <Text style={styles.helperText}>
                  {pendingPosition
                    ? `${activeImageIndex + 1}번째 사진의 위치가 선택됐습니다. 아래에서 제품 정보를 입력해주세요.`
                    : isTagPlacementMode
                      ? `${activeImageIndex + 1}번째 사진에서 제품 위치를 선택하세요.`
                      : `${activeImageIndex + 1}번째 사진에 태그를 추가하려면 위치 선택 버튼을 눌러주세요.`}
                </Text>

                <View style={styles.rowWrap}>
                  <Pressable
                    style={[styles.secondaryButton, isTagPlacementMode && styles.activeButton]}
                    onPress={() => setIsTagPlacementMode((prev) => !prev)}>
                    <Text
                      style={[
                        styles.secondaryButtonText,
                        isTagPlacementMode && styles.activeButtonText,
                      ]}>
                      {isTagPlacementMode ? '위치 선택 중' : '태그 위치 찍기'}
                    </Text>
                  </Pressable>
                  {pendingPosition ? (
                    <Pressable style={styles.ghostButton} onPress={() => setPendingPosition(null)}>
                      <Text style={styles.ghostButtonText}>위치 다시 고르기</Text>
                    </Pressable>
                  ) : null}
                </View>
              </>

              <View
                style={[
                  styles.previewFrame,
                  isDesktopWeb && styles.previewFrameDesktop,
                  { aspectRatio: imageAspectRatio || 4 / 5 },
                ]}
                onLayout={handlePreviewLayout}
                onStartShouldSetResponder={() => isTagPlacementMode}
                onResponderRelease={handleSelectTagPosition}>
                <Image source={{ uri: activeImage?.uri }} style={styles.previewImage} contentFit="contain" />

                {activeImageTags.map((tag) => (
                    <View
                      key={tag.id}
                      style={[
                        styles.tagMarker,
                        { left: `${tag.xPosition * 100}%`, top: `${tag.yPosition * 100}%` },
                      ]}
                    />
                  ))}

                {pendingPosition ? (
                  <View
                    style={[
                      styles.pendingMarker,
                      { left: `${pendingPosition.x * 100}%`, top: `${pendingPosition.y * 100}%` },
                    ]}
                  />
                ) : null}

                {isTagPlacementMode ? (
                  <View style={styles.overlayHint}>
                    <Ionicons name="add-circle" size={22} color="#FFFFFF" />
                    <Text style={styles.overlayHintText}>클릭해서 태그 위치 선택</Text>
                  </View>
                ) : null}
              </View>
            </>
          ) : (
            <Pressable style={styles.emptyCard} onPress={() => void handlePickImages()}>
              <Ionicons name="images-outline" size={28} color={colors.primary} />
              <Text style={styles.emptyTitle}>이미지를 선택해주세요</Text>
              <Text style={styles.emptyText}>
                한 게시글에 여러 장을 업로드할 수 있고, 첫 번째 이미지가 대표 이미지가 됩니다.
              </Text>
            </Pressable>
          )}
        </View>

        <View style={[styles.formColumn, isDesktopWeb && styles.formColumnDesktop]}>
          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>제품 태그</Text>
            {selectedImages.length > 0 ? (
              <Text style={styles.helperText}>
                현재 선택된 {activeImageIndex + 1}번째 사진에 태그가 추가됩니다.
              </Text>
            ) : null}
            <TextInput
              value={tagName}
              onChangeText={setTagName}
              placeholder="제품 이름"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <TextInput
              value={tagUrl}
              onChangeText={setTagUrl}
              placeholder="https://..."
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              autoCapitalize="none"
            />
            <Pressable style={styles.primaryButton} onPress={handleAddTag}>
              <Text style={styles.primaryButtonText}>태그 추가하기</Text>
            </Pressable>

            {draftTags.length === 0 ? (
              <Text style={styles.helperText}>아직 추가된 제품 태그가 없습니다.</Text>
            ) : (
              <View style={styles.tagList}>
                {draftTags.map((tag, index) => (
                  <View key={tag.id} style={styles.tagItem}>
                    <View style={styles.tagTextWrap}>
                      <Text style={styles.tagTitle}>
                        {tag.imageSortOrder !== undefined ? `${tag.imageSortOrder + 1}번 사진 · ` : ''}
                        태그 {index + 1}. {tag.productName}
                      </Text>
                      <Text style={styles.tagSubtitle} numberOfLines={1}>
                        {tag.productUrl}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() =>
                        setDraftTags((prev) => prev.filter((item) => item.id !== tag.id))
                      }>
                      <Text style={styles.removeText}>삭제</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>게시글 설명</Text>
            <TextInput
              value={postContent}
              onChangeText={setPostContent}
              placeholder="사육 환경, 케이지 구성, 제품 추천 이유를 적어주세요."
              placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.textArea]}
              multiline
              textAlignVertical="top"
            />

            <View style={styles.visibility}>
              <View style={styles.visibilityText}>
                <Text style={styles.visibilityTitle}>공개 게시글</Text>
                <Text style={styles.helperText}>
                  커뮤니티 피드에서 다른 사용자가 볼 수 있습니다.
                </Text>
              </View>
              <Switch
                value={isPublic}
                onValueChange={setIsPublic}
                trackColor={{ false: '#D6DBD8', true: '#A8D8C9' }}
                thumbColor={isPublic ? colors.primary : '#F4F4F4'}
              />
            </View>

            <Pressable
              style={[styles.submitButton, isSubmitting && styles.disabled]}
              onPress={() => void handleSubmit()}
              disabled={isSubmitting}>
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>업로드하기</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingBottom: 40 },
  layout: { gap: 16 },
  layoutDesktop: { flexDirection: 'row', alignItems: 'flex-start' },
  previewCard: {
    gap: 14,
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewCardDesktop: { flex: 0.92 },
  formColumn: { gap: 16 },
  formColumnDesktop: { flex: 1 },
  formCard: {
    gap: 12,
    padding: 18,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  thumbnailRow: {
    gap: 10,
  },
  thumbnailButton: {
    position: 'relative',
    width: 74,
    height: 74,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbnailButtonActive: {
    borderColor: colors.primary,
  },
  thumbnailPressable: {
    width: '100%',
    height: '100%',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  thumbnailBadge: {
    position: 'absolute',
    right: 6,
    top: 6,
    minWidth: 20,
    height: 20,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  thumbnailBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  thumbnailRemoveButton: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 20,
    height: 20,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  helperText: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textMuted,
  },
  secondaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  activeButton: {
    backgroundColor: colors.primary,
  },
  activeButtonText: {
    color: '#FFFFFF',
  },
  ghostButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  ghostButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  previewFrame: {
    overflow: 'hidden',
    width: '100%',
    borderRadius: 14,
    backgroundColor: colors.backgroundAccent,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  previewFrameDesktop: {
    maxWidth: 520,
    alignSelf: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  tagMarker: {
    position: 'absolute',
    width: 18,
    height: 18,
    marginLeft: -9,
    marginTop: -9,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 4,
    borderColor: colors.primary,
  },
  pendingMarker: {
    position: 'absolute',
    width: 22,
    height: 22,
    marginLeft: -11,
    marginTop: -11,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 5,
    borderColor: colors.accent,
  },
  overlayHint: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  overlayHintText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyCard: {
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundAccent,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
    textAlign: 'center',
  },
  input: {
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: colors.background,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.text,
  },
  textArea: {
    minHeight: 160,
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  tagList: {
    gap: 10,
  },
  tagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.background,
  },
  tagTextWrap: {
    flex: 1,
    gap: 4,
  },
  tagTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  tagSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
  },
  removeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#C24747',
  },
  visibility: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.background,
  },
  visibilityText: {
    flex: 1,
    gap: 4,
  },
  visibilityTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  submitButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  disabled: {
    opacity: 0.7,
  },
});
