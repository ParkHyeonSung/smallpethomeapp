import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/src/constants/colors';

export default function LoginCallbackPage() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.text}>로그인 정보를 확인하는 중입니다...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: colors.background,
    padding: 24,
  },
  text: {
    fontSize: 15,
    color: colors.textMuted,
  },
});
