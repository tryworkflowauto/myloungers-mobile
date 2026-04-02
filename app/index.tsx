import { Ionicons } from '@expo/vector-icons'
import { Link, useRouter } from 'expo-router'
import { useState } from 'react'
import { Alert, Image, ImageBackground, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { supabase } from '../lib/supabase'

export default function LoginScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) { Alert.alert('Hata', error.message); return }
    router.replace('/(tabs)')
  }

  return (
    <ImageBackground source={require('../assets/images/login-bg.jpg')} style={{flex:1}} resizeMode="cover">
      <View style={{flex:0.4}} />
      <View style={{backgroundColor:'white', borderTopLeftRadius:40, borderTopRightRadius:40, padding:30}}>
        <Image source={require('../assets/images/logo.png')} style={{width:180, height:100, alignSelf:'center', marginBottom:20}} resizeMode="contain" />
        <View style={{flexDirection:'row', borderWidth:1.5, borderColor:'#1a1aff', borderRadius:30, paddingHorizontal:14, paddingVertical:10, marginBottom:14, alignItems:'center', gap:8}}>
          <Ionicons name="person-outline" size={18} color="#1a1aff" />
          <TextInput placeholder="Username / E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" style={{flex:1}} />
        </View>
        <View style={{flexDirection:'row', borderWidth:1.5, borderColor:'#1a1aff', borderRadius:30, paddingHorizontal:14, paddingVertical:10, marginBottom:14, alignItems:'center', gap:8}}>
          <Ionicons name="lock-closed-outline" size={18} color="#1a1aff" />
          <TextInput placeholder="Şifre" value={password} onChangeText={setPassword} secureTextEntry style={{flex:1}} />
        </View>
        <Text style={{textAlign:'center', color:'#1a1aff', marginBottom:16}}>Henüz hesabın yok mu?</Text>
        <View style={{flexDirection:'row', justifyContent:'space-around', marginBottom:16}}>
          <TouchableOpacity onPress={handleLogin} style={{borderWidth:1.5, borderColor:'#0ABAB5', borderRadius:30, paddingHorizontal:30, paddingVertical:10}}>
            <Text style={{color:'#0ABAB5', fontWeight:'600'}}>Giriş</Text>
          </TouchableOpacity>
          <Link href="/" style={{borderWidth:1.5, borderColor:'#F5821F', borderRadius:30, paddingHorizontal:20, paddingVertical:10}}>
            <Text style={{color:'#F5821F', fontWeight:'600'}}>Hesap Oluştur</Text>
          </Link>
        </View>
        <View style={{alignItems:'flex-end'}}>
          <Link href="/" style={{backgroundColor:'#1a1aff', borderRadius:30, paddingHorizontal:20, paddingVertical:10}}>
            <Text style={{color:'white', fontWeight:'600'}}>Şifremi Unuttum</Text>
          </Link>
        </View>
      </View>
    </ImageBackground>
  )
}

const styles = StyleSheet.create({})
