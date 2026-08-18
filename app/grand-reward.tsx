import { StyleSheet, Text, View } from 'react-native';

export default function GrandRewardScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Grand Reward</Text>
      <Text style={styles.body}>Interactive GMP summary book — unlocked after Level 3.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: '700' },
  body: { marginTop: 8, color: '#6b6b6b' },
});
