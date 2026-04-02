import { Ionicons } from '@expo/vector-icons'
import { Link, useRouter } from 'expo-router'
import { useState } from 'react'
import { Alert, Image, ImageBackground, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useAuthLocale } from '../lib/auth-locale-context'
import { supabase } from '../lib/supabase'

export default function ForgotPasswordScreen() {
  const router = useRouter()
  const { lang, setLang, t } = useAuthLocale()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSend = async () => {
    const mail = email.trim()
    if (!mail) {
      Alert.alert(t.common.errorTitle, t.forgot.alertEnterEmail)
      return
    }
    setSubmitting(true)
    const { error } = await supabase.auth.resetPasswordForEmail(mail)
    setSubmitting(false)
    if (error) {
      Alert.alert(t.common.errorTitle, error.message)
      return
    }
    Alert.alert(t.forgot.alertSentTitle, t.forgot.alertSentBody, [
      { text: t.common.ok, onPress: () => router.replace('/') },
    ])
  }

  return (
    <ImageBackground source={require('../assets/images/beach-bg.jpg')} style={styles.bg} resizeMode="cover">
      <View style={styles.wrapper}>
        <View style={styles.card}>
          <Image source={require('../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 8, gap: 12 }}>
            <TouchableOpacity onPress={() => setLang('tr')}>
              <Text style={{ fontSize: 12, color: lang === 'tr' ? '#3333cc' : '#aaaaaa', fontWeight: lang === 'tr' ? '700' : '600' }}>{t.forgot.langTr}</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 12, color: '#aaaaaa' }}>|</Text>
            <TouchableOpacity onPress={() => setLang('en')}>
              <Text style={{ fontSize: 12, color: lang === 'en' ? '#3333cc' : '#aaaaaa', fontWeight: lang === 'en' ? '700' : '600' }}>{t.forgot.langEn}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.title}>{t.forgot.title}</Text>
          <Text style={styles.hint}>
            {t.forgot.hint}
          </Text>
          <View style={styles.inputRow}>
            <Ionicons name="mail-outline" size={22} color="#3333cc" />
            <TextInput
              placeholder={t.forgot.placeholderEmail}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.input}
            />
          </View>
          <TouchableOpacity
            onPress={handleSend}
            disabled={submitting}
            style={[styles.sendBtn, submitting && styles.sendBtnDisabled]}
          >
            <Text style={styles.sendBtnText}>{t.forgot.send}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.backWrapper}>
          <Link href="/" asChild>
            <TouchableOpacity style={styles.backBtn}>
              <Text style={styles.backBtnText}>{t.forgot.backToLogin}</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    </ImageBackground>
  )
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  wrapper: { flex: 1, justifyContent: 'center', paddingBottom: 0, marginHorizontal: 28 },
  card: {
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  logo: { width: 240, height: 145, alignSelf: 'center', marginBottom: 8 },
  title: { textAlign: 'center', color: '#3333cc', fontSize: 20, fontWeight: '700', marginBottom: 10 },
  hint: { textAlign: 'center', color: '#3333cc', fontSize: 14, marginBottom: 14, lineHeight: 20 },
  inputRow: {
    flexDirection: 'row',
    borderWidth: 1.5,
    borderColor: '#3333cc',
    borderRadius: 30,
    paddingHorizontal: 12,
    paddingVertical: 3,
    marginBottom: 10,
    alignItems: 'center',
    gap: 10,
  },
  input: { flex: 1, fontSize: 15 },
  sendBtn: {
    alignSelf: 'center',
    borderWidth: 1.5,
    borderColor: '#3333cc',
    borderRadius: 30,
    paddingHorizontal: 48,
    paddingVertical: 8,
    marginTop: 4,
  },
  sendBtnDisabled: { opacity: 0.6 },
  sendBtnText: { color: '#3333cc', fontWeight: '600', fontSize: 15 },
  backWrapper: { alignItems: 'center', marginTop: 14 },
  backBtn: { backgroundColor: '#3333cc', borderRadius: 30, paddingHorizontal: 28, paddingVertical: 10 },
  backBtnText: { color: 'white', fontWeight: '600', fontSize: 15 },
})
