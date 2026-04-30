import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import * as Localization from 'expo-localization'
import AsyncStorage from '@react-native-async-storage/async-storage'

import tr from '../locales/tr.json'
import en from '../locales/en.json'

const LANGUAGE_KEY = '@myloungers_language'

const initI18n = async () => {
  let savedLang: string | null = null
  try {
    savedLang = await AsyncStorage.getItem(LANGUAGE_KEY)
  } catch {}

  let lang = savedLang
  if (!lang) {
    const deviceLang = Localization.getLocales()[0]?.languageCode ?? 'tr'
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
    await AsyncStorage.setItem(LANGUAGE_KEY, lang)
  } catch {}
}

export default initI18n
