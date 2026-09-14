import { StyleSheet, Text, View } from 'react-native';

// Line progress (issue #10) lands here.
export default function ProgressScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Progress</Text>
      <Text style={styles.body}>Line completion and stats are coming next.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  title: { fontSize: 24, fontWeight: '700' },
  body: { color: '#6b7280', textAlign: 'center' },
});
