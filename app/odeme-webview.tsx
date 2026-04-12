import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'

const TEAL = '#0d9488'

export default function OdemeWebview() {
  const router = useRouter()
  const { token } = useLocalSearchParams<{ token?: string }>()
  const uri = token ? `https://vpos.paratika.com.tr/payment/${String(token)}` : ''

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={14} style={styles.headerBtn} accessibilityRole="button">
          <Ionicons name="chevron-back" size={26} color={TEAL} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ödeme</Text>
        <View style={styles.headerBtn} />
      </View>
      {uri ? (
        <WebView
          source={{ uri }}
          style={styles.web}
          startInLoadingState
          renderLoading={() => <ActivityIndicator style={styles.loader} size="large" color={TEAL} />}
          onNavigationStateChange={(navState) => {
            if (navState.url && navState.url.includes('myloungers.com/profil')) {
              router.replace('/(tabs)/profil')
            }
            if (navState.url && navState.url.includes('myloungers.com/rezervasyon-basarili')) {
              router.replace('/(tabs)/profil')
            }
          }}
          onShouldStartLoadWithRequest={(request) => {
            if (request.url.includes('myloungers.com/profil')) {
              router.replace('/(tabs)/profil')
              return false
            }
            return true
          }}
        />
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Ödeme oturumu bulunamadı.</Text>
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
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
  web: {
    flex: 1,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 15,
    color: '#64748b',
  },
})
