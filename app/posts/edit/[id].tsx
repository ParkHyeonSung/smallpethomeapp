import { useLocalSearchParams } from 'expo-router';

import EditPostScreen from '@/src/screens/posts/EditPostScreen';

export default function EditPostPage() {
  const params = useLocalSearchParams<{ id: string }>();
  const postId = Array.isArray(params.id) ? params.id[0] : params.id;

  return <EditPostScreen postId={postId} />;
}
