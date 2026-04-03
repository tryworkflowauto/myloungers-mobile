import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthLocale } from '../../lib/auth-locale-context'
import { supabase } from '../../lib/supabase'

type TesisRow = {
  id: string
  ad: string
  slug: string
  sehir: string | null
  ilce: string | null
  fotograflar: unknown
  puan: number | null
  imkanlar: unknown
}

const SCREEN_W = Dimensions.get('window').width

const BANNER_SLIDES = [
  { id: 'b0', source: require('../../assets/images/1.png') },
  { id: 'b1', source: require('../../assets/images/2.png') },
  { id: 'b2', source: require('../../assets/images/5.png') },
  { id: 'b3', source: require('../../assets/images/6.png') },
  { id: 'b4', source: require('../../assets/images/9.png') },
  { id: 'b5', source: require('../../assets/images/10.png') },
] as const

/** Bölge → il → ilçe (bölge seçim modalı) */
const BOLGELER: Record<string, Record<string, string[]>> = {
  Ege: {
    Muğla: ['Bodrum', 'Marmaris', 'Fethiye', 'Dalaman', 'Datça', 'Köyceğiz', 'Ortaca', 'Ula'],
    İzmir: ['Çeşme', 'Alaçatı', 'Foça', 'Urla', 'Karşıyaka', 'Seferihisar', 'Dikili', 'Aliağa'],
    Aydın: ['Kuşadası', 'Didim', 'Söke', 'Davutlar'],
    Çanakkale: ['Gökçeada', 'Bozcaada', 'Ayvacık', 'Ezine'],
  },
  Akdeniz: {
    Antalya: ['Kaş', 'Kemer', 'Alanya', 'Manavgat', 'Serik', 'Muratpaşa', 'Finike', 'Demre', 'Gazipaşa'],
    Mersin: ['Erdemli', 'Silifke', 'Anamur', 'Bozyazı', 'Tarsus'],
    Adana: ['Karataş', 'Yumurtalık', 'Ceyhan'],
    Hatay: ['İskenderun', 'Samandağ', 'Arsuz', 'Dörtyol'],
  },
  Marmara: {
    İstanbul: ['Beşiktaş', 'Kadıköy', 'Beyoğlu', 'Üsküdar', 'Sarıyer', 'Adalar', 'Şile', 'Bakırköy'],
    Bursa: ['Mudanya', 'Gemlik', 'Erdek', 'Bandırma'],
    Balıkesir: ['Ayvalık', 'Erdek', 'Marmara', 'Burhaniye', 'Edremit'],
    Tekirdağ: ['Şarköy', 'Marmara Ereğlisi', 'Barbaros'],
    Yalova: ['Çınarcık', 'Armutlu', 'Termal'],
    Kocaeli: ['Gebze', 'Darıca', 'Karamürsel'],
    Edirne: ['Enez', 'Keşan'],
    Kırklareli: ['Kıyıköy'],
  },
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

function firstTesisByTypeKeyword(rows: TesisRow[], type: 'hotel' | 'beach' | 'aqua'): TesisRow | undefined {
  return rows.find((r) => {
    const ad = r.ad.toLowerCase()
    if (type === 'hotel') return ad.includes('hotel')
    if (type === 'beach') return ad.includes('beach') || ad.includes('club')
    return ad.includes('aqua') || ad.includes('park')
  })
}

export default function HomeScreen() {
  const router = useRouter()
  const { lang, setLang, t } = useAuthLocale()
  const [rows, setRows] = useState<TesisRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [region, setRegion] = useState('')
  const [facilityName, setFacilityName] = useState('')
  const [facilityTypeKey, setFacilityTypeKey] = useState<string | null>(null)
  const [showTypeModal, setShowTypeModal] = useState(false)
  const [showFilterModal, setShowFilterModal] = useState(false)
  const [minRating4, setMinRating4] = useState(false)

  const [showRegionModal, setShowRegionModal] = useState(false)
  const [regionStep, setRegionStep] = useState<'bolge' | 'il' | 'ilce'>('bolge')
  const [selectedBolge, setSelectedBolge] = useState<string | null>(null)
  const [selectedIl, setSelectedIl] = useState<string | null>(null)

  const [searchMode, setSearchMode] = useState(false)
  const [searchResults, setSearchResults] = useState<TesisRow[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  const [facilityDropdownResults, setFacilityDropdownResults] = useState<TesisRow[]>([])

  const [date, setDate] = useState(() => {
    const d = new Date()
    d.setHours(12, 0, 0, 0)
    return d
  })
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [calendarViewMonth, setCalendarViewMonth] = useState(() => new Date())
  const [pendingDate, setPendingDate] = useState(() => new Date())

  const [favorites, setFavorites] = useState<Record<string, boolean>>({})

  const bannerRef = useRef<FlatList<(typeof BANNER_SLIDES)[number]>>(null)
  const bannerIndexRef = useRef(0)
  const bannerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const skipFacilityDropdownSearchRef = useRef(false)
  const [bannerActiveIndex, setBannerActiveIndex] = useState(0)

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

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setLoadError(null)
      const { data, error } = await supabase
        .from('tesisler')
        .select('id, ad, slug, sehir, ilce, fotograflar, puan, imkanlar')
        .order('puan', { ascending: false })
      if (cancelled) return
      if (error) {
        setLoadError(error.message)
        setRows([])
      } else {
        setRows((data as TesisRow[]) ?? [])
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (bannerTimerRef.current) {
      clearInterval(bannerTimerRef.current)
      bannerTimerRef.current = null
    }
    if (BANNER_SLIDES.length <= 1) return
    bannerTimerRef.current = setInterval(() => {
      const next = (bannerIndexRef.current + 1) % BANNER_SLIDES.length
      bannerIndexRef.current = next
      setBannerActiveIndex(next)
      bannerRef.current?.scrollToIndex({
        index: next,
        animated: true,
        viewPosition: 0,
      })
    }, 5500)
    return () => {
      if (bannerTimerRef.current) clearInterval(bannerTimerRef.current)
    }
  }, [])

  const onBannerScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x
    const idx = Math.round(x / SCREEN_W)
    const max = BANNER_SLIDES.length - 1
    const clamped = Math.min(Math.max(0, idx), max)
    bannerIndexRef.current = clamped
    setBannerActiveIndex(clamped)
  }

  const goBanner = (dir: -1 | 1) => {
    const len = BANNER_SLIDES.length
    const next = (bannerIndexRef.current + dir + len) % len
    bannerIndexRef.current = next
    setBannerActiveIndex(next)
    bannerRef.current?.scrollToIndex({ index: next, animated: true, viewPosition: 0 })
  }

  const categoryRows = useMemo(() => {
    return [
      { key: 'hotel' as const, label: t.home.facilityTypeHotel, row: firstTesisByTypeKeyword(rows, 'hotel') },
      { key: 'beach' as const, label: t.home.facilityTypeBeachClub, row: firstTesisByTypeKeyword(rows, 'beach') },
      { key: 'aqua' as const, label: t.home.facilityTypeAquaPark, row: firstTesisByTypeKeyword(rows, 'aqua') },
    ]
  }, [rows, t])

  const listToRender = searchMode ? searchResults : rows

  const matchesFacilityType = (ad: string, typeKey: string | null): boolean => {
    if (!typeKey) return true
    const s = ad.toLowerCase()
    if (typeKey === 'hotel') return /hotel|otel|resort|suites/i.test(ad)
    if (typeKey === 'beach') return /beach|plaj|club|sahil|kumsal/i.test(ad)
    return /aqua|water|park|aquapark/i.test(ad)
  }

  const runSupabaseSearch = useCallback(async () => {
    const hasFilters =
      region.trim().length > 0 ||
      facilityName.trim().length > 0 ||
      facilityTypeKey != null ||
      minRating4

    if (!hasFilters) {
      setSearchMode(false)
      setSearchResults([])
      setSearchLoading(false)
      return
    }

    setSearchLoading(true)
    let q = supabase.from('tesisler').select('id, ad, slug, sehir, ilce, fotograflar, puan, imkanlar')

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

    if (minRating4) {
      q = q.gte('puan', 4)
    }

    const { data, error } = await q.order('puan', { ascending: false })
    setSearchLoading(false)
    if (error) {
      setLoadError(error.message)
      setSearchResults([])
      setSearchMode(true)
      return
    }
    let out = (data as TesisRow[]) ?? []
    if (facilityTypeKey) {
      out = out.filter((row) => matchesFacilityType(row.ad, facilityTypeKey))
    }
    setSearchResults(out)
    setSearchMode(true)
  }, [region, facilityName, facilityTypeKey, minRating4])

  useEffect(() => {
    if (skipFacilityDropdownSearchRef.current) {
      skipFacilityDropdownSearchRef.current = false
      return
    }
    const q = facilityName.trim()
    if (!q) {
      setFacilityDropdownResults([])
      return
    }
    const t = setTimeout(() => {
      void (async () => {
        const { data, error } = await supabase
          .from('tesisler')
          .select('id, ad, sehir, ilce, fotograflar')
          .ilike('ad', `%${q}%`)
          .limit(10)
        if (error) {
          setFacilityDropdownResults([])
          return
        }
        setFacilityDropdownResults(((data ?? []) as unknown) as TesisRow[])
      })()
    }, 400)
    return () => clearTimeout(t)
  }, [facilityName])

  const onSearchFacilities = () => {
    router.push({
      pathname: '/(tabs)/search',
      params: {
        region,
        facilityTypeKey: facilityTypeKey ?? '',
        date: date.toISOString(),
        facilityName,
      },
    })
  }

  const onApplyFilterModal = () => {
    setShowFilterModal(false)
  }

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

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const openRegionModal = () => {
    setRegionStep('bolge')
    setSelectedBolge(null)
    setSelectedIl(null)
    setShowRegionModal(true)
  }

  const closeRegionModal = () => {
    setShowRegionModal(false)
    setRegionStep('bolge')
    setSelectedBolge(null)
    setSelectedIl(null)
  }

  const onRegionModalBack = () => {
    if (regionStep === 'ilce') {
      setRegionStep('il')
      setSelectedIl(null)
    } else if (regionStep === 'il') {
      setRegionStep('bolge')
      setSelectedIl(null)
      setSelectedBolge(null)
    } else {
      closeRegionModal()
    }
  }

  const renderFacilityCard = (item: TesisRow) => {
    const src = firstPhotoSrc(item.fotograflar)
    const konum = [item.sehir, item.ilce].filter(Boolean).join(', ')
    const tags = parseImkanlar(item.imkanlar)
    const fav = favorites[item.id]
    return (
      <View key={item.id} style={styles.popCard}>
        <Pressable style={styles.popPress} onPress={() => router.push(`/tesis/${encodeURIComponent(item.slug)}`)}>
          <View style={styles.popImageWrap}>
            {src ? (
              <Image source={{ uri: src }} style={styles.popImage} contentFit="cover" />
            ) : (
              <View style={[styles.popImage, styles.popImagePh]}>
                <Ionicons name="image-outline" size={36} color="#0ABAB5" />
              </View>
            )}
            <View style={styles.popImageTop}>
              <View style={styles.ratingPill}>
                <Ionicons name="star" size={14} color="#FBBF24" />
                <Text style={styles.ratingPillText}>{item.puan != null ? Number(item.puan).toFixed(1) : '—'}</Text>
              </View>
            </View>
          </View>
          <View style={styles.popBody}>
            <Text style={styles.popTitle} numberOfLines={2}>
              {item.ad}
            </Text>
            {konum ? (
              <View style={styles.popLocRow}>
                <Ionicons name="location-outline" size={16} color="#64748b" />
                <Text style={styles.popLoc} numberOfLines={1}>
                  {konum}
                </Text>
              </View>
            ) : null}
            {tags.length > 0 ? (
              <View style={styles.tagsRow}>
                {tags.map((tag, ti) => (
                  <View key={`${item.id}-${ti}-${tag}`} style={styles.tag}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </Pressable>
        <TouchableOpacity
          style={styles.favBtnAbs}
          onPress={() => toggleFavorite(item.id)}
          hitSlop={12}
          accessibilityRole="button"
        >
          <Ionicons name={fav ? 'heart' : 'heart-outline'} size={22} color={fav ? '#ef4444' : '#fff'} />
        </TouchableOpacity>
      </View>
    )
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
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showFilterModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <TouchableOpacity style={styles.modalDismiss} onPress={() => setShowFilterModal(false)} activeOpacity={1} />
          <View style={styles.filterSheet}>
            <Text style={styles.filterSheetTitle}>{t.home.filterTitle}</Text>
            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>{t.home.filterMinRating}</Text>
              <Switch value={minRating4} onValueChange={setMinRating4} trackColor={{ false: '#ccc', true: '#0ABAB5' }} thumbColor="#fff" />
            </View>
            <TouchableOpacity style={styles.filterApplyBtn} onPress={onApplyFilterModal}>
              <Text style={styles.filterApplyText}>{t.home.filterApply}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showRegionModal} animationType="slide" transparent>
        <View style={styles.regionModalRoot}>
          <SafeAreaView style={styles.regionModalSafe} edges={['top']}>
            <View style={styles.regionModalHeader}>
              <TouchableOpacity onPress={onRegionModalBack} hitSlop={12}>
                <Ionicons name={regionStep === 'bolge' ? 'close' : 'arrow-back'} size={24} color="#0A1628" />
              </TouchableOpacity>
              <Text style={styles.regionModalTitle}>
                {regionStep === 'bolge'
                  ? lang === 'tr'
                    ? 'Bölge seçin'
                    : 'Select region'
                  : regionStep === 'il'
                    ? selectedBolge ?? ''
                    : selectedIl ?? ''}
              </Text>
              <View style={{ width: 24 }} />
            </View>
            {regionStep === 'bolge' ? (
              <FlatList
                data={Object.keys(BOLGELER)}
                keyExtractor={(item) => item}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.regionBolgeCard}
                    onPress={() => {
                      setSelectedBolge(item)
                      setRegionStep('il')
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.regionBolgeTitle}>{item}</Text>
                    <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
                  </TouchableOpacity>
                )}
              />
            ) : regionStep === 'il' ? (
              <FlatList
                data={selectedBolge ? Object.keys(BOLGELER[selectedBolge] ?? {}) : []}
                keyExtractor={(item) => item}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.regionRow}
                    onPress={() => {
                      setSelectedIl(item)
                      setRegionStep('ilce')
                    }}
                  >
                    <Text style={styles.regionRowText}>{item}</Text>
                    <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
                  </TouchableOpacity>
                )}
              />
            ) : (
              <FlatList
                data={
                  selectedBolge && selectedIl ? BOLGELER[selectedBolge]?.[selectedIl] ?? [] : []
                }
                keyExtractor={(item) => item}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.regionRow}
                    onPress={() => {
                      if (selectedIl) setRegion(`${item}, ${selectedIl}`)
                      closeRegionModal()
                    }}
                  >
                    <Text style={styles.regionRowText}>{item}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </SafeAreaView>
        </View>
      </Modal>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        stickyHeaderIndices={[1]}
      >
        <View>
          <View style={styles.topHeader}>
            <View style={styles.headerSide} />
            <Image source={require('../../assets/images/logo.png')} style={styles.headerLogo} contentFit="contain" />
            <View style={[styles.headerSide, styles.headerLang]}>
              <TouchableOpacity onPress={() => setLang('tr')} style={styles.langChip}>
                <Text style={[styles.langChipText, lang === 'tr' && styles.langChipActive]}>{`🇹🇷 ${t.home.langTr}`}</Text>
              </TouchableOpacity>
              <Text style={styles.langSep}>|</Text>
              <TouchableOpacity onPress={() => setLang('en')} style={styles.langChip}>
                <Text style={[styles.langChipText, lang === 'en' && styles.langChipActive]}>{`🇬🇧 ${t.home.langEn}`}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.bannerWrap}>
            <FlatList
              ref={bannerRef}
              data={[...BANNER_SLIDES]}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.id}
              onMomentumScrollEnd={onBannerScrollEnd}
              getItemLayout={(_, index) => ({
                length: SCREEN_W,
                offset: SCREEN_W * index,
                index,
              })}
              onScrollToIndexFailed={(info) => {
                setTimeout(() => {
                  bannerRef.current?.scrollToIndex({ index: info.index, animated: false })
                }, 100)
              }}
              renderItem={({ item }) => (
                <View style={{ width: SCREEN_W }}>
                  <View style={styles.bannerSlide}>
                    <Image source={item.source} style={styles.bannerImage} contentFit="cover" />
                  </View>
                </View>
              )}
            />
            <TouchableOpacity style={[styles.bannerArrow, styles.bannerArrowLeft]} onPress={() => goBanner(-1)} activeOpacity={0.85}>
              <Text style={styles.bannerArrowText}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.bannerArrow, styles.bannerArrowRight]} onPress={() => goBanner(1)} activeOpacity={0.85}>
              <Text style={styles.bannerArrowText}>›</Text>
            </TouchableOpacity>
            <View style={styles.bannerDots}>
              {BANNER_SLIDES.map((_, i) => (
                <View key={BANNER_SLIDES[i].id} style={[styles.bannerDot, i === bannerActiveIndex && styles.bannerDotActive]} />
              ))}
            </View>
          </View>
        </View>

        <View style={styles.searchCard}>
          <Text style={styles.fieldLabel}>{lang === 'tr' ? 'BÖLGE' : 'REGION'}</Text>
          <TouchableOpacity style={styles.fieldRow} onPress={openRegionModal} activeOpacity={0.85}>
            <Ionicons name="map-outline" size={18} color="#0A1628" />
            <Text style={[styles.fieldInput, styles.fieldFakeInput, !region && { color: '#94a3b8' }]} numberOfLines={1}>
              {region || t.home.locationPlaceholder}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#0A1628" />
          </TouchableOpacity>

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

          <Text style={styles.fieldLabel}>{lang === 'tr' ? 'TESİS ADI' : 'FACILITY NAME'}</Text>
          <View>
            <View style={styles.fieldRow}>
              <Ionicons name="search-outline" size={18} color="#0A1628" />
              <TextInput
                placeholder={t.home.facilityNamePlaceholder}
                value={facilityName}
                onChangeText={(text) => {
                  setFacilityName(text)
                  if (text.length === 0) setFacilityDropdownResults([])
                }}
                style={styles.fieldInput}
                placeholderTextColor="#94a3b8"
              />
            </View>
            {facilityDropdownResults.length > 0 ? (
              <ScrollView
                style={styles.facilityDropdown}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {facilityDropdownResults.map((item) => {
                  const loc = [item.sehir, item.ilce].filter(Boolean).join(', ')
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.facilityDropdownRow}
                      onPress={() => {
                        skipFacilityDropdownSearchRef.current = true
                        setFacilityName(item.ad)
                        setFacilityDropdownResults([])
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.facilityDropdownTitle} numberOfLines={2}>
                        {item.ad}
                      </Text>
                      {loc ? (
                        <Text style={styles.facilityDropdownSub} numberOfLines={1}>
                          {loc}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
            ) : null}
          </View>

          <View style={styles.searchButtonsRow}>
            <TouchableOpacity style={styles.btnPrimary} onPress={onSearchFacilities} activeOpacity={0.9} disabled={searchLoading}>
              <Text style={styles.btnPrimaryText}>{t.home.searchFacilities}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnSecondary} onPress={() => setShowFilterModal(true)} activeOpacity={0.9}>
              <Ionicons name="options-outline" size={20} color="#0ABAB5" />
              <Text style={styles.btnSecondaryText}>{t.home.filter}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View>
          {loadError ? <Text style={styles.errorBanner}>{t.home.loadError}</Text> : null}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t.home.categoriesTitle}</Text>
            <TouchableOpacity activeOpacity={0.7}>
              <Text style={styles.seeAll}>{t.home.seeAll} →</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.catStack}>
            {categoryRows.map((c) => {
              const img = c.row ? firstPhotoSrc(c.row.fotograflar) : null
              const badgeText = c.key === 'beach' ? t.home.badgeNew : t.home.badgePopular
              return (
                <View key={c.key} style={styles.catCardVertical}>
                  {img ? (
                    <Image source={{ uri: img }} style={styles.catImageFull} contentFit="cover" />
                  ) : (
                    <View style={[styles.catImageFull, styles.catImagePh]}>
                      <Ionicons name="image-outline" size={40} color="#0ABAB5" />
                    </View>
                  )}
                  <View style={styles.catBadge}>
                    <Text style={styles.catBadgeText}>{badgeText}</Text>
                  </View>
                  <View style={styles.catOverlay}>
                    <Text style={styles.catLabel}>{c.label}</Text>
                  </View>
                </View>
              )
            })}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{searchMode ? t.home.searchResultsTitle : t.home.popularTitle}</Text>
          </View>

          {loading || searchLoading ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator size="large" color="#0ABAB5" />
            </View>
          ) : listToRender.length === 0 ? (
            <Text style={styles.empty}>{t.home.noResults}</Text>
          ) : (
            listToRender.map((item) => renderFacilityCard(item))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f0f4f8' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  bannerWrap: { marginBottom: 8, position: 'relative', height: 200 },
  bannerSlide: { height: 200, width: SCREEN_W, position: 'relative' },
  bannerImage: { ...StyleSheet.absoluteFillObject },
  bannerArrow: {
    position: 'absolute',
    top: 78,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerArrowLeft: { left: 10 },
  bannerArrowRight: { right: 10 },
  bannerArrowText: { color: '#fff', fontSize: 28, fontWeight: '300', lineHeight: 32, marginTop: -2 },
  bannerDots: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  bannerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  bannerDotActive: { backgroundColor: '#fff' },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  headerSide: { flex: 1, minWidth: 72 },
  headerLogo: { width: 120, height: 72 },
  headerLang: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4 },
  langChip: { paddingHorizontal: 4, paddingVertical: 4 },
  langChipText: { fontSize: 12, fontWeight: '600', color: '#aaaaaa' },
  langChipActive: { color: '#3333cc', fontWeight: '700' },
  langSep: { color: '#cbd5e1', fontSize: 12 },
  searchCard: {
    marginHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 6,
    marginBottom: 18,
    ...Platform.select({
      ios: {
        shadowColor: '#0A1628',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  fieldLabel: {
    fontSize: 6,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#0A1628',
    opacity: 0.7,
    marginBottom: 6,
    marginTop: 4,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 0,
    marginBottom: 1,
    gap: 8,
    backgroundColor: '#fafbfc',
  },
  fieldInput: { flex: 1, fontSize: 8, color: '#0A1628' },
  fieldFakeInput: { paddingVertical: 0 },
  searchButtonsRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  btnPrimary: {
    flex: 1,
    backgroundColor: '#0ABAB5',
    borderRadius: 12,
    paddingVertical: 3,
    paddingHorizontal: 4,
    minHeight: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 10 },
  btnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 2,
    borderColor: '#0ABAB5',
    borderRadius: 12,
    paddingVertical: 3,
    paddingHorizontal: 4,
    minHeight: 26,
    backgroundColor: '#fff',
  },
  btnSecondaryText: { color: '#0ABAB5', fontWeight: '700', fontSize: 10 },
  errorBanner: { color: '#dc2626', textAlign: 'center', marginHorizontal: 16, marginBottom: 8, fontSize: 13 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#0A1628' },
  seeAll: { fontSize: 14, fontWeight: '600', color: '#0ABAB5' },
  catStack: { paddingHorizontal: 16, gap: 12, marginBottom: 8 },
  catCardVertical: {
    height: 160,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#0A1628',
  },
  catImageFull: { width: '100%', height: '100%' },
  catImagePh: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#e0f7f6' },
  catBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: '#0ABAB5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  catBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  catOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    backgroundColor: 'rgba(10,22,40,0.55)',
  },
  catLabel: { color: '#fff', fontSize: 16, fontWeight: '700' },
  loaderWrap: { paddingVertical: 40, alignItems: 'center' },
  empty: { textAlign: 'center', color: '#64748b', padding: 24, fontSize: 15 },
  popCard: {
    marginHorizontal: 16,
    marginBottom: 18,
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'visible',
    position: 'relative',
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
  popPress: { borderRadius: 16, overflow: 'hidden' },
  popImageWrap: { position: 'relative' },
  popImage: { width: '100%', height: 200 },
  popImagePh: { backgroundColor: '#e0f7f6', alignItems: 'center', justifyContent: 'center' },
  popImageTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    padding: 12,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(10,22,40,0.75)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  ratingPillText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  favBtnAbs: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(10,22,40,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  popBody: { padding: 14 },
  popTitle: { fontSize: 17, fontWeight: '800', color: '#0A1628', marginBottom: 6 },
  popLocRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 },
  popLoc: { flex: 1, fontSize: 14, color: '#64748b' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tagText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,22,40,0.45)' },
  modalDismiss: { flex: 1 },
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
  filterSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
  },
  filterSheetTitle: { fontSize: 18, fontWeight: '800', color: '#0A1628', marginBottom: 16 },
  filterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  filterLabel: { flex: 1, fontSize: 15, color: '#0A1628', fontWeight: '600' },
  filterApplyBtn: { backgroundColor: '#0ABAB5', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  filterApplyText: { color: '#fff', fontWeight: '700', fontSize: 16 },
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
  regionBolgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#0ABAB5',
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
    backgroundColor: '#fff',
  },
  regionBolgeTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#0A1628' },
  regionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  regionRowText: { fontSize: 16, color: '#0A1628' },
  facilityDropdown: {
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 8,
    maxHeight: 150,
    ...Platform.select({
      ios: {
        shadowColor: '#0A1628',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
      },
      android: { elevation: 4 },
    }),
  },
  facilityDropdownRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  facilityDropdownTitle: { fontSize: 12, fontWeight: '700', color: '#0A1628', marginBottom: 2 },
  facilityDropdownSub: { fontSize: 10, color: '#94a3b8' },
})
