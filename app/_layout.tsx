import { useEffect, useState } from 'react'
import { router } from 'expo-router'
import { Stack } from 'expo-router'
import {
  authErrorToDiagnosticString,
  isStaleRefreshTokenLikeAuthDiagnostic,
  signOutStaleSessionQuietly,
} from '../lib/authStaleSession'
import { supabase } from '../lib/supabase'
import SplashScreen from '../components/SplashScreen'
import initI18n from '../lib/i18n'

export default function RootLayout() {
  const [showSplash, setShowSplash] = useState(true)
  const [splashMounted, setSplashMounted] = useState(true)
  const [i18nReady, setI18nReady] = useState(false)

  // i18n init — genelde <500ms, splash (2500ms) bitmeden tamamlanır
  useEffect(() => {
    initI18n().then(() => setI18nReady(true)).catch(() => setI18nReady(true))
  }, [])

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
          await signOutStaleSessionQuietly()
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
          const diag = authErrorToDiagnosticString(error)
          if (isStaleRefreshTokenLikeAuthDiagnostic(diag)) {
            await signOutStaleSessionQuietly()
            router.replace('/giris')
            return
          }
          console.log('[Session Error]', error.message)
        }
      } catch (err: unknown) {
        const diag = authErrorToDiagnosticString(err)
        if (isStaleRefreshTokenLikeAuthDiagnostic(diag)) {
          await signOutStaleSessionQuietly()
          router.replace('/giris')
          return
        }
        console.log('[Initial Session Check Error]', diag)
      }
    }

    checkInitialSession()

    return () => {
      subscription?.unsubscribe()
    }
  }, [])

  return (
    <>
      {/* Stack yalnızca splash tamamen bitip i18n yüklendikten sonra mount edilir */}
      {!splashMounted && i18nReady && (
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
    </>
  )
}
