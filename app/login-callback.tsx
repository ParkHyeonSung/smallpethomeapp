import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export default function LoginCallbackPage() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#4A7C59" />
      <Text style={styles.text}>Completing sign-in...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#F8FAF7',
  },
  text: {
    fontSize: 16,
    color: '#35523F',
    fontWeight: '600',
  },
});
