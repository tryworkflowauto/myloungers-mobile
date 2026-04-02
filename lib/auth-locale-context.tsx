import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { authLocale, type AuthLang, type AuthLocaleTree } from './auth-locale'

type AuthLocaleContextValue = {
  lang: AuthLang
  setLang: (l: AuthLang) => void
  t: AuthLocaleTree
}

const AuthLocaleContext = createContext<AuthLocaleContextValue | null>(null)

export function AuthLocaleProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<AuthLang>('tr')
  const value = useMemo(
    () => ({ lang, setLang, t: authLocale[lang] }),
    [lang],
  )
  return <AuthLocaleContext.Provider value={value}>{children}</AuthLocaleContext.Provider>
}

export function useAuthLocale() {
  const ctx = useContext(AuthLocaleContext)
  if (!ctx) {
    throw new Error('useAuthLocale must be used within AuthLocaleProvider')
  }
  return ctx
}
