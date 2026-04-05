import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { supabase } from '../../lib/supabase'

const SCREEN_W = Dimensions.get('window').width
const GALLERY_MAIN_H = 240

const WEEKDAY_LABELS_TR = ['P', 'P', 'S', 'Ç', 'P', 'C', 'C'] as const

function sameCalendarDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function formatMenuFiyat(fiyat: number | string): string {
  const n = typeof fiyat === 'number' ? fiyat : parseFloat(String(fiyat).replace(/\s/g, '').replace(',', '.'))
  if (Number.isNaN(n)) return String(fiyat)
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function yorumAvg(vals: (number | null | undefined)[]): number | null {
  const nums = vals
    .filter((v) => v != null && !Number.isNaN(Number(v)))
    .map((v) => Number(v))
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function yorumStarFilledCount(puan: number | null | undefined): number {
  if (puan == null || Number.isNaN(Number(puan))) return 0
  const n = Number(puan)
  if (n <= 5) return Math.min(5, Math.round(n))
  return Math.min(5, Math.round(n / 2))
}

function yorumBarPct(avg: number | null): number {
  if (avg == null || Number.isNaN(avg)) return 0
  const n = Number(avg)
  const denom = n <= 5 ? 5 : 10
  return Math.min(100, Math.max(0, (n / denom) * 100))
}

type GrupRow = {
  id: string
  ad: string
  renk: string
  fiyat: number | null
  fiyat_hafici: number | null
  fiyat_hafta_sonu: number | null
  sira: number | null
  aciklama: string | null
  deniz_sirasi: number | null
}

type SezlongRow = {
  id: string
  numara: number
  durum: string
  grup_id: string
}

type MenuKategoriRow = {
  id: string
  ad: string
  icon: string | null
  sira: number | null
  tesis_id: string
}

type MenuUrunRow = {
  id: string
  ad: string
  aciklama: string | null
  fiyat: number | string
  gorsel_url: string | null
  kategori_id: string
  aktif: boolean
}

type YorumRow = {
  id: string
  musteri_adi: string | null
  puan: number | null
  yorum: string | null
  konum_puan: number | null
  temizlik_puan: number | null
  hizmet_puan: number | null
  fiyat_puan: number | null
  dogrulanmis: boolean | null
  isletme_cevabi: string | null
  created_at: string
}

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
  ulasim: unknown
  kurallar: unknown
  kampanya_notlari: unknown
  telefon: string | null
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

function parseKuralKampanyaItems(raw: unknown): { text: string; emoji: string }[] {
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
  if (!Array.isArray(arr)) return []
  return arr
    .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
    .map((obj) => {
      const text = String(obj.text ?? '').trim()
      const emoji = typeof obj.emoji === 'string' ? obj.emoji : ''
      return { text, emoji }
    })
    .filter((x) => x.text)
}

type UlasimFields = {
  hat: string
  not: string
  tel1: string
  tel2: string
  durak: string
  merkeze: string
  saatBas: string
  saatBit: string
  havalimani: string
}

const EMPTY_ULASIM: UlasimFields = {
  hat: '',
  not: '',
  tel1: '',
  tel2: '',
  durak: '',
  merkeze: '',
  saatBas: '',
  saatBit: '',
  havalimani: '',
}

function parseUlasimFields(raw: unknown): UlasimFields | null {
  if (raw == null) return null
  let o: Record<string, unknown>
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown
      if (!p || typeof p !== 'object') return null
      o = p as Record<string, unknown>
    } catch {
      return null
    }
  } else if (typeof raw === 'object') {
    o = raw as Record<string, unknown>
  } else {
    return null
  }
  const s = (k: string) => (typeof o[k] === 'string' ? String(o[k]).trim() : '')
  return {
    hat: s('hat'),
    not: s('not'),
    tel1: s('tel1'),
    tel2: s('tel2'),
    durak: s('durak'),
    merkeze: s('merkeze'),
    saatBas: s('saatBas'),
    saatBit: s('saatBit'),
    havalimani: s('havalimanı') || s('havalimani'),
  }
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
  const [gruplar, setGruplar] = useState<GrupRow[]>([])
  const [sezlonglar, setSezlonglar] = useState<SezlongRow[]>([])
  const [rezerveIdsForDate, setRezeveIdsForDate] = useState<Set<string>>(new Set())
  const [secilenSezlongIds, setSecilenSezlongIds] = useState<Set<string>>(new Set())
  const [planTarih, setPlanTarih] = useState<Date>(() => {
    const d = new Date()
    d.setHours(12, 0, 0, 0)
    return d
  })
  const [showPlanDatePicker, setShowPlanDatePicker] = useState(false)
  const [planCalendarViewMonth, setPlanCalendarViewMonth] = useState(() => new Date())
  const [planPendingDate, setPlanPendingDate] = useState(() => {
    const d = new Date()
    d.setHours(12, 0, 0, 0)
    return d
  })
  const [acikHakkinda, setAcikHakkinda] = useState(true)
  const [acikImkanlar, setAcikImkanlar] = useState(false)
  const [acikSaatler, setAcikSaatler] = useState(false)
  const [acikVideo, setAcikVideo] = useState(false)
  const [acikUlasim, setAcikUlasim] = useState(false)
  const [acikBilinmesi, setAcikBilinmesi] = useState(false)
  const [acikMenu, setAcikMenu] = useState(false)
  const [menuKategoriler, setMenuKategoriler] = useState<MenuKategoriRow[]>([])
  const [menuUrunler, setMenuUrunler] = useState<MenuUrunRow[]>([])
  const [menuSeciliKategori, setMenuSeciliKategori] = useState<'all' | string>('all')
  const [yorumlarList, setYorumlarList] = useState<YorumRow[]>([])
  const [acikYorumlar, setAcikYorumlar] = useState(false)
  const [acikPlan, setAcikPlan] = useState(false)

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
        'id, ad, slug, sehir, ilce, fotograflar, puan, kisa_aciklama, aciklama, detayli_aciklama, imkanlar, calisma_saatleri, adres, video_url, ulasim, kurallar, kampanya_notlari, telefon, enlem, boylam',
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

  useEffect(() => {
    if (!row?.id) return
    console.log('tesis id:', row?.id)
    void supabase
      .from('sezlong_gruplari')
      .select('id, ad, renk, fiyat, fiyat_hafici, fiyat_hafta_sonu, sira, aciklama, deniz_sirasi')
      .eq('tesis_id', row.id)
      .order('sira', { ascending: true })
      .then(({ data }) => {
        console.log('sezlong_gruplari', data)
        if (data) {
          const gruplar = data as GrupRow[]
          console.log('gruplar', gruplar)
          setGruplar(gruplar)
        }
      })
    void supabase
      .from('sezlonglar')
      .select('id, numara, durum, grup_id')
      .eq('tesis_id', row.id)
      .then(({ data }) => {
        if (data) setSezlonglar(data as SezlongRow[])
      })
  }, [row])

  useEffect(() => {
    if (!row?.id) {
      setMenuKategoriler([])
      setMenuUrunler([])
      setMenuSeciliKategori('all')
      return
    }
    let cancelled = false
    setMenuSeciliKategori('all')
    void (async () => {
      const { data: cats } = await supabase
        .from('menu_kategorileri')
        .select('id, ad, icon, sira, tesis_id')
        .eq('tesis_id', row.id)
        .order('sira', { ascending: true })
      if (cancelled) return
      const kategoriRows = (cats ?? []) as MenuKategoriRow[]
      setMenuKategoriler(kategoriRows)
      const ids = kategoriRows.map((c) => c.id)
      if (ids.length === 0) {
        setMenuUrunler([])
        return
      }
      const { data: urunler } = await supabase
        .from('menu_urunleri')
        .select('id, ad, aciklama, fiyat, gorsel_url, kategori_id, aktif')
        .in('kategori_id', ids)
        .eq('aktif', true)
      if (cancelled) return
      setMenuUrunler((urunler ?? []) as MenuUrunRow[])
    })()
    return () => {
      cancelled = true
    }
  }, [row?.id])

  useEffect(() => {
    console.log('menuKategoriler', menuKategoriler)
    console.log('menuUrunler', menuUrunler)
  }, [menuKategoriler, menuUrunler])

  useEffect(() => {
    if (!row?.id) {
      setYorumlarList([])
      return
    }
    let cancelled = false
    void supabase
      .from('yorumlar')
      .select(
        'id, musteri_adi, puan, yorum, konum_puan, temizlik_puan, hizmet_puan, fiyat_puan, dogrulanmis, isletme_cevabi, created_at',
      )
      .eq('tesis_id', row.id)
      .eq('durum', 'onaylı')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return
        setYorumlarList((data ?? []) as YorumRow[])
      })
    return () => {
      cancelled = true
    }
  }, [row?.id])

  useEffect(() => {
    if (!row?.id) return
    const tarihStr = planTarih.toISOString().split('T')[0]
    void supabase
      .from('rezervasyonlar')
      .select('sezlong_id')
      .eq('tesis_id', row.id)
      .lte('baslangic_tarih', tarihStr)
      .gte('bitis_tarih', tarihStr)
      .in('durum', ['onaylandi', 'beklemede'])
      .then(({ data }) => {
        if (data) setRezeveIdsForDate(new Set(data.map((r: { sezlong_id: string }) => r.sezlong_id)))
      })
  }, [row?.id, planTarih])

  const planCalendarRows = useMemo(() => {
    const y = planCalendarViewMonth.getFullYear()
    const m = planCalendarViewMonth.getMonth()
    const first = new Date(y, m, 1)
    const pad = (first.getDay() + 6) % 7
    const daysInMonth = new Date(y, m + 1, 0).getDate()
    const cells: (number | null)[] = []
    for (let i = 0; i < pad; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    const rows: (number | null)[][] = []
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7))
    }
    const last = rows[rows.length - 1]
    if (last && last.length < 7) {
      while (last.length < 7) last.push(null)
    }
    return rows
  }, [planCalendarViewMonth])

  const planMonthYearLabel = planCalendarViewMonth.toLocaleDateString('tr-TR', {
    month: 'long',
    year: 'numeric',
  })

  const openPlanDatePicker = () => {
    const d = new Date(planTarih)
    d.setHours(12, 0, 0, 0)
    setPlanPendingDate(d)
    setPlanCalendarViewMonth(new Date(d.getFullYear(), d.getMonth(), 1))
    setShowPlanDatePicker(true)
  }

  const shiftPlanCalendarMonth = (delta: number) => {
    setPlanCalendarViewMonth((vm) => {
      const next = new Date(vm)
      next.setMonth(next.getMonth() + delta)
      return next
    })
  }

  const onPlanCalendarConfirm = () => {
    const d = new Date(planPendingDate)
    d.setHours(12, 0, 0, 0)
    setPlanTarih(d)
    setShowPlanDatePicker(false)
  }

  const photoUrls = row ? parsePhotoSrcs(row.fotograflar) : []
  const imkanList = row ? parseImkanlarWithEmoji(row.imkanlar) : []
  const calismaLines = row ? parseCalismaSaatleriLines(row.calisma_saatleri) : []
  const tesisVideoUrlTrimmed = useMemo(() => row?.video_url?.trim() || null, [row?.video_url])
  const ulasimFields = useMemo(() => {
    if (row?.ulasim == null) return null
    return parseUlasimFields(row.ulasim) ?? EMPTY_ULASIM
  }, [row?.ulasim])
  const kurallarItems = useMemo(() => (row ? parseKuralKampanyaItems(row.kurallar) : []), [row?.kurallar])
  const kampanyaItems = useMemo(
    () => (row ? parseKuralKampanyaItems(row.kampanya_notlari) : []),
    [row?.kampanya_notlari],
  )
  const bilinmesiGerekenlerVisible = kurallarItems.length > 0 || kampanyaItems.length > 0
  const menuDisplayGroups = useMemo(() => {
    if (menuUrunler.length === 0) return [] as { kategori: MenuKategoriRow; urunler: MenuUrunRow[] }[]
    if (menuSeciliKategori !== 'all') {
      const cat = menuKategoriler.find((c) => c.id === menuSeciliKategori)
      if (!cat) return []
      const urunler = menuUrunler.filter((u) => u.kategori_id === menuSeciliKategori)
      return [{ kategori: cat, urunler }]
    }
    const map = new Map<string, MenuUrunRow[]>()
    for (const u of menuUrunler) {
      const list = map.get(u.kategori_id) ?? []
      list.push(u)
      map.set(u.kategori_id, list)
    }
    return menuKategoriler
      .map((k) => ({ kategori: k, urunler: map.get(k.id) ?? [] }))
      .filter((g) => g.urunler.length > 0)
  }, [menuKategoriler, menuUrunler, menuSeciliKategori])
  const yorumOzet = useMemo(() => {
    const list = yorumlarList
    if (list.length === 0) {
      return {
        genel: null as number | null,
        konum: null as number | null,
        temizlik: null as number | null,
        hizmet: null as number | null,
        fiyat: null as number | null,
      }
    }
    return {
      genel: yorumAvg(list.map((y) => y.puan)),
      konum: yorumAvg(list.map((y) => y.konum_puan)),
      temizlik: yorumAvg(list.map((y) => y.temizlik_puan)),
      hizmet: yorumAvg(list.map((y) => y.hizmet_puan)),
      fiyat: yorumAvg(list.map((y) => y.fiyat_puan)),
    }
  }, [yorumlarList])
  const konumText = row ? [row.sehir, row.ilce].filter(Boolean).join(', ') : ''
  const adresText = row?.adres ?? konumText
  const puanNum = row?.puan != null ? Number(row.puan) : NaN

  const gallerySafeIdx =
    photoUrls.length > 0 ? Math.min(galleryIndex, photoUrls.length - 1) : 0
  const sezlongSize = Math.floor((SCREEN_W - 32 - 24) / 7)

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
            <TouchableOpacity
              onPress={() => setAcikHakkinda(!acikHakkinda)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: '#fff5f5',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="location-outline" size={18} color="#ef4444" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Tesis Hakkında</Text>
                  <Text style={{ fontSize: 11, color: '#94a3b8' }}>{row?.ad ?? ''}</Text>
                </View>
              </View>
              <Ionicons name={acikHakkinda ? 'chevron-up' : 'chevron-down'} size={20} color="#94a3b8" />
            </TouchableOpacity>
            {acikHakkinda && (
              <View style={{ marginTop: 12 }}>
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
            )}
          </View>

          {imkanList.length > 0 ? (
            <View style={styles.card}>
              <TouchableOpacity
                onPress={() => setAcikImkanlar(!acikImkanlar)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: '#fefce8',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="star-outline" size={18} color="#eab308" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>Tesis İmkânları</Text>
                    <Text style={{ fontSize: 11, color: '#94a3b8' }}>Öne çıkan özellikler</Text>
                  </View>
                </View>
                <Ionicons name={acikImkanlar ? 'chevron-up' : 'chevron-down'} size={20} color="#94a3b8" />
              </TouchableOpacity>
              {acikImkanlar && (
                <View style={{ marginTop: 12 }}>
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
              )}
            </View>
          ) : null}

          {calismaLines.length > 0 ? (
            <View style={styles.card}>
              <TouchableOpacity
                onPress={() => setAcikSaatler(!acikSaatler)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: '#fff7ed',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="time-outline" size={18} color="#f97316" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>Çalışma Saatleri</Text>
                    <Text style={{ fontSize: 11, color: '#94a3b8' }}>Haftalık açılış & kapanış</Text>
                  </View>
                </View>
                <Ionicons name={acikSaatler ? 'chevron-up' : 'chevron-down'} size={20} color="#94a3b8" />
              </TouchableOpacity>
              {acikSaatler && (
                <View style={{ marginTop: 12 }}>
                  <View style={styles.calismaSaatGrid}>
                    {calismaLines.map((line, ci) => (
                      <View key={`${ci}-${line}`} style={styles.calismaSaatCell}>
                        <Text style={styles.calismaSaatCellText}>{line}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          ) : null}

          {gruplar.length > 0 && (
            <View style={styles.card}>
              <TouchableOpacity
                onPress={() => setAcikPlan(!acikPlan)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: '#f0fdfa',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="grid-outline" size={18} color="#0ABAB5" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>Tesis Yerleşim Planı</Text>
                    <Text style={{ fontSize: 11, color: '#94a3b8' }}>Bölgeye tıklayarak şezlong seçin</Text>
                  </View>
                </View>
                <Ionicons name={acikPlan ? 'chevron-up' : 'chevron-down'} size={20} color="#94a3b8" />
              </TouchableOpacity>

              {acikPlan && (
                <View style={{ marginTop: 12 }}>
              <TouchableOpacity
                onPress={openPlanDatePicker}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: '#f0fdfa',
                  borderRadius: 10,
                  padding: 10,
                  marginBottom: 16,
                }}
              >
                <Ionicons name="calendar-outline" size={16} color="#0ABAB5" />
                <Text style={{ fontSize: 14, color: '#0ABAB5', fontWeight: '700' }}>
                  {planTarih.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </Text>
                <Ionicons name="chevron-down" size={16} color="#0ABAB5" />
              </TouchableOpacity>

              <View
                style={{
                  flexDirection: 'row',
                  gap: 10,
                  marginBottom: 16,
                  flexWrap: 'nowrap',
                  justifyContent: 'space-between',
                }}
              >
                {[
                  { renk: '#22c55e', label: 'Boş' },
                  { renk: '#f97316', label: 'Dolu' },
                  { renk: '#3b82f6', label: 'Rezerve' },
                  { renk: '#e2e8f0', label: 'Bakım' },
                  { renk: '#0ABAB5', label: 'Seçimim' },
                ].map((item) => (
                  <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: item.renk }} />
                    <Text style={{ fontSize: 10, color: '#64748b' }}>{item.label}</Text>
                  </View>
                ))}
              </View>

              <View
                style={{
                  width: '100%',
                  height: 44,
                  borderRadius: 10,
                  overflow: 'hidden',
                  marginBottom: 12,
                  position: 'relative',
                }}
              >
                <Svg width="100%" height={44} viewBox="0 0 400 44" preserveAspectRatio="none">
                  <Defs>
                    <LinearGradient id="denizGradientTesisPlan" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0" stopColor="#7dd3fc" stopOpacity="1" />
                      <Stop offset="0.45" stopColor="#0284c7" stopOpacity="1" />
                      <Stop offset="1" stopColor="#0c4a6e" stopOpacity="1" />
                    </LinearGradient>
                  </Defs>
                  <Rect width="400" height="44" fill="url(#denizGradientTesisPlan)" />
                </Svg>
                <View
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  pointerEvents="none"
                >
                  <Text
                    style={{
                      color: '#fff',
                      fontWeight: '800',
                      fontSize: 12,
                      letterSpacing: 5,
                    }}
                  >
                    ~ D E N İ Z ~
                  </Text>
                </View>
              </View>

              {gruplar.map((grup) => {
                const grupSezlonglar = sezlonglar.filter((s) => s.grup_id === grup.id).sort((a, b) => a.numara - b.numara)
                if (grupSezlonglar.length === 0) return null
                const fiyat = grup.fiyat ?? grup.fiyat_hafici
                const toplamSezlong = grupSezlonglar.length
                const doluSezlong = grupSezlonglar.filter(
                  (s) => s.durum === 'dolu' || s.durum === 'rezerve' || rezerveIdsForDate.has(s.id),
                ).length
                const dolulukYuzde =
                  toplamSezlong > 0 ? Math.round((doluSezlong / toplamSezlong) * 100) : 0
                return (
                  <View key={grup.id} style={{ marginBottom: 16 }}>
                    <View
                      style={{
                        backgroundColor: grup.renk ?? '#0ABAB5',
                        borderRadius: 10,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        marginBottom: 10,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>{grup.ad}</Text>
                        {grup.aciklama ? (
                          <Text style={{ fontSize: 10, color: '#fff', opacity: 0.8, marginTop: 2 }}>
                            {grup.aciklama}
                          </Text>
                        ) : null}
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        {fiyat != null && (
                          <Text style={{ fontSize: 12, color: '#fff', opacity: 0.9 }}>
                            ₺{fiyat.toLocaleString('tr-TR')} / gün
                          </Text>
                        )}
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: 11, color: '#fff', fontWeight: '700' }}>
                            {toplamSezlong} şezlong
                          </Text>
                          <Text style={{ fontSize: 10, color: '#fff', opacity: 0.85 }}>
                            {dolulukYuzde}% Dolu
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                      {grupSezlonglar.map((s) => {
                        const secili = secilenSezlongIds.has(s.id)
                        const isRezerve = rezerveIdsForDate.has(s.id) || s.durum === 'rezerve'
                        const isDolu = s.durum === 'dolu'
                        const isBakim = s.durum === 'bakim'
                        const isKilitli = s.durum === 'kilitli'
                        const bgColor = secili
                          ? '#0ABAB5'
                          : isRezerve
                            ? '#3b82f6'
                            : isDolu
                              ? '#f97316'
                              : isBakim
                                ? '#fff'
                                : isKilitli
                                  ? '#fff'
                                  : '#22c55e'
                        const textColor = '#fff'
                        const disabled = (isDolu || isRezerve || isBakim || isKilitli) && !secili
                        return (
                          <TouchableOpacity
                            key={s.id}
                            disabled={disabled}
                            onPress={() => {
                              setSecilenSezlongIds((prev) => {
                                const next = new Set(prev)
                                if (next.has(s.id)) next.delete(s.id)
                                else next.add(s.id)
                                return next
                              })
                            }}
                            style={{
                              width: sezlongSize,
                              height: sezlongSize,
                              borderRadius: sezlongSize / 2,
                              backgroundColor: bgColor,
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderWidth: 0,
                            }}
                          >
                            <Text style={{ fontSize: 10, fontWeight: '700', color: textColor }}>
                              {grup.ad.charAt(0).toUpperCase()}
                              {s.numara}
                            </Text>
                          </TouchableOpacity>
                        )
                      })}
                    </View>
                  </View>
                )
              })}

              {secilenSezlongIds.size > 0 && (
                <View style={{ backgroundColor: '#f0fdfa', borderRadius: 10, padding: 12, marginTop: 8 }}>
                  <Text style={{ fontSize: 14, color: '#0ABAB5', fontWeight: '700', textAlign: 'center' }}>
                    {secilenSezlongIds.size} şezlong seçildi
                  </Text>
                </View>
              )}
                </View>
              )}
            </View>
          )}

          {tesisVideoUrlTrimmed ? (
            <View style={styles.card}>
              <TouchableOpacity
                onPress={() => setAcikVideo(!acikVideo)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: '#fef2f2',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="videocam-outline" size={18} color="#dc2626" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>Tesis Videosu</Text>
                    <Text style={{ fontSize: 11, color: '#94a3b8' }}>Tanıtım videosunu izleyin</Text>
                  </View>
                </View>
                <Ionicons name={acikVideo ? 'chevron-up' : 'chevron-down'} size={20} color="#94a3b8" />
              </TouchableOpacity>
              {acikVideo && row?.video_url ? (
                <View style={{ marginTop: 12 }}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      void Linking.openURL(row.video_url)
                    }}
                    style={{
                      width: '100%',
                      aspectRatio: 16 / 9,
                      borderRadius: 10,
                      overflow: 'hidden',
                      backgroundColor: '#000',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="play" size={56} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          ) : null}

          {ulasimFields ? (
            <View style={styles.card}>
              <TouchableOpacity
                onPress={() => setAcikUlasim(!acikUlasim)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: '#eff6ff',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="bus-outline" size={18} color="#2563eb" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>Ulaşım Rehberi</Text>
                    <Text style={{ fontSize: 11, color: '#94a3b8' }}>Dolmuş & Taksi</Text>
                  </View>
                </View>
                <Ionicons name={acikUlasim ? 'chevron-up' : 'chevron-down'} size={20} color="#94a3b8" />
              </TouchableOpacity>
              {acikUlasim && (
                <View style={{ marginTop: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'stretch' }}>
                    <View
                      style={{
                        flex: 1,
                        backgroundColor: '#f8fafc',
                        borderRadius: 10,
                        padding: 10,
                        borderLeftWidth: 3,
                        borderLeftColor: '#f59e0b',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <View
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 18,
                            backgroundColor: '#eff6ff',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Ionicons name="car-outline" size={18} color="#2563eb" />
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#0A1628', flex: 1 }}>Taksi</Text>
                      </View>
                      {ulasimFields.merkeze ? (
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                          <Ionicons name="location-outline" size={16} color="#64748b" style={{ marginTop: 2 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Merkeze Uzaklık</Text>
                            <Text style={{ fontSize: 12, color: '#334155' }}>{ulasimFields.merkeze}</Text>
                          </View>
                        </View>
                      ) : null}
                      {ulasimFields.havalimani ? (
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                          <Ionicons name="airplane-outline" size={16} color="#64748b" style={{ marginTop: 2 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Havalimanına Uzaklık</Text>
                            <Text style={{ fontSize: 12, color: '#334155' }}>{ulasimFields.havalimani}</Text>
                          </View>
                        </View>
                      ) : null}
                      {ulasimFields.tel1 ? (
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                          <Ionicons name="call-outline" size={16} color="#64748b" style={{ marginTop: 2 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Taksi Telefon</Text>
                            <Text style={{ fontSize: 12, color: '#334155' }}>{ulasimFields.tel1}</Text>
                          </View>
                        </View>
                      ) : null}
                      <View
                        style={{
                          alignSelf: 'flex-start',
                          backgroundColor: '#fffbeb',
                          borderWidth: 1,
                          borderColor: '#fde68a',
                          borderRadius: 8,
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          marginTop: 2,
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#b45309' }}>7/24 hizmet</Text>
                      </View>
                    </View>
                    <View
                      style={{
                        flex: 1,
                        backgroundColor: '#f8fafc',
                        borderRadius: 10,
                        padding: 10,
                        borderLeftWidth: 3,
                        borderLeftColor: '#2563eb',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <View
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 18,
                            backgroundColor: '#eff6ff',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Ionicons name="bus-outline" size={18} color="#2563eb" />
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#0A1628', flex: 1 }}>Dolmuş</Text>
                      </View>
                      {ulasimFields.hat ? (
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                          <Ionicons name="navigate-outline" size={16} color="#64748b" style={{ marginTop: 2 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Hat / Güzergah</Text>
                            <Text style={{ fontSize: 12, color: '#334155' }}>{ulasimFields.hat}</Text>
                          </View>
                        </View>
                      ) : null}
                      {ulasimFields.saatBas || ulasimFields.saatBit ? (
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                          <Ionicons name="time-outline" size={16} color="#64748b" style={{ marginTop: 2 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Sefer Saatleri</Text>
                            <Text style={{ fontSize: 12, color: '#334155' }}>
                              {ulasimFields.saatBas && ulasimFields.saatBit
                                ? `${ulasimFields.saatBas} – ${ulasimFields.saatBit}`
                                : ulasimFields.saatBas || ulasimFields.saatBit}
                            </Text>
                          </View>
                        </View>
                      ) : null}
                      {ulasimFields.durak ? (
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                          <Ionicons name="pin-outline" size={16} color="#64748b" style={{ marginTop: 2 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>İniş noktası</Text>
                            <Text style={{ fontSize: 12, color: '#334155' }}>{ulasimFields.durak}</Text>
                          </View>
                        </View>
                      ) : null}
                      {ulasimFields.not ? (
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                          <Ionicons name="pencil-outline" size={16} color="#64748b" style={{ marginTop: 2 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>Not</Text>
                            <Text style={{ fontSize: 12, color: '#334155' }}>{ulasimFields.not}</Text>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
              )}
            </View>
          ) : null}

          {bilinmesiGerekenlerVisible ? (
            <View style={styles.card}>
              <TouchableOpacity
                onPress={() => setAcikBilinmesi(!acikBilinmesi)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: '#fff7ed',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="information-circle-outline" size={18} color="#f97316" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>Bilinmesi Gerekenler</Text>
                    <Text style={{ fontSize: 11, color: '#94a3b8' }}>Kurallar & Kampanyalar</Text>
                  </View>
                </View>
                <Ionicons name={acikBilinmesi ? 'chevron-up' : 'chevron-down'} size={20} color="#94a3b8" />
              </TouchableOpacity>
              {acikBilinmesi && (
                <View style={{ marginTop: 12 }}>
                  {kurallarItems.length > 0 ? (
                    <View style={{ marginBottom: kampanyaItems.length > 0 ? 14 : 0 }}>
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '800',
                          color: '#dc2626',
                          marginBottom: 8,
                          letterSpacing: 0.6,
                          textTransform: 'uppercase',
                        }}
                      >
                        KURALLAR
                      </Text>
                      {kurallarItems.map((item, i) => (
                        <View
                          key={`kr-${i}-${item.text}`}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'flex-start',
                            gap: 8,
                            marginBottom: i < kurallarItems.length - 1 ? 8 : 0,
                          }}
                        >
                          {item.emoji ? <Text style={{ fontSize: 16 }}>{item.emoji}</Text> : null}
                          <Text style={{ fontSize: 12, color: '#334155', flex: 1 }}>{item.text}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {kampanyaItems.length > 0 ? (
                    <View>
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '800',
                          color: '#f97316',
                          marginBottom: 8,
                          letterSpacing: 0.6,
                          textTransform: 'uppercase',
                        }}
                      >
                        KAMPANYALAR
                      </Text>
                      {kampanyaItems.map((item, i) => (
                        <View
                          key={`kp-${i}-${item.text}`}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'flex-start',
                            gap: 8,
                            marginBottom: i < kampanyaItems.length - 1 ? 8 : 0,
                          }}
                        >
                          {item.emoji ? <Text style={{ fontSize: 16 }}>{item.emoji}</Text> : null}
                          <Text style={{ fontSize: 12, color: '#334155', flex: 1 }}>{item.text}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              )}
            </View>
          ) : null}

          <View style={styles.card}>
            <TouchableOpacity
              onPress={() => setAcikMenu(!acikMenu)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: '#f5f3ff',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="restaurant-outline" size={18} color="#7c3aed" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Menü</Text>
                  <Text style={{ fontSize: 11, color: '#94a3b8' }} numberOfLines={1}>
                    {menuUrunler.length} ürün · {menuKategoriler.length} kategori
                  </Text>
                </View>
              </View>
              <Ionicons name={acikMenu ? 'chevron-up' : 'chevron-down'} size={20} color="#94a3b8" />
            </TouchableOpacity>
            {acikMenu && (
              <View style={{ marginTop: 12 }}>
                {menuUrunler.length === 0 ? (
                  <Text style={{ fontSize: 14, color: '#64748b', textAlign: 'center' }}>Menü bulunamadı</Text>
                ) : (
                  <>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 4 }}
                      keyboardShouldPersistTaps="handled"
                    >
                      <TouchableOpacity
                        onPress={() => setMenuSeciliKategori('all')}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 20,
                          backgroundColor: menuSeciliKategori === 'all' ? '#0d9488' : '#e2e8f0',
                        }}
                        activeOpacity={0.85}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '600',
                            color: menuSeciliKategori === 'all' ? '#ffffff' : '#64748b',
                          }}
                        >
                          Tümü
                        </Text>
                      </TouchableOpacity>
                      {menuKategoriler.map((k) => {
                        const sel = menuSeciliKategori === k.id
                        return (
                          <TouchableOpacity
                            key={k.id}
                            onPress={() => setMenuSeciliKategori(k.id)}
                            style={{
                              paddingHorizontal: 12,
                              paddingVertical: 8,
                              borderRadius: 20,
                              backgroundColor: sel ? '#0d9488' : '#e2e8f0',
                            }}
                            activeOpacity={0.85}
                          >
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: '600',
                                color: sel ? '#ffffff' : '#64748b',
                              }}
                              numberOfLines={1}
                            >
                              {k.icon ? `${k.icon} ${k.ad}` : k.ad}
                            </Text>
                          </TouchableOpacity>
                        )
                      })}
                    </ScrollView>
                    <View style={{ marginTop: 8 }}>
                      {menuDisplayGroups.map((group, gi) => (
                        <View key={group.kategori.id}>
                          <Text
                            style={{
                              fontSize: 14,
                              fontWeight: '800',
                              color: '#0A1628',
                              marginBottom: 8,
                              marginTop: gi > 0 ? 12 : 0,
                            }}
                          >
                            {group.kategori.icon ? `${group.kategori.icon} ` : ''}
                            {group.kategori.ad}
                          </Text>
                          {group.urunler.map((urun) => (
                            <View
                              key={urun.id}
                              style={{
                                flexDirection: 'row',
                                gap: 10,
                                marginBottom: 12,
                                alignItems: 'flex-start',
                              }}
                            >
                              {urun.gorsel_url ? (
                                <Image
                                  source={{ uri: urun.gorsel_url }}
                                  style={{ width: 60, height: 60, borderRadius: 8 }}
                                  contentFit="cover"
                                />
                              ) : (
                                <View
                                  style={{
                                    width: 60,
                                    height: 60,
                                    borderRadius: 8,
                                    backgroundColor: '#e2e8f0',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  <Ionicons name="image-outline" size={24} color="#94a3b8" />
                                </View>
                              )}
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={{ fontSize: 14, fontWeight: '700', color: '#0A1628' }}>{urun.ad}</Text>
                                {urun.aciklama ? (
                                  <Text
                                    style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}
                                    numberOfLines={4}
                                  >
                                    {urun.aciklama}
                                  </Text>
                                ) : null}
                                <Text style={{ fontSize: 13, fontWeight: '700', color: '#0ABAB5', marginTop: 4 }}>
                                  ₺{formatMenuFiyat(urun.fiyat)}
                                </Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </View>
            )}
          </View>

          <View style={styles.card}>
            <TouchableOpacity
              onPress={() => setAcikYorumlar(!acikYorumlar)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: '#fffbeb',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="star-outline" size={18} color="#f59e0b" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Kullanıcı Yorumları</Text>
                  <Text style={{ fontSize: 11, color: '#94a3b8' }} numberOfLines={1}>
                    {yorumlarList.length} değerlendirme
                  </Text>
                </View>
              </View>
              <Ionicons name={acikYorumlar ? 'chevron-up' : 'chevron-down'} size={20} color="#94a3b8" />
            </TouchableOpacity>
            {acikYorumlar && (
              <View style={{ marginTop: 12 }}>
                {yorumlarList.length === 0 ? (
                  <Text style={{ fontSize: 14, color: '#64748b', textAlign: 'center' }}>Henüz yorum yok</Text>
                ) : (
                  <>
                    <View style={{ marginBottom: 16 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <Text style={{ fontSize: 28, fontWeight: '800', color: '#0ABAB5' }}>
                          {yorumOzet.genel != null ? yorumOzet.genel.toFixed(1) : '—'}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Ionicons
                              key={s}
                              name="star"
                              size={18}
                              color={s <= yorumStarFilledCount(yorumOzet.genel) ? '#FBBF24' : '#e2e8f0'}
                            />
                          ))}
                        </View>
                      </View>
                      <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                        {yorumlarList.length} yorum
                      </Text>
                      {(
                        [
                          { label: 'Konum', v: yorumOzet.konum },
                          { label: 'Temizlik', v: yorumOzet.temizlik },
                          { label: 'Hizmet', v: yorumOzet.hizmet },
                          { label: 'Fiyat/Değer', v: yorumOzet.fiyat },
                        ] as const
                      ).map((rowBar) => (
                        <View key={rowBar.label} style={{ marginBottom: 8 }}>
                          <View
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: 4,
                            }}
                          >
                            <Text style={{ fontSize: 11, color: '#64748b', fontWeight: '600' }}>{rowBar.label}</Text>
                            <Text style={{ fontSize: 11, color: '#0A1628', fontWeight: '700' }}>
                              {rowBar.v != null ? rowBar.v.toFixed(1) : '—'}
                            </Text>
                          </View>
                          <View style={{ height: 4, borderRadius: 2, backgroundColor: '#e2e8f0', overflow: 'hidden' }}>
                            <View
                              style={{
                                height: 4,
                                borderRadius: 2,
                                width: `${yorumBarPct(rowBar.v)}%` as `${number}%`,
                                backgroundColor: '#0d9488',
                              }}
                            />
                          </View>
                        </View>
                      ))}
                    </View>
                    {yorumlarList.map((y, yi) => (
                      <View
                        key={y.id}
                        style={{
                          marginBottom: yi < yorumlarList.length - 1 ? 14 : 0,
                          paddingBottom: yi < yorumlarList.length - 1 ? 14 : 0,
                          borderBottomWidth: yi < yorumlarList.length - 1 ? StyleSheet.hairlineWidth : 0,
                          borderBottomColor: '#e2e8f0',
                        }}
                      >
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: 6,
                            marginBottom: 6,
                          }}
                        >
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#0A1628' }}>
                            {y.musteri_adi ?? 'Anonim'}
                          </Text>
                          {y.dogrulanmis ? (
                            <View
                              style={{
                                backgroundColor: '#dcfce7',
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderRadius: 6,
                              }}
                            >
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#15803d' }}>Doğrulanmış</Text>
                            </View>
                          ) : null}
                          <Text style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>
                            {new Date(y.created_at).toLocaleDateString('tr-TR', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Ionicons
                              key={s}
                              name="star"
                              size={14}
                              color={s <= yorumStarFilledCount(y.puan) ? '#FBBF24' : '#e2e8f0'}
                            />
                          ))}
                        </View>
                        {y.yorum ? (
                          <Text style={{ fontSize: 13, color: '#334155', lineHeight: 20 }}>{y.yorum}</Text>
                        ) : null}
                        {y.isletme_cevabi ? (
                          <View
                            style={{
                              marginTop: 10,
                              backgroundColor: '#f1f5f9',
                              borderRadius: 8,
                              padding: 10,
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748b', marginBottom: 4 }}>
                              İşletme Yanıtı:
                            </Text>
                            <Text style={{ fontSize: 12, color: '#475569' }}>{y.isletme_cevabi}</Text>
                          </View>
                        ) : null}
                      </View>
                    ))}
                  </>
                )}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <Modal visible={showPlanDatePicker} animationType="slide" transparent>
        <View style={styles.regionModalRoot}>
          <SafeAreaView style={styles.regionModalSafe} edges={['bottom']}>
            <View style={styles.calendarNavRow}>
              <TouchableOpacity onPress={() => shiftPlanCalendarMonth(-1)} hitSlop={12} accessibilityRole="button">
                <Text style={styles.calendarNavArrow}>{'<'}</Text>
              </TouchableOpacity>
              <Text style={styles.calendarMonthTitle}>{planMonthYearLabel}</Text>
              <TouchableOpacity onPress={() => shiftPlanCalendarMonth(1)} hitSlop={12} accessibilityRole="button">
                <Text style={styles.calendarNavArrow}>{'>'}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.calendarWeekdayRow}>
              {WEEKDAY_LABELS_TR.map((label, wi) => (
                <Text key={wi} style={styles.calendarWeekdayCell}>
                  {label}
                </Text>
              ))}
            </View>
            {planCalendarRows.map((calRow, ri) => (
              <View key={`plan-row-${ri}`} style={styles.calendarGridRow}>
                {calRow.map((dayNum, di) => {
                  if (dayNum == null) {
                    return <View key={`e-${ri}-${di}`} style={styles.calendarDayCell} />
                  }
                  const cy = planCalendarViewMonth.getFullYear()
                  const cm = planCalendarViewMonth.getMonth()
                  const cellMidnight = new Date(cy, cm, dayNum)
                  cellMidnight.setHours(0, 0, 0, 0)
                  const todayMidnight = new Date()
                  todayMidnight.setHours(0, 0, 0, 0)
                  const isPast = cellMidnight.getTime() < todayMidnight.getTime()
                  const cellDate = new Date(cy, cm, dayNum)
                  cellDate.setHours(12, 0, 0, 0)
                  const isToday = sameCalendarDay(cellDate, new Date())
                  const isSelected = sameCalendarDay(planPendingDate, cellDate)
                  return (
                    <TouchableOpacity
                      key={`d-${ri}-${di}`}
                      style={styles.calendarDayCell}
                      disabled={isPast}
                      activeOpacity={isPast ? 1 : 0.7}
                      onPress={() => {
                        const nd = new Date(cy, cm, dayNum)
                        nd.setHours(12, 0, 0, 0)
                        setPlanPendingDate(nd)
                      }}
                    >
                      {isSelected ? (
                        <View style={styles.calendarDaySelected}>
                          <Text style={styles.calendarDaySelectedText}>{dayNum}</Text>
                        </View>
                      ) : (
                        <Text
                          style={[
                            styles.calendarDayText,
                            isPast && styles.calendarDayPast,
                            isToday && !isPast && styles.calendarDayToday,
                          ]}
                        >
                          {dayNum}
                        </Text>
                      )}
                    </TouchableOpacity>
                  )
                })}
              </View>
            ))}
            <View style={styles.calendarFooterRow}>
              <TouchableOpacity
                style={styles.calendarBtnCancel}
                onPress={() => setShowPlanDatePicker(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.calendarBtnCancelText}>İPTAL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.calendarBtnOk} onPress={onPlanCalendarConfirm} activeOpacity={0.85}>
                <Text style={styles.calendarBtnOkText}>TAMAM</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      <View style={[styles.stickyBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.stickyBarRow}>
          <TouchableOpacity
            style={styles.stickyBackBtn}
            activeOpacity={0.9}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Geri Dön"
          >
            <Ionicons name="arrow-back-outline" size={18} color="#334155" />
            <Text style={styles.stickyBackBtnText}>Geri Dön</Text>
          </TouchableOpacity>
          {row.telefon?.trim() ? (
            <TouchableOpacity
              style={styles.stickyCallBtn}
              activeOpacity={0.9}
              onPress={() => {
                void Linking.openURL(`tel:${String(row.telefon).replace(/\s/g, '')}`)
              }}
              accessibilityRole="button"
              accessibilityLabel="Tesisi Ara"
            >
              <Ionicons name="call-outline" size={18} color="#0d9488" />
              <Text style={styles.stickyCallBtnText}>Tesisi Ara</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.stickyReserveBtn}
            activeOpacity={0.9}
            onPress={() => Alert.alert('Yakında', 'Ödeme sistemi yakında aktif olacak')}
            accessibilityRole="button"
          >
            <Text style={styles.stickyReserveBtnText}>Rezervasyon Yap</Text>
          </TouchableOpacity>
        </View>
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
    paddingHorizontal: 12,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 10,
  },
  stickyBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stickyBackBtn: {
    flex: 1,
    height: 48,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: '#f1f5f9',
    borderRadius: 24,
    paddingHorizontal: 4,
  },
  stickyBackBtnText: { fontSize: 10, fontWeight: '600', color: '#334155' },
  stickyCallBtn: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#0d9488',
    borderRadius: 24,
    paddingHorizontal: 8,
  },
  stickyCallBtnText: { fontSize: 12, fontWeight: '700', color: '#0d9488' },
  stickyReserveBtn: {
    flex: 2,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0d9488',
    borderRadius: 14,
    paddingHorizontal: 10,
    shadowColor: '#0d9488',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 5,
  },
  stickyReserveBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  regionModalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  regionModalSafe: { maxHeight: '85%', backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  calendarNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  calendarNavArrow: { fontSize: 15, fontWeight: '700', color: '#0A1628', paddingHorizontal: 6 },
  calendarMonthTitle: { fontSize: 13, fontWeight: '700', color: '#0A1628' },
  calendarWeekdayRow: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6 },
  calendarWeekdayCell: { flex: 1, textAlign: 'center', fontSize: 9, fontWeight: '600', color: '#64748b' },
  calendarGridRow: { flexDirection: 'row', paddingHorizontal: 12 },
  calendarDayCell: {
    flex: 1,
    minWidth: 30,
    minHeight: 30,
    maxHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDayText: { fontSize: 11, color: '#0A1628' },
  calendarDayPast: { opacity: 0.3 },
  calendarDayToday: { color: '#0ABAB5', fontWeight: '700' },
  calendarDaySelected: {
    width: 27,
    height: 27,
    borderRadius: 13.5,
    backgroundColor: '#0ABAB5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDaySelectedText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  calendarFooterRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  calendarBtnCancel: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  calendarBtnCancelText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  calendarBtnOk: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#0ABAB5',
  },
  calendarBtnOkText: { fontSize: 12, fontWeight: '700', color: '#fff' },
})
