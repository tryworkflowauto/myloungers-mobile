import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'

export default function TesisDetailScreen() {
  const router = useRouter()
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const [ad, setAd] = useState<string | null>(null)

  useEffect(() => {
    if (!slug || typeof slug !== 'string') return
    supabase
      .from('tesisler')
      .select('ad')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.ad) setAd(data.ad)
      })
  }, [slug])

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }} edges={['top']}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Ionicons name="chevron-back" size={28} color="#3333cc" />
        </TouchableOpacity>
      </View>
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 22, fontWeight: '700', color: '#111827' }}>{ad ?? slug}</Text>
      </View>
    </SafeAreaView>
  )
}
