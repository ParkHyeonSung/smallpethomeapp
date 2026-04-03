import { Pressable, StyleSheet, Text, View } from 'react-native';

import AppHeader from '@/src/components/common/AppHeader';
import ScreenContainer from '@/src/components/common/ScreenContainer';
import { colors } from '@/src/constants/colors';

export default function UploadScreen() {
  return (
    <ScreenContainer scroll>
      <AppHeader
        title="게시글 업로드"
        subtitle="사진, 설명, 제품 태그를 추가하는 작성 화면의 기본 구조입니다."
      />

      <View style={styles.imageBox}>
        <Text style={styles.imageBoxText}>이미지 선택 영역</Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.label}>게시글 설명</Text>
        <View style={styles.inputPlaceholder}>
          <Text style={styles.placeholderText}>내용 입력 영역</Text>
        </View>

        <Text style={styles.label}>제품 태그</Text>
        <View style={styles.inputPlaceholder}>
          <Text style={styles.placeholderText}>태그 추가 영역</Text>
        </View>

        <Pressable style={styles.submitButton}>
          <Text style={styles.submitButtonText}>업로드하기</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  imageBox: {
    height: 220,
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
    color: colors.textMuted,
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
  inputPlaceholder: {
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: colors.background,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  placeholderText: {
    fontSize: 14,
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
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
