import { Ionicons } from '@expo/vector-icons'
import { Link, useRouter } from 'expo-router'
import { useState } from 'react'
import { Alert, Image, ImageBackground, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { changeLanguage } from '../lib/i18n'
import { supabase } from '../lib/supabase'

const LEGAL_URLS = {
  terms: 'https://myloungers.com/kullanim-kosullari',
  kvkk: 'https://myloungers.com/kvkk',
} as const

export default function RegisterScreen() {
  const router = useRouter()
  const { t, i18n } = useTranslation()
  const isTr = i18n.language.startsWith('tr')
  const isEn = i18n.language.startsWith('en')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordAgain, setPasswordAgain] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  const handleRegister = async () => {
    if (!acceptedTerms) return
    const name = fullName.trim()
    const mail = email.trim()
    if (!name || !mail || !password) {
      Alert.alert(t('common.errorTitle'), t('register.alertFillAll'))
      return
    }
    if (password !== passwordAgain) {
      Alert.alert(t('common.errorTitle'), t('register.alertPasswordMismatch'))
      return
    }
    setSubmitting(true)
    const { data, error } = await supabase.auth.signUp({ email: mail, password })
    setSubmitting(false)
    if (error) {
      Alert.alert(t('common.errorTitle'), error.message)
      return
    }
    const user = data.user
    if (user) {
      const { error: profileError } = await supabase.from('kullanicilar').insert({
        id: user.id,
        ad_soyad: name,
      })
      if (profileError) {
        Alert.alert(t('common.errorTitle'), profileError.message)
        return
      }
    }
    Alert.alert(t('register.alertRegisterTitle'), t('register.alertRegisterBody'), [
      { text: t('common.ok'), onPress: () => router.replace('/') },
    ])
  }

  return (
    <ImageBackground source={require('../assets/images/beach-bg.jpg')} style={styles.bg} resizeMode="cover">
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.wrapper}>
          <View style={styles.card}>
            <Image source={require('../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 8, gap: 12 }}>
              <TouchableOpacity onPress={() => { void changeLanguage('tr') }}>
                <Text style={{ fontSize: 12, color: isTr ? '#3333cc' : '#aaaaaa', fontWeight: isTr ? '700' : '600' }}>{t('register.langTr')}</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 12, color: '#aaaaaa' }}>|</Text>
              <TouchableOpacity onPress={() => { void changeLanguage('en') }}>
                <Text style={{ fontSize: 12, color: isEn ? '#3333cc' : '#aaaaaa', fontWeight: isEn ? '700' : '600' }}>{t('register.langEn')}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.tagline}>{t('register.tagline')}</Text>
            <Text style={styles.welcome}>{t('register.welcome')}</Text>
            <Text style={styles.hint}>
              {t('register.hint')}
            </Text>
            <View style={styles.inputRow}>
              <Ionicons name="person-outline" size={18} color="#3333cc" />
              <TextInput
                placeholder={t('register.placeholderName')}
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                style={styles.input}
              />
            </View>
            <View style={styles.inputRow}>
              <Ionicons name="mail-outline" size={18} color="#3333cc" />
              <TextInput
                placeholder={t('register.placeholderEmail')}
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
                placeholder={t('register.placeholderPassword')}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                style={styles.input}
              />
            </View>
            <View style={styles.inputRow}>
              <Ionicons name="lock-closed-outline" size={18} color="#3333cc" />
              <TextInput
                placeholder={t('register.placeholderPasswordAgain')}
                value={passwordAgain}
                onChangeText={setPasswordAgain}
                secureTextEntry
                style={styles.input}
              />
            </View>
            <View style={styles.termsRow}>
              <TouchableOpacity
                style={[styles.termsCheckbox, acceptedTerms && styles.termsCheckboxChecked]}
                activeOpacity={0.85}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: acceptedTerms }}
                onPress={() => setAcceptedTerms((v) => !v)}
              >
                {acceptedTerms ? <Ionicons name="checkmark" size={14} color="#0ABAB5" /> : null}
              </TouchableOpacity>
              <Text style={styles.termsLegalText} accessibilityRole="text">
                {t('register.terms_text_prefix')}
                <Text
                  onPress={() => {
                    void Linking.openURL(LEGAL_URLS.terms)
                  }}
                  style={styles.termsLink}
                >
                  {t('register.terms_link')}
                </Text>
                {t('register.terms_text_between')}
                <Text
                  onPress={() => {
                    void Linking.openURL(LEGAL_URLS.kvkk)
                  }}
                  style={styles.termsLink}
                >
                  {t('register.kvkk_link')}
                </Text>
                {t('register.terms_text_suffix')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleRegister}
              disabled={submitting || !acceptedTerms}
              style={[styles.saveBtn, (submitting || !acceptedTerms) && styles.saveBtnDisabled]}
            >
              <Text style={styles.saveBtnText}>{t('register.save')}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.loginBelow}>
            <Link href="/" asChild>
              <TouchableOpacity style={styles.loginBtn}>
                <Text style={styles.loginBtnText}>{t('register.backToLogin')}</Text>
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
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
    marginTop: 4,
    paddingHorizontal: 2,
  },
  termsCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  termsCheckboxChecked: {
    borderColor: '#94a3b8',
  },
  termsLegalText: {
    flex: 1,
    fontSize: 12,
    color: '#3333cc',
    lineHeight: 18,
  },
  termsLink: {
    fontSize: 12,
    color: '#0ABAB5',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
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
