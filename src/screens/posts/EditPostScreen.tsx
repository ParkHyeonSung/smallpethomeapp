import UploadScreen from '@/src/screens/upload/UploadScreen';

type EditPostScreenProps = {
  postId?: string;
};

export default function EditPostScreen({ postId }: EditPostScreenProps) {
  return <UploadScreen editPostId={postId} />;
}
