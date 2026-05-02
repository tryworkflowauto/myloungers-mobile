import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'

type FavoriRow = {
  id: string
  tesis_id: string
  tesisler: {
    ad: string | null
    fotograflar: any
    sehir: string | null
    ilce: string | null
    slug: string | null
    puan: number | null
  } | null
}

export default function FavoritesScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [favoriler, setFavoriler] = useState<FavoriRow[]>([])
  const [userId, setUserId] = useState<string | null>(null)

  const loadFavoriler = async () => {
    setLoading(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setFavoriler([])
      setUserId(null)
      setLoading(false)
      return
    }

    setUserId(user.id)
    const { data } = await supabase
      .from('favoriler')
      .select('id, tesis_id, tesisler(ad, fotograflar, sehir, ilce, slug, puan)')
      .eq('kullanici_id', user.id)
      .order('created_at', { ascending: false })

    setFavoriler((data as FavoriRow[]) ?? [])
    setLoading(false)
  }

  const handleFavoriKaldir = async (favoriId: string) => {
    if (!userId) return
    await supabase.from('favoriler').delete().eq('id', favoriId).eq('kullanici_id', userId)
    setFavoriler((prev) => prev.filter((f) => f.id !== favoriId))
  }

  useFocusEffect(
    useCallback(() => {
      void loadFavoriler()
    }, []),
  )

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('favorites.title')}</Text>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#0ABAB5" />
        </View>
      ) : favoriler.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="heart-outline" size={46} color="#94a3b8" />
          <Text style={styles.emptyText}>{t('favorites.empty')}</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {favoriler.map((item) => {
            const foto0 = item.tesisler?.fotograflar?.[0]
            const fotoUri =
              typeof foto0 === 'string'
                ? foto0
                : (foto0?.src ?? foto0?.url ?? foto0?.path ?? '')
            const sehirIlce = [item.tesisler?.sehir, item.tesisler?.ilce].filter(Boolean).join(' / ')
            return (
              <View key={item.id} style={styles.card}>
                <TouchableOpacity
                  style={styles.removeBtn}
                  activeOpacity={0.8}
                  onPress={() => void handleFavoriKaldir(item.id)}
                >
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </TouchableOpacity>

                <View style={styles.row}>
                  <View style={styles.fotoWrap}>
                    {fotoUri ? (
                      <Image source={{ uri: String(fotoUri) }} style={styles.foto} resizeMode="cover" />
                    ) : (
                      <View style={[styles.foto, styles.fotoPlaceholder]}>
                        <Ionicons name="image-outline" size={28} color="#94a3b8" />
                      </View>
                    )}
                  </View>

                  <View style={styles.body}>
                    <Text style={styles.tesisAd} numberOfLines={1}>
                      {item.tesisler?.ad ?? 'Tesis'}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {sehirIlce || '-'}
                    </Text>
                    <View style={styles.ratingRow}>
                      <Ionicons name="star" size={14} color="#f59e0b" />
                      <Text style={styles.ratingText}>
                        {item.tesisler?.puan != null ? String(item.tesisler.puan) : '-'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.goBtn}
                      activeOpacity={0.85}
                      onPress={() => {
                        const slug = item.tesisler?.slug
                        if (slug) router.push(`/tesis/${slug}`)
                      }}
                    >
                      <Text style={styles.goBtnText}>{t('facility.visit_facility')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f1f5f9' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a56db',
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  emptyText: { marginTop: 10, color: '#64748b', fontSize: 14, textAlign: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 12, paddingBottom: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  removeBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff5f5',
    zIndex: 2,
  },
  row: { flexDirection: 'row', gap: 12 },
  fotoWrap: { width: 96, height: 96, borderRadius: 12, overflow: 'hidden', backgroundColor: '#f1f5f9' },
  foto: { width: 96, height: 96 },
  fotoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, justifyContent: 'center', paddingRight: 8 },
  tesisAd: { fontSize: 15, fontWeight: '800', color: '#0A1628' },
  meta: { marginTop: 4, fontSize: 12, color: '#64748b' },
  ratingRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { fontSize: 12, color: '#334155', fontWeight: '700' },
  goBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#f97316',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  goBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
})
