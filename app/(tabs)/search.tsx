import { StyleSheet, Text, View } from 'react-native'

export default function SearchScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ara</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
})
