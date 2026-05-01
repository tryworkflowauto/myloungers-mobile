import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import { supabase } from '../lib/supabase'

const TEAL = '#0d9488'

export default function OdemeWebview() {
  const { t } = useTranslation()
  const router = useRouter()
  const { token, rezervasyon_id } = useLocalSearchParams<{ token?: string; rezervasyon_id?: string }>()
  const uri = token ? `https://vpos.paratika.com.tr/payment/${String(token)}` : ''
  const rezId = rezervasyon_id ? String(rezervasyon_id) : ''

  // Guard: realtime, polling ve URL handler'larından ilk tetiklenen navigate eder, diğerleri pas geçer
  const navigatedRef = useRef(false)
  function goToProfile() {
    if (navigatedRef.current) return
    navigatedRef.current = true
    router.replace('/(tabs)/profil')
  }

  // Katman 1 — Realtime: Supabase publication varsa anlık yönlendirir
  useEffect(() => {
    if (!rezId) return
    const uid = Math.random().toString(36).slice(2)
    const channel = supabase
      .channel(`odeme-bekleme-${rezId}-${uid}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rezervasyonlar',
          filter: `id=eq.${rezId}`,
        },
        (payload) => {
          if ((payload.new as { durum?: string })?.durum === 'aktif') {
            goToProfile()
          }
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [rezId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Katman 2 — Polling: Her 800ms'de DB'yi sorgula (RLS/publication bağımsız, %100 çalışır)
  useEffect(() => {
    if (!rezId) return
    let stopped = false
    const interval = setInterval(async () => {
      if (stopped) return
      const { data, error } = await supabase
        .from('rezervasyonlar')
        .select('durum')
        .eq('id', rezId)
        .single()
      if (!error && (data as { durum?: string } | null)?.durum === 'aktif') {
        stopped = true
        clearInterval(interval)
        goToProfile()
      }
    }, 800)
    // 5 dakika sonra otomatik dur
    const timeout = setTimeout(() => {
      stopped = true
      clearInterval(interval)
    }, 300000)
    return () => {
      stopped = true
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [rezId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={14} style={styles.headerBtn} accessibilityRole="button">
          <Ionicons name="chevron-back" size={26} color={TEAL} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('payment.title')}</Text>
        <View style={styles.headerBtn} />
      </View>
      {uri ? (
        <WebView
          source={{ uri }}
          style={styles.web}
          startInLoadingState
          renderLoading={() => <ActivityIndicator style={styles.loader} size="large" color={TEAL} />}
          onNavigationStateChange={(navState) => {
            if (navState.url && navState.url.includes('myloungers.com/profil')) {
              goToProfile()
            }
            if (navState.url && navState.url.includes('myloungers.com/rezervasyon-basarili')) {
              goToProfile()
            }
          }}
          onShouldStartLoadWithRequest={(request) => {
            if (request.url.includes('myloungers.com/profil')) {
              goToProfile()
              return false
            }
            return true
          }}
        />
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('payment.session_not_found')}</Text>
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
  },
  web: {
    flex: 1,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 15,
    color: '#64748b',
  },
})
