import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from '@/src/constants/colors';
import { CommentItem } from '@/src/lib/comments';

type CommentRowProps = {
  comment: CommentItem;
  currentUserId: string | null;
  editingCommentId: string | null;
  editingCommentDraft: string;
  isSubmittingCommentEdit: boolean;
  menuCommentId: string | null;
  onChangeEditDraft: (value: string) => void;
  onCancelEdit: () => void;
  onOpenActions: (comment: CommentItem) => void;
  onSaveEdit: () => void;
  onStartEdit: (comment: CommentItem) => void;
  onDelete: (commentId: string) => void;
  formatDate: (value: string) => string;
};

export default function CommentRow({
  comment,
  currentUserId,
  editingCommentId,
  editingCommentDraft,
  isSubmittingCommentEdit,
  menuCommentId,
  onChangeEditDraft,
  onCancelEdit,
  onOpenActions,
  onSaveEdit,
  onStartEdit,
  onDelete,
  formatDate,
}: CommentRowProps) {
  const isOwner = currentUserId === comment.user_id;
  const isEditing = editingCommentId === comment.id;

  if (isEditing) {
    return (
      <View style={styles.commentCard}>
        <Text style={styles.commentAuthor}>{comment.profiles?.nickname ?? '사용자'}</Text>
        <View style={styles.commentEditRow}>
          <TextInput
            value={editingCommentDraft}
            onChangeText={onChangeEditDraft}
            placeholder="댓글을 수정하세요."
            placeholderTextColor={colors.textMuted}
            style={styles.commentEditInput}
          />
          <Pressable
            style={[styles.commentMiniButton, isSubmittingCommentEdit && styles.disabled]}
            onPress={() => void onSaveEdit()}
            disabled={isSubmittingCommentEdit}>
            <Text style={styles.commentMiniButtonText}>
              {isSubmittingCommentEdit ? '저장 중' : '저장'}
            </Text>
          </Pressable>
        </View>
        <Pressable onPress={onCancelEdit}>
          <Text style={styles.commentCancelText}>취소</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable style={styles.commentCard} onLongPress={() => onOpenActions(comment)} delayLongPress={250}>
      <View style={styles.commentTopRow}>
        <View style={styles.commentMain}>
          <Text style={styles.commentAuthor}>{comment.profiles?.nickname ?? '사용자'}</Text>
          <Text style={styles.commentContent}>{comment.content}</Text>
        </View>
        {isOwner ? (
          <Pressable onPress={() => onOpenActions(comment)} hitSlop={10}>
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.commentMetaRow}>
        <Text style={styles.commentMetaText}>{formatDate(comment.created_at)}</Text>
        <Pressable>
          <Text style={styles.commentMetaAction}>답글 달기</Text>
        </Pressable>
      </View>

      {isOwner && menuCommentId === comment.id ? (
        <View style={styles.commentMenu}>
          <Pressable onPress={() => onStartEdit(comment)}>
            <Text style={styles.commentActionText}>수정</Text>
          </Pressable>
          <Pressable onPress={() => onDelete(comment.id)}>
            <Text style={styles.commentDeleteText}>삭제</Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  commentCard: {
    gap: 8,
  },
  commentTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  commentMain: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  commentContent: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    color: colors.text,
  },
  commentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  commentMetaText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  commentMetaAction: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  commentMenu: {
    flexDirection: 'row',
    gap: 14,
  },
  commentActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  commentDeleteText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#C24747',
  },
  commentEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  commentEditInput: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  commentMiniButton: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  commentMiniButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  commentCancelText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  disabled: {
    opacity: 0.7,
  },
});
