import { Ionicons } from '@expo/vector-icons'
import { Link, useRouter } from 'expo-router'
import { useState } from 'react'
import { Alert, Image, ImageBackground, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { supabase } from '../lib/supabase'

export default function LoginScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) { Alert.alert('Hata', error.message); return }
    router.replace('/(tabs)')
  }

  return (
    <ImageBackground source={require('../assets/images/beach-bg.jpg')} style={styles.bg} resizeMode="cover">
      <View style={styles.wrapper}>
        <View style={styles.card}>
          <Image source={require('../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 8, gap: 12 }}>
            <TouchableOpacity>
              <Text style={{ fontSize: 12, color: '#3333cc', fontWeight: '700' }}>🇹🇷 Türkçe</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 12, color: '#aaaaaa' }}>|</Text>
            <TouchableOpacity>
              <Text style={{ fontSize: 12, color: '#aaaaaa', fontWeight: '600' }}>🇬🇧 English</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.inputRow}>
            <Ionicons name="person-circle-outline" size={22} color="#3333cc" />
            <TextInput placeholder="Username / E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" style={styles.input} />
          </View>
          <View style={styles.inputRow}>
            <Ionicons name="lock-closed-outline" size={22} color="#3333cc" />
            <TextInput placeholder="******" value={password} onChangeText={setPassword} secureTextEntry style={styles.input} />
          </View>
          <Text style={styles.registerText}>{`Hen\u00FCz hesab\u0131n yok mu?`}</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity onPress={handleLogin} style={styles.loginBtn}>
              <Text style={styles.loginBtnText}>{`Giri\u015F`}</Text>
            </TouchableOpacity>
            <Link href="/(tabs)" style={styles.registerBtn}>
              <Text style={styles.registerBtnText}>{`Hesap Olu\u015Ftur`}</Text>
            </Link>
          </View>
          <TouchableOpacity style={styles.googleBtn}>
            <Image source={{ uri: 'https://www.google.com/favicon.ico' }} style={{ width: 18, height: 18, marginRight: 8 }} />
            <Text style={styles.googleBtnText}>{`Google ile Giri\u015F`}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.forgotWrapper}>
          <Link href="/" style={styles.forgotBtn}>
            <Text style={styles.forgotBtnText}>{`\u015Fifremi Unuttum`}</Text>
          </Link>
        </View>
      </View>
    </ImageBackground>
  )
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  wrapper: { flex: 1, justifyContent: 'center', paddingBottom: 0 },
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
})