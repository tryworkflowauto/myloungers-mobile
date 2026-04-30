import { AuthLocaleProvider } from '../lib/auth-locale-context'
import { useEffect, useState } from 'react'
import { router } from 'expo-router'
import { Stack } from 'expo-router'
import { supabase } from '../lib/supabase'
import SplashScreen from '../components/SplashScreen'

export default function RootLayout() {
  const [showSplash, setShowSplash] = useState(true)
  const [splashMounted, setSplashMounted] = useState(true)

  useEffect(() => {
    // 2.5 saniye sonra fade-out başlat
    const timer = setTimeout(() => setShowSplash(false), 2500)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    // Auth state değişikliklerini dinle
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[Auth Event]', event)

        if (event === 'TOKEN_REFRESHED' && !session) {
          await supabase.auth.signOut()
          router.replace('/giris')
          return
        }

        if (event === 'SIGNED_OUT') {
          router.replace('/giris')
          return
        }
      },
    )

    // İlk açılışta mevcut session'ı kontrol et
    async function checkInitialSession() {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()

        if (error) {
          console.log('[Session Error]', error.message)
          if (
            error.message?.toLowerCase().includes('refresh') ||
            error.message?.toLowerCase().includes('token')
          ) {
            await supabase.auth.signOut()
            router.replace('/giris')
          }
        }
      } catch (err: any) {
        console.log('[Initial Session Check Error]', err?.message)
        if (
          err?.message?.toLowerCase().includes('refresh') ||
          err?.message?.toLowerCase().includes('token')
        ) {
          try { await supabase.auth.signOut() } catch {}
          router.replace('/giris')
        }
      }
    }

    checkInitialSession()

    return () => {
      subscription?.unsubscribe()
    }
  }, [])

  return (
    <AuthLocaleProvider>
      {/* Stack yalnızca splash tamamen bittikten sonra mount edilir */}
      {!splashMounted && (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="register" options={{ headerShown: false }} />
          <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      )}

      {/* Splash: fade-out tamamlanınca unmount edilir */}
      {splashMounted && (
        <SplashScreen
          visible={showSplash}
          onAnimationEnd={() => setSplashMounted(false)}
        />
      )}
    </AuthLocaleProvider>
  )
}
