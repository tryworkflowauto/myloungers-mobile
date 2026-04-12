import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'

const TEAL = '#0d9488'

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
  const as = row['ad_soyad']
  return as != null ? String(as).trim() : ''
}

function uuidOrNull(s: string | undefined): string | null {
  const t = String(s ?? '').trim()
  return t.length > 0 ? t : null
}

export default function RezervasyonOzet() {
  const router = useRouter()
  const params = useLocalSearchParams<{
    tesis_id?: string
    tesis_adi?: string
    tesis_slug?: string
    grup_id?: string
    grup_adi?: string
    sezlong_id?: string
    sezlong_adi?: string
    fiyat?: string
    tarih?: string
    sure?: string
    kisi_sayisi?: string
    tesis_fotograf?: string
  }>()

  const tesis_id = params.tesis_id
  const tesis_adi = params.tesis_adi ?? ''
  const grup_adi = params.grup_adi ?? ''
  const sezlong_adi = params.sezlong_adi ?? ''
  const tarih = params.tarih ?? ''
  const tesis_fotograf = params.tesis_fotograf
  const fiyatRaw = params.fiyat

  const sureNum = parsePositiveInt(params.sure, 1)
  const kisiNum = parsePositiveInt(params.kisi_sayisi, 1)
  const fiyatBirim = parseMoney(fiyatRaw)

  const sezlongUcreti = useMemo(
    () => fiyatBirim * sureNum * kisiNum,
    [fiyatBirim, sureNum, kisiNum],
  )
  const toplam = sezlongUcreti

  const bitisTarih = useMemo(() => {
    if (!tarih) return ''
    return addCalendarDays(tarih, sureNum - 1)
  }, [tarih, sureNum])

  const [adSoyad, setAdSoyad] = useState('')
  const [telefon, setTelefon] = useState('')
  const [email, setEmail] = useState('')
  const [profilYukleniyor, setProfilYukleniyor] = useState(true)
  const [odemeYukleniyor, setOdemeYukleniyor] = useState(false)

  const loadProfil = useCallback(async () => {
    setProfilYukleniyor(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user?.email) setEmail(user.email)
      if (!user?.id) {
        setProfilYukleniyor(false)
        return
      }
      const { data } = await supabase.from('kullanicilar').select('*').eq('id', user.id).maybeSingle()
      if (data && typeof data === 'object') {
        const row = data as Record<string, unknown>
        setAdSoyad(pickDisplayName(row))
        const tel = row['telefon']
        setTelefon(tel != null ? String(tel) : '')
      }
    } finally {
      setProfilYukleniyor(false)
    }
  }, [])

  useEffect(() => {
    void loadProfil()
  }, [loadProfil])

  const formatTl = (n: number) =>
    `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`

  const handleOdeme = async () => {
    const ad = adSoyad.trim()
    const tel = telefon.trim()
    const mail = email.trim()
    if (!ad) {
      Alert.alert('Eksik bilgi', 'Ad Soyad zorunludur.')
      return
    }
    if (!tel) {
      Alert.alert('Eksik bilgi', 'Telefon zorunludur.')
      return
    }
    if (!mail || !mail.includes('@')) {
      Alert.alert('Eksik bilgi', 'Geçerli bir e-posta girin.')
      return
    }
    if (!tarih) {
      Alert.alert('Hata', 'Tarih bilgisi eksik.')
      return
    }

    if (!process.env.EXPO_PUBLIC_SITE_URL) {
      Alert.alert(
        'Yapılandırma',
        'Ödeme sunucusu adresi tanımlı değil. EXPO_PUBLIC_SITE_URL ortam değişkenini ayarlayın.',
      )
      return
    }

    setOdemeYukleniyor(true)
    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser()
      if (userErr || !user) {
        Alert.alert('Giriş gerekli', 'Rezervasyon için lütfen giriş yapın.')
        return
      }

      const insertPayload: Record<string, unknown> = {
        tesis_id: uuidOrNull(tesis_id),
        kullanici_id: user.id,
        sezlong_id: uuidOrNull(params.sezlong_id),
        baslangic_tarih: tarih,
        bitis_tarih: bitisTarih || tarih,
        durum: 'beklemede',
        toplam_tutar: Number(toplam.toFixed(2)),
        kisi_sayisi: kisiNum,
      }

      const { data: rezData, error: rezError } = await supabase
        .from('rezervasyonlar')
        .insert(insertPayload)
        .select('id')
        .single()

      console.log('rezervasyon insert hatasi:', JSON.stringify(rezError))

      if (rezError || !rezData) {
        Alert.alert('Hata', 'Rezervasyon oluşturulamadı')
        return
      }
      const rezervasyonId = rezData.id

      const toplamTutar = toplam
      const adSoyadInput = adSoyad
      const [adSoyadParatika, soyad] =
        adSoyadInput.trim().split(' ').length > 1
          ? [
              adSoyadInput.trim().split(' ').slice(0, -1).join(' '),
              adSoyadInput.trim().split(' ').slice(-1)[0],
            ]
          : [adSoyadInput.trim(), '']

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
          customerEmail: email,
          customerPhone: telefon,
        }),
      })

      const sessionData = await sessionRes.json()

      if (!sessionData.sessionToken) {
        Alert.alert('Hata', sessionData.error || 'Ödeme başlatılamadı')
        return
      }

      router.push({
        pathname: '/odeme-webview',
        params: { token: sessionData.sessionToken },
      })
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Beklenmeyen hata')
    } finally {
      setOdemeYukleniyor(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={14} style={styles.headerBtn} accessibilityRole="button">
            <Ionicons name="chevron-back" size={26} color={TEAL} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Rezervasyon Özeti</Text>
          <View style={styles.headerBtn} />
        </View>

        {profilYukleniyor ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={TEAL} />
          </View>
        ) : (
          <>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
              {tesis_fotograf ? (
                <Image source={{ uri: tesis_fotograf }} style={styles.cover} resizeMode="cover" />
              ) : (
                <View style={[styles.cover, styles.coverPlaceholder]} />
              )}
              <Text style={styles.tesisAd}>{tesis_adi || 'Tesis'}</Text>
              <Text style={styles.grupAd}>{grup_adi}</Text>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Rezervasyon detayı</Text>
                <Row label="Tarih" value={tarih || '—'} />
                <Row label="Şezlong" value={sezlong_adi || '—'} />
                <Row label="Süre" value={`${sureNum} gün`} />
                <Row label="Kişi sayısı" value={String(kisiNum)} last />
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Fiyat özeti</Text>
                <Row label="Şezlong ücreti" value={formatTl(sezlongUcreti)} />
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Toplam</Text>
                  <Text style={styles.totalValue}>{formatTl(toplam)}</Text>
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Kişisel bilgiler</Text>
                <Text style={styles.inputLabel}>Ad Soyad *</Text>
                <TextInput
                  style={styles.input}
                  value={adSoyad}
                  onChangeText={setAdSoyad}
                  placeholder="Adınız Soyadınız"
                  placeholderTextColor="#94a3b8"
                />
                <Text style={styles.inputLabel}>Telefon *</Text>
                <TextInput
                  style={styles.input}
                  value={telefon}
                  onChangeText={setTelefon}
                  placeholder="05xx xxx xx xx"
                  placeholderTextColor="#94a3b8"
                  keyboardType="phone-pad"
                />
                <Text style={styles.inputLabel}>E-posta *</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="ornek@email.com"
                  placeholderTextColor="#94a3b8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={{ height: 24 }} />
            </ScrollView>

            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.payBtn, odemeYukleniyor && styles.payBtnDisabled]}
                onPress={() => void handleOdeme()}
                disabled={odemeYukleniyor}
                activeOpacity={0.9}
              >
                {odemeYukleniyor ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.payBtnText}>Ödemeye Geç</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fff',
  },
  flex: {
    flex: 1,
  },
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
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  cover: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  coverPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tesisAd: {
    marginTop: 14,
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  grupAd: {
    marginTop: 4,
    fontSize: 15,
    color: '#64748b',
    fontWeight: '600',
  },
  card: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#f1f5f9',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f1f5f9',
    gap: 12,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    fontSize: 14,
    color: '#64748b',
    flexShrink: 0,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    flex: 1,
    textAlign: 'right',
  },
  totalRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  totalValue: {
    fontSize: 22,
    fontWeight: '800',
    color: TEAL,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
    marginTop: 10,
  },
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
  payBtnDisabled: {
    opacity: 0.75,
  },
  payBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
})
