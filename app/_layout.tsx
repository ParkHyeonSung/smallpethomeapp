import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" backgroundColor="#F5F1E8" translucent={false} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="login-callback" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="stress-check" />
        <Stack.Screen name="posts/[id]" />
        <Stack.Screen name="posts/edit/[id]" />
      </Stack>
    </>
  );
}
