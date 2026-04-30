import { supabase } from '@/lib/supabase'
import { SIPARIS_DURUM } from '@/lib/constants'
import CallWaiterModal from '@/components/CallWaiterModal'
import { Ionicons } from '@expo/vector-icons'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { Audio } from 'expo-av'
import * as Clipboard from 'expo-clipboard'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

type RezDurum = 'yaklasan' | 'aktif' | 'gecmis' | 'iptal'

type AktifCagriDurum = {
  id: string
  createdAt: string
  yanitTarihi: string | null
  yanitSuresi: number | null
  varisTarihi: string | null
  varisSuresi: number | null
}

type ProfilKullanici = {
  id: string
  ad: string
  soyad: string
  email: string
  telefon: string
  sehir: string
  uyeAyYil: string
  eposta_dogrulandi: boolean
}

type ProfilForm = {
  ad: string
  soyad: string
  email: string
  telefon: string
  sehir: string
  dogumTarihi: string
}

const formatDateForDB = (dateStr: string) => {
  if (!dateStr) return null
  const parts = dateStr.split('.')
  if (parts.length !== 3) return null
  return `${parts[2]}-${parts[1]}-${parts[0]}`
}

type RezRow = {
  id: string
  tesisAd: string
  tarih: string
  sezlong: string
  sure: string
  odenen: string
  durum: RezDurum
  kapakGorsel: string | null
  rezervasyon_kodu: string
  grupAd: string
  sehir: string
  kategori: string
  tesisSlug: string
  sezlongLabel: string
  iptalSaatOncesi: number | null
  calismaSaatleri: any
  iptalPolitikasi: string | null
  iptalEdilebilirMiHesap: { edilebilir: boolean; kalanSaat: number; gerekenSaat: number }
}

function formatUyeAyYil(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const ay = d.toLocaleDateString('tr-TR', { month: 'long' })
  const yil = d.getFullYear()
  const ayCap = ay ? ay.charAt(0).toLocaleUpperCase('tr-TR') + ay.slice(1) : ''
  return `${ayCap} ${yil}`
}

function formatRezTarih(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
}

const TR_DAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']

function iptalEdilebilirMi(
  rezervasyon: any,
  tesis: any,
): { edilebilir: boolean; kalanSaat: number; gerekenSaat: number } {
  const iptalSaatOncesi =
    typeof tesis?.iptal_saat_oncesi === 'number'
      ? tesis.iptal_saat_oncesi
      : typeof tesis?.iptalSaatOncesi === 'number'
        ? tesis.iptalSaatOncesi
        : 24

  if (iptalSaatOncesi >= 999999) {
    return { edilebilir: false, kalanSaat: 0, gerekenSaat: iptalSaatOncesi }
  }

  let calismaSaatleri: any[] = []
  try {
    const raw = tesis?.calisma_saatleri ?? tesis?.calismaSaatleri
    calismaSaatleri = Array.isArray(raw) ? raw : typeof raw === 'string' ? JSON.parse(raw) : []
  } catch {
    calismaSaatleri = []
  }

  const baslangicTarih = rezervasyon.baslangic_tarih || rezervasyon.tarih
  const baslangicDate = new Date(`${baslangicTarih}T00:00:00+03:00`)
  const dayName = TR_DAYS[baslangicDate.getDay()]
  const gunData = calismaSaatleri.find((g: any) => g?.name === dayName)

  if (gunData && gunData.kapali === true) {
    return { edilebilir: false, kalanSaat: 0, gerekenSaat: iptalSaatOncesi }
  }

  const acilisStr =
    gunData?.acilis && /^\d{1,2}:\d{2}$/.test(gunData.acilis) ? gunData.acilis : '09:00'
  const rezervasyonBaslangicDT = new Date(`${baslangicTarih}T${acilisStr}:00+03:00`)
  const kalanMs = rezervasyonBaslangicDT.getTime() - new Date().getTime()
  const kalanSaat = kalanMs / (1000 * 60 * 60)

  return {
    edilebilir: kalanSaat >= iptalSaatOncesi,
    kalanSaat: Math.max(0, Math.floor(kalanSaat)),
    gerekenSaat: iptalSaatOncesi,
  }
}

function formatTutar(raw: number | string | null | undefined) {
  if (raw == null) return '\u20BA0'
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/\s/g, '').replace(',', '.'))
  if (Number.isNaN(n)) return `\u20BA${raw}`
  return `\u20BA${n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function formatSure(saniye: number): string {
  const dk = Math.floor(saniye / 60)
  const sn = saniye % 60
  if (dk === 0) return `${sn} sn`
  if (sn === 0) return `${dk} dk`
  return `${dk} dk ${sn} sn`
}

function formatZamanOnce(createdAt: Date | string): string {
  const diff = Date.now() - new Date(createdAt).getTime()
  const dk = Math.floor(diff / 60000)
  const sa = Math.floor(dk / 60)
  if (sa > 0) return `${sa} sa önce`
  if (dk > 0) return `${dk} dk önce`
  return 'Az önce'
}

function getTesisAdFromRez(rezervasyonId: any, rezervasyonlar: any[]): string {
  const rez = rezervasyonlar.find((r) => String(r.id) === String(rezervasyonId))
  return rez?.tesisAd || rez?.tesisler?.ad || 'Bilinmeyen Tesis'
}

async function playHazirSesi() {
  try {
    const { sound } = await Audio.Sound.createAsync(
      require('../../assets/sounds/hazir.mp3'),
      { shouldPlay: true, volume: 0.8 }
    )
    sound.setOnPlaybackStatusUpdate((status: any) => {
      if (status.didJustFinish) {
        sound.unloadAsync().catch(() => {})
      }
    })
  } catch (e) {
    console.log('[ses] hazir.mp3 çalınamadı:', e)
  }
}

function aktifSezlongSureStr(r: { baslangic_tarih?: string; bitis_tarih?: string }) {
  if (!r.bitis_tarih || !r.baslangic_tarih) return '—'
  const d0 = new Date(r.baslangic_tarih)
  const d1 = new Date(r.bitis_tarih)
  if (Number.isNaN(d0.getTime()) || Number.isNaN(d1.getTime())) return '—'
  const diff = Math.round((d1.getTime() - d0.getTime()) / (1000 * 60 * 60 * 24))
  return `${Math.max(1, diff)} gün`
}

function rezDurumLabel(d: RezDurum): string {
  const labels: Record<RezDurum, string> = {
    yaklasan: 'Yaklaşan',
    aktif: 'Aktif',
    gecmis: 'Geçmiş',
    iptal: 'İptal',
  }
  return labels[d]
}

function rezDurumBadgeColors(d: RezDurum): { bg: string; fg: string } {
  switch (d) {
    case 'yaklasan':
      return { bg: '#dbeafe', fg: '#1d4ed8' }
    case 'aktif':
      return { bg: '#dcfce7', fg: '#15803d' }
    case 'gecmis':
      return { bg: '#f1f5f9', fg: '#64748b' }
    case 'iptal':
      return { bg: '#fee2e2', fg: '#b91c1c' }
    default:
      return { bg: '#f1f5f9', fg: '#64748b' }
  }
}

type AltSekme =
  | 'rezervasyonlar'
  | 'siparisler'
  | 'yorumlar'
  | 'favoriler'
  | 'profil-bilgileri'
  | 'bildirimler'
  | 'guvenlik'
type RezFilter = 'tum' | RezDurum

export default function ProfilScreen() {
  const router = useRouter()
  const [altSekme, setAltSekme] = useState<AltSekme>('rezervasyonlar')
  const [rezFilter, setRezFilter] = useState<RezFilter>('tum')
  const [loading, setLoading] = useState(true)
  const [profil, setProfil] = useState<ProfilKullanici | null>(null)
  const [form, setForm] = useState<ProfilForm | null>(null)
  const [rezervasyonlar, setRezervasyonlar] = useState<RezRow[]>([])
  const [toplamHarcama, setToplamHarcama] = useState<number>(0)
  const [toplamKalanBakiye, setToplamKalanBakiye] = useState<number>(0)
  const [yorumlar, setYorumlar] = useState<any[]>([])
  const [favoriler, setFavoriler] = useState<any[]>([])
  const [kaydetBasari, setKaydetBasari] = useState(false)
  const [bildirimler, setBildirimler] = useState<any[]>([])
  const [bildirimlerYukleniyor, setBildirimlerYukleniyor] = useState(false)
  const [modalAyarlar, setModalAyarlar] = useState(false)
  const [accordionProfil, setAccordionProfil] = useState(false)
  const [accordionGuvenlik, setAccordionGuvenlik] = useState(false)
  const [aktifSezlonglar, setAktifSezlonglar] = useState<any[]>([])
  const [sezlongMap, setSezlongMap] = useState<Record<string, string>>({})
  const [epostaBildirim, setEpostaBildirim] = useState(true)
  const handleEpostaBildirimChange = useCallback(async (value: boolean) => {
    setEpostaBildirim(value)
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user?.id) {
      console.warn('[eposta_bildirim] auth hatası:', authErr)
      return
    }
    const { data: updData, error: updErr } = await supabase
      .from('kullanicilar')
      .update({ eposta_bildirim: value })
      .eq('id', user.id)
      .select('id, eposta_bildirim')
    console.log('[eposta_bildirim] UPDATE response — data:', updData, 'error:', updErr)
    if (updErr) {
      console.error('[eposta_bildirim] UPDATE hatası:', updErr)
      setEpostaBildirim(!value)
    }
  }, [])
  const [modalParola, setModalParola] = useState(false)
  const [modalKvkk, setModalKvkk] = useState(false)
  const [mevcutParola, setMevcutParola] = useState('')
  const [yeniParola, setYeniParola] = useState('')
  const [yeniParolaTekrar, setYeniParolaTekrar] = useState('')
  const [successMesaj, setSuccessMesaj] = useState('')
  const [dogrulandiId, setDogrulandiId] = useState<string | null>(null)
  const [cameraPermission, requestCameraPermission] = useCameraPermissions()
  const [showQrScanner, setShowQrScanner] = useState(false)
  const qrHandledRef = useRef(false)
  const loadingRef = useRef(false)
  const lastFetchRef = useRef<number>(0)
  const [modalSezlongAktifDegil, setModalSezlongAktifDegil] = useState(false)
  const [modalKodGir, setModalKodGir] = useState(false)
  const [kodInput, setKodInput] = useState('')
  const [kodHata, setKodHata] = useState('')
  const [kodGonderiliyor, setKodGonderiliyor] = useState(false)
  const [aktifCagrilar, setAktifCagrilar] = useState<Record<string, AktifCagriDurum>>({})
  const [bildirimlerLoading, setBildirimlerLoading] = useState(false)
  const [showCallModal, setShowCallModal] = useState(false)
  const [callModalRez, setCallModalRez] = useState<RezRow | null>(null)
  const [garsonCagriCooldown, setGarsonCagriCooldown] = useState<Record<string, number>>({})
  const [tick, setTick] = useState(0)
  const [aktifSiparisler, setAktifSiparisler] = useState<any[]>([])
  const [infoModal, setInfoModal] = useState<{ visible: boolean; baslik: string; mesaj: string } | null>(null)
  const [confirmModal, setConfirmModal] = useState<{ visible: boolean; baslik: string; mesaj: string; rezervasyon: any } | null>(null)
  const [iptalLoading, setIptalLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [visibleRezCount, setVisibleRezCount] = useState(10)
  const [gecmisTumSiparisler, setGecmisTumSiparisler] = useState<any[]>([])
  const [gecmisTumLoading, setGecmisTumLoading] = useState(false)
  const [gecmisFilter, setGecmisFilter] = useState<'bugun' | 'hafta' | 'ay' | 'tumu'>('ay')
  const [aktifSiparislerLoading, setAktifSiparislerLoading] = useState(false)
  const [cagriToast, setCagriToast] = useState<{ visible: boolean; mesaj: string }>({ visible: false, mesaj: '' })

  const fetchAktifCagrilarRef = useRef<(() => void) | null>(null)
  const fetchBildirimlerRef = useRef<(() => void) | null>(null)
  const fetchSiparislerRef = useRef<(() => void) | null>(null)

  const onQrBarcodeScanned = useCallback((result: { data: string }) => {
    if (qrHandledRef.current) return
    qrHandledRef.current = true
    setShowQrScanner(false)
    if (result?.data) {
      Alert.alert('QR', result.data)
    }
    setTimeout(() => {
      qrHandledRef.current = false
    }, 2000)
  }, [])

  const handleQrOku = async () => {
    try {
      if (!cameraPermission?.granted) {
        const res = await requestCameraPermission()
        if (!res.granted) {
          Alert.alert('\u0130zin gerekli', 'QR kod okutmak i\u00e7in kamera eri\u015fimine izin verin.')
          return
        }
      }
      qrHandledRef.current = false
      setShowQrScanner(true)
    } catch {
      Alert.alert('Yak\u0131nda', 'QR okuyucu yak\u0131nda aktif olacak')
    }
  }

  const handleKodOnayla = async () => {
    const raw = kodInput.trim().toUpperCase()
    if (!raw) {
      setKodHata('Ge\u00e7ersiz kod')
      return
    }
    setKodGonderiliyor(true)
    setKodHata('')
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const bugun = new Date().toISOString().split('T')[0]

      const { data: rezData, error: rezErr } = await supabase
        .from('rezervasyonlar')
        .select('*')
        .eq('kullanici_id', user.id)
        .not('pgtranid', 'is', null)
        .eq('rezervasyon_kodu', kodInput.trim().toUpperCase())
        .lte('baslangic_tarih', bugun)
        .gte('bitis_tarih', bugun)
        .single()

      if (rezErr || !rezData) {
        setKodHata('Ge\u00e7ersiz kod')
        return
      }

      const { error: updErr } = await supabase
        .from('rezervasyonlar')
        .update({ durum: 'onaylandi', giris_yapildi: true })
        .eq('id', rezData.id)
      if (updErr) {
        setKodHata('Kod g\u00fcncellenemedi')
        return
      }

      // Optimistic update: local state'i hemen g\u00fcncelle
      setRezervasyonlar((prev) =>
        prev.map((r) =>
          String(r.id) === String(rezData.id)
            ? ({ ...r, durum: 'aktif', giris_yapildi: true } as any)
            : r
        )
      )
      setAktifSezlonglar((prev) =>
        prev.map((r: any) =>
          String(r.id) === String(rezData.id)
            ? { ...r, durum: 'aktif', giris_yapildi: true }
            : r
        )
      )

      setDogrulandiId(rezData.id ?? null)
      setSuccessMesaj('Rezervasyon do\u011fruland\u0131! Ho\u015f geldiniz.')
      setTimeout(() => setSuccessMesaj(''), 3000)
      setModalKodGir(false)
      setKodInput('')

      // Arka planda senkron (kullan\u0131c\u0131 beklemez)
      loadProfil().catch(() => {})
    } catch {
      setKodHata('Ge\u00e7ersiz kod')
    } finally {
      setKodGonderiliyor(false)
    }
  }

  const onRefresh = async () => {
    setRefreshing(true)
    setVisibleRezCount(10)
    try {
      await loadProfil()
    } catch {
      // sessizce geç
    } finally {
      setRefreshing(false)
    }
  }

  async function handleIptalConfirm(rezervasyon: RezRow) {
    const BASE_URL = process.env.EXPO_PUBLIC_SITE_URL || 'https://myloungers.com'
    setIptalLoading(true)
    try {
      const response = await fetch(`${BASE_URL}/api/paratika/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rezervasyonId: rezervasyon.id }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok || !data.success) {
        setConfirmModal(null)
        setInfoModal({
          visible: true,
          baslik: 'İade Başarısız',
          mesaj: data.error || 'İade işlemi sırasında bir sorun oluştu. Lütfen daha sonra tekrar deneyin.',
        })
        return
      }

      setConfirmModal(null)
      setInfoModal({
        visible: true,
        baslik: 'Rezervasyon İptal Edildi',
        mesaj: 'Rezervasyon iptal edildi. Ücret iadeniz 5 iş günü içinde kartınıza yansıyacaktır.',
      })
      loadProfil().catch(() => {})
    } catch (e: any) {
      setConfirmModal(null)
      setInfoModal({
        visible: true,
        baslik: 'Hata',
        mesaj: e?.message || 'Beklenmeyen bir hata oluştu.',
      })
    } finally {
      setIptalLoading(false)
    }
  }

  async function handleCallConfirm() {
    const rez = callModalRez
    setShowCallModal(false)
    setCallModalRez(null)
    if (!rez) return
    const kilitKey = String(rez.id)
    const musteriAd = `${profil?.ad || ''} ${profil?.soyad || ''}`.trim() || 'Müşteri'
    const insertedAt = new Date().toISOString()
    const { data: insertData, error } = await supabase
      .from('bildirimler')
      .insert({
        tip: 'garson_cagri',
        tesis_id: (rez as any).tesis_id,
        sezlong_id: (rez as any).sezlong_id,
        rezervasyon_id: rez.id,
        kullanici_id: null,
        baslik: 'Garson Çağrısı',
        mesaj: `${musteriAd} size çağrıda bulundu`,
        okundu: false,
      })
      .select('id, created_at')
      .single()
    if (error) {
      console.error('handleCallConfirm insert error:', JSON.stringify(error, null, 2))
      Alert.alert('Hata', 'Çağrı gönderilemedi, tekrar deneyin')
      return
    }
    const createdAt = insertData?.created_at ?? insertedAt
    setAktifCagrilar((prev) => ({
      ...prev,
      [kilitKey]: {
        id: String(insertData?.id ?? ''),
        createdAt,
        yanitTarihi: null,
        yanitSuresi: null,
        varisTarihi: null,
        varisSuresi: null,
      },
    }))
    setCagriToast({ visible: true, mesaj: 'Garson çağrıldı, birazdan yanınızda olacak' })
    setTimeout(() => setCagriToast({ visible: false, mesaj: '' }), 3000)
    const yeniBitis = Date.now() + 2 * 60 * 1000
    setGarsonCagriCooldown((prev) => ({ ...prev, [kilitKey]: yeniBitis }))
    setTimeout(() => {
      setGarsonCagriCooldown((prev) => {
        const n = { ...prev }
        if ((n[kilitKey] ?? 0) <= Date.now()) delete n[kilitKey]
        return n
      })
    }, 2 * 60 * 1000 + 200)
  }

  const loadProfil = async () => {
    if (loadingRef.current) {
      return
    }
    loadingRef.current = true
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      // id-öncelikli sorgu: auth.uid == kullanicilar.id garantisi, indexed → hızlı.
      // Bulamazsa email ile fallback (eski email/şifre kayıtları için geriye dönük uyumluluk).
      const { data: dataById } = await supabase
        .from('kullanicilar')
        .select('id, ad, soyad, telefon, email, sehir, dogum_tarihi, rol, created_at, eposta_bildirim')
        .eq('id', user.id)
        .maybeSingle()

      let userData = dataById
      if (!userData) {
        const { data: dataByEmail } = await supabase
          .from('kullanicilar')
          .select('id, ad, soyad, telefon, email, sehir, dogum_tarihi, rol, created_at, eposta_bildirim')
          .eq('email', user.email)
          .maybeSingle()
        userData = dataByEmail
      }

      if (userData) {
        const d = userData.dogum_tarihi ? userData.dogum_tarihi.split('-').reverse().join('.') : ''
        const emailVal = userData.email ?? user.email ?? ''
        setProfil({
          id: userData.id,
          ad: userData.ad ?? '',
          soyad: userData.soyad ?? '',
          email: emailVal,
          telefon: userData.telefon != null ? String(userData.telefon) : '',
          sehir: userData.sehir != null ? String(userData.sehir) : '',
          uyeAyYil: formatUyeAyYil(userData.created_at),
          eposta_dogrulandi: !!user.email_confirmed_at,
        })
        setForm({
          ad: userData.ad ?? '',
          soyad: userData.soyad ?? '',
          email: emailVal,
          telefon: userData.telefon != null ? String(userData.telefon) : '',
          sehir: userData.sehir != null ? String(userData.sehir) : '',
          dogumTarihi: d,
        })

        // E-posta bildirim tercihini DB'den oku; kolon NULL ise varsayılan true
        if (userData.eposta_bildirim !== null && userData.eposta_bildirim !== undefined) {
          setEpostaBildirim(userData.eposta_bildirim as boolean)
        }

        // Yorumlar artık lazy yükleniyor (kullanıcı Yorumlarım tab'ına tıkladığında).
        const [rezResult, favResult] = await Promise.all([
          supabase
            .from('rezervasyonlar')
            .select(
              'id, baslangic_tarih, bitis_tarih, sezlong_id, toplam_tutar, bakiye_yuklenen, bakiye_harcanan, bakiye_kalan, durum, tesis_id, rezervasyon_kodu, giris_yapildi, tesisler(ad, fotograflar, sehir, kategori, slug), sezlonglar(numara, grup_id, sezlong_gruplari(ad))',
            )
            .eq('kullanici_id', userData.id)
            .in('durum', ['onaylandi', 'aktif', 'tamamlandi', 'iptal', 'iptal_edildi'])
            .order('baslangic_tarih', { ascending: false }),
          supabase
            .from('favoriler')
            .select('id, tesis_id, created_at, tesisler(ad, fotograflar, slug)')
            .eq('kullanici_id', userData.id)
            .order('created_at', { ascending: false }),
        ])

        const rezData = rezResult.data
        const rezError = rezResult.error

        if (rezData) {
          const bugun = new Date()
          bugun.setHours(0, 0, 0, 0)

          // ID listelerini rezData'dan çıkar
          const aktifSezData = rezData.filter((r: any) => {
            if (r.durum === 'iptal' || r.durum === 'iptal_edildi') return false
            const baslangic = r.baslangic_tarih ? new Date(r.baslangic_tarih) : null
            const bitis = r.bitis_tarih ? new Date(r.bitis_tarih) : null
            if (
              !baslangic ||
              Number.isNaN(baslangic.getTime()) ||
              !bitis ||
              Number.isNaN(bitis.getTime())
            ) {
              return false
            }
            baslangic.setHours(0, 0, 0, 0)
            bitis.setHours(0, 0, 0, 0)
            return baslangic <= bugun && bitis >= bugun
          })

          const sezlongIds = aktifSezData.map((r: any) => r.sezlong_id).filter(Boolean)
          const uniqTesisIds = Array.from(new Set(rezData.map((r: any) => r.tesis_id).filter(Boolean))) as string[]

          // sezlonglar + tesis politikaları paralel çek
          const [sezlongResult, tesisPolitikaResult] = await Promise.all([
            sezlongIds.length > 0
              ? supabase
                  .from('sezlonglar')
                  .select('id, no, numara, grup_id, sezlong_gruplari(ad)')
                  .in('id', sezlongIds)
              : Promise.resolve({ data: [] as any[] }),
            uniqTesisIds.length > 0
              ? supabase
                  .from('tesisler')
                  .select('id, iptal_saat_oncesi, calisma_saatleri, iptal_politikasi')
                  .in('id', uniqTesisIds)
              : Promise.resolve({ data: [] as any[] }),
          ])

          // sezlongMap oluştur
          const sezlongMap: Record<string, string> = {}
          if (Array.isArray(sezlongResult.data)) {
            sezlongResult.data.forEach((s: any) => {
              const grupAd = s.sezlong_gruplari?.ad ?? ''
              const no = s.no || s.numara || ''
              const prefix = grupAd ? grupAd.charAt(0).toUpperCase() : ''
              sezlongMap[s.id] = grupAd ? `${grupAd} - ${prefix}${no}` : `${prefix}${no}`
            })
          }

          // tesisPolitikaMap oluştur (key: tesis UUID)
          const tesisPolitikaMap: Record<string, any> = {}
          if (Array.isArray(tesisPolitikaResult.data)) {
            tesisPolitikaResult.data.forEach((t: any) => {
              if (t?.id) tesisPolitikaMap[t.id] = t
            })
          }

          // setRezervasyonlar: tek geçişte tüm verilerle
          setRezervasyonlar(
            rezData.map((r: any) => {
              const foto = r.tesisler?.fotograflar?.[0]
              const sezlong = Array.isArray(r.sezlonglar) ? r.sezlonglar[0] : r.sezlonglar
              const grupAdRaw = sezlong?.sezlong_gruplari?.ad ?? ''
              const grupAd = String(grupAdRaw)
              const prefix = (sezlong?.sezlong_gruplari?.ad ?? '').charAt(0).toUpperCase()
              const numara = sezlong?.numara ?? ''
              const sezlongLabel =
                grupAd.trim().length > 0
                  ? `${grupAd} - ${prefix}${String(numara)}`
                  : `${prefix}${String(numara)}`

              let kategoriLabel = ''
              try {
                const raw = r.tesisler?.kategori ?? '[]'
                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
                if (Array.isArray(parsed)) {
                  kategoriLabel = parsed
                    .map((k: string) =>
                      k
                        .split(' ')
                        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                        .join(' '),
                    )
                    .join(' · ')
                } else {
                  kategoriLabel =
                    String(parsed).charAt(0).toUpperCase() + String(parsed).slice(1).toLowerCase()
                }
              } catch {
                kategoriLabel = String(r.tesisler?.kategori ?? '')
              }

              const baslangicRaw = r.baslangic_tarih ? new Date(r.baslangic_tarih) : null
              const baslangic = baslangicRaw ? new Date(baslangicRaw) : null
              if (baslangic) baslangic.setHours(0, 0, 0, 0)
              const bitisRaw = r.bitis_tarih ? new Date(r.bitis_tarih) : null
              const bitis = bitisRaw ? new Date(bitisRaw) : null
              if (bitis) bitis.setHours(0, 0, 0, 0)

              let rezDurum: RezDurum = 'gecmis'
              if (r.durum === 'iptal' || r.durum === 'iptal_edildi') {
                rezDurum = 'iptal'
              } else if (r.durum === 'tamamlandi') {
                rezDurum = 'gecmis'
              } else if (r.durum === 'onaylandi' || r.durum === 'aktif') {
                if (baslangic && baslangic > bugun) {
                  rezDurum = 'yaklasan'
                } else if (baslangic && bitis && baslangic <= bugun && bugun <= bitis) {
                  rezDurum = 'aktif'
                } else if (bitis && bitis < bugun) {
                  rezDurum = 'gecmis'
                }
              }

              return {
                id: r.id,
                tesisAd: r.tesisler?.ad ?? 'Tesis',
                kapakGorsel: typeof foto === 'string' ? foto : (foto?.url ?? foto?.src ?? foto?.path ?? null),
                tarih: r.baslangic_tarih ?? '',
                sezlong: String(r.sezlong_id ?? '-'),
                sure: (() => {
                  if (!r.bitis_tarih || !r.baslangic_tarih) return '-'
                  const d0 = new Date(r.baslangic_tarih)
                  const d1 = new Date(r.bitis_tarih)
                  if (Number.isNaN(d0.getTime()) || Number.isNaN(d1.getTime())) return '-'
                  const diff = Math.round((d1.getTime() - d0.getTime()) / (1000 * 60 * 60 * 24))
                  return `${Math.max(1, diff)} gün`
                })(),
                odenen: formatTutar(r.toplam_tutar),
                durum: rezDurum,
                rezervasyon_kodu: r.rezervasyon_kodu ?? '',
                grupAd,
                sehir: r.tesisler?.sehir ?? '',
                kategori: kategoriLabel,
                tesisSlug: r.tesisler?.slug ?? '',
                sezlongLabel,
                iptalSaatOncesi: tesisPolitikaMap[r.tesis_id]?.iptal_saat_oncesi ?? null,
                calismaSaatleri: tesisPolitikaMap[r.tesis_id]?.calisma_saatleri ?? null,
                iptalPolitikasi: tesisPolitikaMap[r.tesis_id]?.iptal_politikasi ?? null,
                iptalEdilebilirMiHesap: iptalEdilebilirMi(r, tesisPolitikaMap[r.tesis_id] ?? {}),
              }
            }),
          )

          const toplam = (rezData ?? []).reduce((acc: number, r: any) => {
            if (r.durum === 'iptal' || r.durum === 'iptal_edildi') return acc
            return acc + (Number(r.toplam_tutar) || 0)
          }, 0)
          setToplamHarcama(toplam)
          const toplamKalan = (rezData ?? []).reduce((acc: number, r: any) => {
            if (r.durum === 'iptal' || r.durum === 'iptal_edildi') return acc
            // Sadece şu an devam eden rezervasyonların kalan bakiyesi
            const bugun = new Date()
            bugun.setHours(0, 0, 0, 0)
            const baslangic = r.baslangic_tarih ? new Date(r.baslangic_tarih) : null
            const bitis = r.bitis_tarih ? new Date(r.bitis_tarih) : null
            if (!baslangic || !bitis) return acc
            baslangic.setHours(0, 0, 0, 0)
            bitis.setHours(23, 59, 59, 999)
            if (baslangic > bugun || bitis < bugun) return acc
            return acc + (Number(r.bakiye_kalan) || 0)
          }, 0)
          setToplamKalanBakiye(toplamKalan)
          setAktifSezlonglar(aktifSezData)
          setSezlongMap(sezlongMap)
        } else {
        }

        const favData = favResult.data
        if (favData) setFavoriler(favData)

      }
    } catch (e) {
    } finally {
      setLoading(false)
      loadingRef.current = false
      lastFetchRef.current = Date.now()
    }
  }

  // useFocusEffect: ilk mount'ta AND her odak kazanımında çalışır (tab geçişi, ödeme sonrası
  // router.replace ile dönüş, vs.). useEffect([], []) yalnızca initial mount'ta çalıştığından
  // ödeme sonrası veya başka sekmeden geçince 0 istatistik sorununun kökü burasıydı.
  useFocusEffect(
    useCallback(() => {
      // 30 saniye içinde tekrar odaklanılırsa sorgu atlanır (hızlı tab geçişi koruması).
      // Pull-to-refresh her zaman bypass eder (onRefresh → loadProfil'i doğrudan çağırır).
      // Ödeme sonrası router.replace çağrısı genellikle >=30s sonra gelir; dolayısıyla
      // ödeme dönüşü cache'i bypass eder ve güncel rezervasyon görünür.
      if (Date.now() - lastFetchRef.current < 30_000) return
      void loadProfil()
    }, []),
  )

  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 10000)
    return () => clearInterval(iv)
  }, [])

  // DEĞİŞİKLİK 2+3: fetchAktifCagrilar ve fetchBildirimler TEK sorguda birleştirildi.
  // Eski: 2 ayrı bildirimler sorgusu + 1 duplicate rezervasyonlar sorgusu = 3 round trip.
  // Yeni: 1 bildirimler sorgusu, hem aktifCagrilar hem bildirimler state'ini doldurur = 1 round trip.
  // Dep [profil, rezervasyonlar] → [profil?.id, rezervasyonlar.length]: gereksiz object eşitlik
  // karşılaştırmasını önler; rezervasyonlar listesi dolunca (length değişince) yeniden çalışır.
  useEffect(() => {
    if (!profil?.id) return
    const rezIds = rezervasyonlar.map((r) => String(r.id)).filter(Boolean)
    if (rezIds.length === 0) {
      setAktifCagrilar({})
      setBildirimler([])
      return
    }

    async function fetchCagriVeBildirimler() {
      setBildirimlerLoading(true)
      const { data, error } = await supabase
        .from('bildirimler')
        .select('id, rezervasyon_id, created_at, yanit_tarihi, yanit_suresi_saniye, varis_tarihi, varis_suresi_saniye, okundu')
        .eq('tip', 'garson_cagri')
        .in('rezervasyon_id', rezIds)
        .order('created_at', { ascending: false })
        .limit(50)
      setBildirimlerLoading(false)
      if (error) {
        console.error('fetchCagriVeBildirimler:', JSON.stringify(error))
        return
      }
      const rows = data ?? []
      // bildirimler state (tam liste, 50 kayıtla sınırlı)
      setBildirimler(rows)
      // aktifCagrilar state (yalnızca aktif garson çağrıları)
      const now = Date.now()
      const onDakika = 10 * 60 * 1000
      const birDakika = 60 * 1000
      const yeni: Record<string, AktifCagriDurum> = {}
      for (const b of rows) {
        const key = String(b.rezervasyon_id)
        if (yeni[key]) continue
        const createdMs = new Date(b.created_at).getTime()
        const varisMs = b.varis_tarihi ? new Date(b.varis_tarihi).getTime() : null
        const isOkunmamis = !b.okundu && now - createdMs < onDakika
        const isYoldaFazinda = b.yanit_tarihi !== null && b.varis_tarihi === null
        const isYeniVaris = varisMs !== null && now - varisMs < birDakika
        if (isOkunmamis || isYoldaFazinda || isYeniVaris) {
          yeni[key] = {
            id: String(b.id),
            createdAt: b.created_at,
            yanitTarihi: b.yanit_tarihi ?? null,
            yanitSuresi: b.yanit_suresi_saniye ?? null,
            varisTarihi: b.varis_tarihi ?? null,
            varisSuresi: b.varis_suresi_saniye ?? null,
          }
        }
      }
      setAktifCagrilar(yeni)
    }

    // Her iki ref de birleşik fonksiyona işaret eder; realtime channel her ikisini çağırır,
    // fetchBildirimlerRef no-op yapılarak çift sorgu engellenir.
    fetchAktifCagrilarRef.current = fetchCagriVeBildirimler
    fetchBildirimlerRef.current = () => { /* fetchCagriVeBildirimler zaten yukarıda çalıştı */ }
    fetchCagriVeBildirimler()
  }, [profil?.id, rezervasyonlar.length])

  // Cagri realtime channel — sadece profil.id değişince yeniden kurulur
  // Benzersiz suffix: supabase.channel() aynı isimde mevcut (subscribed) kanalı döndürür
  // (v2.101.1 deduplication), unique suffix her run'da yeni instance garantiler
  useEffect(() => {
    if (!profil?.id) return
    const uid = Math.random().toString(36).slice(2)
    const cagriChannel = supabase
      .channel(`musteri-cagri-${profil.id}-${uid}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bildirimler' },
        (payload) => {
          if (payload.new) {
            void fetchAktifCagrilarRef.current?.()
            void fetchBildirimlerRef.current?.()
          }
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(cagriChannel)
    }
  }, [profil?.id])

  // DEĞİŞİKLİK 4: fetchSiparisler artık lazy — sadece Siparişlerim tab'ı aktifken çalışır.
  // Eski: sayfa açılışında otomatik → rezervasyonlar.select('id') + 2 ayrı siparis sorgusu = 3 seri RT.
  // Yeni: tab açılınca → state'ten rezIds (0 RT tasarrufu) + aktif+gecmis paralel = 2 RT (vs 3).
  // rezervasyonlar.length bağımlılığı: tab zaten açıkken rezervasyonlar yüklenirse yeniden çalışır.
  useEffect(() => {
    if (!profil?.id) return
    if (altSekme !== 'siparisler') return

    const rezIds = rezervasyonlar.map((r) => String(r.id)).filter(Boolean)
    if (rezIds.length === 0) {
      setAktifSiparisler([])
      setGecmisTumSiparisler([])
      setAktifSiparislerLoading(false)
      setGecmisTumLoading(false)
      return
    }

    async function fetchSiparisler() {
      setAktifSiparislerLoading(true)
      setGecmisTumLoading(true)

      const simdi = new Date()
      let baslangicTarihi: Date | null = null
      if (gecmisFilter === 'bugun') {
        baslangicTarihi = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate())
      } else if (gecmisFilter === 'hafta') {
        baslangicTarihi = new Date(simdi.getTime() - 7 * 24 * 60 * 60 * 1000)
      } else if (gecmisFilter === 'ay') {
        baslangicTarihi = new Date(simdi.getFullYear(), simdi.getMonth(), 1)
      }

      let gecmisQuery = supabase
        .from('siparisler')
        .select('id, durum, toplam, created_at, tesis_id, rezervasyon_id, siparis_kalemleri(ad, adet, fiyat), tesisler(ad)')
        .in('rezervasyon_id', rezIds)
        .in('durum', [SIPARIS_DURUM.TESLIM_EDILDI, 'iptal', 'iptal_edildi'])
        .order('created_at', { ascending: false })
        .limit(50)

      if (baslangicTarihi) {
        gecmisQuery = gecmisQuery.gte('created_at', baslangicTarihi.toISOString())
      }

      // Aktif + geçmiş siparişler paralel çekilir (2 seri RT → 1 paralel RT)
      const [aktifResult, gecmisResult] = await Promise.all([
        supabase
          .from('siparisler')
          .select('id, durum, toplam, created_at, tesis_id, rezervasyon_id, siparis_kalemleri(ad, adet, fiyat), tesisler(ad)')
          .in('rezervasyon_id', rezIds)
          .in('durum', [SIPARIS_DURUM.YENI, SIPARIS_DURUM.HAZIRLANIYOR, SIPARIS_DURUM.HAZIR, SIPARIS_DURUM.YOLDA])
          .order('created_at', { ascending: false }),
        gecmisQuery,
      ])

      if (!aktifResult.error) setAktifSiparisler(aktifResult.data ?? [])
      setAktifSiparislerLoading(false)

      if (!gecmisResult.error) setGecmisTumSiparisler(gecmisResult.data ?? [])
      setGecmisTumLoading(false)
    }

    fetchSiparislerRef.current = fetchSiparisler
    fetchSiparisler()
  }, [profil?.id, gecmisFilter, altSekme, rezervasyonlar.length])

  // Siparis realtime channel — sadece profil.id değişince yeniden kurulur
  // Benzersiz suffix: supabase.channel() deduplication'ı önlemek için
  useEffect(() => {
    if (!profil?.id) return
    const uid = Math.random().toString(36).slice(2)
    const siparisChannel = supabase
      .channel(`musteri-siparis-${profil.id}-${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'siparisler' },
        (payload) => {
          const oldRow = (payload as any).old
          const newRow = (payload as any).new
          const eskiDurum = oldRow?.durum
          const yeniDurum = newRow?.durum
          if (yeniDurum === SIPARIS_DURUM.HAZIR && eskiDurum !== SIPARIS_DURUM.HAZIR) {
            playHazirSesi()
          }
          void fetchSiparislerRef.current?.()
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(siparisChannel)
    }
  }, [profil?.id])

  // DEĞİŞİKLİK 4 (yorumlar): sadece Yorumlarım tab'ı açıkken çekilir.
  // Bir kez yüklendikten sonra tekrar çekilmez (length === 0 koşulu ile).
  useEffect(() => {
    if (!profil?.id) return
    if (altSekme !== 'yorumlar') return
    if (yorumlar.length > 0) return

    void supabase
      .from('yorumlar')
      .select('id, yorum, puan, created_at, durum, tesisler(ad)')
      .eq('kullanici_id', profil.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setYorumlar(data)
      })
  }, [profil?.id, altSekme, yorumlar.length])

  const avatarHarf = useMemo(() => {
    const t = (profil?.ad ?? '').trim()
    return t ? t.charAt(0).toLocaleUpperCase('tr-TR') : '?'
  }, [profil?.ad])
  const uyelikTarihi = profil?.uyeAyYil ?? ''

  const filtrelenmisRez = useMemo(() => {
    if (rezFilter === 'tum') return rezervasyonlar
    return rezervasyonlar.filter((r) => r.durum === rezFilter)
  }, [rezFilter, rezervasyonlar])

  const rezFilterCounts = useMemo(() => {
    return {
      tum: rezervasyonlar.length,
      yaklasan: rezervasyonlar.filter((x) => x.durum === 'yaklasan').length,
      aktif: rezervasyonlar.filter((x) => x.durum === 'aktif').length,
      gecmis: rezervasyonlar.filter((x) => x.durum === 'gecmis').length,
      iptal: rezervasyonlar.filter((x) => x.durum === 'iptal').length,
    }
  }, [rezervasyonlar])

  const handleCikis = async () => {
    await supabase.auth.signOut()
    router.replace('/giris')
  }

  const handleKaydetProfil = async () => {
    if (!profil || !form) return
    const { error } = await supabase
      .from('kullanicilar')
      .update({
        ad: form.ad.trim(),
        soyad: form.soyad.trim(),
        telefon: form.telefon.trim() || null,
        sehir: form.sehir.trim() || null,
        dogum_tarihi: formatDateForDB(form.dogumTarihi) || null,
      })
      .eq('id', profil.id)
    if (error) {
      Alert.alert('Hata', error.message)
      return
    }
    setProfil({
      ...profil,
      ad: form.ad.trim(),
      soyad: form.soyad.trim(),
      telefon: form.telefon.trim(),
      sehir: form.sehir.trim(),
    })
    setSuccessMesaj('✓ Profiliniz güncellendi')
    setTimeout(() => setSuccessMesaj(''), 2500)
    setKaydetBasari(true)
    setTimeout(() => setKaydetBasari(false), 2000)
  }

  const handleParolaDegistir = async () => {
    if (!mevcutParola.trim() || !yeniParola.trim() || !yeniParolaTekrar.trim()) {
      Alert.alert('Hata', 'Tüm alanları doldurun.')
      return
    }
    if (yeniParola !== yeniParolaTekrar) {
      Alert.alert('Hata', 'Yeni parola ile tekrarı eşleşmiyor.')
      return
    }
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.email) {
      Alert.alert('Hata', 'Oturum bulunamadı.')
      return
    }
    const { error: signErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: mevcutParola,
    })
    if (signErr) {
      Alert.alert('Hata', 'Mevcut parola hatalı.')
      return
    }
    const { error } = await supabase.auth.updateUser({ password: yeniParola })
    if (error) {
      Alert.alert('Hata', error.message)
      return
    }
    setMevcutParola('')
    setYeniParola('')
    setYeniParolaTekrar('')
    setModalParola(false)
    setSuccessMesaj('✓ Parolanız güncellendi')
    setTimeout(() => setSuccessMesaj(''), 2500)
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.loadingWrap]} edges={['top']}>
        <ActivityIndicator size="large" color="#0ABAB5" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.safe, styles.safeRelative]} edges={['top']}>
      {successMesaj !== '' ? (
        <View style={styles.successToast} pointerEvents="none">
          <Ionicons name="checkmark-circle-outline" size={22} color="#fff" />
          <Text style={styles.successToastText}>{successMesaj}</Text>
        </View>
      ) : null}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#0EA5A4']}
            tintColor="#0EA5A4"
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity
              style={styles.headerIconBtn}
              hitSlop={12}
              activeOpacity={0.8}
              onPress={() => setModalAyarlar(true)}
            >
              <Ionicons name="settings-outline" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIconBtn}
              hitSlop={12}
              activeOpacity={0.8}
              onPress={handleCikis}
            >
              <Ionicons name="log-out-outline" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.avatarWrap}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{avatarHarf}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.75)', fontWeight: '600', textAlign: 'center', marginTop: 1, letterSpacing: 1 }}>HOŞ GELDİN</Text>
          <Text style={styles.userName}>
            {profil ? `${profil.ad} ${profil.soyad}`.trim() : ''}
          </Text>
          <Text style={styles.userEmail}>{profil?.email ?? ''}</Text>
          <View style={styles.badgeRow}>
            {profil?.eposta_dogrulandi ? (
              <View style={styles.badgeYesil}>
                <Ionicons name="checkmark-circle" size={14} color="#15803d" />
                <Text style={styles.badgeYesilText}>E-posta Doğrulandı</Text>
              </View>
            ) : null}
            <View style={styles.badgeAltin}>
              <Ionicons name="ribbon-outline" size={14} color="#b45309" />
              <Text style={styles.badgeAltinText}>Üye</Text>
            </View>
          </View>
          {uyelikTarihi ? (
            <Text style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.85)',
              fontWeight: '600',
              marginTop: 3,
              textAlign: 'center'
            }}>
              Üye: {uyelikTarihi}
            </Text>
          ) : null}
        </View>

        <View
          style={{
            marginHorizontal: 16,
            marginTop: -12,
            borderRadius: 20,
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 12,
            elevation: 6,
          }}
        >
          <LinearGradient
            colors={['#0A1628', '#1e3a5f']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ flexDirection: 'row', padding: 20, gap: 0 }}
          >
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                borderRightWidth: 1,
                borderRightColor: 'rgba(255,255,255,0.25)',
                paddingRight: 16,
              }}
            >
              <Ionicons name="umbrella-outline" size={18} color="rgba(255,255,255,0.85)" />
              <Text style={{ fontSize: 22, fontWeight: '800', color: '#fff', marginTop: 6 }}>
                {rezervasyonlar.filter((r) => r.durum !== 'iptal').length}
              </Text>
              <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', marginTop: 2, fontWeight: '600' }}>
                Rezervasyon
              </Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center', paddingLeft: 16, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.25)', paddingRight: 16 }}>
              <Ionicons name="wallet-outline" size={18} color="rgba(255,255,255,0.85)" />
              <Text style={{ fontSize: 22, fontWeight: '800', color: '#fff', marginTop: 6 }}>
                {'\u20BA'}
                {toplamHarcama.toLocaleString('tr-TR')}
              </Text>
              <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', marginTop: 2, fontWeight: '600' }}>
                Toplam Harcama
              </Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Ionicons name="wallet-outline" size={18} color="#fff" style={{ marginBottom: 4 }} />
              <Text style={{ fontSize: 22, fontWeight: '800', color: '#fff', marginTop: 2 }}>
                {'₺'}{toplamKalanBakiye.toLocaleString('tr-TR')}
              </Text>
              <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
                Kalan Bakiye
              </Text>
            </View>
          </LinearGradient>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>QR Girişi</Text>
          <View style={styles.qrBtnRow}>
            <TouchableOpacity style={styles.btnQrOku} activeOpacity={0.85} onPress={() => void handleQrOku()}>
              <Ionicons name="camera-outline" size={22} color="#fff" />
              <Text style={styles.btnQrOkuText}>QR Oku</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btnKodGir}
              activeOpacity={0.85}
              onPress={() => {
                setKodHata('')
                setKodInput('')
                setModalKodGir(true)
              }}
            >
              <Ionicons name="keypad-outline" size={22} color="#fff" />
              <Text style={styles.btnKodGirText}>Kod Gir</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Aktif Şezlonglarım</Text>
          {aktifSezlonglar.length === 0 ? (
            <View style={styles.sezlongBos}>
              <Ionicons name="umbrella-outline" size={40} color="#94a3b8" />
              <Text style={styles.sezlongBosText}>Henüz aktif şezlongunuz yok</Text>
              <TouchableOpacity
                style={styles.btnRezYap}
                activeOpacity={0.9}
                onPress={() => router.push('/')}
              >
                <Text style={styles.btnRezYapText}>Rezervasyon Yap</Text>
              </TouchableOpacity>
            </View>
          ) : (
            aktifSezlonglar.map((r: any) => {
              const foto0 = r.tesisler?.fotograflar?.[0]
              const fotoUri =
                foto0 == null
                  ? ''
                  : typeof foto0 === 'string'
                    ? foto0
                    : String(foto0?.src ?? foto0?.url ?? '')
              const sureGun =
                typeof r.sure === 'number' && Number.isFinite(r.sure) && r.sure > 0
                  ? `${r.sure} gün`
                  : typeof r.sure === 'string' && String(r.sure).trim() !== ''
                    ? `${String(r.sure).trim()} gün`
                    : aktifSezlongSureStr(r)
              return (
                <View
                  key={r.id}
                  style={{
                    backgroundColor: '#fff',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 10,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.08,
                    shadowRadius: 6,
                    elevation: 3,
                  }}
                >
                  <View style={{ flexDirection: 'row', gap: 14 }}>
                    <View style={{ width: 110, height: 110, borderRadius: 12, overflow: 'hidden' }}>
                      {fotoUri ? (
                        <Image source={{ uri: fotoUri }} style={{ width: 110, height: 110, borderRadius: 12 }} resizeMode="cover" />
                      ) : (
                        <View
                          style={{
                            width: 110,
                            height: 110,
                            borderRadius: 12,
                            backgroundColor: '#e2e8f0',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ fontWeight: 'bold', fontSize: 15, flex: 1 }} numberOfLines={1}>
                          {r.tesisler?.ad}
                        </Text>
                      </View>
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginTop: 2,
                        }}
                      >
                        {dogrulandiId === r.id ? (
                          <View
                            style={{
                              backgroundColor: '#22c55e',
                              borderRadius: 6,
                              paddingHorizontal: 8,
                              paddingVertical: 2,
                            }}
                          >
                            <Text style={{ color: 'white', fontSize: 11, fontWeight: 'bold' }}>Aktif</Text>
                          </View>
                        ) : (
                          <View />
                        )}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 12, color: '#0d9488', fontWeight: 'bold' }}>
                            {r.rezervasyon_kodu ?? ''}
                          </Text>
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={async () => {
                              const kod = r.rezervasyon_kodu ?? ''
                              if (!kod) return
                              await Clipboard.setStringAsync(kod)
                              setSuccessMesaj('✓ Kod kopyalandı')
                              setTimeout(() => setSuccessMesaj(''), 2000)
                            }}
                          >
                            <Ionicons name="copy-outline" size={14} color="#0d9488" />
                          </TouchableOpacity>
                        </View>
                      </View>
                      <Text style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                        Tarih: {formatRezTarih(r.baslangic_tarih ?? '')}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        {'\u015eezlong: ' + (sezlongMap[r.sezlong_id] ?? '')}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        Süre: {sureGun}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        Ödenen: {formatTutar(r.toplam_tutar)}
                      </Text>
                    </View>
                  </View>
                  {(() => {
                    const cagri = aktifCagrilar[String(r.id)]
                    if (!cagri) return null
                    const nowMs = Date.now()
                    const createdMs = new Date(cagri.createdAt).getTime()

                    // Aşama 3: varis_tarihi dolu
                    if (cagri.varisTarihi) {
                      const varisMs = new Date(cagri.varisTarihi).getTime()
                      if (nowMs - varisMs > 60000) return null
                      const sureSn = cagri.varisSuresi ?? Math.round((varisMs - createdMs) / 1000)
                      return (
                        <View
                          style={{
                            paddingVertical: 10,
                            paddingHorizontal: 12,
                            borderRadius: 10,
                            marginTop: 10,
                            backgroundColor: 'rgba(8,145,178,0.08)',
                            borderWidth: StyleSheet.hairlineWidth,
                            borderColor: 'rgba(8,145,178,0.3)',
                          }}
                        >
                          <Text style={{ fontSize: 13, color: '#0C4A6E', fontWeight: '600' }}>
                            💚 Garson şezlongunuza geldi • Süre: {formatSure(sureSn)}
                          </Text>
                        </View>
                      )
                    }

                    // Aşama 2: yanit_tarihi dolu, varis yok
                    if (cagri.yanitTarihi) {
                      const yanitMs = new Date(cagri.yanitTarihi).getTime()
                      const sureSn = cagri.yanitSuresi ?? Math.round((yanitMs - createdMs) / 1000)
                      return (
                        <View
                          style={{
                            paddingVertical: 10,
                            paddingHorizontal: 12,
                            borderRadius: 10,
                            marginTop: 10,
                            backgroundColor: 'rgba(16,185,129,0.08)',
                            borderWidth: StyleSheet.hairlineWidth,
                            borderColor: 'rgba(16,185,129,0.3)',
                          }}
                        >
                          <Text style={{ fontSize: 13, color: '#065F46', fontWeight: '600' }}>
                            ✅ Garson yolda • Yanıt süresi: {formatSure(sureSn)}
                          </Text>
                        </View>
                      )
                    }

                    // Aşama 1: bekliyor
                    const dakikaOnce = Math.max(0, Math.round((nowMs - createdMs) / 60000))
                    const zamanMetni = dakikaOnce === 0 ? 'Az önce' : `${dakikaOnce} dk önce`
                    return (
                      <View
                        style={{
                          paddingVertical: 10,
                          paddingHorizontal: 12,
                          borderRadius: 10,
                          marginTop: 10,
                          backgroundColor: 'rgba(245,130,31,0.08)',
                          borderWidth: StyleSheet.hairlineWidth,
                          borderColor: 'rgba(245,130,31,0.3)',
                        }}
                      >
                        <Text style={{ fontSize: 13, color: '#92400E', fontWeight: '600' }}>
                          🔔 Garson çağrısı gönderildi • {zamanMetni}
                        </Text>
                      </View>
                    )
                  })()}
                  {(() => {
                    const rezId = String(r.id)
                    const girisYapildi = r.giris_yapildi === true
                    const cagriKilitli = (garsonCagriCooldown[rezId] ?? 0) > Date.now()
                    const aktifVeOnayli = (r.durum === 'aktif' || r.durum === 'onaylandi')

                    return (
                      <View style={{ gap: 8, marginTop: 10 }}>
                        {/* 1. satır: Garson Çağır + Sipariş Ver */}
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TouchableOpacity
                            disabled={!girisYapildi || !aktifVeOnayli || cagriKilitli}
                            activeOpacity={0.85}
                            style={{
                              flex: 1,
                              backgroundColor: !girisYapildi ? '#E5E7EB' : (cagriKilitli ? '#FCA5A5' : '#EF4444'),
                              paddingVertical: 12,
                              borderRadius: 10,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 6,
                            }}
                            onPress={() => {
                              if (!girisYapildi) {
                                Alert.alert('Şezlong girişi gerekli', 'Önce QR veya Kod ile şezlong girişinizi yapın.')
                                return
                              }
                              setCallModalRez(r as any)
                              setShowCallModal(true)
                            }}
                          >
                            <Ionicons
                              name={!girisYapildi ? 'lock-closed' : (cagriKilitli ? 'checkmark-circle' : 'notifications')}
                              size={15}
                              color={!girisYapildi ? '#9CA3AF' : '#fff'}
                            />
                            <Text style={{ color: !girisYapildi ? '#6B7280' : '#fff', fontWeight: '700', fontSize: 13 }}>
                              {!girisYapildi ? 'Garson Çağır' : (cagriKilitli ? 'Çağrıldı' : 'Garson Çağır')}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            disabled={!girisYapildi || !aktifVeOnayli}
                            activeOpacity={0.85}
                            style={{
                              flex: 1,
                              backgroundColor: !girisYapildi ? '#E5E7EB' : '#F5821F',
                              paddingVertical: 12,
                              borderRadius: 10,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 6,
                            }}
                            onPress={() => {
                              if (!girisYapildi) {
                                Alert.alert('Şezlong girişi gerekli', 'Önce QR veya Kod ile şezlong girişinizi yapın.')
                                return
                              }
                              router.push({ pathname: '/siparis/[rezervasyon_id]', params: { rezervasyon_id: String(r.id), tesis_id: String(r.tesis_id || '') } })
                            }}
                          >
                            <Ionicons name={!girisYapildi ? 'lock-closed' : 'restaurant'} size={15} color={!girisYapildi ? '#9CA3AF' : '#fff'} />
                            <Text style={{ color: !girisYapildi ? '#6B7280' : '#fff', fontWeight: '700', fontSize: 13 }}>
                              Sipariş Ver
                            </Text>
                          </TouchableOpacity>
                        </View>

                        {/* 2. satır: Tesise Git (full width) */}
                        <TouchableOpacity
                          activeOpacity={0.85}
                          style={{
                            backgroundColor: '#0ABAB5',
                            paddingVertical: 12,
                            borderRadius: 10,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                          }}
                          onPress={() => {
                            const slug = r.tesisler?.slug || (r.tesisAd ?? '').toLowerCase().replace(/\s+/g, '-')
                            router.push(`/tesis/${slug}`)
                          }}
                        >
                          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Tesise Git →</Text>
                        </TouchableOpacity>

                        {/* Bilgi mesajı: şezlong girişi yapılmamışsa */}
                        {!girisYapildi && (
                          <View style={{
                            backgroundColor: '#FEF3C7',
                            borderWidth: StyleSheet.hairlineWidth,
                            borderColor: '#FCD34D',
                            borderRadius: 8,
                            padding: 10,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                          }}>
                            <Ionicons name="information-circle" size={16} color="#92400E" />
                            <Text style={{ flex: 1, fontSize: 12, color: '#92400E', fontWeight: '600' }}>
                              Sipariş verebilmek için QR Oku yada Kod ile şezlong girişi yapın.
                            </Text>
                          </View>
                        )}
                      </View>
                    )
                  })()}
                </View>
              )
            })
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.altSekmeBar}
          contentContainerStyle={styles.altSekmeBarContent}
        >
          {(
            [
              { key: 'rezervasyonlar' as const, label: 'Rezervasyonlarım' },
              { key: 'siparisler' as const, label: 'Siparişlerim' },
              { key: 'yorumlar' as const, label: 'Yorumlarım' },
              { key: 'favoriler' as const, label: 'Favorilerim' },
              { key: 'bildirimler' as const, label: 'Bildirimler' },
            ] as const
          ).map((s) => (
            <TouchableOpacity
              key={s.key}
              style={[styles.altSekmeItem, altSekme === s.key && styles.altSekmeItemActive]}
              onPress={() => setAltSekme(s.key)}
              activeOpacity={0.85}
            >
              <Text
                numberOfLines={1}
                style={[styles.altSekmeText, altSekme === s.key && styles.altSekmeTextActive]}
              >
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {altSekme === 'rezervasyonlar' ? (
          <>
            <View style={styles.card}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filtreScroll}
              >
                {(
                  [
                    { key: 'tum' as const, label: `Tümü (${rezFilterCounts.tum})` },
                    { key: 'yaklasan' as const, label: `Yaklaşan (${rezFilterCounts.yaklasan})` },
                    { key: 'aktif' as const, label: `Aktif (${rezFilterCounts.aktif})` },
                    { key: 'gecmis' as const, label: `Geçmiş (${rezFilterCounts.gecmis})` },
                    { key: 'iptal' as const, label: `İptal (${rezFilterCounts.iptal})` },
                  ] as const
                ).map((f) => (
                  <TouchableOpacity
                    key={f.key}
                    style={[styles.filtreChip, rezFilter === f.key && styles.filtreChipActive]}
                    onPress={() => setRezFilter(f.key)}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[styles.filtreChipText, rezFilter === f.key && styles.filtreChipTextActive]}
                    >
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={{ marginHorizontal: 12, paddingHorizontal: 16 }}>
            {filtrelenmisRez.length === 0 ? (
              <Text style={styles.bosListe}>Bu filtrede rezervasyon yok.</Text>
            ) : (
              filtrelenmisRez.slice(0, visibleRezCount).map((r) => {
                const dc = rezDurumBadgeColors(r.durum)
                return (
                  <View key={r.id} style={styles.rezWebCard}>
                    <View style={styles.rezWebTop}>
                      <View style={styles.rezWebFotoWrap}>
                        {r.kapakGorsel ? (
                          <Image
                            source={{ uri: r.kapakGorsel }}
                            style={styles.rezWebFoto}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={[styles.rezWebFoto, styles.rezWebFotoPh]}>
                            <Ionicons name="image-outline" size={32} color="#94a3b8" />
                          </View>
                        )}
                      </View>
                      <View style={styles.rezWebTopRight}>
                        <View style={styles.rezWebTitleRow}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.rezTesisAd} numberOfLines={2}>
                              {r.tesisAd}
                            </Text>
                            <Text style={{ fontSize: 11, color: '#0d9488', fontWeight: 'bold' }}>
                              {r.rezervasyon_kodu ?? ''}
                            </Text>
                            {r.kategori ? (
                              <View style={styles.rezKategoriPill}>
                                <Text style={styles.rezKategoriPillText}>{r.kategori}</Text>
                              </View>
                            ) : null}
                            {r.sehir ? (
                              <View style={styles.rezSehirRow}>
                                <Ionicons name="location-outline" size={14} color="#64748b" />
                                <Text style={styles.rezSehirText}>{r.sehir}</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </View>
                    </View>
                    <View style={[styles.rezDurumPill, { backgroundColor: dc.bg }]}>
                      <Text style={[styles.rezDurumPillText, { color: dc.fg }]}>
                        {rezDurumLabel(r.durum)}
                      </Text>
                    </View>
                    <View style={styles.rezInfoBlock}>
                      <View style={styles.rezInfoLineRow}>
                        <Ionicons name="calendar-outline" size={13} color="#64748b" />
                        <Text style={styles.rezInfoLine}>Tarih: {formatRezTarih(r.tarih)}</Text>
                      </View>
                      <View style={styles.rezInfoLineRow}>
                        <Ionicons name="bed-outline" size={13} color="#64748b" />
                        <Text style={styles.rezInfoLine}>Şezlong: {r.sezlongLabel}</Text>
                      </View>
                      <View style={styles.rezInfoLineRow}>
                        <Ionicons name="time-outline" size={13} color="#64748b" />
                        <Text style={styles.rezInfoLine}>Süre: {r.sure}</Text>
                      </View>
                      <View style={styles.rezInfoLineRow}>
                        <Ionicons name="cash-outline" size={13} color="#0ABAB5" />
                        <Text style={styles.rezInfoLine}>Ödenen: {r.odenen}</Text>
                      </View>
                    </View>
                    <View style={styles.rezWebBtnRow}>
                      {(() => {
                        const iptalSonuc = r.iptalEdilebilirMiHesap ?? { edilebilir: false, kalanSaat: 0, gerekenSaat: 24 }
                        const gri = !iptalSonuc.edilebilir
                        return (
                          <TouchableOpacity
                            style={[
                              styles.btnIptal,
                              gri
                                ? { backgroundColor: '#9CA3AF', borderColor: '#9CA3AF', opacity: 0.7 }
                                : { backgroundColor: '#dc2626', borderColor: '#dc2626' },
                            ]}
                            activeOpacity={0.85}
                            onPress={() => {
                              if (gri) {
                                setInfoModal({
                                  visible: true,
                                  baslik: 'İptal Yapılamıyor',
                                  mesaj: `Bu rezervasyon için iptal süresi dolmuştur. Tesisin politikasına göre iptal işlemi en az ${iptalSonuc.gerekenSaat} saat önce yapılmalıydı. Lütfen tesis ile iletişime geçin.`,
                                })
                              } else {
                                setConfirmModal({
                                  visible: true,
                                  baslik: 'Rezervasyonu İptal Et',
                                  mesaj: 'Bu rezervasyonu iptal etmek istediğinize emin misiniz? İptal işlemi geri alınamaz ve ücret iadeniz başlatılır. Ödemeniz 5 iş günü içinde kartınıza iade edilecektir.',
                                  rezervasyon: r,
                                })
                              }
                            }}
                          >
                            <Text style={[styles.btnIptalText, { color: '#fff', fontWeight: '700' }]}>
                              İptal Et
                            </Text>
                          </TouchableOpacity>
                        )
                      })()}
                      <TouchableOpacity
                        style={[styles.btnTesiseGit, { backgroundColor: '#f97316' }]}
                        activeOpacity={0.85}
                        onPress={() => {
                          if (r.tesisSlug) router.push(`/tesis/${r.tesisSlug}`)
                        }}
                      >
                        <Text style={styles.btnTesiseGitText}>Tesise Git</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )
              })
            )}
            {filtrelenmisRez.length > visibleRezCount && (
              <TouchableOpacity
                style={{
                  marginTop: 12,
                  marginBottom: 12,
                  paddingVertical: 14,
                  borderWidth: 1,
                  borderColor: '#0EA5A4',
                  borderRadius: 12,
                  alignItems: 'center',
                  backgroundColor: '#fff',
                }}
                onPress={() => setVisibleRezCount((prev) => prev + 10)}
              >
                <Text style={{ color: '#0EA5A4', fontWeight: '600', fontSize: 14 }}>
                  Daha Fazla Göster ({filtrelenmisRez.length - visibleRezCount} adet kaldı)
                </Text>
              </TouchableOpacity>
            )}
            </View>
          </>
        ) : null}

        {altSekme === 'yorumlar' ? (
          <View style={styles.card}>
            {yorumlar.length === 0 ? (
              <Text style={styles.bosListe}>Henüz yorum yapmadınız</Text>
            ) : (
              yorumlar.map((r: any) => {
                let yorumDurumBadge: { bg: string; fg: string; label: string } | null = null
                if (r.durum === 'onaylı') {
                  yorumDurumBadge = { bg: '#dcfce7', fg: '#15803d', label: 'Onaylı' }
                } else if (r.durum === 'bekliyor') {
                  yorumDurumBadge = { bg: '#fef3c7', fg: '#b45309', label: 'Beklemede' }
                } else if (r.durum === 'reddedildi') {
                  yorumDurumBadge = { bg: '#fee2e2', fg: '#dc2626', label: 'Reddedildi' }
                }
                return (
                  <View key={r.id} style={[styles.rezCard, { position: 'relative' }]}>
                    {yorumDurumBadge ? (
                      <View
                        style={[styles.yorumDurumBadge, { backgroundColor: yorumDurumBadge.bg }]}
                      >
                        <Text style={[styles.yorumDurumBadgeText, { color: yorumDurumBadge.fg }]}>
                          {yorumDurumBadge.label}
                        </Text>
                      </View>
                    ) : null}
                    <View style={styles.rezBody}>
                      <Text style={styles.rezTesisAd}>{r.tesisler?.ad ?? 'Tesis'}</Text>
                      <View style={{ flexDirection: 'row', marginTop: 4 }}>
                        {[1, 2, 3, 4, 5].map((i) => (
                          <Text
                            key={i}
                            style={{ color: i <= (r.puan ?? 0) ? '#f59e0b' : '#cbd5e1', fontSize: 16 }}
                          >
                            ★
                          </Text>
                        ))}
                      </View>
                      <Text style={[styles.rezMeta, { marginTop: 6, color: '#374151', fontSize: 13 }]}>
                        {r.yorum}
                      </Text>
                      <Text style={[styles.rezMeta, { marginTop: 4 }]}>{r.created_at?.slice(0, 10)}</Text>
                    </View>
                  </View>
                )
              })
            )}
          </View>
        ) : null}

        {altSekme === 'favoriler' ? (
          <View style={styles.card}>
            {favoriler.length === 0 ? (
              <Text style={styles.bosListe}>Henüz favori eklemediniz</Text>
            ) : (
              favoriler.map((r: any) => (
                <View key={r.id} style={styles.favCard}>
                  <View style={styles.favFotoWrap}>
                    {r.tesisler?.fotograflar?.[0] ? (
                      <Image
                        source={{
                          uri:
                            typeof r.tesisler.fotograflar[0] === 'string'
                              ? r.tesisler.fotograflar[0]
                              : (r.tesisler.fotograflar[0]?.url ??
                                  r.tesisler.fotograflar[0]?.src ??
                                  ''),
                        }}
                        style={styles.favFoto}
                        resizeMode="cover"
                      />
                    ) : (
                      <View
                        style={[
                          styles.favFoto,
                          { backgroundColor: '#e0f2f1', alignItems: 'center', justifyContent: 'center' },
                        ]}
                      >
                        <Ionicons name="image-outline" size={32} color="#94a3b8" />
                      </View>
                    )}
                  </View>
                  <View style={styles.favBody}>
                    <Text style={styles.rezTesisAd}>{r.tesisler?.ad ?? 'Tesis'}</Text>
                    <Text style={styles.rezMeta}>Favorilere eklendi: {r.created_at?.slice(0, 10)}</Text>
                    <TouchableOpacity
                      style={{
                        backgroundColor: '#f97316',
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        alignSelf: 'flex-start',
                        marginTop: 8,
                      }}
                      activeOpacity={0.85}
                      onPress={() => router.push(`/tesis/${r.tesisler?.slug}`)}
                    >
                      <Text style={styles.btnTesiseGitText}>Şezlong Seç →</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        ) : null}

        {altSekme === 'bildirimler' ? (
          <View style={{ marginTop: 12 }}>
            {bildirimlerLoading ? (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#0ABAB5" />
              </View>
            ) : bildirimler.length === 0 ? (
              <View style={{ padding: 32, alignItems: 'center' }}>
                <Ionicons name="notifications-off-outline" size={40} color="#cbd5e1" />
                <Text style={{ marginTop: 10, fontSize: 14, color: '#64748b' }}>
                  Henüz bildirim yok
                </Text>
              </View>
            ) : (
              bildirimler.map((b: any) => {
                const now = Date.now()
                const createdMs = new Date(b.created_at).getTime()
                const yanitMs = b.yanit_tarihi ? new Date(b.yanit_tarihi).getTime() : null
                const varisMs = b.varis_tarihi ? new Date(b.varis_tarihi).getTime() : null
                const tesisAd = getTesisAdFromRez(b.rezervasyon_id, rezervasyonlar)

                let bgColor = 'rgba(148,163,184,0.08)'
                let borderColor = 'rgba(148,163,184,0.3)'
                let textColor = '#475569'
                let icon = 'notifications-outline'
                let durumMetni = 'Bekliyor'

                if (varisMs) {
                  bgColor = 'rgba(8,145,178,0.08)'
                  borderColor = 'rgba(8,145,178,0.3)'
                  textColor = '#0C4A6E'
                  icon = 'checkmark-done'
                  const varisSure = b.varis_suresi_saniye ?? Math.round((varisMs - createdMs) / 1000)
                  const yanitSure = b.yanit_suresi_saniye ?? (yanitMs ? Math.round((yanitMs - createdMs) / 1000) : null)
                  if (yanitSure !== null) {
                    durumMetni = `✓ Yolda: ${formatSure(yanitSure)} • ✓ Vardı: ${formatSure(varisSure)}`
                  } else {
                    durumMetni = `✓ Vardı: ${formatSure(varisSure)}`
                  }
                } else if (yanitMs) {
                  bgColor = 'rgba(16,185,129,0.08)'
                  borderColor = 'rgba(16,185,129,0.3)'
                  textColor = '#065F46'
                  icon = 'checkmark'
                  const yanitSure = b.yanit_suresi_saniye ?? Math.round((yanitMs - createdMs) / 1000)
                  durumMetni = `✓ Yolda: ${formatSure(yanitSure)}`
                } else if (!b.okundu && (now - createdMs) > 5 * 60 * 1000) {
                  bgColor = 'rgba(239,68,68,0.08)'
                  borderColor = 'rgba(239,68,68,0.3)'
                  textColor = '#991B1B'
                  icon = 'alert-circle-outline'
                  durumMetni = 'Garson henüz yanıt vermedi'
                } else if (!b.okundu) {
                  bgColor = 'rgba(245,130,31,0.08)'
                  borderColor = 'rgba(245,130,31,0.3)'
                  textColor = '#92400E'
                  icon = 'time-outline'
                  durumMetni = 'Bekleniyor'
                }

                return (
                  <View
                    key={String(b.id)}
                    style={{
                      backgroundColor: bgColor,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: borderColor,
                      borderRadius: 10,
                      padding: 12,
                      marginBottom: 8,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}>
                        <Ionicons name={icon as any} size={16} color={textColor} />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: textColor, flex: 1 }} numberOfLines={1}>
                          {tesisAd}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 11, color: textColor, opacity: 0.8 }}>
                        {formatZamanOnce(b.created_at)}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 12, color: textColor, fontWeight: '600', marginLeft: 24 }}>
                      {durumMetni}
                    </Text>
                  </View>
                )
              })
            )}
          </View>
        ) : null}

        {altSekme === 'siparisler' && (
          <View style={{ marginTop: 12, gap: 16 }}>
            {/* Aktif Siparişler */}
            <View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 10 }}>
                Aktif Siparişlerim
              </Text>
              {aktifSiparislerLoading ? (
                <ActivityIndicator size="small" color="#0ABAB5" />
              ) : aktifSiparisler.length === 0 ? (
                <View style={{ padding: 20, alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 10 }}>
                  <Ionicons name="restaurant-outline" size={32} color="#cbd5e1" />
                  <Text style={{ marginTop: 8, fontSize: 13, color: '#64748b' }}>
                    Aktif siparişiniz yok
                  </Text>
                </View>
              ) : (
                aktifSiparisler.map((s: any) => {
                  const stages = [
                    { key: SIPARIS_DURUM.YENI,         label: 'Alındı',       icon: '✓'  },
                    { key: SIPARIS_DURUM.HAZIRLANIYOR, label: 'Hazırlanıyor', icon: '🍳' },
                    { key: SIPARIS_DURUM.HAZIR,        label: 'Hazır',        icon: '🔔' },
                    { key: SIPARIS_DURUM.YOLDA,        label: 'Yolda',        icon: '🛵' },
                    { key: SIPARIS_DURUM.TESLIM_EDILDI,label: 'Teslim',       icon: '✅' },
                  ]
                  const currentIdx = stages.findIndex((st) => st.key === s.durum)
                  const tesisAd = s.tesisler?.ad || 'Bilinmeyen Tesis'
                  const kalemleri: any[] = Array.isArray(s.siparis_kalemleri) ? s.siparis_kalemleri : []
                  const toplamHesap = kalemleri.reduce((sum: number, k: any) => sum + Number(k.fiyat ?? 0) * Number(k.adet ?? 1), 0)
                  const toplamGoster = toplamHesap > 0 ? toplamHesap : Number(s.toplam || 0)
                  const zamanOnce = formatZamanOnce(s.created_at)
                  const chipConfig: Record<string, { bg: string; color: string; text: string }> = {
                    [SIPARIS_DURUM.YENI]:         { bg: 'rgba(245,130,31,0.12)', color: '#F5821F', text: '📥 Alındı' },
                    [SIPARIS_DURUM.HAZIRLANIYOR]: { bg: 'rgba(234,179,8,0.12)',  color: '#CA8A04', text: '🍳 Hazırlanıyor' },
                    [SIPARIS_DURUM.HAZIR]:        { bg: 'rgba(16,185,129,0.12)', color: '#10B981', text: '🔔 Hazır' },
                    [SIPARIS_DURUM.YOLDA]:        { bg: 'rgba(59,130,246,0.15)', color: '#3B82F6', text: '🛵 Garson Yolda' },
                  }
                  const chip = chipConfig[s.durum] ?? chipConfig[SIPARIS_DURUM.YENI]

                  return (
                    <View
                      key={String(s.id)}
                      style={{
                        backgroundColor: '#fff',
                        borderRadius: 14,
                        padding: 16,
                        marginBottom: 12,
                        borderWidth: 1,
                        borderColor: 'rgba(10,186,181,0.2)',
                        shadowColor: '#0ABAB5',
                        shadowOpacity: 0.08,
                        shadowRadius: 8,
                        shadowOffset: { width: 0, height: 2 },
                        elevation: 2,
                      }}
                    >
                      {/* Üst satır: sipariş kodu + durum chip */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                        <View>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a' }}>
                            Sipariş #{String(s.id).slice(-5)}
                          </Text>
                          <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{tesisAd}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <View style={{ backgroundColor: chip.bg, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: chip.color }}>{chip.text}</Text>
                          </View>
                          <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{zamanOnce}</Text>
                        </View>
                      </View>

                      {/* Ürünler */}
                      {kalemleri.length > 0 && (
                        <Text style={{ fontSize: 12, color: '#475569', marginBottom: 8 }} numberOfLines={2}>
                          {kalemleri.map((u: any, i: number) => `${u.ad} ×${u.adet}${i < kalemleri.length - 1 ? ' · ' : ''}`).join('')}
                        </Text>
                      )}

                      {/* Toplam */}
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a', textAlign: 'right', marginBottom: 14 }}>
                        ₺{toplamGoster.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </Text>

                      {/* Progress bar — web ile aynı mantık */}
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        {stages.map((stage, idx) => {
                          const isDone   = idx < currentIdx
                          const isActive = idx === currentIdx
                          const size = isActive ? 32 : 26
                          return (
                            <View key={stage.key} style={{ flex: 1, alignItems: 'center', position: 'relative' }}>
                              {idx > 0 && (
                                <View style={{
                                  position: 'absolute',
                                  height: 2,
                                  backgroundColor: idx <= currentIdx ? '#10B981' : '#e2e8f0',
                                  top: size / 2 - 1,
                                  right: '50%',
                                  width: '100%',
                                  zIndex: 0,
                                }} />
                              )}
                              <View style={{
                                width: size,
                                height: size,
                                borderRadius: size / 2,
                                backgroundColor: isActive ? '#F5821F' : isDone ? '#10B981' : '#e2e8f0',
                                alignItems: 'center',
                                justifyContent: 'center',
                                zIndex: 1,
                              }}>
                                {isDone ? (
                                  <Ionicons name="checkmark" size={14} color="#fff" />
                                ) : (
                                  <Text style={{ fontSize: isActive ? 13 : 11, color: isActive ? '#fff' : '#94a3b8', fontWeight: '700' }}>
                                    {stage.icon}
                                  </Text>
                                )}
                              </View>
                              <Text style={{
                                fontSize: 9,
                                marginTop: 4,
                                color: isActive ? '#F5821F' : isDone ? '#10B981' : '#94a3b8',
                                fontWeight: isActive ? '700' : '500',
                                textAlign: 'center',
                              }} numberOfLines={2}>
                                {stage.label}
                              </Text>
                            </View>
                          )
                        })}
                      </View>
                    </View>
                  )
                })
              )}
            </View>

            {/* Sipariş Geçmişim */}
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a' }}>
                  Sipariş Geçmişim
                </Text>
              </View>

              {/* Filtre butonları */}
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                {(['bugun', 'hafta', 'ay', 'tumu'] as const).map((f) => {
                  const labels = { bugun: 'Bugün', hafta: 'Hafta', ay: 'Ay', tumu: 'Tümü' }
                  const isActive = gecmisFilter === f
                  return (
                    <TouchableOpacity
                      key={f}
                      onPress={() => setGecmisFilter(f)}
                      style={{
                        paddingVertical: 6,
                        paddingHorizontal: 12,
                        borderRadius: 20,
                        backgroundColor: isActive ? '#0ABAB5' : '#f1f5f9',
                      }}
                    >
                      <Text style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: isActive ? '#fff' : '#475569',
                      }}>
                        {labels[f]}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>

              {gecmisTumLoading ? (
                <ActivityIndicator size="small" color="#0ABAB5" />
              ) : gecmisTumSiparisler.length === 0 ? (
                <View style={{ padding: 20, alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 10 }}>
                  <Ionicons name="archive-outline" size={32} color="#cbd5e1" />
                  <Text style={{ marginTop: 8, fontSize: 13, color: '#64748b' }}>
                    Bu filtrede sipariş yok
                  </Text>
                </View>
              ) : (
                (() => {
                  const gruplar: Record<string, any[]> = {}
                  gecmisTumSiparisler.forEach((s: any) => {
                    const d = new Date(s.created_at)
                    const key = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' })
                    if (!gruplar[key]) gruplar[key] = []
                    gruplar[key].push(s)
                  })
                  return Object.entries(gruplar).map(([tarihLabel, siparisler]) => (
                    <View key={tarihLabel} style={{ marginBottom: 14 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                        {'── '}{tarihLabel}{' ──'}
                      </Text>
                      {siparisler.map((s: any) => {
                        const tesisAd = s.tesisler?.ad || 'Bilinmeyen Tesis'
                        const saat = new Date(s.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                        const kalemleri: any[] = Array.isArray(s.siparis_kalemleri) ? s.siparis_kalemleri : []
                        const isIptal = s.durum === 'iptal' || s.durum === 'iptal_edildi'
                        return (
                          <View
                            key={String(s.id)}
                            style={{
                              backgroundColor: '#fff',
                              borderRadius: 10,
                              padding: 12,
                              marginBottom: 8,
                              borderWidth: StyleSheet.hairlineWidth,
                              borderColor: '#e2e8f0',
                            }}
                          >
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                              <View style={{ flex: 1, marginRight: 8 }}>
                                <Text style={{ fontSize: 13, fontWeight: '800', color: '#0f172a' }}>
                                  Sipariş #{String(s.id).slice(-5)}
                                </Text>
                                <Text style={{ fontSize: 11, color: '#64748b', marginTop: 1 }} numberOfLines={1}>{tesisAd}</Text>
                              </View>
                              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                                <Text style={{ fontSize: 11, color: '#94a3b8' }}>{saat}</Text>
                                <View style={{
                                  backgroundColor: isIptal ? '#fef2f2' : '#f0fdf4',
                                  borderWidth: 1,
                                  borderColor: isIptal ? '#fecaca' : '#bbf7d0',
                                  borderRadius: 6,
                                  paddingHorizontal: 8,
                                  paddingVertical: 2,
                                }}>
                                  <Text style={{ fontSize: 10, fontWeight: '800', color: isIptal ? '#b91c1c' : '#16a34a' }}>
                                    {isIptal ? '✗ İptal' : '✓ Teslim'}
                                  </Text>
                                </View>
                              </View>
                            </View>
                            {kalemleri.length > 0 && (
                              <Text style={{ fontSize: 11, color: '#64748b', marginTop: 4 }} numberOfLines={2}>
                                {kalemleri.map((u: any, i: number) => `${u.ad} ×${u.adet}${i < kalemleri.length - 1 ? ' · ' : ''}`).join('')}
                              </Text>
                            )}
                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#0f172a', textAlign: 'right', marginTop: 6 }}>
                              ₺{Number(s.toplam || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                            </Text>
                          </View>
                        )
                      })}
                    </View>
                  ))
                })()
              )}
            </View>
          </View>
        )}

      </ScrollView>

      <Modal visible={modalAyarlar} animationType="slide" transparent onRequestClose={() => setModalAyarlar(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View
            style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingBottom: 32,
              height: '85%',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 20,
                borderBottomWidth: 1,
                borderBottomColor: '#f1f5f9',
              }}
            >
              <Text style={{ fontSize: 17, fontWeight: '800', color: '#0A1628' }}>Ayarlar</Text>
              <TouchableOpacity onPress={() => setModalAyarlar(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1, padding: 16 }} showsVerticalScrollIndicator={false}>
              {profil && form ? (
                <>
                  <TouchableOpacity
                    onPress={() => setAccordionProfil((v) => !v)}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingVertical: 14,
                      borderBottomWidth: 1,
                      borderBottomColor: '#f1f5f9',
                      marginBottom: accordionProfil ? 12 : 0,
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#0A1628' }}>👤 Profil Bilgileri</Text>
                    <Ionicons name={accordionProfil ? 'chevron-up' : 'chevron-down'} size={18} color="#64748b" />
                  </TouchableOpacity>
                  {accordionProfil ? (
                    <View style={styles.card}>
                      {kaydetBasari ? (
                        <View
                          style={{
                            backgroundColor: '#dcfce7',
                            borderRadius: 10,
                            padding: 12,
                            marginBottom: 12,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <Ionicons name="checkmark-circle" size={18} color="#15803d" />
                          <Text style={{ color: '#15803d', fontWeight: '700', fontSize: 13 }}>
                            Profiliniz güncellendi!
                          </Text>
                        </View>
                      ) : null}
                      <View style={{ marginBottom: 12 }}>
                        <Text style={styles.profilInputLabel}>Ad</Text>
                        <TextInput
                          style={styles.profilInput}
                          value={form.ad}
                          onChangeText={(t) => setForm({ ...form, ad: t })}
                          autoCapitalize="words"
                          placeholder="Ad"
                        />
                      </View>
                      <View style={{ marginBottom: 12 }}>
                        <Text style={styles.profilInputLabel}>Soyad</Text>
                        <TextInput
                          style={styles.profilInput}
                          value={form.soyad}
                          onChangeText={(t) => setForm({ ...form, soyad: t })}
                          autoCapitalize="words"
                          placeholder="Soyad"
                        />
                      </View>
                      <View style={{ marginBottom: 12 }}>
                        <Text style={styles.profilInputLabel}>Telefon</Text>
                        <TextInput
                          style={styles.profilInput}
                          value={form.telefon}
                          onChangeText={(t) => setForm({ ...form, telefon: t })}
                          keyboardType="phone-pad"
                          placeholder="Telefon"
                        />
                      </View>
                      <View style={{ marginBottom: 12 }}>
                        <Text style={styles.profilInputLabel}>E-posta</Text>
                        <TextInput
                          style={[styles.profilInput, styles.profilInputDisabled]}
                          value={form.email}
                          editable={false}
                          placeholder="E-posta"
                        />
                      </View>
                      <View style={{ marginBottom: 12 }}>
                        <Text style={styles.profilInputLabel}>Doğum Tarihi</Text>
                        <TextInput
                          style={styles.profilInput}
                          value={form.dogumTarihi ?? ''}
                          onChangeText={(t) => setForm({ ...form, dogumTarihi: t })}
                          placeholder="GG.AA.YYYY"
                        />
                      </View>
                      <View style={{ marginBottom: 16 }}>
                        <Text style={styles.profilInputLabel}>Şehir</Text>
                        <TextInput
                          style={styles.profilInput}
                          value={form.sehir}
                          onChangeText={(t) => setForm({ ...form, sehir: t })}
                          autoCapitalize="words"
                          placeholder="Şehir"
                        />
                      </View>
                      <TouchableOpacity
                        style={styles.btnProfilKaydet}
                        activeOpacity={0.85}
                        onPress={() => void handleKaydetProfil()}
                      >
                        <Text style={styles.btnProfilKaydetText}>Değişiklikleri Kaydet</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </>
              ) : null}
              <TouchableOpacity
                onPress={() => setAccordionGuvenlik((v) => !v)}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: '#f1f5f9',
                  marginBottom: accordionGuvenlik ? 12 : 0,
                  marginTop: 8,
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#0A1628' }}>🔒 Güvenlik</Text>
                <Ionicons name={accordionGuvenlik ? 'chevron-up' : 'chevron-down'} size={18} color="#64748b" />
              </TouchableOpacity>
              {accordionGuvenlik ? (
                <View style={styles.guvenlikSection}>
                  <View style={styles.guvenlikKart}>
                    <View style={styles.guvenlikKartRow}>
                      <View style={styles.guvenlikKartSol}>
                        <Ionicons name="lock-closed-outline" size={22} color="#0A1628" />
                        <View style={styles.guvenlikKartMetin}>
                          <Text style={styles.guvenlikKartTitle}>Parola</Text>
                          <Text style={styles.guvenlikKartSub}>Hesabınızı koruyun</Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={styles.guvenlikBtnOutline}
                        activeOpacity={0.85}
                        onPress={() => setModalParola(true)}
                      >
                        <Text style={styles.guvenlikBtnOutlineText}>Parolayı Değiştir</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.guvenlikKart}>
                    <View style={styles.guvenlikKartRow}>
                      <View style={styles.guvenlikKartSol}>
                        <Ionicons name="notifications-outline" size={22} color="#0A1628" />
                        <View style={styles.guvenlikKartMetin}>
                          <Text style={styles.guvenlikKartTitle}>E-posta Bildirimleri</Text>
                          <Text style={styles.guvenlikKartSub}>Rezervasyon ve kampanya bildirimleri</Text>
                        </View>
                      </View>
                      <Switch
                        value={epostaBildirim}
                        onValueChange={(v) => void handleEpostaBildirimChange(v)}
                        trackColor={{ false: '#cbd5e1', true: '#99f6e4' }}
                        thumbColor={epostaBildirim ? '#0ABAB5' : '#f4f4f5'}
                      />
                    </View>
                  </View>

                  <View style={[styles.guvenlikKart, { marginBottom: 0 }]}>
                    <View style={styles.guvenlikKartRow}>
                      <View style={styles.guvenlikKartSol}>
                        <Ionicons name="document-text-outline" size={22} color="#0A1628" />
                        <View style={styles.guvenlikKartMetin}>
                          <Text style={styles.guvenlikKartTitle}>Veri ve Gizlilik</Text>
                          <Text style={styles.guvenlikKartSub}>KVKK kapsamında verilerinizi yönetin</Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={styles.guvenlikBtnOutline}
                        activeOpacity={0.85}
                        onPress={() => setModalKvkk(true)}
                      >
                        <Text style={styles.guvenlikBtnOutlineText}>Görüntüle</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={modalParola}
        animationType="fade"
        transparent
        onRequestClose={() => setModalParola(false)}
      >
        <View style={styles.guvenlikModalBackdrop}>
          <View style={styles.guvenlikModalCard}>
            <Text style={styles.guvenlikModalTitle}>Parola değiştir</Text>
            <Text style={styles.guvenlikModalLabel}>Mevcut Parola</Text>
            <TextInput
              style={styles.guvenlikModalInput}
              secureTextEntry
              value={mevcutParola}
              onChangeText={setMevcutParola}
              placeholder="Mevcut parola"
            />
            <Text style={styles.guvenlikModalLabel}>Yeni Parola</Text>
            <TextInput
              style={styles.guvenlikModalInput}
              secureTextEntry
              value={yeniParola}
              onChangeText={setYeniParola}
              placeholder="Yeni parola"
            />
            <Text style={styles.guvenlikModalLabel}>Yeni Parola (Tekrar)</Text>
            <TextInput
              style={styles.guvenlikModalInput}
              secureTextEntry
              value={yeniParolaTekrar}
              onChangeText={setYeniParolaTekrar}
              placeholder="Yeni parola tekrar"
            />
            <View style={styles.guvenlikModalBtnRow}>
              <TouchableOpacity
                style={styles.guvenlikModalBtnIptal}
                activeOpacity={0.85}
                onPress={() => {
                  setModalParola(false)
                  setMevcutParola('')
                  setYeniParola('')
                  setYeniParolaTekrar('')
                }}
              >
                <Text style={styles.guvenlikModalBtnIptalText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.guvenlikModalBtnKaydet}
                activeOpacity={0.85}
                onPress={() => void handleParolaDegistir()}
              >
                <Text style={styles.guvenlikModalBtnKaydetText}>Değiştir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={modalKvkk}
        animationType="fade"
        transparent
        onRequestClose={() => setModalKvkk(false)}
      >
        <View style={styles.guvenlikModalBackdrop}>
          <View style={styles.guvenlikModalCard}>
            <Text style={styles.guvenlikModalTitle}>Kişisel verilerin korunması</Text>
            <ScrollView style={styles.guvenlikKvkkScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.guvenlikKvkkBody}>
                6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında, kişisel verileriniz
                yalnızca belirtilen amaçlar doğrultusunda işlenir; güvenli şekilde saklanır ve
                yasal süre boyunca muhafaza edilir. Verilerinize erişim, düzeltme ve silme
                taleplerinizi veri sorumlusuna iletebilirsiniz.
              </Text>
            </ScrollView>
            <TouchableOpacity
              style={[styles.guvenlikModalBtnKaydet, { alignSelf: 'stretch' }]}
              activeOpacity={0.85}
              onPress={() => setModalKvkk(false)}
            >
              <Text style={styles.guvenlikModalBtnKaydetText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showQrScanner}
        animationType="slide"
        statusBarTranslucent={true}
        onRequestClose={() => setShowQrScanner(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'black' }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={onQrBarcodeScanned}
          />
          <View
            pointerEvents="none"
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center' }}
          >
            <View
              style={{
                position: 'absolute',
                width: 250,
                height: 250,
                alignSelf: 'center',
                top: '35%',
              }}
            >
              <View
                style={{
                  borderTopWidth: 3,
                  borderLeftWidth: 3,
                  borderColor: 'white',
                  width: 40,
                  height: 40,
                  position: 'absolute',
                  top: 0,
                  left: 0,
                }}
              />
              <View
                style={{
                  borderTopWidth: 3,
                  borderRightWidth: 3,
                  borderColor: 'white',
                  width: 40,
                  height: 40,
                  position: 'absolute',
                  top: 0,
                  right: 0,
                }}
              />
              <View
                style={{
                  borderBottomWidth: 3,
                  borderLeftWidth: 3,
                  borderColor: 'white',
                  width: 40,
                  height: 40,
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                }}
              />
              <View
                style={{
                  borderBottomWidth: 3,
                  borderRightWidth: 3,
                  borderColor: 'white',
                  width: 40,
                  height: 40,
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                }}
              />
            </View>
            <Text
              style={{
                position: 'absolute',
                left: 16,
                right: 16,
                top: '35%',
                marginTop: 266,
                color: 'white',
                textAlign: 'center',
              }}
            >
              {'QR kodu \u00e7er\u00e7eve i\u00e7ine al\u0131n'}
            </Text>
          </View>
          <View style={{ position: 'absolute', top: 50, left: 20, zIndex: 999 }}>
            <TouchableOpacity onPress={() => setShowQrScanner(false)} hitSlop={12} accessibilityRole="button">
              <Ionicons name="close" size={32} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={modalKodGir}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setModalKodGir(false)
          setKodInput('')
          setKodHata('')
        }}
      >
        <View style={styles.kodModalBackdrop}>
          <View style={styles.kodModalCard}>
            <Text style={styles.kodModalTitle}>Rezervasyon Kodunuzu Girin</Text>
            <TextInput
              style={styles.kodModalInput}
              value={kodInput}
              onChangeText={(t) => {
                setKodInput(t.toUpperCase())
                if (kodHata) setKodHata('')
              }}
              placeholder="KOD"
              placeholderTextColor="#94a3b8"
              autoCapitalize="characters"
              autoCorrect={false}
              textAlign="center"
            />
            {kodHata ? <Text style={styles.kodModalHata}>{kodHata}</Text> : null}
            <TouchableOpacity
              style={styles.kodModalOnayla}
              activeOpacity={0.9}
              disabled={kodGonderiliyor}
              onPress={() => void handleKodOnayla()}
            >
              {kodGonderiliyor ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.kodModalOnaylaText}>Onayla</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.kodModalIptal}
              activeOpacity={0.85}
              onPress={() => {
                setModalKodGir(false)
                setKodInput('')
                setKodHata('')
              }}
            >
              <Text style={styles.kodModalIptalText}>{'\u0130ptal'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal
        visible={modalSezlongAktifDegil}
        animationType="fade"
        transparent
        onRequestClose={() => setModalSezlongAktifDegil(false)}
      >
        <View style={styles.sezlongAktifDegilBackdrop}>
          <View style={styles.sezlongAktifDegilCard}>
            <Text style={styles.sezlongAktifDegilEmoji}>🏖️</Text>
            <Text style={styles.sezlongAktifDegilTitle}>Sezlong Henüz Aktif Değil</Text>
            <Text style={styles.sezlongAktifDegilDesc}>
              Sipariş verebilmek için önce QR kodu okutun veya rezervasyon kodunuzu girin.
            </Text>
            <View style={styles.sezlongAktifDegilBtnRow}>
              <TouchableOpacity
                style={styles.sezlongAktifDegilTamamBtn}
                activeOpacity={0.85}
                onPress={() => setModalSezlongAktifDegil(false)}
              >
                <Text style={styles.sezlongAktifDegilTamamText}>Tamam</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <CallWaiterModal
        isOpen={showCallModal}
        onClose={() => { setShowCallModal(false); setCallModalRez(null) }}
        onConfirm={handleCallConfirm}
        tesisAdi={callModalRez?.tesisAd ?? ''}
      />
      {cagriToast.visible && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 80,
            left: 16,
            right: 16,
            zIndex: 9999,
            elevation: 10,
            alignItems: 'center',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              backgroundColor: '#0ABAB5',
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: 12,
              maxWidth: '100%',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.2,
              shadowRadius: 8,
            }}
          >
            <View style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: 'rgba(255,255,255,0.2)',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Ionicons name="checkmark" size={18} color="#fff" />
            </View>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', flex: 1 }}>
              {cagriToast.mesaj}
            </Text>
          </View>
        </View>
      )}
      {/* INFO MODAL */}
      <Modal
        visible={infoModal?.visible || false}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoModal(null)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}>
          <View style={{
            backgroundColor: '#fff',
            borderRadius: 16,
            padding: 24,
            width: '100%',
            maxWidth: 360,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 12,
            elevation: 8,
          }}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: '#FEF3C7',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 12,
              }}>
                <Text style={{ fontSize: 28 }}>⚠️</Text>
              </View>
              <Text style={{
                fontSize: 18,
                fontWeight: '700',
                color: '#111827',
                textAlign: 'center',
              }}>
                {infoModal?.baslik || ''}
              </Text>
            </View>
            <Text style={{
              fontSize: 14,
              color: '#4B5563',
              lineHeight: 20,
              textAlign: 'center',
              marginBottom: 20,
            }}>
              {infoModal?.mesaj || ''}
            </Text>
            <TouchableOpacity
              onPress={() => setInfoModal(null)}
              style={{
                backgroundColor: '#0EA5A4',
                paddingVertical: 12,
                borderRadius: 10,
                alignItems: 'center',
              }}
              activeOpacity={0.85}
            >
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Tamam</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* CONFIRM MODAL */}
      <Modal
        visible={confirmModal?.visible || false}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!iptalLoading) setConfirmModal(null) }}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}>
          <View style={{
            backgroundColor: '#fff',
            borderRadius: 16,
            padding: 24,
            width: '100%',
            maxWidth: 360,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 12,
            elevation: 8,
          }}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: '#FEE2E2',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 12,
              }}>
                <Text style={{ fontSize: 28 }}>❓</Text>
              </View>
              <Text style={{
                fontSize: 18,
                fontWeight: '700',
                color: '#111827',
                textAlign: 'center',
              }}>
                {confirmModal?.baslik || ''}
              </Text>
            </View>
            <Text style={{
              fontSize: 14,
              color: '#4B5563',
              lineHeight: 20,
              textAlign: 'center',
              marginBottom: 20,
            }}>
              {confirmModal?.mesaj || ''}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => { if (!iptalLoading) setConfirmModal(null) }}
                disabled={iptalLoading}
                style={{
                  flex: 1,
                  backgroundColor: '#F3F4F6',
                  paddingVertical: 12,
                  borderRadius: 10,
                  alignItems: 'center',
                  opacity: iptalLoading ? 0.5 : 1,
                }}
                activeOpacity={0.85}
              >
                <Text style={{ color: '#374151', fontSize: 15, fontWeight: '700' }}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => confirmModal?.rezervasyon && handleIptalConfirm(confirmModal.rezervasyon)}
                disabled={iptalLoading}
                style={{
                  flex: 1,
                  backgroundColor: iptalLoading ? '#9CA3AF' : '#dc2626',
                  paddingVertical: 12,
                  borderRadius: 10,
                  alignItems: 'center',
                }}
                activeOpacity={0.85}
              >
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>
                  {iptalLoading ? 'İptal ediliyor...' : 'Evet, İptal Et'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f1f5f9' },
  safeRelative: { position: 'relative' },
  successToast: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    zIndex: 999,
    backgroundColor: '#16a34a',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 8,
  },
  successToastText: {
    flex: 1,
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  loadingWrap: { justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  header: {
    backgroundColor: '#0ABAB5',
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 22,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  headerIconBtn: { padding: 4 },
  avatarWrap: { alignItems: 'center', marginTop: 2 },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#0f766e',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  avatarText: { fontSize: 24, fontWeight: '800', color: '#fff' },
  userName: {
    marginTop: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
  userEmail: {
    marginTop: 1,
    textAlign: 'center',
    fontSize: 11,
    color: 'rgba(255,255,255,0.9)',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 3,
  },
  badgeYesil: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeYesilText: { fontSize: 10, fontWeight: '700', color: '#15803d' },
  badgeAltin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeAltinText: { fontSize: 10, fontWeight: '700', color: '#b45309' },
  uyeEtiket: {
    marginTop: 4,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
  },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 16,
    padding: 16,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#0A1628', marginBottom: 12 },
  profilInputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 4,
  },
  profilInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: '#0A1628',
  },
  profilInputDisabled: {
    opacity: 0.85,
  },
  btnProfilKaydet: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f97316',
    borderRadius: 12,
    paddingVertical: 14,
  },
  btnProfilKaydetText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  qrBtnRow: { flexDirection: 'row', gap: 10 },
  btnQrOku: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f97316',
    borderRadius: 12,
    paddingVertical: 14,
  },
  btnQrOkuText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnKodGir: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingVertical: 14,
  },
  btnKodGirText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  sezlongBos: { alignItems: 'center', paddingVertical: 16 },
  sezlongBosText: { marginTop: 8, fontSize: 14, color: '#64748b', textAlign: 'center' },
  btnRezYap: {
    marginTop: 16,
    backgroundColor: '#0ABAB5',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  btnRezYapText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  altSekmeBar: {
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: '#f1f5f9',
    borderRadius: 16,
    paddingVertical: 6,
    shadowColor: '#0A1628',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  altSekmeBarContent: {
    paddingHorizontal: 6,
    paddingRight: 12,
    paddingVertical: 4,
    gap: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  altSekmeItem: {
    flexShrink: 0,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  altSekmeItemActive: {
    backgroundColor: '#0ABAB5',
    shadowColor: '#0ABAB5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  altSekmeText: { fontSize: 12, fontWeight: '600', color: '#64748b', flexShrink: 0 },
  altSekmeTextActive: { color: '#fff', fontWeight: '700' },
  altSekmeUnderline: { marginTop: 0, height: 0, width: 0 },
  filtreScroll: { flexDirection: 'row', gap: 8, paddingBottom: 12, flexWrap: 'wrap' },
  filtreChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },
  filtreChipActive: { backgroundColor: '#e0f2f1' },
  filtreChipText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  filtreChipTextActive: { color: '#0d9488', fontWeight: '700' },
  bosListe: { fontSize: 14, color: '#94a3b8', textAlign: 'center', paddingVertical: 16 },
  bildirimCard: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  bildirimCardOkunmadi: {
    borderLeftWidth: 4,
    borderLeftColor: '#2563eb',
    paddingLeft: 10,
  },
  bildirimBaslik: { fontSize: 16, fontWeight: '800', color: '#0A1628' },
  bildirimMesaj: { fontSize: 14, color: '#64748b', marginTop: 4, lineHeight: 20 },
  bildirimTarih: { fontSize: 12, color: '#94a3b8', marginTop: 8 },
  guvenlikSection: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
  },
  guvenlikPageTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0A1628',
    marginBottom: 12,
  },
  guvenlikKart: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  guvenlikKartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  guvenlikKartSol: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  guvenlikKartMetin: { marginLeft: 12, flex: 1, minWidth: 0 },
  guvenlikKartTitle: { fontSize: 15, fontWeight: '700', color: '#0A1628' },
  guvenlikKartSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  guvenlikBtnOutline: {
    borderWidth: 1.5,
    borderColor: '#0A1628',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    flexShrink: 0,
  },
  guvenlikBtnOutlineText: { fontSize: 12, fontWeight: '700', color: '#0A1628' },
  guvenlikModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  guvenlikModalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    maxHeight: '90%',
  },
  guvenlikModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0A1628',
    marginBottom: 16,
  },
  guvenlikModalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 6,
    marginTop: 8,
  },
  guvenlikModalInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#0A1628',
  },
  guvenlikModalBtnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    justifyContent: 'flex-end',
  },
  guvenlikModalBtnIptal: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#94a3b8',
  },
  guvenlikModalBtnIptalText: { fontSize: 14, fontWeight: '700', color: '#64748b' },
  guvenlikModalBtnKaydet: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#0ABAB5',
    alignItems: 'center',
  },
  guvenlikModalBtnKaydetText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  guvenlikKvkkScroll: { maxHeight: 220, marginBottom: 16 },
  guvenlikKvkkBody: { fontSize: 14, color: '#475569', lineHeight: 22 },
  rezWebCard: {
    padding: 16,
    marginBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  rezWebTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  rezWebFotoWrap: {
    width: 90,
    height: 90,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
  },
  rezWebFoto: { width: 90, height: 90 },
  rezWebFotoPh: { alignItems: 'center', justifyContent: 'center' },
  rezWebTopRight: { flex: 1, minWidth: 0 },
  rezWebTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rezKodChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  rezKodChipText: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  rezKategoriPill: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#e0f2f1',
  },
  rezKategoriPillText: { fontSize: 11, fontWeight: '700', color: '#0d9488' },
  rezSehirRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  rezSehirText: { fontSize: 12, color: '#64748b', flex: 1 },
  rezDurumPill: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  rezDurumPillText: { fontSize: 12, fontWeight: '700' },
  rezInfoBlock: { marginTop: 12, gap: 6 },
  rezInfoLineRow: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  rezInfoLine: { fontSize: 13, color: '#374151' },
  rezWebBtnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  rezWebBtnIptal: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  rezWebBtnIptalText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  rezWebBtnGit: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#0ABAB5',
  },
  rezCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  yorumDurumBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  yorumDurumBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  favCard: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  favFotoWrap: { width: 90, height: 90, borderRadius: 12, overflow: 'hidden' },
  favFoto: { width: 90, height: 90 },
  favBody: { flex: 1, justifyContent: 'center' },
  rezFoto: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rezFotoImg: { width: 64, height: 64, borderRadius: 10 },
  rezBody: { flex: 1, minWidth: 0 },
  rezTesisAd: { fontSize: 13, fontWeight: '800', color: '#0A1628' },
  rezMeta: { fontSize: 10, color: '#64748b', marginTop: 2 },
  rezOdenen: { fontSize: 11, fontWeight: '700', color: '#0ABAB5', marginTop: 3 },
  rezBtnRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  btnIptal: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0A1628',
    backgroundColor: '#fff',
  },
  btnIptalText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0A1628',
  },
  btnTesiseGit: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#f97316',
  },
  btnTesiseGitText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  kodModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  kodModalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  kodModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 20,
  },
  kodModalInput: {
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 20,
    fontWeight: '700',
    color: '#0A1628',
    letterSpacing: 6,
    backgroundColor: '#f8fafc',
  },
  kodModalHata: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '600',
    color: '#b91c1c',
    textAlign: 'center',
  },
  kodModalOnayla: {
    marginTop: 20,
    backgroundColor: '#0ABAB5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kodModalOnaylaText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  kodModalIptal: { marginTop: 14, alignItems: 'center', paddingVertical: 8 },
  kodModalIptalText: { fontSize: 15, fontWeight: '700', color: '#64748b' },
  sezlongAktifDegilBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sezlongAktifDegilCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
  },
  sezlongAktifDegilEmoji: { fontSize: 48, textAlign: 'center' },
  sezlongAktifDegilTitle: {
    marginTop: 8,
    color: '#0A1628',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  sezlongAktifDegilDesc: { marginTop: 8, color: '#64748b', fontSize: 14, textAlign: 'center' },
  sezlongAktifDegilBtnRow: { marginTop: 20, flexDirection: 'row', gap: 10 },
  sezlongAktifDegilTamamBtn: {
    width: '100%',
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sezlongAktifDegilTamamText: { color: '#334155', fontSize: 14, fontWeight: '700' },
  placeholderTab: { fontSize: 14, color: '#64748b', textAlign: 'center', paddingVertical: 8 },
})
