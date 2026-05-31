import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'

const TEAL = '#0d9488'
const ORANGE = '#F5821F'

const LEGAL_URLS = {
  terms: 'https://myloungers.com/kullanim-kosullari',
  kvkk: 'https://myloungers.com/kvkk',
} as const

function parseMoney(s: string | undefined): number {
  if (s == null || s === '') return 0
  const n = parseFloat(String(s).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function parsePositiveInt(s: string | undefined, fallback: number): number {
  const n = parseInt(String(s ?? '').trim(), 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function addCalendarDays(dateStr: string, add: number): string {
  const parts = dateStr.split('-').map((x) => parseInt(x, 10))
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return dateStr
  const dt = new Date(parts[0], parts[1] - 1, parts[2])
  dt.setDate(dt.getDate() + add)
  const y = dt.getFullYear()
  const mo = String(dt.getMonth() + 1).padStart(2, '0')
  const da = String(dt.getDate()).padStart(2, '0')
  return `${y}-${mo}-${da}`
}

function pickDisplayName(row: Record<string, unknown> | null | undefined): string {
  if (!row) return ''
  const m = row['musteri_adi']
  if (m != null && String(m).trim()) return String(m).trim()
  const ad = row['ad']
  const soyad = row['soyad']
  const parts = [ad, soyad].filter((x) => x != null && String(x).trim())
  if (parts.length) return parts.map(String).join(' ').trim()
  const as_ = row['ad_soyad']
  return as_ != null ? String(as_).trim() : ''
}

function uuidOrNull(s: string | undefined): string | null {
  const t = String(s ?? '').trim()
  return t.length > 0 ? t : null
}

function firstPhotoFromFotograflar(raw: unknown): string | null {
  let arr: unknown = raw
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw) as unknown
      if (Array.isArray(p)) arr = p
    } catch {
      /* ignore */
    }
  }
  if (!Array.isArray(arr) || arr.length === 0) return null
  const first = arr[0] as { src?: string; url?: string; path?: string } | string | null
  if (typeof first === 'string') return first || null
  if (first && typeof first === 'object') {
    const src = first.src ?? first.url ?? first.path ?? ''
    return src ? String(src) : null
  }
  return null
}

type KisiForm = { ad_soyad: string; telefon: string; email: string }
const emptyKisi = (): KisiForm => ({ ad_soyad: '', telefon: '', email: '' })

export default function RezervasyonOzet() {
  const router = useRouter()
  const { t, i18n } = useTranslation()
  const params = useLocalSearchParams<{
    tesis_id?: string
    tesis_adi?: string
    tesis_slug?: string
    grup_id?: string
    grup_adi?: string
    sezlong_id?: string
    sezlong_ids?: string
    sezlong_adi?: string
    sezlong_fiyatlar?: string
    fiyat?: string
    toplam_sezlong_ucreti?: string
    tarih?: string
    sure?: string
    kisi_sayisi?: string
    tesis_fotograf?: string
    bekleyen_rez_ids?: string
    hizmet_secimli?: string
    saat?: string
  }>()

  const tesis_id = params.tesis_id
  const tesis_adi = params.tesis_adi ?? ''
  const grup_adi = params.grup_adi ?? ''
  const sezlong_adi = params.sezlong_adi ?? ''
  const hizmetSecimli = params.hizmet_secimli === '1'
  const ozetYerVeyaHizmet = hizmetSecimli ? grup_adi : sezlong_adi
  const tarih = params.tarih ?? ''
  const saat = params.saat?.trim() ?? ''
  const tesis_fotograf = params.tesis_fotograf
  const fiyatRaw = params.fiyat

  const sureNum = parsePositiveInt(params.sure, 1)
  const kisiNum = parsePositiveInt(params.kisi_sayisi, 1)
  const fiyatBirim = parseMoney(fiyatRaw)
  // toplam_sezlong_ucreti: tüm seçili şezlongların fiyat toplamı (slug.tsx'ten gelir)
  // Eğer bu parametre yoksa (eski akış) tek şezlong fiyatıyla devam et
  const toplamSezlongUcretiBase = parseMoney(params.toplam_sezlong_ucreti)
  const sezlongUcretiBase = toplamSezlongUcretiBase > 0 ? toplamSezlongUcretiBase : fiyatBirim

  const sezlongUcreti = useMemo(
    () => sezlongUcretiBase * sureNum,
    [sezlongUcretiBase, sureNum],
  )
  const toplam = sezlongUcreti

  const bitisTarih = useMemo(() => {
    if (!tarih) return ''
    return addCalendarDays(tarih, sureNum - 1)
  }, [tarih, sureNum])

  // Tesis sayfasında oluşturulan bekliyor rezervasyon ID'leri (seat hold)
  const bekleyenRezIds = useMemo<string[]>(() => {
    const raw = params.bekleyen_rez_ids
    if (!raw) return []
    return String(raw).split(',').map((s) => s.trim()).filter(Boolean)
  }, [params.bekleyen_rez_ids])

  const stepLabels = useMemo(
    () => [
      t('reservation.step_summary'),
      t('reservation.step_personal'),
      t('reservation.step_payment'),
      t('reservation.step_confirm'),
    ],
    [t, i18n.language],
  )

  // ─── Mevcut state'ler ───────────────────────────────────────────────────────
  const [kisiler, setKisiler] = useState<KisiForm[]>(() =>
    Array.from({ length: Math.max(1, kisiNum) }, emptyKisi),
  )
  const updateKisi = (index: number, field: keyof KisiForm, value: string) =>
    setKisiler((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  const [profilYukleniyor, setProfilYukleniyor] = useState(true)
  const [odemeYukleniyor, setOdemeYukleniyor] = useState(false)
  const resInFlightRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ─── Yeni state'ler ─────────────────────────────────────────────────────────
  const [kalanSure, setKalanSure] = useState(600) // 10 dakika
  const [sureDoldu, setSureDoldu] = useState(false)
  const [kvkk, setKvkk] = useState(false)
  const [kvkkErr, setKvkkErr] = useState(false)
  const [tesisCover, setTesisCover] = useState<string | null>(tesis_fotograf ?? null)
  const [tesisAddress, setTesisAddress] = useState('')
  const [tesisIptalPolitikasi, setTesisIptalPolitikasi] = useState<string | null>(null)
  const [eksikBilgiModal, setEksikBilgiModal] = useState(false)
  const [sureDolduModal, setSureDolduModal] = useState(false)

  // ─── Geri sayım sayacı ──────────────────────────────────────────────────────
  // useFocusEffect ile: ekran odaklanınca başlar, odak kaybolunca (odeme-webview'e
  // geçilince) temizlenir. useEffect+[] kullanılsaydı komponent unmount olana kadar
  // timer çalışmaya devam ederdi ve profil sayfasında Süre Doldu modalı görünürdü.
  useFocusEffect(
    useCallback(() => {
      timerRef.current = setInterval(() => {
        setKalanSure((s) => {
          if (s <= 1) {
            if (timerRef.current) clearInterval(timerRef.current)
            setSureDoldu(true)
            return 0
          }
          return s - 1
        })
      }, 1000)
      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
      }
    }, []),
  )

  useEffect(() => {
    if (!sureDoldu) return
    // Süre dolunca bekleyen seat-hold'ı iptal et, ardından modal göster
    void iptalBekleyenRez()
    setSureDolduModal(true)
  }, [sureDoldu, iptalBekleyenRez])

  // Android donanım geri tuşunu yakala — seat-hold iptal ederek geri git
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      void handleGeri()
      return true
    })
    return () => sub.remove()
  }, [handleGeri])

  // ─── Tesis bilgileri (Supabase) ──────────────────────────────────────────────
  useEffect(() => {
    if (!tesis_id) return
    let cancelled = false
    void supabase
      .from('tesisler')
      .select('fotograflar, adres, ilce, sehir, iptal_politikasi')
      .eq('id', tesis_id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        const cover = firstPhotoFromFotograflar(data.fotograflar)
        if (cover && !tesis_fotograf) setTesisCover(cover)
        const addr =
          (data.adres as string | null)?.trim() ||
          [data.ilce, data.sehir].filter(Boolean).join(', ')
        setTesisAddress(addr)
        setTesisIptalPolitikasi((data as Record<string, unknown>).iptal_politikasi as string | null ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [tesis_id, tesis_fotograf])

  // ─── Profil yükleme ──────────────────────────────────────────────────────────
  const loadProfil = useCallback(async () => {
    setProfilYukleniyor(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const profilEmail = user?.email ?? ''
      if (!user?.id) {
        if (profilEmail) {
          setKisiler((prev) => {
            const next = [...prev]
            if (next.length > 0) next[0] = { ...next[0], email: profilEmail }
            return next
          })
        }
        setProfilYukleniyor(false)
        return
      }
      const { data } = await supabase.from('kullanicilar').select('*').eq('id', user.id).maybeSingle()
      if (data && typeof data === 'object') {
        const row = data as Record<string, unknown>
        const profAdSoyad = pickDisplayName(row)
        const tel = row['telefon']
        const profTelefon = tel != null ? String(tel) : ''
        setKisiler((prev) => {
          const next = [...prev]
          if (next.length > 0) {
            next[0] = {
              ad_soyad: profAdSoyad || next[0].ad_soyad,
              telefon: profTelefon || next[0].telefon,
              email: profilEmail || next[0].email,
            }
          }
          return next
        })
      }
    } finally {
      setProfilYukleniyor(false)
    }
  }, [])

  useEffect(() => {
    void loadProfil()
  }, [loadProfil])

  // Bekleyen (bekliyor) rezervasyonları iptal et — vazgeçme veya süre dolması durumunda
  const iptalBekleyenRez = useCallback(async () => {
    if (bekleyenRezIds.length === 0) return
    await supabase
      .from('rezervasyonlar')
      .update({ durum: 'iptal' })
      .in('id', bekleyenRezIds)
      .eq('durum', 'bekliyor')
  }, [bekleyenRezIds])

  // Geri butonuna basılınca önce seat-hold'ı iptal et, sonra geri git
  const handleGeri = useCallback(async () => {
    await iptalBekleyenRez()
    router.back()
  }, [iptalBekleyenRez, router])

  const formatTl = (n: number) =>
    `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${t('reservation.tl_suffix')}`

  // ─── Ödeme handler ───────────────────────────────────────────────────────────
  const handleOdeme = async () => {
    if (resInFlightRef.current) return
    if (!kvkk) {
      setKvkkErr(true)
      return
    }
    setKvkkErr(false)

    const allFilled = kisiler.every(
      (k) => k.ad_soyad.trim() && k.telefon.trim() && k.email.trim() && k.email.includes('@'),
    )
    if (!allFilled) {
      setEksikBilgiModal(true)
      return
    }
    if (!tarih) {
      Alert.alert(t('reservation.error_title'), t('reservation.error_date_missing'))
      return
    }

    if (!process.env.EXPO_PUBLIC_SITE_URL) {
      Alert.alert(t('reservation.error_config'), t('reservation.error_config_body'))
      return
    }

    resInFlightRef.current = true
    setOdemeYukleniyor(true)
    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser()
      if (userErr || !user) {
        Alert.alert(t('reservation.error_login_required'), t('reservation.error_login_body'))
        return
      }

      const tarihFormatli = (() => {
        const d = new Date(tarih)
        const gun = String(d.getDate()).padStart(2, '0')
        const ay = String(d.getMonth() + 1).padStart(2, '0')
        const yil = d.getFullYear()
        return `${gun}${ay}${yil}`
      })()

      // Seçili şezlong listesi: sezlong_ids param'ından parse et, yoksa sezlong_id'ye dön
      const sezlongIdList = params.sezlong_ids
        ? String(params.sezlong_ids).split(',').map((s) => s.trim()).filter(Boolean)
        : params.sezlong_id
          ? [String(params.sezlong_id).trim()].filter(Boolean)
          : []

      // Her şezlongun bireysel fiyatı (slug.tsx'ten gelir)
      const sezlongFiyatlarArr = params.sezlong_fiyatlar
        ? String(params.sezlong_fiyatlar).split(',').map((s) => parseMoney(s.trim()))
        : []

      // Her şezlongun adı ("Gold 1", "Silver 2", ...)
      const sezlongAdlari = sezlong_adi
        ? String(sezlong_adi).split(',').map((s) => s.trim())
        : []

      if (sezlongIdList.length === 0 && bekleyenRezIds.length === 0) {
        Alert.alert(t('reservation.error_title'), t('reservation.error_sunbed_missing'))
        return
      }

      // Tesis sayfasında oluşturulan bekliyor kayıtları varsa: durum→beklemede UPDATE yap.
      // Yoksa (eski akış veya bekliyor insert başarısız olduysa): yeni INSERT döngüsü çalış.
      let insertedIds: string[] = []

      if (bekleyenRezIds.length > 0) {
        const { error: updErr } = await supabase
          .from('rezervasyonlar')
          .update({ durum: 'beklemede' })
          .in('id', bekleyenRezIds)
        if (updErr) {
          Alert.alert(t('reservation.error_title'), t('reservation.error_update_failed'))
          return
        }
        insertedIds = [...bekleyenRezIds]
      } else {
        // Fallback: yeni INSERT (eski akış veya bekliyor insert başarısız olduysa)
        for (let i = 0; i < sezlongIdList.length; i++) {
          const thisSezlongId = sezlongIdList[i]
          // Bireysel fiyat: sezlong_fiyatlar'dan al, yoksa fiyatBirim'e dön
          const thisFiyat = sezlongFiyatlarArr[i] != null ? sezlongFiyatlarArr[i] : fiyatBirim
          const thisToplam = Number((thisFiyat * sureNum).toFixed(2))

          // Rezervasyon kodu: "MYL-DDMMYYYY-G1" (grup ilk harfi + sezlong numarası)
          const thisSezlongAdi = sezlongAdlari[i] ?? `${i + 1}`
          const thisGrupPrefix = thisSezlongAdi.charAt(0).toUpperCase() || 'X'
          const thisSezlongNo = thisSezlongAdi.replace(/^[^\d]*/, '')
          const thisRezKodu = `MYL-${tarihFormatli}-${thisGrupPrefix}${thisSezlongNo}`

          const insertPayload: Record<string, unknown> = {
            tesis_id: uuidOrNull(tesis_id),
            kullanici_id: user.id,
            sezlong_id: thisSezlongId,
            sezlong_ids: [thisSezlongId],
            baslangic_tarih: tarih,
            bitis_tarih: bitisTarih || tarih,
            durum: 'beklemede',
            toplam_tutar: thisToplam,
            kisi_sayisi: 1,
            rezervasyon_kodu: thisRezKodu,
            ...(saat ? { saat } : {}),
          }

          const { data: rezData, error: rezError } = await supabase
            .from('rezervasyonlar')
            .insert(insertPayload)
            .select('id')
            .single()

          if (rezError || !rezData) {
            Alert.alert(t('reservation.error_title'), t('reservation.error_create_failed'))
            return
          }
          insertedIds.push(rezData.id as string)
        }
      }

      // İlk INSERT'in ID'si Paratika orderId olarak gider
      const rezervasyonId = insertedIds[0]

      // Paratika session: toplam tutar tüm şezlongların toplamı
      const toplamTutar = toplam
      const adSoyadInput = (kisiler[0]?.ad_soyad ?? '').trim()
      const [adSoyadParatika, soyad] =
        adSoyadInput.split(' ').length > 1
          ? [
              adSoyadInput.split(' ').slice(0, -1).join(' '),
              adSoyadInput.split(' ').slice(-1)[0],
            ]
          : [adSoyadInput, '']

      const sessionRes = await fetch(`${process.env.EXPO_PUBLIC_SITE_URL}/api/paratika/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: toplamTutar.toFixed(2),
          orderId: rezervasyonId,
          customerName: adSoyadParatika,
          customerSurname: soyad || adSoyadParatika,
          customerEmail: kisiler[0]?.email ?? '',
          customerPhone: kisiler[0]?.telefon ?? '',
          kisiler: kisiler,
        }),
      })

      const sessionData = await sessionRes.json()

      if (!sessionData.sessionToken) {
        Alert.alert(
          t('reservation.error_title'),
          sessionData.error || t('reservation.error_payment_init'),
        )
        return
      }

      router.push({
        pathname: '/odeme-webview',
        params: { token: sessionData.sessionToken, rezervasyon_id: rezervasyonId },
      })
    } catch (e) {
      Alert.alert(
        t('reservation.error_title'),
        e instanceof Error ? e.message : t('reservation.error_unexpected'),
      )
    } finally {
      resInFlightRef.current = false
      setOdemeYukleniyor(false)
    }
  }

  // ─── Sayaç değerleri ─────────────────────────────────────────────────────────
  const sayacDakika = String(Math.floor(kalanSure / 60)).padStart(2, '0')
  const sayacSaniye = String(kalanSure % 60).padStart(2, '0')
  const sayacUrgent = kalanSure < 120

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => void handleGeri()} hitSlop={14} style={styles.headerBtn} accessibilityRole="button">
            <Ionicons name="chevron-back" size={26} color={TEAL} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('reservation.summary_title')}</Text>
          <View style={styles.headerBtn} />
        </View>

        {/* ── Sticky geri sayım sayacı ── */}
        {kalanSure > 0 && (
          <View style={[styles.countdown, sayacUrgent && styles.countdownUrgent]}>
            <Text style={styles.countdownEmoji}>⏱️</Text>
            <View style={styles.countdownTexts}>
              <Text style={[styles.countdownMain, sayacUrgent && styles.countdownMainUrgent]}>
                {`${t('reservation.holding_sunbed')}: ${sayacDakika}:${sayacSaniye}`}
              </Text>
              <Text style={[styles.countdownSub, sayacUrgent && styles.countdownSubUrgent]}>
                {t('reservation.complete_in_time')}
              </Text>
            </View>
          </View>
        )}

        {/* ── Adım göstergesi ── */}
        <View style={styles.stepsBar}>
          {stepLabels.map((label, idx) => {
            const stepNo = idx + 1
            const isActive = stepNo === 1
            const isDone = stepNo < 1
            return (
              <View key={label} style={styles.stepItem}>
                <View style={[styles.stepCircle, isActive && styles.stepCircleActive, isDone && styles.stepCircleDone]}>
                  {isDone ? (
                    <Ionicons name="checkmark" size={12} color="#fff" />
                  ) : (
                    <Text style={[styles.stepNum, (isActive || isDone) && styles.stepNumActive]}>{stepNo}</Text>
                  )}
                </View>
                <Text style={[styles.stepLabel, isActive && styles.stepLabelActive, isDone && styles.stepLabelDone]}>
                  {label}
                </Text>
                {idx < stepLabels.length - 1 && (
                  <View style={[styles.stepLine, isDone && styles.stepLineDone]} />
                )}
              </View>
            )
          })}
        </View>

        {/* ── İçerik ── */}
        {profilYukleniyor ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={TEAL} />
          </View>
        ) : (
          <>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

              {/* ── Tesis bilgi kartı ── */}
              <View style={styles.sumCard}>
                {tesisCover ? (
                  <Image source={{ uri: tesisCover }} style={styles.sumImg} resizeMode="cover" />
                ) : (
                  <View style={[styles.sumImg, styles.sumImgPh]}>
                    <Ionicons name="image-outline" size={32} color="#94a3b8" />
                  </View>
                )}
                <View style={styles.sumBody}>
                  <Text style={styles.sumName}>{tesis_adi || 'Tesis'}</Text>
                  {tesisAddress ? (
                    <View style={styles.sumMetaRow}>
                      <Ionicons name="location-outline" size={11} color="#64748b" />
                      <Text style={styles.sumMeta} numberOfLines={1}>{tesisAddress}</Text>
                    </View>
                  ) : null}
                  <View style={styles.sumRows}>
                    <SumRow icon="📅" label={t('reservation.date_label')} value={tarih || '—'} />
                    {saat ? (
                      <SumRow
                        icon="🕐"
                        label={t('reservation.time_label', { defaultValue: 'Saat' })}
                        value={saat}
                      />
                    ) : null}
                    <SumRow icon="🛏" label={t('reservation.sunbed_label')} value={ozetYerVeyaHizmet || '—'} />
                    <SumRow icon="👥" label={t('reservation.guest_label')} value={t('reservation.guest_count', { count: kisiNum })} />
                    <SumRow
                      icon="📆"
                      label={t('reservation.duration_label')}
                      value={
                        sureNum === 1
                          ? t('reservation.day_count_singular', { count: sureNum })
                          : t('reservation.day_count_plural', { count: sureNum })
                      }
                    />
                  </View>
                  <View style={styles.sumDivider} />
                  <View style={styles.sumTotalRow}>
                    <Text style={styles.sumTotalLabel}>Toplam</Text>
                    <Text style={styles.sumTotalValue}>{formatTl(toplam)}</Text>
                  </View>
                </View>
              </View>

              {/* ── Rezervasyon detayı ── */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('reservation.reservation_detail')}</Text>
                <Row label={t('reservation.date_label')} value={tarih || '—'} />
                <Row label={t('reservation.sunbed_label')} value={ozetYerVeyaHizmet || '—'} />
                <Row
                  label={t('reservation.duration_label')}
                  value={
                    sureNum === 1
                      ? t('reservation.day_count_singular', { count: sureNum })
                      : t('reservation.day_count_plural', { count: sureNum })
                  }
                />
                <Row label={t('reservation.guest_count_label')} value={String(kisiNum)} last />
              </View>

              {/* ── Fiyat özeti ── */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('reservation.price_summary')}</Text>
                <Row label={t('reservation.sunbed_fee')} value={formatTl(sezlongUcreti)} />
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Toplam</Text>
                  <Text style={styles.totalValue}>{formatTl(toplam)}</Text>
                </View>
              </View>

              {/* ── İptal politikası ── */}
              <View style={styles.iptalBox}>
                <Text style={styles.iptalText}>
                  {'🔄 '}
                  <Text style={styles.iptalBold}>{t('reservation.cancellation_policy')}: </Text>
                  {tesisIptalPolitikasi?.trim() ? tesisIptalPolitikasi : t('reservation.default_policy')}
                </Text>
              </View>

              {/* ── Kişisel bilgiler (her şezlong için ayrı form) ── */}
              {kisiler.map((kisi, index) => {
                const sezlongAdlari = sezlong_adi.split(',')
                const buSezlong = hizmetSecimli
                  ? grup_adi.trim() || t('reservation.sunbed_form_title', { n: index + 1 })
                  : sezlongAdlari[index]?.trim() ||
                    t('reservation.sunbed_form_title', { n: index + 1 })
                const isLast = index === kisiler.length - 1
                return (
                  <View key={index} style={[styles.card, !isLast && { marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomWidth: 0 }]}>
                    {index > 0 && (
                      <View style={styles.kisiAyrac} />
                    )}
                    <Text style={styles.cardTitle}>
                      {`${index + 1}. ${t('reservation.personal_info_title')}`}
                      <Text style={styles.cardTitleSub}>
                        {`  (${t('reservation.sunbed_label')}: ${buSezlong})`}
                      </Text>
                    </Text>
                    <Text style={styles.inputLabel}>Ad Soyad *</Text>
                    <TextInput
                      style={styles.input}
                      value={kisi.ad_soyad}
                      onChangeText={(v) => updateKisi(index, 'ad_soyad', v)}
                      placeholder={t('reservation.full_name')}
                      placeholderTextColor="#94a3b8"
                    />
                    <Text style={styles.inputLabel}>Telefon *</Text>
                    <TextInput
                      style={styles.input}
                      value={kisi.telefon}
                      onChangeText={(v) => updateKisi(index, 'telefon', v)}
                      placeholder={t('reservation.phone_placeholder')}
                      placeholderTextColor="#94a3b8"
                      keyboardType="phone-pad"
                    />
                    <Text style={styles.inputLabel}>E-posta *</Text>
                    <TextInput
                      style={styles.input}
                      value={kisi.email}
                      onChangeText={(v) => updateKisi(index, 'email', v)}
                      placeholder={t('reservation.email_placeholder')}
                      placeholderTextColor="#94a3b8"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {/* ── KVKK tek kere, son kişi formunun altında ── */}
                    {isLast && (
                      <>
                        <View style={[styles.kvkkRow, kvkkErr && styles.kvkkRowErr]}>
                          <TouchableOpacity
                            onPress={() => {
                              setKvkk((v) => !v)
                              setKvkkErr(false)
                            }}
                            activeOpacity={0.8}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: kvkk }}
                            accessibilityLabel={t('reservation.kvkk_consent')}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <View style={[styles.kvkkBox, kvkk && styles.kvkkBoxChecked]}>
                              {kvkk && <Ionicons name="checkmark" size={13} color="#fff" />}
                            </View>
                          </TouchableOpacity>
                          <Text style={styles.kvkkText}>
                            {t('reservation.kvkk_text_prefix')}
                            <Text
                              onPress={() => {
                                void Linking.openURL(LEGAL_URLS.terms)
                              }}
                              style={styles.kvkkLink}
                            >
                              {t('reservation.kvkk_terms_link')}
                            </Text>
                            {t('reservation.kvkk_text_between')}
                            <Text
                              onPress={() => {
                                void Linking.openURL(LEGAL_URLS.kvkk)
                              }}
                              style={styles.kvkkLink}
                            >
                              {t('reservation.kvkk_link')}
                            </Text>
                            {t('reservation.kvkk_text_suffix')}
                          </Text>
                        </View>
                        {kvkkErr && (
                          <Text style={styles.kvkkErrText}>{t('reservation.consent_required')}</Text>
                        )}
                      </>
                    )}
                  </View>
                )
              })}

              <View style={{ height: 24 }} />
            </ScrollView>

            {/* ── Footer: Ödemeye Geç ── */}
            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.payBtn, (odemeYukleniyor || !kvkk) && styles.payBtnDisabled]}
                onPress={() => void handleOdeme()}
                disabled={odemeYukleniyor || !kvkk}
                activeOpacity={0.9}
              >
                {odemeYukleniyor ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.payBtnText}>{t('reservation.proceed_to_payment')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </KeyboardAvoidingView>

      {/* ── Eksik bilgi modal ── */}
      <Modal visible={eksikBilgiModal} animationType="fade" transparent statusBarTranslucent>
        <View style={styles.cmBackdrop}>
          <View style={styles.cmCard}>
            <Text style={styles.cmIcon}>⚠️</Text>
            <Text style={styles.cmTitle}>{t('reservation.incomplete_info_title')}</Text>
            <Text style={styles.cmMsg}>{t('reservation.incomplete_info_body')}</Text>
            <TouchableOpacity
              style={styles.cmBtn}
              activeOpacity={0.85}
              onPress={() => setEksikBilgiModal(false)}
            >
              <Text style={styles.cmBtnText}>{t('reservation.ok')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Süre doldu modal ── */}
      <Modal visible={sureDolduModal} animationType="fade" transparent statusBarTranslucent>
        <View style={styles.cmBackdrop}>
          <View style={styles.cmCard}>
            <Text style={styles.cmIcon}>⏰</Text>
            <Text style={styles.cmTitle}>{t('reservation.time_up_title')}</Text>
            <Text style={styles.cmMsg}>{t('reservation.time_up_body')}</Text>
            <TouchableOpacity
              style={styles.cmBtn}
              activeOpacity={0.85}
              onPress={() => {
                setSureDolduModal(false)
                router.back()
              }}
            >
              <Text style={styles.cmBtnText}>{t('reservation.ok')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

// ─── Yardımcı bileşenler ─────────────────────────────────────────────────────

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

function SumRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.sumRowItem}>
      <Text style={styles.sumRowL}>{icon} {label}</Text>
      <Text style={styles.sumRowV}>{value}</Text>
    </View>
  )
}

// ─── Stiller ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  flex: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a' },

  // Sayaç
  countdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF3C7',
    borderBottomWidth: 2,
    borderBottomColor: '#F59E0B',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  countdownUrgent: {
    backgroundColor: '#FEE2E2',
    borderBottomColor: '#DC2626',
  },
  countdownEmoji: { fontSize: 20 },
  countdownTexts: { flex: 1 },
  countdownMain: {
    fontSize: 15,
    fontWeight: '800',
    color: '#92400E',
    fontVariant: ['tabular-nums'],
  },
  countdownMainUrgent: { color: '#991B1B' },
  countdownSub: { fontSize: 11, color: '#92400E', opacity: 0.8, marginTop: 1 },
  countdownSubUrgent: { color: '#991B1B' },

  // Adım göstergesi
  stepsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  stepItem: { flexDirection: 'row', alignItems: 'center' },
  stepCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleActive: { backgroundColor: ORANGE },
  stepCircleDone: { backgroundColor: '#22c55e' },
  stepNum: { fontSize: 11, fontWeight: '700', color: '#94a3b8' },
  stepNumActive: { color: '#fff' },
  stepLabel: { fontSize: 9, color: '#94a3b8', marginLeft: 4, fontWeight: '600' },
  stepLabelActive: { color: ORANGE },
  stepLabelDone: { color: '#22c55e' },
  stepLine: { width: 16, height: 1.5, backgroundColor: '#e2e8f0', marginHorizontal: 4 },
  stepLineDone: { backgroundColor: '#22c55e' },

  // Loader
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ScrollView
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },

  // Tesis bilgi kartı (sum-card)
  sumCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    marginBottom: 14,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  sumImg: { width: '100%', height: 160, backgroundColor: '#f1f5f9' },
  sumImgPh: { alignItems: 'center', justifyContent: 'center' },
  sumBody: { padding: 14 },
  sumName: { fontSize: 17, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  sumMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 },
  sumMeta: { fontSize: 12, color: '#64748b', flex: 1 },
  sumRows: { gap: 6 },
  sumRowItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sumRowL: { fontSize: 12, color: '#64748b' },
  sumRowV: { fontSize: 12, fontWeight: '600', color: '#0f172a' },
  sumDivider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 10 },
  sumTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sumTotalLabel: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  sumTotalValue: { fontSize: 18, fontWeight: '800', color: '#22c55e' },

  // Rezervasyon / fiyat kartları
  card: {
    marginBottom: 14,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  cardTitleSub: { fontSize: 12, fontWeight: '400', color: '#64748b' },
  kisiAyrac: { height: 1, backgroundColor: '#e2e8f0', marginBottom: 16 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f1f5f9',
    gap: 12,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { fontSize: 14, color: '#64748b', flexShrink: 0 },
  rowValue: { fontSize: 14, fontWeight: '600', color: '#0f172a', flex: 1, textAlign: 'right' },
  totalRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  totalValue: { fontSize: 22, fontWeight: '800', color: TEAL },

  // İptal politikası
  iptalBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 12,
    marginBottom: 14,
  },
  iptalText: { fontSize: 13, color: '#92400E', lineHeight: 19 },
  iptalBold: { fontWeight: '700' },

  // Form
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#fafafa',
  },

  // KVKK
  kvkkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 16,
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    padding: 12,
  },
  kvkkRowErr: { borderColor: '#fca5a5', backgroundColor: '#fff1f2' },
  kvkkBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#93c5fd',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  kvkkBoxChecked: { backgroundColor: TEAL, borderColor: TEAL },
  kvkkText: { flex: 1, fontSize: 12, color: '#1e40af', lineHeight: 18 },
  kvkkLink: {
    fontSize: 12,
    lineHeight: 18,
    color: '#0ABAB5',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  kvkkErrText: { fontSize: 12, color: '#dc2626', marginTop: 6 },

  // Footer
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
  },
  payBtn: {
    backgroundColor: TEAL,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  payBtnDisabled: { opacity: 0.5 },
  payBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Custom modal (eksik bilgi / süre doldu)
  cmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  cmCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
  },
  cmIcon: { fontSize: 36, marginBottom: 10 },
  cmTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a', marginBottom: 10 },
  cmMsg: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 22,
  },
  cmBtn: {
    backgroundColor: TEAL,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 40,
  },
  cmBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
})
