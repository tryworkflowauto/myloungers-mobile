import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'

type RezervasyonBakiye = {
  bakiye_kalan: number | null
  bakiye_yuklenen: number | null
  bakiye_harcanan: number | null
}

type KategoriRow = {
  id: string
  ad: string
  icon: string | null
}

type UrunRow = {
  id: string
  kategori_id: string
  ad: string
  aciklama: string | null
  fiyat: number | string
  gorsel_url: string | null
  icon: string | null
  badge: string | null
}

function fmtTl(v: number) {
  return `\u20BA${v.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function num(v: number | string | null | undefined) {
  if (v == null) return 0
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/\s/g, '').replace(',', '.'))
  return Number.isNaN(n) ? 0 : n
}

export default function SiparisScreen() {
  const router = useRouter()
  const { rezervasyon_id, tesis_id } = useLocalSearchParams<{ rezervasyon_id: string; tesis_id: string }>()

  const [yukleniyor, setYukleniyor] = useState(true)
  const [tesisAd, setTesisAd] = useState('')
  const [bakiyeKalan, setBakiyeKalan] = useState(0)
  const [bakiyeYuklenen, setBakiyeYuklenen] = useState(0)
  const [bakiyeHarcanan, setBakiyeHarcanan] = useState(0)
  const [kategoriler, setKategoriler] = useState<KategoriRow[]>([])
  const [urunler, setUrunler] = useState<UrunRow[]>([])
  const [seciliKategori, setSeciliKategori] = useState<string>('tumü')
  const [sepet, setSepet] = useState<Record<string, number>>({})
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [toast, setToast] = useState<{ mesaj: string; tip: 'basarili' | 'hata' } | null>(null)

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(id)
  }, [toast])

  useEffect(() => {
    if (!rezervasyon_id || !tesis_id) {
      setYukleniyor(false)
      return
    }
    let cancelled = false
    void (async () => {
      setYukleniyor(true)
      console.log('SIPARIS PARAMS:', { tesis_id, rezervasyon_id })

      const { data: rezData } = await supabase
        .from('rezervasyonlar')
        .select('bakiye_kalan, bakiye_yuklenen, bakiye_harcanan')
        .eq('id', rezervasyon_id)
        .maybeSingle()

      const rezervasyon = (rezData ?? null) as RezervasyonBakiye | null
      console.log('BAKIYE:', {
        bakiye_yuklenen: rezervasyon?.bakiye_yuklenen,
        bakiye_harcanan: rezervasyon?.bakiye_harcanan,
        bakiye_kalan: rezervasyon?.bakiye_kalan,
      })

      const { data: kategoriData, error: kategoriError } = await supabase
        .from('menu_kategorileri')
        .select('id, ad, icon')
        .eq('tesis_id', tesis_id)
        .order('sira', { ascending: true })
      console.log('KATEGORILER:', kategoriData, kategoriError)

      const { data: urunData, error: urunError } = await supabase
        .from('menu_urunleri')
        .select('id, kategori_id, ad, aciklama, fiyat, gorsel_url, icon, badges')
        .eq('tesis_id', tesis_id)
        .order('sira', { ascending: true })
      console.log('URUNLER:', urunData, urunError)

      const { data: tesisData } = await supabase
        .from('tesisler')
        .select('ad')
        .eq('id', tesis_id)
        .maybeSingle()

      if (cancelled) return

      const rez = rezervasyon
      setBakiyeKalan(num(rez?.bakiye_kalan))
      setBakiyeYuklenen(num(rez?.bakiye_yuklenen))
      setBakiyeHarcanan(num(rez?.bakiye_harcanan))

      const kats = (kategoriData ?? []) as KategoriRow[]
      setKategoriler(kats)
      setSeciliKategori((prev) => prev || kats[0]?.id || '')
      setUrunler((urunData ?? []) as UrunRow[])
      setTesisAd(String((tesisData as { ad?: string } | null)?.ad ?? ''))
      setYukleniyor(false)
    })()
    return () => {
      cancelled = true
    }
  }, [rezervasyon_id, tesis_id])

  const urunlerFiltreli = useMemo(
    () =>
      urunler.filter((u) =>
        seciliKategori === 'tumü' ? true : u.kategori_id === seciliKategori,
      ),
    [urunler, seciliKategori],
  )

  const sepetToplam = useMemo(() => {
    return Object.entries(sepet).reduce((acc, [urunId, adet]) => {
      if (adet <= 0) return acc
      const urun = urunler.find((u) => u.id === urunId)
      return acc + num(urun?.fiyat) * adet
    }, 0)
  }, [sepet, urunler])

  const sepetAdetToplam = useMemo(() => {
    return Object.values(sepet).reduce((acc, n) => acc + n, 0)
  }, [sepet])

  const adetAzalt = (urunId: string) => {
    setSepet((prev) => {
      const cur = prev[urunId] ?? 0
      const next = cur - 1
      if (next <= 0) {
        const copy = { ...prev }
        delete copy[urunId]
        return copy
      }
      return { ...prev, [urunId]: next }
    })
  }

  const adetArttir = (urunId: string) => {
    setSepet((prev) => ({ ...prev, [urunId]: (prev[urunId] ?? 0) + 1 }))
  }

  const handleSiparisVer = async () => {
    if (!rezervasyon_id || !tesis_id || sepetToplam <= 0 || gonderiliyor) return
    if (sepetToplam > bakiyeKalan) {
      setToast({ mesaj: '\u274c Harcama limitiniz yetersiz! Limit y\u00fckleyin.', tip: 'hata' })
      return
    }
    setGonderiliyor(true)
    try {
      const { data: siparisData, error: siparisErr } = await supabase
        .from('siparisler')
        .insert({ tesis_id, rezervasyon_id, durum: 'beklemede', toplam: sepetToplam })
        .select('id')
        .single()
      if (siparisErr || !siparisData?.id) {
        Alert.alert('\u0130\u015flem Hatas\u0131', 'Sipari\u015f olu\u015fturulamad\u0131.')
        return
      }

      const kalemler = Object.entries(sepet)
        .filter(([, adet]) => adet > 0)
        .map(([urunId, adet]) => {
          const urun = urunler.find((u) => u.id === urunId)
          return {
            siparis_id: siparisData.id,
            urun_id: urunId,
            ad: String(urun?.ad ?? ''),
            fiyat: num(urun?.fiyat),
            adet,
          }
        })

      if (kalemler.length > 0) {
        const { error: kalemErr } = await supabase.from('siparis_kalemleri').insert(kalemler)
        if (kalemErr) {
          setToast({ mesaj: '\u274c Sipari\u015f verilemedi, tekrar deneyin.', tip: 'hata' })
          return
        }
      }

      const yeniHarcanan = bakiyeHarcanan + sepetToplam
      const yeniKalan = bakiyeKalan - sepetToplam
      const { error: rezUpdateErr } = await supabase
        .from('rezervasyonlar')
        .update({ bakiye_harcanan: yeniHarcanan, bakiye_kalan: yeniKalan })
        .eq('id', rezervasyon_id)
      if (rezUpdateErr) {
        setToast({ mesaj: '\u274c Sipari\u015f verilemedi, tekrar deneyin.', tip: 'hata' })
        return
      }

      setBakiyeHarcanan(yeniHarcanan)
      setBakiyeKalan(yeniKalan)
      setSepet({})
      setToast({ mesaj: '\u2705 Sipari\u015finiz al\u0131nd\u0131!', tip: 'basarili' })
    } finally {
      setGonderiliyor(false)
    }
  }

  if (yukleniyor) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]} edges={['top']}>
        <ActivityIndicator size="large" color="#0ABAB5" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {toast ? (
        <View
          style={[
            styles.toastWrap,
            toast.tip === 'basarili' ? styles.toastBasarili : styles.toastHata,
          ]}
        >
          <Ionicons
            name={toast.tip === 'basarili' ? 'checkmark-circle' : 'close-circle'}
            size={22}
            color="#fff"
          />
          <Text style={styles.toastMesaj}>{toast.mesaj}</Text>
        </View>
      ) : null}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {tesisAd || 'Tesis'}
          </Text>
        </View>
        <View style={styles.balancePill}>
          <Text style={styles.balanceText}>
            {'\u20BA' + Number(bakiyeKalan ?? 0).toLocaleString('tr-TR')}
          </Text>
          <Text style={styles.balanceTextLimit}>
            {'Limit: \u20BA' + Number(bakiyeYuklenen ?? 0).toLocaleString('tr-TR')}
          </Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.katBar}
        contentContainerStyle={styles.katBarContent}
      >
        <TouchableOpacity
          style={[styles.katChip, seciliKategori === 'tumü' && styles.katChipActive]}
          onPress={() => setSeciliKategori('tumü')}
          activeOpacity={0.85}
        >
          <Text style={[styles.katChipText, seciliKategori === 'tumü' && styles.katChipTextActive]}>
            Tümü
          </Text>
        </TouchableOpacity>
        {kategoriler.map((k) => {
          const aktif = seciliKategori === k.id
          return (
            <TouchableOpacity
              key={k.id}
              style={[styles.katChip, aktif && styles.katChipActive]}
              onPress={() => setSeciliKategori(k.id)}
              activeOpacity={0.85}
            >
              <Text style={[styles.katChipText, aktif && styles.katChipTextActive]}>{k.ad}</Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {urunlerFiltreli.map((u) => {
          const adet = sepet[u.id] ?? 0
          return (
            <View key={u.id} style={styles.urunCard}>
              <View style={styles.urunLeft}>
                {u.gorsel_url ? (
                  <Image source={{ uri: u.gorsel_url }} style={styles.urunGorsel} resizeMode="cover" />
                ) : (
                  <View style={[styles.urunGorsel, styles.urunIconWrap]}>
                    <Ionicons name={(u.icon as any) || 'restaurant-outline'} size={20} color="#0ABAB5" />
                  </View>
                )}
              </View>
              <View style={styles.urunBody}>
                <Text style={styles.urunAd}>{u.ad}</Text>
                <Text style={styles.urunAciklama} numberOfLines={2}>
                  {u.aciklama ?? ''}
                </Text>
                <Text style={styles.urunFiyat}>{fmtTl(num(u.fiyat))}</Text>
              </View>
              <View style={styles.adetCol}>
                <TouchableOpacity style={styles.adetBtn} onPress={() => adetAzalt(u.id)} activeOpacity={0.85}>
                  <Ionicons name="remove" size={16} color="#0A1628" />
                </TouchableOpacity>
                <Text style={styles.adetText}>{adet}</Text>
                <TouchableOpacity style={styles.adetBtn} onPress={() => adetArttir(u.id)} activeOpacity={0.85}>
                  <Ionicons name="add" size={16} color="#0A1628" />
                </TouchableOpacity>
              </View>
            </View>
          )
        })}
      </ScrollView>

      {sepetAdetToplam > 0 ? (
        <View style={styles.sepetBar}>
          <Text style={styles.sepetToplam}>{fmtTl(sepetToplam)}</Text>
          <TouchableOpacity style={styles.siparisBtn} onPress={() => void handleSiparisVer()} activeOpacity={0.85}>
            <Text style={styles.siparisBtnText}>{gonderiliyor ? 'G\u00f6nderiliyor...' : 'Sipari\u015f Ver'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  toastWrap: {
    position: 'absolute',
    top: 60,
    left: 12,
    right: 12,
    zIndex: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  toastBasarili: { backgroundColor: '#16a34a' },
  toastHata: { backgroundColor: '#dc2626' },
  toastMesaj: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  safe: { flex: 1, backgroundColor: '#f1f5f9' },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    backgroundColor: '#0ABAB5',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  headerCenter: { flex: 1, minWidth: 0 },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  balancePill: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 118,
    alignItems: 'center',
  },
  balanceText: { color: '#0A1628', fontSize: 12, fontWeight: '800' },
  balanceTextLimit: { color: '#64748b', fontSize: 10, fontWeight: '600', marginTop: 2 },
  katBar: { maxHeight: 54, backgroundColor: '#fff' },
  katBarContent: { paddingHorizontal: 12, gap: 8, alignItems: 'center' },
  katChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f1f5f9' },
  katChipActive: { backgroundColor: '#0ABAB5' },
  katChipText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  katChipTextActive: { color: '#fff' },
  list: { flex: 1 },
  listContent: { padding: 12, paddingBottom: 90, gap: 10 },
  urunCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  urunLeft: { width: 56, height: 56, borderRadius: 10, overflow: 'hidden' },
  urunGorsel: { width: 56, height: 56 },
  urunIconWrap: { backgroundColor: '#ecfeff', alignItems: 'center', justifyContent: 'center' },
  urunBody: { flex: 1, minWidth: 0 },
  urunAd: { fontSize: 14, fontWeight: '800', color: '#0A1628' },
  urunAciklama: { marginTop: 2, fontSize: 11, color: '#64748b' },
  urunFiyat: { marginTop: 4, fontSize: 13, fontWeight: '800', color: '#0ABAB5' },
  adetCol: { alignItems: 'center', gap: 6 },
  adetBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adetText: { fontSize: 13, fontWeight: '800', color: '#0A1628', minWidth: 18, textAlign: 'center' },
  sepetBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: '#0A1628',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sepetToplam: { color: '#fff', fontSize: 16, fontWeight: '900' },
  siparisBtn: {
    backgroundColor: '#0ABAB5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  siparisBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
})
