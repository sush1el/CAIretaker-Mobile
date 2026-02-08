import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      {/* Add this line to handle the new page */}
      <Stack.Screen 
        name="forgot-password" 
        options={{ 
          presentation: 'card', // Makes it slide up/in nicely
          headerShown: false 
        }} 
      />
    </Stack>
  );
}