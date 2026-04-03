import Slider from '@react-native-community/slider'
import { Ionicons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthLocale } from '../../lib/auth-locale-context'
import { supabase } from '../../lib/supabase'

export type TesisRow = {
  id: string
  ad: string
  slug: string
  kategori?: string | string[] | null
  sehir: string | null
  ilce: string | null
  fotograflar: unknown
  puan: number | null
  imkanlar: unknown
  lat?: number | null
  lon?: number | null
}

const WEEKDAY_LABELS_TR = ['P', 'P', 'S', 'Ç', 'P', 'C', 'C'] as const
const WEEKDAY_LABELS_EN = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const

function sameCalendarDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function firstPhotoSrc(fotograflar: unknown): string | null {
  if (!fotograflar || !Array.isArray(fotograflar)) return null
  const first = fotograflar[0] as { src?: string }
  return typeof first?.src === 'string' ? first.src : null
}

function parseImkanlar(raw: unknown): string[] {
  if (raw == null) return []
  if (Array.isArray(raw)) {
    return raw
      .map((x) => {
        if (typeof x === 'string') return x
        if (x && typeof x === 'object' && 'ad' in x) return String((x as { ad: string }).ad)
        if (x && typeof x === 'object' && 'name' in x) return String((x as { name: string }).name)
        return ''
      })
      .filter(Boolean)
      .slice(0, 6)
  }
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown
      return parseImkanlar(p)
    } catch {
      return raw ? [raw] : []
    }
  }
  return []
}

function parseImkanlarAll(raw: unknown): string[] {
  if (raw == null) return []
  if (Array.isArray(raw)) {
    return raw
      .map((x) => {
        if (typeof x === 'string') return x
        if (x && typeof x === 'object' && 'ad' in x) return String((x as { ad: string }).ad)
        if (x && typeof x === 'object' && 'name' in x) return String((x as { name: string }).name)
        return ''
      })
      .filter(Boolean)
  }
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown
      return parseImkanlarAll(p)
    } catch {
      return raw ? [raw] : []
    }
  }
  return []
}

function paramString(v: string | string[] | undefined): string {
  if (typeof v === 'string') return v
  if (Array.isArray(v) && v[0]) return v[0]
  return ''
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function matchesFacilityType(ad: string, typeKey: string | null): boolean {
  if (!typeKey) return true
  if (typeKey === 'hotel') return /hotel|otel|resort|suites/i.test(ad)
  if (typeKey === 'beach') return /beach|plaj|club|sahil|kumsal/i.test(ad)
  return /aqua|water|park|aquapark/i.test(ad)
}

function typeBadgesForAd(ad: string, t: { home: { facilityTypeHotel: string; facilityTypeBeachClub: string; facilityTypeAquaPark: string } }): string[] {
  const badges: string[] = []
  if (/hotel|otel|resort|suites/i.test(ad)) badges.push(t.home.facilityTypeHotel)
  if (/beach|plaj|club|sahil|kumsal/i.test(ad)) badges.push(t.home.facilityTypeBeachClub)
  if (/aqua|water|park|aquapark/i.test(ad)) badges.push(t.home.facilityTypeAquaPark)
  return badges.slice(0, 4)
}

export default function SearchScreen() {
  const router = useRouter()
  const { lang, t } = useAuthLocale()
  const params = useLocalSearchParams<{ region?: string; facilityTypeKey?: string; date?: string; facilityName?: string }>()

  const [region, setRegion] = useState(() => paramString(params.region))
  const [facilityName, setFacilityName] = useState(() => paramString(params.facilityName))
  const [facilityTypeKey, setFacilityTypeKey] = useState<string | null>(() => {
    const k = paramString(params.facilityTypeKey)
    return k === '' ? null : k
  })
  const [date, setDate] = useState(() => {
    const ds = paramString(params.date)
    if (ds) {
      const d = new Date(ds)
      if (!isNaN(d.getTime())) {
        d.setHours(12, 0, 0, 0)
        return d
      }
    }
    const n = new Date()
    n.setHours(12, 0, 0, 0)
    return n
  })

  const [showDatePicker, setShowDatePicker] = useState(false)
  const [calendarViewMonth, setCalendarViewMonth] = useState(() => new Date())
  const [pendingDate, setPendingDate] = useState(() => new Date())

  const [showTypeModal, setShowTypeModal] = useState(false)
  const [searchResults, setSearchResults] = useState<TesisRow[]>([])
  const [loading, setLoading] = useState(false)
  const [filterTab, setFilterTab] = useState<'all' | 'hotel' | 'beach' | 'aqua'>('all')
  const [kisiSayisi, setKisiSayisi] = useState<number | null>(null)
  const [showKisiModal, setShowKisiModal] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [mesafe, setMesafe] = useState<number>(10)
  const [gpsKonum, setGpsKonum] = useState<{ lat: number; lon: number } | null>(null)

  const [showFilterModal, setShowFilterModal] = useState(false)
  const [siralama, setSiralama] = useState<'populer' | 'ucuzdan' | 'pahalidan' | 'puan'>('populer')
  const [minPuan, setMinPuan] = useState<number | null>(null)
  const [secilenImkanlar, setSecilenImkanlar] = useState<string[]>([])
  const [tumImkanlar, setTumImkanlar] = useState<string[]>([])
  const [minFiyat, setMinFiyat] = useState<number>(0)
  const [maxFiyat, setMaxFiyat] = useState<number>(5000)

  const locale = lang === 'tr' ? 'tr-TR' : 'en-US'
  const formatDate = useCallback(
    (d: Date) => d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }),
    [locale],
  )

  const typeOptions = useMemo(
    () => [
      { key: 'hotel', label: t.home.facilityTypeHotel },
      { key: 'beach', label: t.home.facilityTypeBeachClub },
      { key: 'aqua', label: t.home.facilityTypeAquaPark },
    ],
    [t],
  )

  const selectedTypeLabel = facilityTypeKey
    ? typeOptions.find((o) => o.key === facilityTypeKey)?.label ?? t.home.facilityTypePlaceholder
    : t.home.facilityTypePlaceholder

  const runSearch = useCallback(async () => {
    setLoading(true)

    const runQuery = (selectCols: string) => {
      let q = supabase.from('tesisler').select(selectCols)
      const r = region.trim()
      if (r.includes(',')) {
        const parts = r.split(',').map((s) => s.trim())
        const ilcePart = parts[0]
        const sehirPart = parts[1]
        if (ilcePart) q = q.ilike('ilce', `%${ilcePart}%`)
        if (sehirPart) q = q.ilike('sehir', `%${sehirPart}%`)
      } else if (r) {
        const safe = r.replace(/%/g, '')
        q = q.or(`sehir.ilike.%${safe}%,ilce.ilike.%${safe}%`)
      }
      if (facilityName.trim()) {
        q = q.ilike('ad', `%${facilityName.trim()}%`)
      }
      return q.order('puan', { ascending: false })
    }

    const selectBase = 'id, ad, slug, kategori, sehir, ilce, fotograflar, puan, imkanlar'
    let { data, error } = await runQuery(`${selectBase}, lat, lon`)
    let hasLatLonCols = true
    if (error) {
      const r2 = await runQuery(selectBase)
      if (r2.error) {
        setLoading(false)
        setSearchResults([])
        return
      }
      data = r2.data
      hasLatLonCols = false
    }
    setLoading(false)
    let out = (data as TesisRow[]) ?? []
    if (facilityTypeKey) {
      out = out.filter((row) => matchesFacilityType(row.ad, facilityTypeKey))
    }
    if (gpsKonum && hasLatLonCols) {
      out = out.filter((row) => {
        const lat = row.lat
        const lon = row.lon
        if (lat == null || lon == null) return true
        const la = Number(lat)
        const lo = Number(lon)
        if (Number.isNaN(la) || Number.isNaN(lo)) return true
        return haversineKm(gpsKonum.lat, gpsKonum.lon, la, lo) <= mesafe
      })
    }
    setSearchResults(out)
  }, [region, facilityName, facilityTypeKey, mesafe, gpsKonum])

  useEffect(() => {
    void runSearch()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial search from route params only
  }, [])

  useEffect(() => {
    let cancelled = false
    void supabase
      .from('tesisler')
      .select('imkanlar')
      .then(({ data, error }) => {
        if (cancelled || error || !data) return
        const uniq = new Set<string>()
        for (const row of data) {
          for (const im of parseImkanlarAll(row.imkanlar)) {
            uniq.add(im)
          }
        }
        setTumImkanlar(Array.from(uniq).sort((a, b) => a.localeCompare(b, 'tr')))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const openDatePickerModal = () => {
    const d = new Date(date)
    d.setHours(12, 0, 0, 0)
    setPendingDate(d)
    setCalendarViewMonth(new Date(d.getFullYear(), d.getMonth(), 1))
    setShowDatePicker(true)
  }

  const shiftCalendarMonth = (delta: number) => {
    setCalendarViewMonth((vm) => {
      const next = new Date(vm)
      next.setMonth(next.getMonth() + delta)
      return next
    })
  }

  const onCalendarConfirm = () => {
    const d = new Date(pendingDate)
    d.setHours(12, 0, 0, 0)
    setDate(d)
    setShowDatePicker(false)
  }

  const calendarRows = useMemo(() => {
    const y = calendarViewMonth.getFullYear()
    const m = calendarViewMonth.getMonth()
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
  }, [calendarViewMonth])

  const weekdayLabels = lang === 'tr' ? WEEKDAY_LABELS_TR : WEEKDAY_LABELS_EN
  const monthYearLabel = calendarViewMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' })

  const getKategori = (r: TesisRow): string[] => {
    if (Array.isArray(r.kategori)) return r.kategori
    if (typeof r.kategori === 'string') {
      try {
        return JSON.parse(r.kategori)
      } catch {
        return []
      }
    }
    return []
  }

  const filteredResults = useMemo(() => {
    let list: TesisRow[]
    if (filterTab === 'all') list = [...searchResults]
    else if (filterTab === 'beach') {
      list = searchResults.filter((r) => getKategori(r).some((k) => k.toUpperCase().includes('BEACH')))
    } else if (filterTab === 'hotel') {
      list = searchResults.filter((r) => getKategori(r).some((k) => k.toUpperCase().includes('HOTEL')))
    } else {
      list = searchResults.filter((r) => getKategori(r).some((k) => k.toUpperCase().includes('AQUA')))
    }

    if (minPuan != null) {
      list = list.filter((r) => r.puan != null && Number(r.puan) >= minPuan)
    }

    if (secilenImkanlar.length > 0) {
      list = list.filter((r) => {
        const ims = parseImkanlarAll(r.imkanlar)
        const set = new Set(ims)
        return secilenImkanlar.every((req) => set.has(req))
      })
    }

    const puanVal = (r: TesisRow) => {
      if (r.puan == null) return NaN
      const n = Number(r.puan)
      return Number.isNaN(n) ? NaN : n
    }

    list.sort((a, b) => {
      if (siralama === 'populer') return 0
      const pa = puanVal(a)
      const pb = puanVal(b)
      if (siralama === 'ucuzdan') {
        if (Number.isNaN(pa) && Number.isNaN(pb)) return 0
        if (Number.isNaN(pa)) return 1
        if (Number.isNaN(pb)) return -1
        return pa - pb
      }
      if (siralama === 'pahalidan' || siralama === 'puan') {
        if (Number.isNaN(pa) && Number.isNaN(pb)) return 0
        if (Number.isNaN(pa)) return 1
        if (Number.isNaN(pb)) return -1
        return pb - pa
      }
      return 0
    })

    return list
  }, [searchResults, filterTab, siralama, minPuan, secilenImkanlar])

  const onUseGps = async () => {
    setGpsLoading(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') return
      const pos = await Location.getCurrentPositionAsync({})
      setGpsKonum({ lat: pos.coords.latitude, lon: pos.coords.longitude })
      const [rev] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      })
      if (rev) {
        const district = rev.district ?? rev.subregion ?? ''
        const city = rev.city ?? rev.region ?? ''
        const parts = [district, city].filter(Boolean)
        if (parts.length > 0) setRegion(parts.join(', '))
      }
    } finally {
      setGpsLoading(false)
    }
  }

  const tabItems: { key: 'all' | 'hotel' | 'beach' | 'aqua'; label: string }[] = [
    { key: 'all', label: lang === 'tr' ? 'Tümü' : 'All' },
    { key: 'beach', label: t.home.facilityTypeBeachClub },
    { key: 'hotel', label: t.home.facilityTypeHotel },
    { key: 'aqua', label: t.home.facilityTypeAquaPark },
  ]

  const tabCounts = useMemo(() => {
    const sr = searchResults
    return {
      all: sr.length,
      beach: sr.filter((r) => getKategori(r).some((k) => k.toUpperCase().includes('BEACH'))).length,
      hotel: sr.filter((r) => getKategori(r).some((k) => k.toUpperCase().includes('HOTEL'))).length,
      aqua: sr.filter((r) => getKategori(r).some((k) => k.toUpperCase().includes('AQUA'))).length,
    }
  }, [searchResults])

  const facilityNameMatches = useMemo(() => {
    const q = facilityName.trim().toLowerCase()
    if (!q) return []
    return searchResults.filter((r) => r.ad.toLowerCase().includes(q))
  }, [searchResults, facilityName])

  const kisiModalOptions = useMemo(
    () => [
      { value: 1, label: lang === 'tr' ? '1 Kişi' : '1 Guest' },
      { value: 2, label: lang === 'tr' ? '2 Kişi' : '2 Guests' },
      { value: 3, label: lang === 'tr' ? '3 Kişi' : '3 Guests' },
      { value: 4, label: lang === 'tr' ? '4 Kişi' : '4 Guests' },
      { value: 5, label: lang === 'tr' ? '5+ Kişi' : '5+ Guests' },
    ],
    [lang],
  )

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Modal visible={showDatePicker} animationType="slide" transparent>
        <View style={styles.regionModalRoot}>
          <SafeAreaView style={styles.regionModalSafe} edges={['bottom']}>
            <View style={styles.calendarNavRow}>
              <TouchableOpacity onPress={() => shiftCalendarMonth(-1)} hitSlop={12} accessibilityRole="button">
                <Text style={styles.calendarNavArrow}>{'<'}</Text>
              </TouchableOpacity>
              <Text style={styles.calendarMonthTitle}>{monthYearLabel}</Text>
              <TouchableOpacity onPress={() => shiftCalendarMonth(1)} hitSlop={12} accessibilityRole="button">
                <Text style={styles.calendarNavArrow}>{'>'}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.calendarWeekdayRow}>
              {weekdayLabels.map((label, wi) => (
                <Text key={wi} style={styles.calendarWeekdayCell}>
                  {label}
                </Text>
              ))}
            </View>
            {calendarRows.map((row, ri) => (
              <View key={`row-${ri}`} style={styles.calendarGridRow}>
                {row.map((dayNum, di) => {
                  if (dayNum == null) {
                    return <View key={`e-${ri}-${di}`} style={styles.calendarDayCell} />
                  }
                  const cy = calendarViewMonth.getFullYear()
                  const cm = calendarViewMonth.getMonth()
                  const cellMidnight = new Date(cy, cm, dayNum)
                  cellMidnight.setHours(0, 0, 0, 0)
                  const todayMidnight = new Date()
                  todayMidnight.setHours(0, 0, 0, 0)
                  const isPast = cellMidnight.getTime() < todayMidnight.getTime()
                  const cellDate = new Date(cy, cm, dayNum)
                  cellDate.setHours(12, 0, 0, 0)
                  const isToday = sameCalendarDay(cellDate, new Date())
                  const isSelected = sameCalendarDay(pendingDate, cellDate)
                  return (
                    <TouchableOpacity
                      key={`d-${ri}-${di}`}
                      style={styles.calendarDayCell}
                      disabled={isPast}
                      activeOpacity={isPast ? 1 : 0.7}
                      onPress={() => {
                        const nd = new Date(cy, cm, dayNum)
                        nd.setHours(12, 0, 0, 0)
                        setPendingDate(nd)
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
              <TouchableOpacity style={styles.calendarBtnCancel} onPress={() => setShowDatePicker(false)} activeOpacity={0.85}>
                <Text style={styles.calendarBtnCancelText}>İPTAL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.calendarBtnOk} onPress={onCalendarConfirm} activeOpacity={0.85}>
                <Text style={styles.calendarBtnOkText}>TAMAM</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      <Modal visible={showTypeModal} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setShowTypeModal(false)}>
          <Pressable style={styles.typeSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.typeSheetTitle}>{t.home.selectFacilityType}</Text>
            {typeOptions.map((o) => (
              <TouchableOpacity
                key={o.key}
                style={styles.typeOptionRow}
                onPress={() => {
                  setFacilityTypeKey(o.key)
                  setShowTypeModal(false)
                }}
                activeOpacity={0.85}
              >
                <View style={styles.typeOptionRowLeft}>
                  <Ionicons
                    name={o.key === 'hotel' ? 'bed-outline' : o.key === 'beach' ? 'umbrella-outline' : 'water-outline'}
                    size={16}
                    color="#0ABAB5"
                  />
                  <Text style={styles.typeOptionText}>{o.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.typeOptionRow}
              onPress={() => {
                setFacilityTypeKey(null)
                setShowTypeModal(false)
              }}
              activeOpacity={0.85}
            >
              <Text style={[styles.typeOptionText, { opacity: 0.6 }]}>—</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showKisiModal} animationType="slide" transparent>
        <View style={styles.regionModalRoot}>
          <SafeAreaView style={styles.regionModalSafe} edges={['top']}>
            <View style={styles.regionModalHeader}>
              <Text style={[styles.regionModalTitle, { flex: 1 }]}>{lang === 'tr' ? 'Kişi Sayısı' : 'Number of guests'}</Text>
              <TouchableOpacity onPress={() => setShowKisiModal(false)} hitSlop={12} accessibilityRole="button">
                <Ionicons name="close" size={24} color="#0A1628" />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {kisiModalOptions.map((opt) => {
                const selected = kisiSayisi === opt.value
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={styles.kisiModalRow}
                    onPress={() => {
                      setKisiSayisi(opt.value)
                      setShowKisiModal(false)
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={styles.kisiModalRowLeft}>
                      <Ionicons name="people-outline" size={22} color="#0A1628" />
                      <Text style={styles.kisiModalRowText}>{opt.label}</Text>
                    </View>
                    {selected ? <Ionicons name="checkmark" size={22} color="#0ABAB5" /> : null}
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      <Modal visible={showFilterModal} animationType="slide" transparent>
        <View style={styles.regionModalRoot}>
          <SafeAreaView style={styles.regionModalSafe} edges={['top', 'bottom']}>
            <View style={styles.regionModalHeader}>
              <Text style={[styles.regionModalTitle, { flex: 1 }]}>Filtrele</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)} hitSlop={12} accessibilityRole="button">
                <Ionicons name="close" size={24} color="#0A1628" />
              </TouchableOpacity>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.filterModalScrollContent}
            >
              <Text style={styles.filterSectionLabel}>SIRALAMA</Text>
              <View style={styles.filterSortGrid}>
                {(
                  [
                    { key: 'populer' as const, label: '⭐ Popüler' },
                    { key: 'ucuzdan' as const, label: '💰 Ucuzdan Pahalıya' },
                    { key: 'pahalidan' as const, label: '💎 Pahalıdan Ucuza' },
                    { key: 'puan' as const, label: '🏆 En Yüksek Puan' },
                  ] as const
                ).map((opt) => {
                  const active = siralama === opt.key
                  return (
                    <View key={opt.key} style={styles.filterSortCell}>
                      <TouchableOpacity
                        style={[styles.filterSortBtn, active && styles.filterSortBtnActive]}
                        onPress={() => setSiralama(opt.key)}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.filterSortBtnText, active && styles.filterSortBtnTextActive]} numberOfLines={2}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )
                })}
              </View>

              <Text style={styles.filterSectionLabel}>MİNİMUM PUAN</Text>
              <View style={styles.filterPuanRow}>
                {(
                  [
                    { value: null as number | null, label: 'Tümü' },
                    { value: 3 as number | null, label: '3★+' },
                    { value: 4 as number | null, label: '4★+' },
                    { value: 4.5 as number | null, label: '4.5★+' },
                  ] as const
                ).map((opt) => {
                  const active = minPuan === opt.value
                  return (
                    <TouchableOpacity
                      key={String(opt.value)}
                      style={[styles.filterPuanPill, active && styles.filterPuanPillActive]}
                      onPress={() => setMinPuan(opt.value)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.filterPuanPillText, active && styles.filterPuanPillTextActive]}>{opt.label}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>

              <Text style={styles.filterSectionLabel}>ÖZELLİKLER</Text>
              <View style={styles.filterImkanWrap}>
                {tumImkanlar.map((im) => {
                  const active = secilenImkanlar.includes(im)
                  return (
                    <TouchableOpacity
                      key={im}
                      style={[styles.filterImkanPill, active && styles.filterImkanPillActive]}
                      onPress={() => {
                        setSecilenImkanlar((prev) =>
                          prev.includes(im) ? prev.filter((x) => x !== im) : [...prev, im],
                        )
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.filterImkanPillText, active && styles.filterImkanPillTextActive]} numberOfLines={2}>
                        {im}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </ScrollView>
            <View style={styles.filterModalFooter}>
              <TouchableOpacity
                style={styles.filterClearBtn}
                onPress={() => {
                  setSiralama('populer')
                  setMinPuan(null)
                  setSecilenImkanlar([])
                  setMinFiyat(0)
                  setMaxFiyat(5000)
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.filterClearBtnText}>Temizle</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.filterApplyBtn}
                onPress={() => setShowFilterModal(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.filterApplyBtnText}>Sonuçları Gör</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{lang === 'tr' ? 'Tesis Ara' : 'Search facilities'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        <View style={styles.fieldRow}>
          <Ionicons name="map-outline" size={20} color="#0A1628" />
          <Text style={styles.locText} numberOfLines={2}>
            {region || (lang === 'tr' ? 'Konum seçin' : 'Select location')}
          </Text>
          <TouchableOpacity style={styles.gpsBtn} onPress={onUseGps} disabled={gpsLoading} activeOpacity={0.85}>
            {gpsLoading ? (
              <ActivityIndicator size="small" color="#0ABAB5" />
            ) : (
              <Text style={styles.gpsBtnText}>+ GPS</Text>
            )}
          </TouchableOpacity>
        </View>

        {gpsKonum ? (
          <View style={styles.mesafeSliderBlock}>
            <Text style={styles.mesafeSliderLabel}>
              {lang === 'tr'
                ? `Çevremdeki tesisler — yarıçap: ${mesafe} km`
                : `Facilities nearby — radius: ${mesafe} km`}
            </Text>
            <Slider
              minimumValue={1}
              maximumValue={50}
              step={1}
              value={mesafe}
              onValueChange={(val) => setMesafe(Math.round(val))}
              minimumTrackTintColor="#0ABAB5"
              maximumTrackTintColor="#e2e8f0"
              thumbTintColor="#0ABAB5"
            />
          </View>
        ) : null}

        <Text style={styles.fieldLabel}>{lang === 'tr' ? 'TESİS TİPİ' : 'FACILITY TYPE'}</Text>
        <TouchableOpacity style={styles.fieldRow} onPress={() => setShowTypeModal(true)} activeOpacity={0.85}>
          <Ionicons name="business-outline" size={18} color="#0A1628" />
          <Text style={[styles.fieldInput, styles.fieldFakeInput]} numberOfLines={1}>
            {selectedTypeLabel}
          </Text>
          <Ionicons name="chevron-down" size={18} color="#0A1628" />
        </TouchableOpacity>

        <Text style={styles.fieldLabel}>{lang === 'tr' ? 'TARİH' : 'DATE'}</Text>
        <TouchableOpacity style={styles.fieldRow} onPress={openDatePickerModal} activeOpacity={0.85}>
          <Ionicons name="calendar-outline" size={18} color="#0A1628" />
          <Text style={[styles.fieldInput, styles.fieldFakeInput]}>{formatDate(date)}</Text>
        </TouchableOpacity>

        <Text style={styles.fieldLabel}>{lang === 'tr' ? 'KİŞİ' : 'GUESTS'}</Text>
        <TouchableOpacity style={styles.fieldRow} onPress={() => setShowKisiModal(true)} activeOpacity={0.85}>
          <Ionicons name="people-outline" size={18} color="#0A1628" />
          <Text
            style={[styles.fieldInput, styles.fieldFakeInput, !kisiSayisi && { color: '#94a3b8' }]}
            numberOfLines={1}
          >
            {kisiSayisi != null
              ? kisiSayisi === 5
                ? lang === 'tr'
                  ? '5+ Kişi'
                  : '5+ Guests'
                : lang === 'tr'
                  ? `${kisiSayisi} Kişi`
                  : `${kisiSayisi} Guests`
              : lang === 'tr'
                ? 'Kişi sayısı'
                : 'Guest count'}
          </Text>
          <Ionicons name="chevron-down" size={18} color="#0A1628" />
        </TouchableOpacity>

        <Text style={styles.fieldLabel}>{lang === 'tr' ? 'TESİS ADI' : 'FACILITY NAME'}</Text>
        <View style={styles.fieldRow}>
          <Ionicons name="search-outline" size={18} color="#0A1628" />
          <TextInput
            placeholder={t.home.facilityNamePlaceholder}
            value={facilityName}
            onChangeText={setFacilityName}
            style={styles.fieldInput}
            placeholderTextColor="#94a3b8"
          />
        </View>
        {facilityName.trim().length > 0 ? (
          <View style={styles.facilityNameDropdown}>
            {facilityNameMatches.length > 0 ? (
              <ScrollView style={styles.facilityNameDropdownScroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                {facilityNameMatches.map((row) => (
                  <TouchableOpacity
                    key={row.id}
                    style={styles.facilityNameDropdownRow}
                    activeOpacity={0.85}
                    onPress={() => setFacilityName(row.ad)}
                  >
                    <Text style={styles.facilityNameDropdownRowText} numberOfLines={2}>
                      {row.ad}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.facilityNameDropdownEmpty}>Tesis bulunamadı</Text>
            )}
          </View>
        ) : null}

        <TouchableOpacity style={styles.searchOrangeBtn} onPress={() => void runSearch()} activeOpacity={0.9} disabled={loading}>
          <Text style={styles.searchOrangeBtnText}>{lang === 'tr' ? 'Ara' : 'Search'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.filterOpenBtn} onPress={() => setShowFilterModal(true)} activeOpacity={0.85}>
          <Text style={styles.filterOpenBtnText}>Filtrele</Text>
        </TouchableOpacity>

        <View style={styles.tabsRow}>
          {tabItems.map((tab) => {
            const active = filterTab === tab.key
            const n = tabCounts[tab.key]
            const tabLabel = n > 0 ? `${tab.label} (${n})` : tab.label
            return (
              <TouchableOpacity key={tab.key} style={styles.tab} onPress={() => setFilterTab(tab.key)} activeOpacity={0.85}>
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{tabLabel}</Text>
                {active ? <View style={styles.tabUnderline} /> : null}
              </TouchableOpacity>
            )
          })}
        </View>

        <Text style={styles.resultCount}>
          {lang === 'tr' ? `${filteredResults.length} tesis listeleniyor` : `${filteredResults.length} facilities listed`}
        </Text>

        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color="#0ABAB5" />
          </View>
        ) : (
          filteredResults.map((item) => {
            const src = firstPhotoSrc(item.fotograflar)
            const konum = [item.sehir, item.ilce].filter(Boolean).join(', ')
            const badges = typeBadgesForAd(item.ad, t)
            const tags = parseImkanlar(item.imkanlar)
            const extraTags = tags.filter((tag) => !badges.includes(tag)).slice(0, 2)
            return (
              <View key={item.id} style={styles.card}>
                <Pressable style={styles.cardPress} onPress={() => router.push(`/tesis/${encodeURIComponent(item.slug)}`)}>
                  <View style={styles.cardImageWrap}>
                    {src ? (
                      <Image source={{ uri: src }} style={styles.cardImage} contentFit="cover" />
                    ) : (
                      <View style={[styles.cardImage, styles.cardImagePh]}>
                        <Ionicons name="image-outline" size={36} color="#0ABAB5" />
                      </View>
                    )}
                    <View style={styles.searchCardRatingPill}>
                      <Ionicons name="star" size={12} color="#fff" />
                      <Text style={styles.searchCardRatingText}>{item.puan != null ? Number(item.puan).toFixed(1) : '—'}</Text>
                    </View>
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {item.ad}
                    </Text>
                    <View style={styles.badgeRow}>
                      {badges.map((b) => (
                        <View key={`${item.id}-b-${b}`} style={styles.typeBadge}>
                          <Text style={styles.typeBadgeText}>{b}</Text>
                        </View>
                      ))}
                      {extraTags.map((tag, ti) => (
                        <View key={`${item.id}-t-${ti}`} style={styles.tagChip}>
                          <Text style={styles.tagChipText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                    {konum ? (
                      <View style={styles.cardLocRow}>
                        <Ionicons name="location-outline" size={14} color="#64748b" />
                        <Text style={styles.cardLoc} numberOfLines={1}>
                          {konum}
                        </Text>
                      </View>
                    ) : null}
                    <TouchableOpacity style={styles.loungerBtn} activeOpacity={0.9} onPress={() => router.push(`/tesis/${encodeURIComponent(item.slug)}`)}>
                      <Text style={styles.loungerBtnText}>{lang === 'tr' ? 'Şezlong Seç →' : 'Select lounger →'}</Text>
                    </TouchableOpacity>
                  </View>
                </Pressable>
              </View>
            )
          })
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#ffffff' },
  scroll: { flex: 1, backgroundColor: '#f0f4f8' },
  scrollContent: { paddingBottom: 32, paddingHorizontal: 16 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a56db',
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff' },
  locText: { flex: 1, fontSize: 12, color: '#0A1628' },
  gpsBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  gpsBtnText: { fontSize: 12, fontWeight: '700', color: '#0ABAB5' },
  mesafeSliderBlock: { marginBottom: 4 },
  mesafeSliderLabel: { fontSize: 12, fontWeight: '600', color: '#0A1628', marginBottom: 6 },
  fieldLabel: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#0A1628',
    opacity: 0.7,
    marginBottom: 1,
    marginTop: 4,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 4,
    gap: 8,
    backgroundColor: '#fafbfc',
  },
  fieldInput: { flex: 1, fontSize: 8, color: '#0A1628' },
  fieldFakeInput: { paddingVertical: 0 },
  facilityNameDropdown: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    backgroundColor: '#fff',
    marginBottom: 4,
    overflow: 'hidden',
  },
  facilityNameDropdownScroll: { maxHeight: 200 },
  facilityNameDropdownRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  facilityNameDropdownRowText: { fontSize: 12, color: '#0A1628' },
  facilityNameDropdownEmpty: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 12,
    paddingVertical: 12,
  },
  searchOrangeBtn: {
    backgroundColor: '#1a56db',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  searchOrangeBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  tabsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 8,
  },
  tab: { alignItems: 'center', paddingVertical: 6 },
  tabText: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  tabTextActive: { color: '#0ABAB5', fontWeight: '700' },
  tabUnderline: {
    marginTop: 4,
    height: 2,
    width: '100%',
    backgroundColor: '#0ABAB5',
    borderRadius: 1,
  },
  resultCount: { fontSize: 13, color: '#64748b', marginBottom: 12 },
  loaderWrap: { paddingVertical: 40, alignItems: 'center' },
  card: {
    marginBottom: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0A1628',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
    }),
  },
  cardPress: { overflow: 'hidden' },
  cardImageWrap: { position: 'relative' },
  cardImage: { width: '100%', height: 140 },
  cardImagePh: { backgroundColor: '#e0f7f6', alignItems: 'center', justifyContent: 'center' },
  searchCardRatingPill: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0ABAB5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  searchCardRatingText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  cardBody: { paddingVertical: 10, paddingHorizontal: 10 },
  cardTitle: { fontSize: 13, fontWeight: '800', color: '#0A1628', marginBottom: 6 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 },
  typeBadge: {
    backgroundColor: '#e0f7f6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#0ABAB5',
  },
  typeBadgeText: { fontSize: 10, fontWeight: '700', color: '#0ABAB5' },
  tagChip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tagChipText: { fontSize: 10, color: '#475569', fontWeight: '600' },
  cardLocRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  cardLoc: { flex: 1, fontSize: 11, color: '#64748b' },
  loungerBtn: {
    backgroundColor: '#1a56db',
    borderRadius: 10,
    paddingVertical: 7,
    alignItems: 'center',
  },
  loungerBtnText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,22,40,0.45)' },
  typeSheet: {
    margin: 24,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    maxHeight: '70%',
  },
  typeSheetTitle: { fontSize: 17, fontWeight: '700', color: '#0A1628', marginBottom: 12 },
  typeOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 5,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#0ABAB5',
    backgroundColor: '#fafbfc',
  },
  typeOptionRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  typeOptionText: { fontSize: 13, color: '#0A1628' },
  regionModalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  regionModalSafe: { maxHeight: '85%', backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  regionModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  regionModalTitle: { fontSize: 17, fontWeight: '700', color: '#0A1628' },
  kisiModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#0ABAB5',
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
    backgroundColor: '#fff',
  },
  kisiModalRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  kisiModalRowText: { fontSize: 16, color: '#0A1628', fontWeight: '600' },
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
  filterOpenBtn: {
    borderWidth: 1,
    borderColor: '#1a56db',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  filterOpenBtnText: { color: '#1a56db', fontWeight: '700', fontSize: 14 },
  filterModalScrollContent: { paddingHorizontal: 16, paddingBottom: 16 },
  filterSectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: '#0A1628',
    opacity: 0.7,
    marginBottom: 8,
    marginTop: 12,
  },
  filterSortGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  filterSortCell: { width: '48%', marginBottom: 4 },
  filterSortBtn: {
    borderWidth: 1,
    borderColor: '#1a56db',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    backgroundColor: '#fff',
  },
  filterSortBtnActive: { backgroundColor: '#1a56db', borderColor: '#1a56db' },
  filterSortBtnText: { fontSize: 11, fontWeight: '600', color: '#1a56db', textAlign: 'center' },
  filterSortBtnTextActive: { color: '#fff' },
  filterPuanRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterPuanPill: {
    borderWidth: 1,
    borderColor: '#1a56db',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
  },
  filterPuanPillActive: { backgroundColor: '#1a56db', borderColor: '#1a56db' },
  filterPuanPillText: { fontSize: 13, fontWeight: '600', color: '#1a56db' },
  filterPuanPillTextActive: { color: '#fff' },
  filterImkanWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterImkanPill: {
    borderWidth: 1,
    borderColor: '#1a56db',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    maxWidth: '100%',
  },
  filterImkanPillActive: { backgroundColor: '#1a56db', borderColor: '#1a56db' },
  filterImkanPillText: { fontSize: 12, fontWeight: '600', color: '#1a56db' },
  filterImkanPillTextActive: { color: '#fff' },
  filterModalFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  filterClearBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
  },
  filterClearBtnText: { fontSize: 14, fontWeight: '700', color: '#64748b' },
  filterApplyBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#1a56db',
  },
  filterApplyBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
})
