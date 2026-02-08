import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* This points to app/index.js (which renders your Login page).
        We hide the header so the login screen looks clean.
      */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}