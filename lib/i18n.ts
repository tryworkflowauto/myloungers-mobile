import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import * as SecureStore from 'expo-secure-store'
import { NativeModules, Platform } from 'react-native'

import tr from '../locales/tr.json'
import en from '../locales/en.json'

const LANGUAGE_KEY = 'myloungers_language'

const getDeviceLang = (): string => {
  try {
    let locale = 'tr'
    if (Platform.OS === 'ios') {
      const settings = NativeModules.SettingsManager?.settings as
        | { AppleLocale?: string; AppleLanguages?: string[] }
        | undefined
      locale = settings?.AppleLocale ?? settings?.AppleLanguages?.[0] ?? 'tr'
    } else if (Platform.OS === 'android') {
      const id =
        (NativeModules.I18nManager as { localeIdentifier?: string } | undefined)?.localeIdentifier
      locale = id ?? 'tr'
    }
    return locale.toLowerCase().substring(0, 2)
  } catch {
    return 'tr'
  }
}

const initI18n = async () => {
  let savedLang: string | null = null
  try {
    savedLang = await SecureStore.getItemAsync(LANGUAGE_KEY)
  } catch {}

  let lang = savedLang
  if (!lang) {
    const deviceLang = getDeviceLang()
    lang = deviceLang === 'tr' ? 'tr' : 'en'
  }

  await i18n
    .use(initReactI18next)
    .init({
      resources: {
        tr: { translation: tr },
        en: { translation: en },
      },
      lng: lang,
      fallbackLng: 'tr',
      interpolation: { escapeValue: false },
    })

  return i18n
}

export const changeLanguage = async (lang: 'tr' | 'en') => {
  await i18n.changeLanguage(lang)
  try {
    await SecureStore.setItemAsync(LANGUAGE_KEY, lang)
  } catch {}
}

export default initI18n
