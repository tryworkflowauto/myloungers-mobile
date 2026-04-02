import { AuthLocaleProvider } from '../lib/auth-locale-context'
import { Stack } from 'expo-router'
export default function RootLayout() {
  return (
    <AuthLocaleProvider>
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ headerShown: false }} />
      <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
    </AuthLocaleProvider>
  )
}
