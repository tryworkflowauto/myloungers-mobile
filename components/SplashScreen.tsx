import { useEffect, useRef } from 'react'
import { Animated, Image, Modal, StyleSheet } from 'react-native'

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
        <Image
          source={require('../assets/images/splash-background.png')}
          style={[StyleSheet.absoluteFillObject, { width: '100%', height: '100%', transform: [{ scale: 1.15 }] }]}
          resizeMode="cover"
        />
      </Animated.View>
    </Modal>
  )
}
