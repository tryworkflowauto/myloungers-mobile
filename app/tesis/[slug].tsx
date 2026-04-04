import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'

const SCREEN_W = Dimensions.get('window').width
const GALLERY_MAIN_H = 240

type TesisDetailRow = {
  id: string
  ad: string
  slug: string
  sehir: string | null
  ilce: string | null
  fotograflar: unknown
  puan: number | null
  kisa_aciklama: string | null
  aciklama: string | null
  detayli_aciklama: string | null
  imkanlar: unknown
  calisma_saatleri: unknown
  adres: string | null
  video_url: string | null
  enlem: number | null
  boylam: number | null
}

function parseImkanlarWithEmoji(raw: unknown): { name: string; emoji: string }[] {
  if (raw == null) return []
  const arr = Array.isArray(raw)
    ? raw
    : (() => {
        try {
          return JSON.parse(raw as string)
        } catch {
          return []
        }
      })()
  return (Array.isArray(arr) ? arr : [])
    .filter((x: unknown) => x && typeof x === 'object' && (x as Record<string, unknown>).active !== false)
    .map((x: unknown) => {
      const obj = x as Record<string, unknown>
      const name = String(obj.name ?? obj.ad ?? '')
      const emoji = typeof obj.emoji === 'string' ? obj.emoji : ''
      return { name, emoji }
    })
    .filter((x: { name: string; emoji: string }) => x.name)
}

function parseCalismaSaatleriLines(raw: unknown): string[] {
  if (raw == null) return []
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (!t) return []
    return t
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
  }
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (!item || typeof item !== 'object') return ''
        const obj = item as Record<string, unknown>
        const name = String(obj.name ?? '')
        const kapali = obj.kapali === true
        if (kapali) return `${name}: Kapalı`
        const acilis = String(obj.acilis ?? '')
        const kapanis = String(obj.kapanis ?? '')
        const vurgu = obj.vurgu === true ? ' ⭐' : ''
        return `${name}: ${acilis} - ${kapanis}${vurgu}`
      })
      .filter(Boolean)
  }
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    if (obj.acilis && obj.kapanis) return [`${obj.acilis} - ${obj.kapanis}`]
  }
  return []
}

function parsePhotoSrcs(fotograflar: unknown): string[] {
  if (!fotograflar || !Array.isArray(fotograflar)) return []
  const out: string[] = []
  for (const item of fotograflar) {
    if (item && typeof item === 'object' && 'src' in item) {
      const s = (item as { src?: unknown }).src
      if (typeof s === 'string' && s) out.push(s)
    }
  }
  return out
}

function paramSlug(slug: string | string[] | undefined): string {
  if (typeof slug === 'string') return slug
  if (Array.isArray(slug) && slug[0]) return slug[0]
  return ''
}

export default function TesisDetailScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { slug: slugParam } = useLocalSearchParams<{ slug: string }>()
  const slug = paramSlug(slugParam)

  const [row, setRow] = useState<TesisDetailRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [fav, setFav] = useState(false)
  const [yorumSayisi, setYorumSayisi] = useState(0)

  useEffect(() => {
    if (!slug) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void supabase
      .from('tesisler')
      .select(
        'id, ad, slug, sehir, ilce, fotograflar, puan, kisa_aciklama, aciklama, detayli_aciklama, imkanlar, calisma_saatleri, adres, video_url, enlem, boylam',
      )
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data, error }) => {
        console.log('SLUG:', slug, 'DATA:', data, 'ERROR:', error)
        if (cancelled) return
        if (error || !data) {
          setRow(null)
        } else {
          setRow(data as TesisDetailRow)
        }
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  useEffect(() => {
    if (!row?.id) return
    let cancelled = false
    void supabase
      .from('yorumlar')
      .select('id', { count: 'exact' })
      .eq('tesis_id', row.id)
      .eq('durum', 'onaylı')
      .then(({ count }) => {
        if (cancelled) return
        setYorumSayisi(count ?? 0)
      })
    return () => {
      cancelled = true
    }
  }, [row?.id])

  const photoUrls = row ? parsePhotoSrcs(row.fotograflar) : []
  const imkanList = row ? parseImkanlarWithEmoji(row.imkanlar) : []
  const calismaLines = row ? parseCalismaSaatleriLines(row.calisma_saatleri) : []
  const konumText = row ? [row.sehir, row.ilce].filter(Boolean).join(', ') : ''
  const adresText = row?.adres ?? konumText
  const puanNum = row?.puan != null ? Number(row.puan) : NaN

  const gallerySafeIdx =
    photoUrls.length > 0 ? Math.min(galleryIndex, photoUrls.length - 1) : 0

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#0ABAB5" />
        </View>
      </SafeAreaView>
    )
  }

  if (!row) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.loaderWrap}>
          <Text style={styles.muted}>Tesis bulunamadı</Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
            <Text style={styles.linkBack}>Geri</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={[styles.headerAbs, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={14} style={styles.headerBtn} accessibilityRole="button">
          <Ionicons name="chevron-back" size={28} color="#0ABAB5" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setFav((v) => !v)} hitSlop={14} style={styles.headerBtn} accessibilityRole="button">
          <Ionicons name={fav ? 'heart' : 'heart-outline'} size={26} color="#0ABAB5" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {photoUrls.length > 0 ? (
          <View style={styles.galleryWrap}>
            <Image
              source={{ uri: photoUrls[gallerySafeIdx] }}
              style={styles.galleryMainImage}
              contentFit="cover"
            />
            {photoUrls.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.thumbScrollContent}
              >
                {photoUrls.map((uri, i) => (
                  <TouchableOpacity
                    key={`${uri}-${i}`}
                    activeOpacity={0.85}
                    onPress={() => setGalleryIndex(i)}
                    accessibilityRole="button"
                  >
                    <Image
                      source={{ uri }}
                      style={[styles.thumb, i === gallerySafeIdx && styles.thumbSelected]}
                      contentFit="cover"
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : null}
          </View>
        ) : (
          <View style={[styles.galleryPlaceholder, { width: SCREEN_W, height: GALLERY_MAIN_H }]}>
            <Ionicons name="image-outline" size={48} color="#94a3b8" />
          </View>
        )}

        <View style={styles.padH}>
          <Text style={styles.tesisAd}>{row.ad}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            {[1, 2, 3, 4, 5].map((s) => (
              <Ionicons key={s} name="star" size={16} color={s <= Math.round(puanNum) ? '#FBBF24' : '#e2e8f0'} />
            ))}
            {!Number.isNaN(puanNum) && (
              <View style={{ backgroundColor: '#0ABAB5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{puanNum.toFixed(1)} / 10</Text>
              </View>
            )}
            <View
              style={{
                backgroundColor: '#dcfce7',
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 2,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Ionicons name="checkmark-circle" size={13} color="#16a34a" />
              <Text style={{ color: '#16a34a', fontWeight: '700', fontSize: 12 }}>Doğrulandı</Text>
            </View>
          </View>
          <Text style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>{yorumSayisi} değerlendirme</Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <Ionicons name="location-outline" size={16} color="#64748b" />
              <Text style={{ fontSize: 13, color: '#64748b', flex: 1 }} numberOfLines={2}>
                {adresText}
              </Text>
            </View>
            {(row.enlem != null && row.boylam != null) || row?.adres ? (
              <TouchableOpacity
                onPress={() => {
                  import('expo-linking').then((Linking) => {
                    const url =
                      row.enlem != null && row.boylam != null
                        ? `https://maps.google.com/?q=${row.enlem},${row.boylam}`
                        : `https://maps.google.com/?q=${encodeURIComponent(row.adres ?? '')}`
                    Linking.openURL(url)
                  })
                }}
                style={{ marginLeft: 8 }}
              >
                <Text style={{ fontSize: 13, color: '#0ABAB5', fontWeight: '700' }}>Haritada gör</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="location-outline" size={18} color="#0ABAB5" />
              <Text style={styles.sectionTitle}>Tesis Hakkında</Text>
            </View>
            {row.kisa_aciklama && String(row.kisa_aciklama).trim() ? (
              <Text style={styles.bodyText}>{row.kisa_aciklama}</Text>
            ) : null}
            {row.detayli_aciklama && String(row.detayli_aciklama).trim() ? (
              <Text
                style={[
                  styles.bodyText,
                  row.kisa_aciklama && String(row.kisa_aciklama).trim() ? { marginTop: 8 } : null,
                ]}
              >
                {row.detayli_aciklama}
              </Text>
            ) : null}
            {!row.kisa_aciklama?.trim() &&
            !row.detayli_aciklama?.trim() &&
            row.aciklama &&
            String(row.aciklama).trim() ? (
              <Text style={styles.bodyText}>{row.aciklama}</Text>
            ) : null}
            {!row.kisa_aciklama?.trim() &&
            !row.detayli_aciklama?.trim() &&
            !row.aciklama?.trim() ? (
              <Text style={styles.bodyText}>Henüz açıklama eklenmemiş.</Text>
            ) : null}
          </View>

          {imkanList.length > 0 ? (
            <View style={styles.card}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="star-outline" size={18} color="#0ABAB5" />
                <Text style={styles.sectionTitle}>Tesis İmkânları</Text>
              </View>
              <View style={styles.imkanGrid}>
                {imkanList.map((item, i) => (
                  <View
                    key={i}
                    style={{
                      width: '50%',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingVertical: 4,
                    }}
                  >
                    <Text style={{ fontSize: 16 }}>{item.emoji}</Text>
                    <Text style={{ fontSize: 12, color: '#334155', flex: 1 }} numberOfLines={2}>
                      {item.name}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {calismaLines.length > 0 ? (
            <View style={styles.card}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="time-outline" size={18} color="#0ABAB5" />
                <Text style={styles.sectionTitle}>Çalışma Saatleri</Text>
              </View>
              <View style={styles.calismaSaatGrid}>
                {calismaLines.map((line, ci) => (
                  <View key={`${ci}-${line}`} style={styles.calismaSaatCell}>
                    <Text style={styles.calismaSaatCellText}>{line}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.stickyBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity style={styles.reserveBtn} activeOpacity={0.9} onPress={() => {}}>
          <Text style={styles.reserveBtnText}>Rezervasyon Yap</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: '#64748b', fontSize: 15 },
  linkBack: { color: '#0ABAB5', fontWeight: '700' },
  headerAbs: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  galleryWrap: { marginBottom: 8 },
  galleryMainImage: { width: SCREEN_W, height: GALLERY_MAIN_H },
  galleryPlaceholder: {
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbSelected: { borderColor: '#0ABAB5' },
  padH: { paddingHorizontal: 12 },
  tesisAd: { fontSize: 22, fontWeight: '800', color: '#0A1628', marginTop: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    margin: 12,
    padding: 16,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#0A1628', marginBottom: 0 },
  bodyText: { fontSize: 14, color: '#475569', lineHeight: 22 },
  imkanGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calismaSaatGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calismaSaatCell: { width: '50%', paddingVertical: 3 },
  calismaSaatCellText: { fontSize: 12, color: '#334155' },
  stickyBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  reserveBtn: {
    backgroundColor: '#0ABAB5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    width: '100%',
  },
  reserveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
})
