import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  LayoutChangeEvent,
  Platform,
  Pressable,
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
import { createPost } from '@/src/lib/posts';
import { createPostTags, PostProductTagInput } from '@/src/lib/post-tags';
import { uploadPostImage } from '@/src/lib/storage';

type DraftTag = PostProductTagInput & { id: string };

export default function UploadScreen() {
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 1024;

  const [selectedImage, setSelectedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [isPickingImage, setIsPickingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [postContent, setPostContent] = useState('');
  const [tagName, setTagName] = useState('');
  const [tagUrl, setTagUrl] = useState('');
  const [draftTags, setDraftTags] = useState<DraftTag[]>([]);
  const [isTagPlacementMode, setIsTagPlacementMode] = useState(false);
  const [pendingPosition, setPendingPosition] = useState<{ x: number; y: number } | null>(null);
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });

  const imageAspectRatio = useMemo(() => {
    if (!selectedImage?.width || !selectedImage?.height) return 4 / 5;
    return selectedImage.width / selectedImage.height;
  }, [selectedImage]);

  const handlePickImage = async () => {
    try {
      setIsPickingImage(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.9,
        base64: true,
      });

      if (result.canceled || !result.assets[0]) return;

      setSelectedImage(result.assets[0]);
      setDraftTags([]);
      setPendingPosition(null);
      setTagName('');
      setTagUrl('');
      setIsTagPlacementMode(false);
    } catch (error) {
      Alert.alert('이미지 선택 실패', error instanceof Error ? error.message : '이미지를 선택하지 못했습니다.');
    } finally {
      setIsPickingImage(false);
    }
  };

  const handleSelectTagPosition = (event: any) => {
    if (!selectedImage || !isTagPlacementMode) return;
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
      Alert.alert('태그 위치 선택', '먼저 이미지에서 제품 위치를 선택해주세요.');
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

    setDraftTags((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${prev.length}`,
        productName: tagName.trim(),
        productUrl: tagUrl.trim(),
        xPosition: pendingPosition.x,
        yPosition: pendingPosition.y,
      },
    ]);
    setTagName('');
    setTagUrl('');
    setPendingPosition(null);
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);

      let imageUrl: string | null = null;
      let imagePath: string | null = null;

      if (selectedImage) {
        const uploaded = await uploadPostImage(selectedImage);
        imageUrl = uploaded.imageUrl;
        imagePath = uploaded.imagePath;
      }

      const post = await createPost({
        content: postContent,
        imageUrl,
        imagePath,
        isPublic,
      });

      if (draftTags.length > 0) {
        await createPostTags(
          post.id,
          draftTags.map((tag) => ({
            productName: tag.productName,
            productUrl: tag.productUrl,
            xPosition: tag.xPosition,
            yPosition: tag.yPosition,
            thumbnailUrl: null,
          }))
        );
      }

      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert('업로드 실패', error instanceof Error ? error.message : '게시글 업로드 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <AppHeader
        title="게시글 업로드"
        subtitle="이미지를 올리고 제품 위치를 지정해 태그를 함께 저장할 수 있습니다."
      />

      <View style={[styles.layout, isDesktopWeb && styles.layoutDesktop]}>
        <View style={[styles.previewCard, isDesktopWeb && styles.previewCardDesktop]}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>이미지</Text>
            <Pressable style={styles.secondaryButton} onPress={() => void handlePickImage()}>
              <Text style={styles.secondaryButtonText}>
                {isPickingImage ? '선택 중...' : selectedImage ? '이미지 변경' : '이미지 선택'}
              </Text>
            </Pressable>
          </View>

          {selectedImage ? (
            <>
              <Text style={styles.helperText}>
                {pendingPosition
                  ? '위치가 선택됐습니다. 오른쪽에서 제품 정보를 입력해주세요.'
                  : isTagPlacementMode
                    ? '이미지를 클릭해서 제품 위치를 선택하세요.'
                    : '태그 위치를 찍으려면 아래 버튼을 눌러주세요.'}
              </Text>

              <View style={styles.rowWrap}>
                <Pressable
                  style={[styles.secondaryButton, isTagPlacementMode && styles.activeButton]}
                  onPress={() => setIsTagPlacementMode((prev) => !prev)}
                >
                  <Text style={[styles.secondaryButtonText, isTagPlacementMode && styles.activeButtonText]}>
                    {isTagPlacementMode ? '위치 선택 중' : '태그 위치 찍기'}
                  </Text>
                </Pressable>
                {pendingPosition ? (
                  <Pressable style={styles.ghostButton} onPress={() => setPendingPosition(null)}>
                    <Text style={styles.ghostButtonText}>위치 다시 고르기</Text>
                  </Pressable>
                ) : null}
              </View>

              <View
                style={[
                  styles.previewFrame,
                  isDesktopWeb && styles.previewFrameDesktop,
                  { aspectRatio: imageAspectRatio || 4 / 5 },
                ]}
                onLayout={handlePreviewLayout}
                onStartShouldSetResponder={() => isTagPlacementMode}
                onResponderRelease={handleSelectTagPosition}
              >
                <Image source={{ uri: selectedImage.uri }} style={styles.previewImage} contentFit="contain" />

                {draftTags.map((tag) => (
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
            <Pressable style={styles.emptyCard} onPress={() => void handlePickImage()}>
              <Ionicons name="image-outline" size={28} color={colors.primary} />
              <Text style={styles.emptyTitle}>이미지를 선택해주세요</Text>
              <Text style={styles.emptyText}>PC에서는 세로형 비율로 미리보기가 보이도록 조정했습니다.</Text>
            </Pressable>
          )}
        </View>

        <View style={[styles.formColumn, isDesktopWeb && styles.formColumnDesktop]}>
          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>제품 태그</Text>
            <TextInput value={tagName} onChangeText={setTagName} placeholder="제품 이름" placeholderTextColor={colors.textMuted} style={styles.input} />
            <TextInput value={tagUrl} onChangeText={setTagUrl} placeholder="https://..." placeholderTextColor={colors.textMuted} style={styles.input} autoCapitalize="none" />
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
                      <Text style={styles.tagTitle}>태그 {index + 1}. {tag.productName}</Text>
                      <Text style={styles.tagSubtitle} numberOfLines={1}>{tag.productUrl}</Text>
                    </View>
                    <Pressable onPress={() => setDraftTags((prev) => prev.filter((item) => item.id !== tag.id))}>
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
                <Text style={styles.helperText}>커뮤니티 피드에서 다른 사용자가 볼 수 있습니다.</Text>
              </View>
              <Switch value={isPublic} onValueChange={setIsPublic} trackColor={{ false: '#D6DBD8', true: '#A8D8C9' }} thumbColor={isPublic ? colors.primary : '#F4F4F4'} />
            </View>

            <Pressable style={[styles.submitButton, isSubmitting && styles.disabled]} onPress={() => void handleSubmit()} disabled={isSubmitting}>
              {isSubmitting ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.submitButtonText}>업로드하기</Text>}
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
  previewCard: { gap: 14, padding: 16, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  previewCardDesktop: { flex: 0.92 },
  formColumn: { gap: 16 },
  formColumnDesktop: { flex: 1 },
  formCard: { gap: 12, padding: 18, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  helperText: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  secondaryButton: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.primaryLight },
  secondaryButtonText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  activeButton: { backgroundColor: colors.primary },
  activeButtonText: { color: '#FFFFFF' },
  ghostButton: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  ghostButtonText: { fontSize: 13, fontWeight: '700', color: colors.text },
  previewFrame: { overflow: 'hidden', width: '100%', borderRadius: 24, backgroundColor: '#EAF2EE', borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  previewFrameDesktop: { maxWidth: 520, alignSelf: 'center' },
  previewImage: { width: '100%', height: '100%' },
  tagMarker: { position: 'absolute', width: 18, height: 18, marginLeft: -9, marginTop: -9, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 4, borderColor: colors.primary },
  pendingMarker: { position: 'absolute', width: 22, height: 22, marginLeft: -11, marginTop: -11, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 5, borderColor: '#F19A3E' },
  overlayHint: { position: 'absolute', left: 16, right: 16, bottom: 16, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.58)' },
  overlayHintText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  emptyCard: { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: '#EAF2EE' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  emptyText: { fontSize: 14, lineHeight: 21, color: colors.textMuted, textAlign: 'center' },
  input: { minHeight: 48, borderRadius: 14, backgroundColor: colors.background, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text },
  textArea: { minHeight: 160 },
  primaryButton: { alignItems: 'center', justifyContent: 'center', minHeight: 48, borderRadius: 14, backgroundColor: colors.primary },
  primaryButtonText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  tagList: { gap: 10 },
  tagItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 14, borderRadius: 16, backgroundColor: colors.background },
  tagTextWrap: { flex: 1, gap: 4 },
  tagTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  tagSubtitle: { fontSize: 12, color: colors.textMuted },
  removeText: { fontSize: 13, fontWeight: '700', color: '#C24747' },
  visibility: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 14, borderRadius: 16, backgroundColor: colors.background },
  visibilityText: { flex: 1, gap: 4 },
  visibilityTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  submitButton: { alignItems: 'center', justifyContent: 'center', minHeight: 52, borderRadius: 16, backgroundColor: colors.primary },
  submitButtonText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  disabled: { opacity: 0.7 },
});
