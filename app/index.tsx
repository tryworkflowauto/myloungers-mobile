import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin'
import * as AppleAuthentication from 'expo-apple-authentication'
import * as Crypto from 'expo-crypto'
import { Link, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Image, ImageBackground, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useAuthLocale } from '../lib/auth-locale-context'
import { supabase } from '../lib/supabase'

function mapLoginError(rawMsg: string, tLogin: { loginErrInvalidCredentials: string; loginErrEmailNotConfirmed: string; loginErrUserNotFound: string; loginErrDefault: string }): string {
  const lower = rawMsg.toLowerCase()
  if (lower.includes('invalid login credentials') || lower.includes('invalid email or password') || lower.includes('wrong password')) {
    return tLogin.loginErrInvalidCredentials
  }
  if (lower.includes('email not confirmed') || lower.includes('email address not confirmed')) {
    return tLogin.loginErrEmailNotConfirmed
  }
  if (lower.includes('user not found') || lower.includes('no user found')) {
    return tLogin.loginErrUserNotFound
  }
  return tLogin.loginErrDefault
}

export default function LoginScreen() {
  const router = useRouter()
  const { lang, setLang, t } = useAuthLocale()

  // i18n test — sadece doğrulama için, üretimde kaldırılacak
  const { t: ti18n } = useTranslation()
  console.log('[i18n test] auth.login =>', ti18n('auth.login'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginErrVisible, setLoginErrVisible] = useState(false)
  const [loginErrMsg, setLoginErrMsg] = useState('')
  const [googleLoading, setGoogleLoading] = useState(false)
  const [appleLoading, setAppleLoading] = useState(false)

  // Android: Google Sign-In yapılandırması
  useEffect(() => {
    if (Platform.OS !== 'ios') {
      GoogleSignin.configure({
        webClientId: '891007758452-eg3vit8jhh61h7tl0tappumb0a4a08tu.apps.googleusercontent.com',
        offlineAccess: true,
        scopes: ['profile', 'email'],
      })
    }
  }, [])

  // ── iOS: Apple ile Giriş ──────────────────────────────────────────────────
  const handleAppleLogin = async () => {
    if (appleLoading) return
    setAppleLoading(true)
    try {
      // Nonce: Apple Sign-In nonce'u tam olarak destekler.
      // rawNonce → SHA-256 HEX hash → Apple'a ver → Supabase rawNonce'u alır,
      // kendi hash'ini hesaplar, token içindekiyle karşılaştırır.
      const rawNonce = Crypto.randomUUID()
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
        { encoding: Crypto.CryptoEncoding.HEX },
      )

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      })

      if (!credential.identityToken) throw new Error('Apple identity token alınamadı')

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      })
      if (error) throw error

      // kullanicilar tablosunda kayıt yoksa oluştur
      const { data: existing } = await supabase
        .from('kullanicilar')
        .select('id')
        .eq('id', data.user.id)
        .maybeSingle()

      if (!existing) {
        // Apple sadece ilk girişte ad/soyad ve email verir
        const ad = credential.fullName?.givenName || data.user.email?.split('@')[0] || 'Kullanıcı'
        const soyad = credential.fullName?.familyName || ''
        const userEmail = credential.email || data.user.email || ''
        await supabase.from('kullanicilar').insert({
          id: data.user.id,
          ad,
          soyad,
          email: userEmail,
          rol: 'musteri',
        })
      }

      router.replace('/(tabs)')
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string }
      // ERR_REQUEST_CANCELED: kullanıcı iptal etti
      if (err.code === 'ERR_REQUEST_CANCELED') return
      Alert.alert('Hata', err.message || 'Apple ile giriş başarısız')
    } finally {
      setAppleLoading(false)
    }
  }

  // ── Android: Google ile Giriş ─────────────────────────────────────────────
  const handleGoogleLogin = async () => {
    if (googleLoading) return
    setGoogleLoading(true)
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
      const userInfo = await GoogleSignin.signIn()
      const idToken = (userInfo as any).idToken ?? (userInfo as any).data?.idToken
      if (!idToken) throw new Error('Google ID token alınamadı')

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      })
      if (error) throw error

      // kullanicilar tablosunda kayıt yoksa oluştur
      const { data: existing } = await supabase
        .from('kullanicilar')
        .select('id')
        .eq('id', data.user.id)
        .maybeSingle()

      if (!existing) {
        const fullName = (data.user.user_metadata?.full_name as string | undefined) ?? ''
        const parts = fullName.trim().split(' ')
        const ad = parts[0] || data.user.email?.split('@')[0] || 'Kullanıcı'
        const soyad = parts.slice(1).join(' ')
        await supabase.from('kullanicilar').insert({
          id: data.user.id,
          ad,
          soyad,
          email: data.user.email,
          rol: 'musteri',
        })
      }

      router.replace('/(tabs)')
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string }
      if (err.code === statusCodes.SIGN_IN_CANCELLED) return
      if (err.code === statusCodes.IN_PROGRESS) return
      Alert.alert('Hata', err.message || 'Google ile giriş başarısız')
    } finally {
      setGoogleLoading(false)
    }
  }

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      setLoginErrMsg(mapLoginError(error.message, t.login))
      setLoginErrVisible(true)
      return
    }
    router.replace('/(tabs)')
  }

  return (
    <ImageBackground source={require('../assets/images/beach-bg.jpg')} style={styles.bg} resizeMode="cover">
      <View style={styles.wrapper}>
        <View style={styles.card}>
          <Image source={require('../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 8, gap: 12 }}>
            <TouchableOpacity onPress={() => setLang('tr')}>
              <Text style={{ fontSize: 12, color: lang === 'tr' ? '#3333cc' : '#aaaaaa', fontWeight: lang === 'tr' ? '700' : '600' }}>{t.login.langTr}</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 12, color: '#aaaaaa' }}>|</Text>
            <TouchableOpacity onPress={() => setLang('en')}>
              <Text style={{ fontSize: 12, color: lang === 'en' ? '#3333cc' : '#aaaaaa', fontWeight: lang === 'en' ? '700' : '600' }}>{t.login.langEn}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.inputRow}>
            <Ionicons name="person-circle-outline" size={22} color="#3333cc" />
            <TextInput placeholder={t.login.placeholderEmail} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" style={styles.input} />
          </View>
          <View style={styles.inputRow}>
            <Ionicons name="lock-closed-outline" size={22} color="#3333cc" />
            <TextInput placeholder={t.login.placeholderPassword} value={password} onChangeText={setPassword} secureTextEntry style={styles.input} />
          </View>
          <View style={styles.buttonRow}>
            <TouchableOpacity onPress={handleLogin} style={styles.loginBtn}>
              <Text style={styles.loginBtnText}>{t.login.login}</Text>
            </TouchableOpacity>
            <Link href="/register" style={styles.registerBtn}>
              <Text style={styles.registerBtnText}>{t.login.createAccount}</Text>
            </Link>
          </View>

          {/* iOS: Apple ile Giriş — Android: Google ile Giriş */}
          {Platform.OS === 'ios' ? (
            <TouchableOpacity
              style={[styles.googleBtn, appleLoading && { opacity: 0.7 }]}
              activeOpacity={0.85}
              disabled={appleLoading}
              onPress={() => void handleAppleLogin()}
            >
              {appleLoading ? (
                <ActivityIndicator size="small" color="#000000" style={{ marginRight: 8 }} />
              ) : (
                <Ionicons name="logo-apple" size={18} color="#000000" style={{ marginRight: 8 }} />
              )}
              <Text style={styles.googleBtnText}>Apple ile Giriş</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.googleBtn, googleLoading && { opacity: 0.7 }]}
              activeOpacity={0.85}
              disabled={googleLoading}
              onPress={() => void handleGoogleLogin()}
            >
              {googleLoading ? (
                <ActivityIndicator size="small" color="#4285F4" style={{ marginRight: 8 }} />
              ) : (
                <Image source={{ uri: 'https://www.google.com/favicon.ico' }} style={{ width: 18, height: 18, marginRight: 8 }} />
              )}
              <Text style={styles.googleBtnText}>{t.login.googleSignIn}</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.forgotWrapper}>
          <Link href="/forgot-password" style={styles.forgotBtn}>
            <Text style={styles.forgotBtnText}>{t.login.forgotPassword}</Text>
          </Link>
        </View>
      </View>

      {/* ── Giriş hatası custom modal ── */}
      <Modal visible={loginErrVisible} animationType="fade" transparent statusBarTranslucent>
        <View style={styles.errBackdrop}>
          <View style={styles.errCard}>
            <Text style={styles.errIcon}>🔒</Text>
            <Text style={styles.errTitle}>{t.login.loginErrTitle}</Text>
            <Text style={styles.errMsg}>{loginErrMsg}</Text>
            <TouchableOpacity
              style={styles.errBtn}
              activeOpacity={0.85}
              onPress={() => setLoginErrVisible(false)}
            >
              <Text style={styles.errBtnText}>{t.login.loginErrOk}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  )
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  wrapper: { flex: 1, justifyContent: 'center', paddingBottom: 0, marginHorizontal: 28 },
  card: { backgroundColor: 'white', paddingHorizontal: 20, paddingVertical: 12, borderTopLeftRadius: 40, borderTopRightRadius: 40, borderBottomLeftRadius: 40, borderBottomRightRadius: 40 },
  langRow: { position: 'absolute', top: 52, right: 16, zIndex: 2, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  langBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  langBtnText: { fontSize: 12, color: '#3333cc', fontWeight: '600' },
  langSep: { color: '#3333cc', fontSize: 12 },
  logo: { width: 240, height: 145, alignSelf: 'center', marginBottom: 8 },
  inputRow: { flexDirection: 'row', borderWidth: 1.5, borderColor: '#3333cc', borderRadius: 30, paddingHorizontal: 12, paddingVertical: 3, marginBottom: 10, alignItems: 'center', gap: 10 },
  input: { flex: 1, fontSize: 15 },
  registerText: { textAlign: 'center', color: '#3333cc', marginBottom: 10, fontSize: 14 },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10 },
  loginBtn: { borderWidth: 1.5, borderColor: '#0ABAB5', borderRadius: 30, paddingHorizontal: 36, paddingVertical: 4 },
  loginBtnText: { color: '#0ABAB5', fontWeight: '600', fontSize: 15 },
  registerBtn: { borderWidth: 1.5, borderColor: '#F5821F', borderRadius: 30, paddingHorizontal: 24, paddingVertical: 4 },
  registerBtnText: { color: '#F5821F', fontWeight: '600', fontSize: 15 },
  googleBtn: { flexDirection: 'row', borderWidth: 1.5, borderColor: '#dddddd', borderRadius: 30, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', marginTop: 12, backgroundColor: 'white' },
  googleBtnText: { color: '#333333', fontWeight: '600', fontSize: 16 },
  forgotWrapper: { alignItems: 'flex-end', paddingHorizontal: 20, marginTop: 10 },
  forgotBtn: { backgroundColor: '#3333cc', borderRadius: 30, paddingHorizontal: 18, paddingVertical: 8 },
  forgotBtnText: { color: 'white', fontWeight: '600', fontSize: 13, textTransform: 'capitalize' },
  errBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  errCard: { backgroundColor: '#fff', borderRadius: 16, paddingVertical: 28, paddingHorizontal: 24, alignItems: 'center', width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 10 },
  errIcon: { fontSize: 36, marginBottom: 10 },
  errTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a', marginBottom: 10 },
  errMsg: { fontSize: 14, color: '#475569', textAlign: 'center', lineHeight: 22, marginBottom: 22 },
  errBtn: { backgroundColor: '#0ABAB5', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 40 },
  errBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
})
