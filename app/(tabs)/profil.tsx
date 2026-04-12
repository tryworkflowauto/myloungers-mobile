import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
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

type RezDurum = 'yaklasan' | 'aktif' | 'gecmis' | 'iptal'

type ProfilKullanici = {
  id: string
  ad: string
  soyad: string
  email: string
  uyeAyYil: string
  eposta_dogrulandi: boolean
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
  rezervasyonKodu: string
  grupAd: string
  sehir: string
  kategori: string
  tesisSlug: string
  sezlongLabel: string
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

function formatTutar(raw: number | string | null | undefined) {
  if (raw == null) return '₺0'
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/\s/g, '').replace(',', '.'))
  if (Number.isNaN(n)) return `₺${raw}`
  return `₺${n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
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

type AltSekme = 'rezervasyonlar' | 'yorumlar' | 'favoriler'
type RezFilter = 'tum' | RezDurum

export default function ProfilScreen() {
  const router = useRouter()
  const [altSekme, setAltSekme] = useState<AltSekme>('rezervasyonlar')
  const [rezFilter, setRezFilter] = useState<RezFilter>('tum')
  const [loading, setLoading] = useState(true)
  const [profil, setProfil] = useState<ProfilKullanici | null>(null)
  const [rezervasyonlar, setRezervasyonlar] = useState<RezRow[]>([])
  const [yorumlar, setYorumlar] = useState<any[]>([])
  const [favoriler, setFavoriler] = useState<any[]>([])

  const loadProfil = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('kullanicilar')
        .select('id, ad, soyad, telefon, email, rol, created_at')
        .eq('email', user.email)
        .single()

      console.log('KULLANICI DATA:', data)
      console.log('KULLANICI ERROR:', error)

      if (data) {
        setProfil({
          id: data.id,
          ad: data.ad ?? '',
          soyad: data.soyad ?? '',
          email: data.email ?? user.email ?? '',
          uyeAyYil: formatUyeAyYil(data.created_at),
          eposta_dogrulandi: !!user.email_confirmed_at,
        })

        const { data: rezData, error: rezError } = await supabase
          .from('rezervasyonlar')
          .select(
            'id, baslangic_tarih, bitis_tarih, sezlong_id, toplam_tutar, durum, tesis_id, tesisler(ad, fotograflar, sehir, kategori, slug), sezlonglar(numara, grup_id, sezlong_gruplari(ad))',
          )
          .eq('kullanici_id', data.id)
          .order('baslangic_tarih', { ascending: false })

        console.log('REZ DATA:', rezData)
        console.log('REZ ERROR:', rezError)

        if (rezData) {
          setRezervasyonlar(
            rezData.map((r: any) => {
              const foto = r.tesisler?.fotograflar?.[0]
              const sezlong = Array.isArray(r.sezlonglar) ? r.sezlonglar[0] : r.sezlonglar
              const grupAdRaw = sezlong?.sezlong_gruplari?.ad ?? ''
              const grupAd = String(grupAdRaw)
              const prefix = (sezlong?.sezlong_gruplari?.ad ?? '').charAt(0).toUpperCase()
              const numara = sezlong?.numara ?? ''
              const rezervasyonKodu = 'MYL-' + prefix + String(numara)
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

              const baslangic = r.baslangic_tarih ? new Date(r.baslangic_tarih) : null
              const bitis = r.bitis_tarih ? new Date(r.bitis_tarih) : null
              const bugun = new Date()
              bugun.setHours(0, 0, 0, 0)

              let rezDurum: RezDurum = 'gecmis'
              if (r.durum === 'iptal') {
                rezDurum = 'iptal'
              } else if (baslangic && baslangic > bugun) {
                rezDurum = 'yaklasan'
              } else if (baslangic && bitis && baslangic <= bugun && bitis >= bugun) {
                rezDurum = 'aktif'
              } else {
                rezDurum = 'gecmis'
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
                rezervasyonKodu,
                grupAd,
                sehir: r.tesisler?.sehir ?? '',
                kategori: kategoriLabel,
                tesisSlug: r.tesisler?.slug ?? '',
                sezlongLabel,
              }
            }),
          )
        }

        const { data: yorumData } = await supabase
          .from('yorumlar')
          .select('id, yorum, puan, created_at, durum, tesisler(ad)')
          .eq('kullanici_id', data.id)
          .order('created_at', { ascending: false })
        if (yorumData) setYorumlar(yorumData)

        const { data: favData } = await supabase
          .from('favoriler')
          .select('id, tesis_id, created_at, tesisler(ad, fotograflar)')
          .eq('kullanici_id', data.id)
          .order('created_at', { ascending: false })
        if (favData) setFavoriler(favData)
      }
    } catch (e) {
      console.log('LOAD PROFIL HATA:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadProfil()
  }, [])

  const avatarHarf = useMemo(() => {
    const t = (profil?.ad ?? '').trim()
    return t ? t.charAt(0).toLocaleUpperCase('tr-TR') : '?'
  }, [profil?.ad])

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

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.loadingWrap]} edges={['top']}>
        <ActivityIndicator size="large" color="#0ABAB5" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity style={styles.headerIconBtn} hitSlop={12} activeOpacity={0.8}>
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
              <Text style={styles.badgeAltinText}>Sadık Üye</Text>
            </View>
          </View>
          <Text style={styles.uyeEtiket}>Üye: {profil?.uyeAyYil ?? ''}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>QR Girişi</Text>
          <View style={styles.qrBtnRow}>
            <TouchableOpacity style={styles.btnQrOku} activeOpacity={0.85}>
              <Ionicons name="camera-outline" size={22} color="#fff" />
              <Text style={styles.btnQrOkuText}>QR Oku</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnKodGir} activeOpacity={0.85}>
              <Ionicons name="keypad-outline" size={22} color="#fff" />
              <Text style={styles.btnKodGirText}>Kod Gir</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Aktif Şezlonglarım</Text>
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
        </View>

        <View style={styles.altSekmeBar}>
          {(
            [
              { key: 'rezervasyonlar' as const, label: 'Rezervasyonlarım' },
              { key: 'yorumlar' as const, label: 'Yorumlarım' },
              { key: 'favoriler' as const, label: 'Favorilerim' },
            ] as const
          ).map((s) => (
            <TouchableOpacity
              key={s.key}
              style={styles.altSekmeItem}
              onPress={() => setAltSekme(s.key)}
              activeOpacity={0.85}
            >
              <Text
                style={[styles.altSekmeText, altSekme === s.key && styles.altSekmeTextActive]}
              >
                {s.label}
              </Text>
              {altSekme === s.key ? <View style={styles.altSekmeUnderline} /> : null}
            </TouchableOpacity>
          ))}
        </View>

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
              filtrelenmisRez.map((r) => {
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
                          <View style={styles.rezKodChip}>
                            <Text style={styles.rezKodChipText}>{r.rezervasyonKodu}</Text>
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
                      <TouchableOpacity
                        style={[styles.btnIptal, { backgroundColor: '#0A1628', borderColor: '#0A1628' }]}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.btnIptalText, { color: '#fff', fontWeight: '700' }]}>İptal Et</Text>
                      </TouchableOpacity>
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
            </View>
          </>
        ) : null}

        {altSekme === 'yorumlar' ? (
          <View style={styles.card}>
            {yorumlar.length === 0 ? (
              <Text style={styles.bosListe}>Henüz yorum yapmadınız</Text>
            ) : (
              yorumlar.map((r: any) => (
                <View key={r.id} style={styles.rezCard}>
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
              ))
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
                      style={[styles.btnTesiseGit, { marginTop: 10, alignSelf: 'flex-start', paddingHorizontal: 20 }]}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.btnTesiseGitText}>Şezlong Seç →</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f1f5f9' },
  loadingWrap: { justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  header: {
    backgroundColor: '#0ABAB5',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerIconBtn: { padding: 4 },
  avatarWrap: { alignItems: 'center', marginTop: 4 },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#0f766e',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  avatarText: { fontSize: 36, fontWeight: '800', color: '#fff' },
  userName: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
  },
  userEmail: {
    marginTop: 4,
    textAlign: 'center',
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  badgeYesil: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeYesilText: { fontSize: 11, fontWeight: '700', color: '#15803d' },
  badgeAltin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeAltinText: { fontSize: 11, fontWeight: '700', color: '#b45309' },
  uyeEtiket: {
    marginTop: 10,
    textAlign: 'center',
    fontSize: 12,
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
    flexDirection: 'row',
    marginHorizontal: 12,
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  altSekmeItem: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  altSekmeText: { fontSize: 12, fontWeight: '600', color: '#94a3b8' },
  altSekmeTextActive: { color: '#0ABAB5', fontWeight: '800' },
  altSekmeUnderline: {
    marginTop: 6,
    height: 3,
    width: '60%',
    backgroundColor: '#0ABAB5',
    borderRadius: 2,
  },
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
  placeholderTab: { fontSize: 14, color: '#64748b', textAlign: 'center', paddingVertical: 8 },
})
