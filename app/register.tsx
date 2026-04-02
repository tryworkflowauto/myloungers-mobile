import { Ionicons } from '@expo/vector-icons'
import { Link, useRouter } from 'expo-router'
import { useState } from 'react'
import { Alert, Image, ImageBackground, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { supabase } from '../lib/supabase'

export default function RegisterScreen() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordAgain, setPasswordAgain] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleRegister = async () => {
    const name = fullName.trim()
    const mail = email.trim()
    if (!name || !mail || !password) {
      Alert.alert('Hata', 'Lütfen tüm alanları doldurun.')
      return
    }
    if (password !== passwordAgain) {
      Alert.alert('Hata', 'Şifreler eşleşmiyor.')
      return
    }
    setSubmitting(true)
    const { data, error } = await supabase.auth.signUp({ email: mail, password })
    setSubmitting(false)
    if (error) {
      Alert.alert('Hata', error.message)
      return
    }
    const user = data.user
    if (user) {
      const { error: profileError } = await supabase.from('kullanicilar').insert({
        id: user.id,
        ad_soyad: name,
      })
      if (profileError) {
        Alert.alert('Hata', profileError.message)
        return
      }
    }
    Alert.alert('Kayıt', 'Hesabınız oluşturuldu. E-postanızı kontrol edin.', [
      { text: 'Tamam', onPress: () => router.replace('/') },
    ])
  }

  return (
    <ImageBackground source={require('../assets/images/beach-bg.jpg')} style={styles.bg} resizeMode="cover">
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.wrapper}>
          <View style={styles.card}>
            <Image source={require('../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
            <Text style={styles.tagline}>My Loungers Dünyasına</Text>
            <Text style={styles.welcome}>HOŞ GELDİNİZ</Text>
            <Text style={styles.hint}>
              E-posta adresini doğru yazdığın emin olmalısın, onay linki yazdığın adrese gönderilecektir.
            </Text>
            <View style={styles.inputRow}>
              <Ionicons name="person-outline" size={18} color="#3333cc" />
              <TextInput
                placeholder="Ad Soyad"
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                style={styles.input}
              />
            </View>
            <View style={styles.inputRow}>
              <Ionicons name="mail-outline" size={18} color="#3333cc" />
              <TextInput
                placeholder="E-Posta"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
              />
            </View>
            <View style={styles.inputRow}>
              <Ionicons name="lock-closed-outline" size={18} color="#3333cc" />
              <TextInput
                placeholder="Şifre"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                style={styles.input}
              />
            </View>
            <View style={styles.inputRow}>
              <Ionicons name="lock-closed-outline" size={18} color="#3333cc" />
              <TextInput
                placeholder="Şifre (Tekrar)"
                value={passwordAgain}
                onChangeText={setPasswordAgain}
                secureTextEntry
                style={styles.input}
              />
            </View>
            <TouchableOpacity
              onPress={handleRegister}
              disabled={submitting}
              style={[styles.saveBtn, submitting && styles.saveBtnDisabled]}
            >
              <Text style={styles.saveBtnText}>Kaydet</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.loginBelow}>
            <Link href="/" asChild>
              <TouchableOpacity style={styles.loginBtn}>
                <Text style={styles.loginBtnText}>Giriş</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </ImageBackground>
  )
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 6 },
  wrapper: { flex: 1, justifyContent: 'center', paddingBottom: 0, paddingHorizontal: 16, marginHorizontal: 20 },
  card: {
    backgroundColor: 'white',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  logo: { width: 150, height: 90, alignSelf: 'center', marginBottom: 4 },
  tagline: { textAlign: 'center', color: '#3333cc', fontSize: 11, marginBottom: 2 },
  welcome: { textAlign: 'center', color: '#3333cc', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  hint: { textAlign: 'center', color: '#3333cc', fontSize: 11, marginBottom: 6, lineHeight: 14 },
  inputRow: {
    flexDirection: 'row',
    borderWidth: 1.5,
    borderColor: '#3333cc',
    borderRadius: 24,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginBottom: 5,
    alignItems: 'center',
    gap: 6,
  },
  input: { flex: 1, fontSize: 13 },
  saveBtn: {
    alignSelf: 'center',
    borderWidth: 1.5,
    borderColor: '#3333cc',
    borderRadius: 24,
    paddingHorizontal: 36,
    paddingVertical: 5,
    marginTop: 2,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#3333cc', fontWeight: '600', fontSize: 13 },
  loginBelow: { alignItems: 'center', marginTop: 8 },
  loginBtn: { backgroundColor: '#3333cc', borderRadius: 24, paddingHorizontal: 28, paddingVertical: 7 },
  loginBtnText: { color: 'white', fontWeight: '600', fontSize: 13 },
})
