import { AuthLocaleProvider } from '../lib/auth-locale-context'
import { useEffect } from "react";
import { router } from "expo-router";
import { Stack } from 'expo-router'
import { supabase } from "../lib/supabase";
export default function RootLayout() {
  useEffect(() => {
    // Auth state değişikliklerini dinle
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log("[Auth Event]", event);
        
        // Token refresh başarısız oldu veya kullanıcı çıkış yaptı
        if (event === "TOKEN_REFRESHED" && !session) {
          // Yenileme başarısız → login'e yönlendir
          await supabase.auth.signOut();
          router.replace("/giris");
          return;
        }
        
        if (event === "SIGNED_OUT") {
          router.replace("/giris");
          return;
        }
      }
    );
    
    // İlk açılışta mevcut session'ı kontrol et
    async function checkInitialSession() {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.log("[Session Error]", error.message);
          // Refresh token hatası varsa temizle
          if (error.message?.toLowerCase().includes("refresh") || 
              error.message?.toLowerCase().includes("token")) {
            await supabase.auth.signOut();
            router.replace("/giris");
          }
        }
      } catch (err: any) {
        console.log("[Initial Session Check Error]", err?.message);
        // Herhangi bir auth hatası → temizle ve login'e
        if (err?.message?.toLowerCase().includes("refresh") || 
            err?.message?.toLowerCase().includes("token")) {
          try { await supabase.auth.signOut(); } catch {}
          router.replace("/giris");
        }
      }
    }
    
    checkInitialSession();
    
    return () => {
      subscription?.unsubscribe();
    };
  }, []);

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
