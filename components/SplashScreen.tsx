import { useCallback, useEffect, useRef } from 'react'
import { Animated, Image, Modal, StyleSheet } from 'react-native'

type Props = {
  visible: boolean
  onAnimationEnd?: () => void
}

const SPLASH_VISIBLE_MS = 2250
const FADE_OUT_MS = 250

export default function SplashScreen({ visible, onAnimationEnd }: Props) {
  const opacity = useRef(new Animated.Value(1)).current
  const fadeStarted = useRef(false)

  const runFadeOut = useCallback(() => {
    if (fadeStarted.current) return
    fadeStarted.current = true
    Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_OUT_MS,
      useNativeDriver: true,
    }).start(() => {
      onAnimationEnd?.()
    })
  }, [opacity, onAnimationEnd])

  useEffect(() => {
    const timer = setTimeout(runFadeOut, SPLASH_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [runFadeOut])

  useEffect(() => {
    if (!visible) {
      runFadeOut()
    }
  }, [visible, runFadeOut])

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
