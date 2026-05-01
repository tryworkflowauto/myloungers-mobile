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
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity }]}>
        <Image
          source={require('../assets/images/splash-background.png')}
          style={{ width: '100%', height: '100%', resizeMode: 'cover' }}
        />
      </Animated.View>
    </Modal>
  )
}
