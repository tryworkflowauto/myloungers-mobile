import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useRouter } from 'expo-router'
import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { supabase } from '../../lib/supabase'

type KategoriRow = { id: string; ad: string; icon: string | null }
type UrunRow = {
  id: string
  kategori_id: string
  ad: string
  aciklama: string | null
  fiyat: number | string
  gorsel_url: string | null
  icon: string | null
}

function num(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function fmtTl(v: number): string {
  return `₺${v.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export default function SiparisScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ rezervasyon_id: string; tesis_id?: string }>()
  const rezervasyonId = String(params?.rezervasyon_id ?? '')
  const tesisId = String(params?.tesis_id ?? '')

  const [yukleniyor, setYukleniyor] = useState(true)
  const [tesisAd, setTesisAd] = useState('')
  const [bakiyeKalan, setBakiyeKalan] = useState(0)
  const [bakiyeYuklenen, setBakiyeYuklenen] = useState(0)
  const [bakiyeHarcanan, setBakiyeHarcanan] = useState(0)
  const [kategoriler, setKategoriler] = useState<KategoriRow[]>([])
  const [urunler, setUrunler] = useState<UrunRow[]>([])
  const [seciliKategori, setSeciliKategori] = useState('tumu')
  const [sepet, setSepet] = useState<Record<string, number>>({})
  const [sepetAcik, setSepetAcik] = useState(false)
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    async function loadData() {
      if (!rezervasyonId || !tesisId) {
        showToast('Rezervasyon veya tesis bilgisi eksik.', 'error')
        setYukleniyor(false)
        return
      }
      setYukleniyor(true)
      try {
        const [rezRes, katRes, urunRes, tesisRes] = await Promise.all([
          supabase
            .from('rezervasyonlar')
            .select('bakiye_kalan, bakiye_yuklenen, bakiye_harcanan, giris_yapildi, durum')
            .eq('id', rezervasyonId)
            .maybeSingle(),
          supabase
            .from('menu_kategorileri')
            .select('id, ad, icon')
            .eq('tesis_id', tesisId)
            .order('sira', { ascending: true }),
          supabase
            .from('menu_urunleri')
            .select('id, kategori_id, ad, aciklama, fiyat, gorsel_url, icon')
            .eq('tesis_id', tesisId)
            .order('sira', { ascending: true }),
          supabase.from('tesisler').select('ad').eq('id', tesisId).maybeSingle(),
        ])

        if (rezRes.error) throw rezRes.error
        if (katRes.error) throw katRes.error
        if (urunRes.error) throw urunRes.error
        if (tesisRes.error) throw tesisRes.error

        const rezData: any = rezRes.data
        if (
          rezData &&
          (rezData.giris_yapildi !== true ||
            (rezData.durum !== 'onaylandi' && rezData.durum !== 'aktif'))
        ) {
          showToast('Önce şezlongunuzun girişini yapın (QR okutun veya kod girin)', 'error')
          setTimeout(() => router.back(), 1500)
          setYukleniyor(false)
          return
        }

        setBakiyeKalan(num(rezData?.bakiye_kalan))
        setBakiyeYuklenen(num(rezData?.bakiye_yuklenen))
        setBakiyeHarcanan(num(rezData?.bakiye_harcanan))
        setKategoriler((katRes.data ?? []) as KategoriRow[])
        setUrunler((urunRes.data ?? []) as UrunRow[])
        setTesisAd((tesisRes.data as any)?.ad || 'Tesis Menüsü')
      } catch (err: any) {
        const msg = err?.message || 'Veriler yüklenemedi.'
        showToast(msg, 'error')
      } finally {
        setYukleniyor(false)
      }
    }
    loadData()
  }, [rezervasyonId, tesisId])

  const urunlerFiltreli = useMemo(() => {
    if (seciliKategori === 'tumu') return urunler
    return urunler.filter((u) => String(u.kategori_id) === String(seciliKategori))
  }, [urunler, seciliKategori])

  const sepetToplam = useMemo(() => {
    return Object.entries(sepet).reduce((sum, [urunId, adet]) => {
      const urun = urunler.find((u) => String(u.id) === String(urunId))
      if (!urun) return sum
      return sum + num(urun.fiyat) * adet
    }, 0)
  }, [sepet, urunler])

  const sepetAdetToplam = useMemo(() => {
    return Object.values(sepet).reduce((sum, adet) => sum + adet, 0)
  }, [sepet])

  function adetAzalt(urunId: string) {
    setSepet((prev) => {
      const cur = prev[urunId] || 0
      if (cur <= 1) {
        const { [urunId]: _removed, ...rest } = prev
        return rest
      }
      return { ...prev, [urunId]: cur - 1 }
    })
  }

  function adetArttir(urunId: string) {
    setSepet((prev) => ({ ...prev, [urunId]: (prev[urunId] || 0) + 1 }))
  }

  async function handleSiparisVer() {
    if (!rezervasyonId || !tesisId) {
      showToast('Eksik parametre.', 'error')
      return
    }
    if (sepetAdetToplam <= 0) {
      showToast('Sepetiniz boş.', 'error')
      return
    }
    if (sepetToplam > bakiyeKalan) {
      showToast('Harcama limitiniz yetersiz!', 'error')
      return
    }
    setGonderiliyor(true)
    try {
      const { data: rezRow, error: rezErr } = await supabase
        .from('rezervasyonlar')
        .select('id, tesis_id, sezlong_id, musteri_adi, bakiye_harcanan, bakiye_kalan')
        .eq('id', rezervasyonId)
        .maybeSingle()

      if (rezErr || !rezRow) throw rezErr || new Error('Rezervasyon bulunamadı.')

      const sezlongId = (rezRow as any).sezlong_id ?? null
      let sezlongNo = '-'
      if (sezlongId) {
        const { data: sezData } = await supabase
          .from('sezlonglar')
          .select('numara, grup:sezlong_gruplari(ad)')
          .eq('id', sezlongId)
          .maybeSingle()
        if (sezData) {
          const grupAd = (sezData as any)?.grup?.ad ?? ''
          const numara = (sezData as any)?.numara ?? ''
          if (grupAd && numara !== '') {
            sezlongNo = `${String(grupAd).charAt(0).toUpperCase()}${numara}`
          } else if (numara !== '') {
            sezlongNo = String(numara)
          }
        }
      }

      const musteriAdi = (rezRow as any).musteri_adi || 'Misafir'
      const hedefTesisId = tesisId || String((rezRow as any).tesis_id || '')

      const { data: siparisData, error: siparisErr } = await supabase
        .from('siparisler')
        .insert({
          tesis_id: hedefTesisId,
          rezervasyon_id: rezervasyonId,
          durum: 'yeni',
          toplam: sepetToplam,
          sezlong_no: sezlongNo,
          musteri_adi: musteriAdi,
        })
        .select('id')
        .single()

      if (siparisErr || !siparisData?.id) throw siparisErr || new Error('Sipariş oluşturulamadı.')

      const kalemler = Object.entries(sepet)
        .filter(([, adet]) => adet > 0)
        .map(([urunId, adet]) => {
          const urun = urunler.find((u) => String(u.id) === String(urunId))
          if (!urun) return null
          return {
            siparis_id: siparisData.id,
            urun_id: urun.id,
            ad: urun.ad,
            fiyat: num(urun.fiyat),
            adet,
          }
        })
        .filter(Boolean)

      if (kalemler.length > 0) {
        const { error: kalemErr } = await supabase
          .from('siparis_kalemleri')
          .insert(kalemler as any[])
        if (kalemErr) throw kalemErr
      }

      const yeniHarcanan = num((rezRow as any).bakiye_harcanan) + sepetToplam
      const yeniKalan = Math.max(0, num((rezRow as any).bakiye_kalan) - sepetToplam)
      const { error: rezUpdateErr } = await supabase
        .from('rezervasyonlar')
        .update({ bakiye_harcanan: yeniHarcanan, bakiye_kalan: yeniKalan })
        .eq('id', rezervasyonId)
      if (rezUpdateErr) throw rezUpdateErr

      setBakiyeHarcanan(yeniHarcanan)
      setBakiyeKalan(yeniKalan)
      setSepet({})
      showToast('Siparişiniz alındı.', 'success')
      setTimeout(() => router.back(), 1500)
    } catch (err: any) {
      const msg = err?.message || 'Sipariş verilemedi.'
      showToast(msg, 'error')
    } finally {
      setGonderiliyor(false)
    }
  }

  if (yukleniyor) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' }}>
        <ActivityIndicator size="large" color="#FF7E5F" />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      {/* Toast */}
      {toast && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 50,
            left: 16,
            right: 16,
            zIndex: 9999,
            elevation: 20,
            alignItems: 'center',
          }}
        >
          <View
            style={{
              backgroundColor: toast.type === 'success' ? '#16A34A' : '#DC2626',
              paddingVertical: 10,
              paddingHorizontal: 16,
              borderRadius: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 4 },
            }}
          >
            <Ionicons
              name={toast.type === 'success' ? 'checkmark-circle' : 'warning'}
              size={18}
              color="#fff"
            />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{toast.msg}</Text>
          </View>
        </View>
      )}

      {/* Header */}
      <LinearGradient
        colors={['#FF7E5F', '#FEB47B']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingTop: 48,
          paddingBottom: 14,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            backgroundColor: 'rgba(255,255,255,0.2)',
            width: 36,
            height: 36,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={{ flex: 1, color: '#fff', fontWeight: '700', fontSize: 16 }} numberOfLines={1}>
          {tesisAd}
        </Text>
        <View
          style={{
            backgroundColor: 'rgba(255,255,255,0.22)',
            paddingVertical: 6,
            paddingHorizontal: 12,
            borderRadius: 10,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{fmtTl(bakiyeKalan)}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 9, textAlign: 'center' }}>Limit: {fmtTl(bakiyeYuklenen)}</Text>
        </View>
      </LinearGradient>

      {/* Kategori bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{
          backgroundColor: '#fff',
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: '#e5e7eb',
          maxHeight: 56,
          flexGrow: 0,
        }}
        contentContainerStyle={{
          paddingHorizontal: 12,
          paddingVertical: 8,
          gap: 8,
          alignItems: 'center',
          flexGrow: 0,
        }}
      >
        {([{ id: 'tumu', ad: 'Tümü', icon: null } as KategoriRow, ...kategoriler]).map((k) => {
          const aktif = seciliKategori === k.id
          const iconStr = k.icon != null && String(k.icon).trim() !== '' ? String(k.icon).trim() : ''
          return (
            <TouchableOpacity
              key={k.id}
              onPress={() => setSeciliKategori(k.id)}
              style={{
                alignSelf: 'flex-start',
                height: 40,
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: 20,
                backgroundColor: aktif ? '#0ABAB5' : '#F1F5F9',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {iconStr ? <Text style={{ fontSize: 14 }}>{iconStr}</Text> : null}
              <Text style={{ color: aktif ? '#fff' : '#475569', fontWeight: '700', fontSize: 13 }}>
                {k.ad}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* Ürün Listesi */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 12, paddingBottom: sepetAdetToplam > 0 ? 180 : 16, gap: 10 }}
        showsVerticalScrollIndicator={false}
      >
        {urunlerFiltreli.length === 0 && (
          <View style={{ alignItems: 'center', padding: 30 }}>
            <Ionicons name="restaurant-outline" size={40} color="#cbd5e1" />
            <Text style={{ marginTop: 10, fontSize: 13, color: '#64748b' }}>Bu kategoride ürün yok</Text>
          </View>
        )}
        {urunlerFiltreli.map((u) => {
          const adet = sepet[u.id] || 0
          return (
            <View
              key={u.id}
              style={{
                backgroundColor: '#fff',
                borderRadius: 14,
                padding: 10,
                flexDirection: 'row',
                gap: 10,
                alignItems: 'center',
                shadowColor: '#000',
                shadowOpacity: 0.04,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
                elevation: 1,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: '#e2e8f0',
              }}
            >
              {u.gorsel_url ? (
                <Image source={{ uri: u.gorsel_url }} style={{ width: 58, height: 58, borderRadius: 10, backgroundColor: '#E0F7FA' }} />
              ) : (
                <View style={{ width: 58, height: 58, borderRadius: 10, backgroundColor: '#E0F7FA', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 26 }}>{u.icon || '🍽️'}</Text>
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a' }} numberOfLines={1}>{u.ad}</Text>
                {u.aciklama ? (
                  <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }} numberOfLines={2}>{u.aciklama}</Text>
                ) : null}
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#FF7E5F', marginTop: 4 }}>{fmtTl(num(u.fiyat))}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <TouchableOpacity
                  onPress={() => adetAzalt(u.id)}
                  disabled={adet <= 0}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    backgroundColor: adet > 0 ? '#F1F5F9' : '#F8FAFC',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: adet > 0 ? 1 : 0.4,
                  }}
                >
                  <Ionicons name="remove" size={16} color="#475569" />
                </TouchableOpacity>
                <Text style={{ minWidth: 22, textAlign: 'center', fontWeight: '800', fontSize: 14, color: '#0f172a' }}>{adet}</Text>
                <TouchableOpacity
                  onPress={() => adetArttir(u.id)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    backgroundColor: '#FF7E5F',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="add" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          )
        })}
      </ScrollView>

      {/* Sepet Akordeon altta sabit */}
      {sepetAdetToplam > 0 && (
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: '#0F172A',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingTop: 10,
            paddingBottom: 20,
            paddingHorizontal: 14,
            shadowColor: '#000',
            shadowOpacity: 0.3,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: -4 },
            elevation: 10,
          }}
        >
          {sepetAcik && (
            <ScrollView style={{ maxHeight: 220, marginBottom: 10 }} showsVerticalScrollIndicator={false}>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>
                SEPETİNİZ
              </Text>
              {Object.entries(sepet).map(([urunId, adet]) => {
                const u = urunler.find((x) => String(x.id) === String(urunId))
                if (!u) return null
                return (
                  <View key={urunId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 16 }}>{u.icon || '🍽️'}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }} numberOfLines={1}>{u.ad}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>{fmtTl(num(u.fiyat))} × {adet}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <TouchableOpacity
                        onPress={() => adetAzalt(urunId)}
                        style={{ width: 26, height: 26, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Ionicons name="remove" size={14} color="#fff" />
                      </TouchableOpacity>
                      <Text style={{ color: '#fff', minWidth: 20, textAlign: 'center', fontWeight: '800', fontSize: 13 }}>{adet}</Text>
                      <TouchableOpacity
                        onPress={() => adetArttir(urunId)}
                        style={{ width: 26, height: 26, borderRadius: 6, backgroundColor: '#FF7E5F', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Ionicons name="add" size={14} color="#fff" />
                      </TouchableOpacity>
                    </View>
                    <Text style={{ color: '#FF7E5F', fontWeight: '800', fontSize: 13, minWidth: 56, textAlign: 'right' }}>
                      {fmtTl(num(u.fiyat) * adet)}
                    </Text>
                  </View>
                )
              })}
              <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.15)', paddingTop: 8, marginTop: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Toplam</Text>
                <Text style={{ color: '#FF7E5F', fontSize: 16, fontWeight: '800' }}>{fmtTl(sepetToplam)}</Text>
              </View>
            </ScrollView>
          )}

          <TouchableOpacity
            onPress={() => setSepetAcik((v) => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name={sepetAcik ? 'chevron-down' : 'chevron-up'} size={18} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                {sepetAdetToplam} ürün
              </Text>
              <Text style={{ color: '#FF7E5F', fontSize: 14, fontWeight: '800' }}>{fmtTl(sepetToplam)}</Text>
            </View>
            <TouchableOpacity
              onPress={handleSiparisVer}
              disabled={gonderiliyor}
              style={{
                backgroundColor: gonderiliyor ? '#94a3b8' : '#FF7E5F',
                paddingVertical: 10,
                paddingHorizontal: 20,
                borderRadius: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {gonderiliyor ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={16} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Sipariş Ver</Text>
                </>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}
