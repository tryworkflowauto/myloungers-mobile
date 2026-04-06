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
          .select('id, baslangic_tarih, bitis_tarih, sezlong_id, toplam_tutar, durum, tesis_id, tesisler(ad, fotograflar)')
          .eq('kullanici_id', data.id)
          .order('baslangic_tarih', { ascending: false })

        console.log('REZ DATA:', rezData)
        console.log('REZ ERROR:', rezError)

        if (rezData) {
          setRezervasyonlar(
            rezData.map((r: any) => {
              const foto = r.tesisler?.fotograflar?.[0]
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
              sezlong: r.sezlong_id ?? '-',
              sure: (() => {
                if (!r.bitis_tarih || !r.baslangic_tarih) return '-'
                const d0 = new Date(r.baslangic_tarih)
                const d1 = new Date(r.bitis_tarih)
                if (Number.isNaN(d0.getTime()) || Number.isNaN(d1.getTime())) return '-'
                const diff = Math.round((d1.getTime() - d0.getTime()) / (1000 * 60 * 60 * 24))
                return `${diff} gün`
              })(),
              odenen: r.toplam_tutar ? `₺${r.toplam_tutar}` : '₺0',
              durum: rezDurum,
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
          <View style={styles.card}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filtreScroll}
            >
              {(
                [
                  { key: 'tum' as const, label: 'Tümü' },
                  { key: 'yaklasan' as const, label: 'Yaklaşan' },
                  { key: 'aktif' as const, label: 'Aktif' },
                  { key: 'gecmis' as const, label: 'Geçmiş' },
                  { key: 'iptal' as const, label: 'İptal' },
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

            {filtrelenmisRez.length === 0 ? (
              <Text style={styles.bosListe}>Bu filtrede rezervasyon yok.</Text>
            ) : (
              filtrelenmisRez.map((r) => (
                <View key={r.id} style={styles.rezCard}>
                  <View style={styles.rezFoto}>
                    {r.kapakGorsel ? (
                      <Image
                        source={{ uri: r.kapakGorsel }}
                        style={styles.rezFotoImg}
                        resizeMode="cover"
                      />
                    ) : (
                      <Ionicons name="image-outline" size={32} color="#94a3b8" />
                    )}
                  </View>
                  <View style={styles.rezBody}>
                    <Text style={styles.rezTesisAd} numberOfLines={2}>
                      {r.tesisAd}
                    </Text>
                    <Text style={styles.rezMeta}>{r.tarih}</Text>
                    <Text style={styles.rezMeta}>
                      Şezlong: {r.sezlong} · Süre: {r.sure}
                    </Text>
                    <Text style={styles.rezOdenen}>Ödenen: {r.odenen}</Text>
                    <View style={styles.rezBtnRow}>
                      <TouchableOpacity style={styles.btnIptal} activeOpacity={0.85}>
                        <Text style={styles.btnIptalText}>İptal Et</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.btnTesiseGit} activeOpacity={0.85}>
                        <Text style={styles.btnTesiseGitText}>Tesise Git</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
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
                        <Text key={i} style={{ color: i <= (r.puan ?? 0) ? '#f59e0b' : '#cbd5e1', fontSize: 16 }}>
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
  rezCard: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
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
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rezFotoImg: { width: 72, height: 72, borderRadius: 10 },
  rezBody: { flex: 1, minWidth: 0 },
  rezTesisAd: { fontSize: 15, fontWeight: '800', color: '#0A1628' },
  rezMeta: { fontSize: 12, color: '#64748b', marginTop: 4 },
  rezOdenen: { fontSize: 13, fontWeight: '700', color: '#0ABAB5', marginTop: 6 },
  rezBtnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btnIptal: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  btnIptalText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  btnTesiseGit: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#0ABAB5',
  },
  btnTesiseGitText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  placeholderTab: { fontSize: 14, color: '#64748b', textAlign: 'center', paddingVertical: 8 },
})
