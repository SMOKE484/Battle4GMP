import { StyleSheet, Text, View } from 'react-native';

export default function ScoreboardScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scoreboard</Text>
      <Text style={styles.body}>Top scores from Supabase will be listed here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: '700' },
  body: { marginTop: 8, color: '#6b6b6b' },
});
