import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Auth routes - public */}
      <Stack.Screen name="index" />
      <Stack.Screen
        name="login"
        options={{
          presentation: 'card',
          headerShown: false
        }}
      />
      <Stack.Screen
        name="register"
        options={{
          presentation: 'card',
          headerShown: false
        }}
      />
      <Stack.Screen
        name="forgot-password"
        options={{
          presentation: 'card',
          headerShown: false
        }}
      />

      {/* Protected routes - main app */}
      <Stack.Screen
        name="(tabs)"
        options={{
          headerShown: false
        }}
      />
    </Stack>
  );
}
