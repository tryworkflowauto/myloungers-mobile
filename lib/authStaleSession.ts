import { supabase } from './supabase'

/** Auth / unknown hatalardan küçük harfli ile eşlenecek tek metin çıkarımı */
export function authErrorToDiagnosticString(err: unknown): string {
  if (err == null) return ''
  if (typeof err === 'string') return err
  if (typeof err === 'object') {
    const o = err as Record<string, unknown>
    const parts: string[] = []
    if (typeof o.name === 'string') parts.push(o.name)
    if (typeof o.message === 'string') parts.push(o.message)
    if (typeof o.code === 'string') parts.push(o.code)
    return parts.join(' ')
  }
  return String(err)
}

/** Eski/geçersiz refresh oturumu: kullanıcıya gösterilmez, sessizce çıkılır */
const STALE_REFRESH_SESSION_MARKERS = [
  'refresh token',
  'refresh_token',
  'invalid refresh token',
  'authsessionmissingerror',
  'session_not_found',
  'jwt expired',
] as const

export function isStaleRefreshTokenLikeAuthDiagnostic(text: string): boolean {
  const t = text.toLowerCase()
  return STALE_REFRESH_SESSION_MARKERS.some((m) => t.includes(m))
}

export async function signOutStaleSessionQuietly(): Promise<void> {
  try {
    await supabase.auth.signOut()
  } catch {
    /* yine de sessiz kal */
  }
}
