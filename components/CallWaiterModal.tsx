import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

interface CallWaiterModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  tesisAdi: string
}

export default function CallWaiterModal({ isOpen, onClose, onConfirm, tesisAdi }: CallWaiterModalProps) {
  return (
    <Modal
      transparent
      visible={isOpen}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          <LinearGradient
            colors={['#1E293B', '#0F172A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.card}
          >
            {/* Çan ikonu */}
            <View style={styles.iconWrap}>
              <Ionicons name="notifications-outline" size={40} color="#F5821F" />
            </View>

            {/* Başlık */}
            <Text style={styles.title}>Garson çağırılsın mı?</Text>

            {/* Açıklama */}
            <Text style={styles.desc}>{tesisAdi} garsonuna çağrı gönderilecek.</Text>

            {/* Butonlar */}
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.btnCancel} onPress={onClose} activeOpacity={0.8}>
                <Text style={styles.btnCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnConfirm} onPress={onConfirm} activeOpacity={0.85}>
                <Text style={styles.btnConfirmText}>Çağır</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    borderRadius: 16,
    padding: 24,
    width: 340,
    maxWidth: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 60,
    elevation: 20,
  },
  iconWrap: {
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 6,
    textAlign: 'center',
  },
  desc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 20,
    lineHeight: 20,
    textAlign: 'center',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  btnCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancelText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#fff',
  },
  btnConfirm: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F5821F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnConfirmText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#fff',
  },
})
