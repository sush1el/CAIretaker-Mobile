import { Stack } from 'expo-router';

export default function TabsLayout() {
  // This could be enhanced with authentication checks
  // For now, it's a simple container for the main app
  
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
