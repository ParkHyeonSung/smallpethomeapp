import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor="#F7F8FA" translucent={false} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="login-callback" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="stress-check" />
        <Stack.Screen name="posts/[id]" />
        <Stack.Screen name="posts/edit/[id]" />
      </Stack>
    </SafeAreaProvider>
  );
}
