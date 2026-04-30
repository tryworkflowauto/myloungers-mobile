import { useEffect, useRef } from 'react'
import { Animated, Image, Modal, StyleSheet, Text, View } from 'react-native'

type Props = {
  visible: boolean
  onAnimationEnd?: () => void
}

export default function SplashScreen({ visible, onAnimationEnd }: Props) {
  const opacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (!visible) {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        onAnimationEnd?.()
      })
    } else {
      opacity.setValue(1)
    }
  }, [visible, opacity, onAnimationEnd])

  return (
    <Modal visible={true} transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity, backgroundColor: '#0a4d68' }]}>
        <View style={styles.textBlock}>
          <Text style={styles.title}>MY LOUNGERS</Text>
          <Text style={styles.subtitle}>Discover the Loungers World</Text>
        </View>

        {/* Geçici: AAPT / drawable derleme sorununu atlamak için; sonra optimize PNG geri alınır
        <Image
          source={require('../assets/images/splash-background.png')}
          style={[StyleSheet.absoluteFillObject, { width: '100%', height: '100%', transform: [{ scale: 1.15 }] }]}
          resizeMode="cover"
        />
        */}
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  textBlock: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 2,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 12,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 15,
    fontStyle: 'italic',
    textAlign: 'center',
  },
})
